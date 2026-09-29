// Wiring rule checker. Pure function: scene + board + parts library in, findings out.
// Runs on every scene change; each finding becomes a warning on a pin or wire and a log line.

import type { BoardDef, PartDef, PartPinRole, PinDef, Scene, SceneWire, TargetRef, WiringFinding } from './types';
import { isAdcPin, isEspFamily, pinById, powerPinFor } from './board';
import { t } from './i18n';

interface Connection {
  wire: SceneWire;
  boardPin: PinDef | undefined;
  boardPinId: string;
  partInstance: string;
  partDef: PartDef | undefined;
  partPin: string;
  role: PartPinRole | undefined;
}

/** Roles that need the board pin to drive a signal. */
const NEEDS_OUTPUT: PartPinRole[] = ['i2c_sda', 'i2c_scl', 'spi_mosi', 'spi_sck', 'spi_cs', 'digital_in', 'onewire'];
/** Roles where the part drives the line (or pulls it up), so its voltage reaches the board pin. */
const PART_DRIVES: PartPinRole[] = ['digital_out', 'analog_out', 'int', 'spi_miso', 'onewire', 'i2c_sda', 'i2c_scl'];
/** Roles that may share one board pin with other parts of the same role (a bus). */
const SHAREABLE: PartPinRole[] = ['i2c_sda', 'i2c_scl', 'spi_mosi', 'spi_miso', 'spi_sck', 'power', 'ground'];

/** "A", "A and B", "A and B and C": one translated join per pair, same English as before. */
function joinAnd(items: string[]): string {
  return items.slice(1).reduce((acc, x) => t('{a} and {b}', { a: acc, b: x }), items[0] ?? '');
}

/** A few pin labels from a board rule list, for hints ("such as D25, D26 or D27"). */
function examples(board: BoardDef, ids: string[], n = 3): string {
  const labels = ids.map((id) => pinById(board, id)?.label ?? id).slice(0, n);
  if (labels.length <= 1) return labels[0] ?? '';
  return t('{a} or {b}', { a: labels.slice(0, -1).join(', '), b: labels[labels.length - 1] });
}

function partMaxVolt(v: string): number {
  const nums = v.split('-').map(Number).filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) : 3.3;
}
function partMinVolt(v: string): number {
  const nums = v.split('-').map(Number).filter((n) => Number.isFinite(n));
  return nums.length ? Math.min(...nums) : 3.3;
}

function connections(scene: Scene, board: BoardDef, parts: Record<string, PartDef>): Connection[] {
  const out: Connection[] = [];
  for (const w of scene.wires) {
    const boardEnd = w.from.part === 'board' ? w.from : w.to.part === 'board' ? w.to : null;
    const partEnd = w.from.part === 'board' ? w.to : w.from;
    if (!boardEnd || partEnd.part === 'board') continue;
    const inst = scene.parts.find((p) => p.id === partEnd.part);
    const def = inst ? parts[inst.partId] : undefined;
    out.push({
      wire: w,
      boardPin: pinById(board, boardEnd.pin),
      boardPinId: boardEnd.pin,
      partInstance: partEnd.part,
      partDef: def,
      partPin: partEnd.pin,
      role: def?.pins.find((p) => p.name === partEnd.pin)?.role,
    });
  }
  return out;
}

export function checkWiring(scene: Scene, board: BoardDef, parts: Record<string, PartDef>): WiringFinding[] {
  const findings: WiringFinding[] = [];
  const seen = new Set<string>();
  const add = (f: Omit<WiringFinding, 'id'>) => {
    const id = `${f.rule}:${f.targets.join(',')}`;
    if (seen.has(id)) return;
    seen.add(id);
    findings.push({ id, ...f });
  };

  const conns = connections(scene, board, parts);
  const DATASHEET = `datasheet: ${board.rules.datasheet}`;
  const powerLabel = (c: Connection) => (c.partDef ? powerPinFor(board, c.partDef.voltage)?.label : undefined) ?? '3V3';
  const outputExamples = examples(board, board.rules.safeIo);
  const partName = (c: Connection) =>
    scene.parts.find((p) => p.id === c.partInstance)?.label ?? c.partDef?.name ?? c.partInstance;

  for (const c of conns) {
    const pinT: TargetRef = `pin:${c.boardPinId}`;
    const wireT: TargetRef = `wire:${c.wire.id}`;
    const bp = c.boardPin;
    if (!bp) {
      add({
        rule: 'unknown_pin',
        severity: 'error',
        message: t('The wire goes to “{pin}”, which is not a pin on this board.', { pin: c.boardPinId }),
        hint: t('Move the wire to a pin shown on the board.'),
        targets: [wireT],
      });
      continue;
    }
    const gpio = bp.gpio;
    const label = bp.label;

    // Flash pins: wired to the flash chip on the module or board.
    if (gpio !== null && bp.flags.includes('flash')) {
      add({
        rule: 'flash_pin',
        severity: 'error',
        message: t('{pin} (GPIO {gpio}) is wired to the board’s internal flash memory.', { pin: label, gpio }),
        hint: t('Never use the flash pins. Move this wire to a free pin such as {pins}.', { pins: outputExamples }),
        targets: [pinT, wireT],
        source: `${DATASHEET}, Pin Description`,
      });
    }

    const role = c.role;
    if (!role) continue;

    // Power and ground pins used the wrong way round, or voltage too high for the part.
    if (role === 'power') {
      if (bp.kind === 'ground') {
        add({
          rule: 'voltage_mismatch',
          severity: 'error',
          message: t('{part} {partPin} (power) goes to GND. The part gets no power.', { part: partName(c), partPin: c.partPin }),
          hint: t('Move it to {pin}.', { pin: powerLabel(c) }),
          targets: [pinT, wireT],
        });
      } else if (bp.kind === 'power' && bp.supplies === 0) {
        add({
          rule: 'voltage_mismatch',
          severity: 'warning',
          message: t('{pin} is a power input. It only has voltage when the board is powered through it, not from USB.', { pin: label }),
          hint: t('Use {pin} for power.', { pin: powerLabel(c) }),
          targets: [pinT, wireT],
          source: `library: ${board.id}`,
        });
      } else if (bp.kind === 'power' && bp.supplies !== undefined && c.partDef) {
        const max = partMaxVolt(c.partDef.voltage);
        const min = partMinVolt(c.partDef.voltage);
        if (bp.supplies > max + 0.2) {
          add({
            rule: 'voltage_mismatch',
            severity: 'error',
            message: t('{part} runs on {need} V but gets {got} V from {pin}.', { part: partName(c), need: c.partDef.voltage, got: bp.supplies, pin: label }),
            hint: t('Move the power wire to {pin}. {got} V can damage the part and the board pins it talks to.', { pin: powerLabel(c), got: bp.supplies }),
            targets: [pinT, wireT],
            source: `library: ${c.partDef.id}`,
          });
        } else if (bp.supplies < min - 0.2) {
          add({
            rule: 'voltage_mismatch',
            severity: 'warning',
            message: t('{part} needs {need} V but gets only {got} V from {pin}.', { part: partName(c), need: c.partDef.voltage, got: bp.supplies, pin: label }),
            hint: t('It may not work reliably. Check the part’s datasheet or use a level shifter.'),
            targets: [pinT, wireT],
            source: `library: ${c.partDef.id}`,
          });
        }
      } else if (bp.kind === 'gpio') {
        add({
          rule: 'wrong_pin_type',
          severity: 'warning',
          message: t('{part} is powered from {pin}, a signal pin.', { part: partName(c), pin: label }),
          hint: t('A GPIO can only supply a few milliamps. Use {pin} for power.', { pin: powerLabel(c) }),
          targets: [pinT, wireT],
        });
      }
      continue;
    }
    if (role === 'ground') {
      if (bp.kind !== 'ground') {
        add({
          rule: bp.kind === 'power' ? 'voltage_mismatch' : 'wrong_pin_type',
          severity: bp.kind === 'power' ? 'error' : 'warning',
          message:
            bp.kind === 'power'
              ? t('{part} {partPin} (ground) goes to {pin}, a power pin. That is a short circuit.', { part: partName(c), partPin: c.partPin, pin: label })
              : t('{part} {partPin} (ground) goes to {pin}, not to GND.', { part: partName(c), partPin: c.partPin, pin: label }),
          hint: t('Move it to a GND pin.'),
          targets: [pinT, wireT],
        });
      }
      continue;
    }

    // A signal wire on a power/ground pin.
    if (bp.kind !== 'gpio') {
      add({
        rule: 'wrong_pin_type',
        severity: 'error',
        message: t('{part} {partPin} is a signal but goes to {pin}.', { part: partName(c), partPin: c.partPin, pin: label }),
        hint: t('Move it to a GPIO pin.'),
        targets: [pinT, wireT],
      });
      continue;
    }

    if (NEEDS_OUTPUT.includes(role) && bp.flags.includes('input_only')) {
      add({
        rule: 'output_on_input_only',
        severity: 'error',
        message: t('{pin} (GPIO {gpio}) can only read signals, but {part} {partPin} needs a pin that can drive it.', {
          pin: label,
          gpio: String(gpio),
          part: partName(c),
          partPin: c.partPin,
        }),
        hint: t('This pin is input only. Move this wire to a pin such as {pins}.', { pins: outputExamples }),
        targets: [pinT, wireT],
        source: `${DATASHEET}, pin description (input-only pins)`,
      });
    }

    if (role === 'analog_out' && gpio !== null) {
      const adc1 = board.rules.adcPins.filter((id) => pinById(board, id)?.flags.includes('adc1'));
      if (!isAdcPin(bp)) {
        add({
          rule: 'not_adc',
          severity: 'error',
          message: t('{pin} cannot measure voltage, so the {part} value cannot be read here.', { pin: label, part: partName(c) }),
          hint: t('Move the wire to an analog input such as {pins}.', { pins: examples(board, board.rules.adcPins) }),
          targets: [pinT, wireT],
          source: `${DATASHEET}, pin description (ADC channels)`,
        });
      } else if (board.rules.adcWifiConflict && bp.flags.includes('adc2')) {
        add({
          rule: 'adc2_wifi',
          severity: 'info',
          message: t('{pin} is an ADC2 pin. It stops working while Wi-Fi is on.', { pin: label }),
          hint: t('If your project uses Wi-Fi, move this wire to an ADC1 pin such as {pins}.', { pins: examples(board, adc1) }),
          targets: [pinT],
          source: 'datasheet: ESP-IDF Programming Guide, ADC limitations',
        });
      }
    }

    if (bp.flags.includes('strapping') || bp.flags.includes('strapping_critical')) {
      const critical = bp.flags.includes('strapping_critical');
      const esp12 = critical && isEspFamily(board) && board.family === 'esp32' && gpio === 12;
      add({
        rule: 'strapping_pin',
        severity: critical && (c.partDef?.pullupsOnBoard || role === 'i2c_sda' || role === 'i2c_scl') ? 'error' : 'warning',
        message: esp12
          ? t('{pin} (GPIO 12) is a strapping pin. If {part} holds it HIGH at reset, the board picks the wrong flash voltage and may not boot.', {
              pin: label,
              part: partName(c),
            })
          : critical
            ? t('{pin} (GPIO {gpio}) is a strapping pin. If {part} holds it at the wrong level at reset, the board may not boot.', {
                pin: label,
                gpio: String(gpio),
                part: partName(c),
              })
            : t('{pin} (GPIO {gpio}) is a strapping pin. Its level at reset changes how the board boots.', { pin: label, gpio: String(gpio) }),
        hint: critical
          ? t('Move this wire to a pin that is not a strapping pin, such as {pins}.', { pins: outputExamples })
          : t('It usually works, but if the board fails to boot or upload, move this wire first.'),
        targets: [pinT],
        source: `${DATASHEET}, strapping pins`,
      });
    }

    if (bp.flags.includes('usb') || bp.flags.includes('swd')) {
      add({
        rule: 'reserved_pin',
        severity: 'warning',
        message: bp.flags.includes('usb')
          ? t('{pin} carries the board’s USB data line. Using it breaks uploading and the serial monitor over USB.', { pin: label })
          : t('{pin} is part of the debug port. Using it can stop the debugger from reaching the chip.', { pin: label }),
        hint: t('Move this wire to a free pin such as {pins}.', { pins: outputExamples }),
        targets: [pinT],
        source: `${DATASHEET}, pin description`,
      });
    } else if (bp.flags.includes('reserved')) {
      add({
        rule: 'reserved_pin',
        severity: 'warning',
        message: t('{pin} is already used by something on the board. {note}', { pin: label, note: bp.notes ?? '' }).trim(),
        hint: t('Move this wire to a free pin such as {pins}.', { pins: outputExamples }),
        targets: [pinT],
        source: `${DATASHEET}, pin description`,
      });
    }

    // Signal levels: a 3.3 V part on a 5 V board, or a 5 V-only part on a 3.3 V pin.
    if (c.partDef && role !== 'passive') {
      const partMax = partMaxVolt(c.partDef.voltage);
      const partMin = partMinVolt(c.partDef.voltage);
      if (board.logicVolt >= 5 && partMax < 4.5) {
        add({
          rule: 'logic_level',
          severity: 'warning',
          message: t('{part} is a {need} V part, but {pin} uses 5 V signals. This can damage the part.', { part: partName(c), need: c.partDef.voltage, pin: label }),
          hint: t('Use a level shifter between the board and the part, or a version of the part made for 5 V.'),
          targets: [pinT, wireT],
          source: `library: ${c.partDef.id}`,
        });
      } else if (board.logicVolt < 4 && partMin >= 4.5 && PART_DRIVES.includes(role) && bp.maxVolt < 5 && !bp.flags.includes('five_volt_tolerant')) {
        add({
          rule: 'logic_level',
          severity: 'warning',
          message: t('{part} works at 5 V and may send 5 V signals into {pin}, which only takes 3.3 V.', { part: partName(c), pin: label }),
          hint: t('Use a level shifter, or a 3.3 V version of the part.'),
          targets: [pinT, wireT],
          source: `library: ${c.partDef.id}`,
        });
      }
    }

    if (bp.flags.includes('uart0')) {
      add({
        rule: 'uart0_pin',
        severity: 'warning',
        message: t('{pin} carries the USB serial link. Uploads and the serial monitor use it.', { pin: label }),
        hint: t('Use another pin, or disconnect this wire while uploading.'),
        targets: [pinT],
      });
    }
  }

  /* ---- shared pin conflicts ---- */
  const byPin = new Map<string, Connection[]>();
  for (const c of conns) {
    if (!c.boardPin || c.boardPin.kind !== 'gpio' || !c.role) continue;
    byPin.set(c.boardPinId, [...(byPin.get(c.boardPinId) ?? []), c]);
  }
  for (const [pinId, list] of byPin) {
    const roles = new Set(list.map((c) => c.role));
    const allShareable = [...roles].every((r) => r && SHAREABLE.includes(r));
    if (list.length > 1 && (roles.size > 1 || !allShareable)) {
      add({
        rule: 'shared_pin_conflict',
        severity: 'error',
        message: t('{pin} is wired to {parts}. These cannot share a pin.', { pin: pinId, parts: joinAnd(list.map((c) => `${partName(c)} ${c.partPin}`)) }),
        hint: t('Give each signal its own GPIO.'),
        targets: [`pin:${pinId}` as TargetRef, ...list.map((c) => `wire:${c.wire.id}` as TargetRef)],
      });
    }
  }

  /* ---- I2C: SDA/SCL crossed, compared with the part definition and the bus ---- */
  const i2cParts = scene.parts.filter((p) => parts[p.partId]?.bus === 'i2c');
  const busSda = new Set<string>();
  const busScl = new Set<string>();
  for (const inst of i2cParts) {
    const sda = conns.find((c) => c.partInstance === inst.id && c.role === 'i2c_sda');
    const scl = conns.find((c) => c.partInstance === inst.id && c.role === 'i2c_scl');
    if (sda) busSda.add(sda.boardPinId);
    if (scl) busScl.add(scl.boardPinId);
    if (!sda || !scl || !sda.boardPin || !scl.boardPin) continue;
    const sdaOnDefaultScl = sda.boardPin.functions.includes('I2C_SCL_default');
    const sclOnDefaultSda = scl.boardPin.functions.includes('I2C_SDA_default');
    if (sdaOnDefaultScl && sclOnDefaultSda) {
      const name = inst.label ?? parts[inst.partId]?.name ?? inst.id;
      add({
        rule: 'i2c_swapped',
        severity: 'warning',
        message: t('{part}: SDA goes to {sda} and SCL to {scl}. That is the reverse of the board’s default (SDA = {dsda}, SCL = {dscl}).', {
          part: name,
          sda: sda.boardPin.label,
          scl: scl.boardPin.label,
          dsda: pinById(board, board.rules.i2c.sda)?.label ?? board.rules.i2c.sda,
          dscl: pinById(board, board.rules.i2c.scl)?.label ?? board.rules.i2c.scl,
        }),
        hint: board.rules.i2c.remappable
          ? t('Swap the two wires at the sensor, or set Wire.begin({sda}, {scl}) in your code.', { sda: String(sda.boardPin.gpio), scl: String(scl.boardPin.gpio) })
          : t('Swap the two wires at the sensor. On this board the I2C pins are fixed.'),
        targets: [`wire:${sda.wire.id}`, `wire:${scl.wire.id}`, `pin:${sda.boardPinId}`, `pin:${scl.boardPinId}`],
        source: `library: ${inst.partId}`,
      });
    }
  }
  for (const p of busSda) {
    if (busScl.has(p)) {
      add({
        rule: 'i2c_swapped',
        severity: 'error',
        message: t('{pin} is SDA for one I2C part and SCL for another. The bus lines are crossed between parts.', { pin: p }),
        hint: t('All parts on one I2C bus must share the same SDA pin and the same SCL pin.'),
        targets: [`pin:${p}`],
      });
    }
  }

  /* ---- I2C: two parts that can answer at the same address on one bus ---- */
  // Parts on one bus share the SDA pin. The library lists every address a part can have, the usual
  // (default) one first; an address-select pin (ADDR, SDO, AD0…) says "address" in its pin notes.
  const onBus = new Map<string, { inst: (typeof i2cParts)[number]; def: PartDef; wire: string }[]>();
  for (const inst of i2cParts) {
    const def = parts[inst.partId];
    const sda = conns.find((c) => c.partInstance === inst.id && c.role === 'i2c_sda');
    if (!def?.addresses?.length || !sda) continue;
    onBus.set(sda.boardPinId, [...(onBus.get(sda.boardPinId) ?? []), { inst, def, wire: sda.wire.id }]);
  }
  for (const list of onBus.values()) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const aAddr = (a.def.addresses ?? []).map((x) => x.toLowerCase());
        const bAddr = (b.def.addresses ?? []).map((x) => x.toLowerCase());
        // Only a clash at the default (first listed) address matters: parts with different defaults
        // work as delivered.
        if (aAddr[0] !== bAddr[0]) continue;
        const addr = aAddr[0];
        const nameA = a.inst.label ?? a.def.name;
        const nameB = b.inst.label ?? b.def.name;
        const targets: TargetRef[] = [`part:${a.inst.id}`, `part:${b.inst.id}`, `wire:${a.wire}`, `wire:${b.wire}`];
        const source = `library: ${a.def.id === b.def.id ? a.def.id : `${a.def.id}, ${b.def.id}`}`;
        // The part that can move (the second one if both can), the address it moves to, the pin that selects it.
        const movable = [b, a].find((x) => (x.def.addresses ?? []).length > 1);
        if (!movable) {
          add({
            rule: 'i2c_address_conflict',
            severity: 'error',
            message: t('{a} and {b} both use I2C address {addr} on the same bus. Only one of them can answer.', { a: nameA, b: nameB, addr }),
            hint: t('Neither part can change its address. Put one of them on a second I2C bus, or use an I2C multiplexer.'),
            targets,
            source,
          });
          continue;
        }
        const other = (movable.def.addresses ?? []).find((ad) => ad.toLowerCase() !== addr) ?? '';
        const addrPin = movable.def.pins.find((p) => /address/i.test(p.notes ?? ''))?.name;
        add({
          rule: 'i2c_address_conflict',
          severity: 'warning',
          message: t('{a} and {b} both answer at I2C address {addr} by default, on the same bus. Set to the same address, neither reads correctly.', {
            a: nameA,
            b: nameB,
            addr,
          }),
          hint: addrPin
            ? t('Set {part} to address {other} with its {pin} pin, so each part has its own address.', { part: movable.inst.label ?? movable.def.name, other, pin: addrPin })
            : t('Set {part} to address {other} (see its address jumper or pads), so each part has its own address.', { part: movable.inst.label ?? movable.def.name, other }),
          targets,
          source,
        });
      }
  }

  /* ---- missing ground / power ---- */
  for (const inst of scene.parts) {
    const def = parts[inst.partId];
    if (!def) continue;
    const name = inst.label ?? def.name;
    for (const pp of def.pins) {
      if (pp.role !== 'ground' && pp.role !== 'power') continue;
      const wired = conns.some((c) => c.partInstance === inst.id && c.partPin === pp.name);
      if (!wired) {
        const ground = pp.role === 'ground';
        add({
          rule: ground ? 'missing_ground' : 'missing_power',
          severity: 'warning',
          message: ground
            ? t('{part} {partPin} is not connected to GND.', { part: name, partPin: pp.name })
            : t('{part} {partPin} is not connected to power.', { part: name, partPin: pp.name }),
          hint: ground
            ? t('Without a shared ground the signals have no reference. Add a wire to a GND pin.')
            : t('Add a wire from {pin} to this pin.', { pin: powerPinFor(board, def.voltage)?.label ?? '3V3' }),
          targets: [`part:${inst.id}`],
          source: `library: ${def.id}`,
        });
      }
    }
  }

  const order = { error: 0, warning: 1, info: 2 } as const;
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
