// Wiring rule checker. Pure function: scene + board + parts library in, findings out.
// Runs on every scene change; each finding becomes a warning on a pin or wire and a log line.

import type { BoardDef, PartDef, PartPinRole, PinDef, Scene, SceneWire, TargetRef, WiringFinding } from './types';
import { FLASH_GPIOS, isAdcGpio, ADC2_GPIOS, pinById } from './board';

interface Connection {
  wire: SceneWire;
  boardPin: PinDef | undefined;
  boardPinId: string;
  partInstance: string;
  partDef: PartDef | undefined;
  partPin: string;
  role: PartPinRole | undefined;
}

const DATASHEET = 'datasheet: ESP32 Series Datasheet';

/** Roles that need the board pin to drive a signal. */
const NEEDS_OUTPUT: PartPinRole[] = ['i2c_sda', 'i2c_scl', 'spi_mosi', 'spi_sck', 'spi_cs', 'digital_in', 'onewire'];
/** Roles that may share one board pin with other parts of the same role (a bus). */
const SHAREABLE: PartPinRole[] = ['i2c_sda', 'i2c_scl', 'spi_mosi', 'spi_miso', 'spi_sck', 'power', 'ground'];

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
        message: `The wire goes to “${c.boardPinId}”, which is not a pin on this board.`,
        hint: 'Move the wire to a pin shown on the board.',
        targets: [wireT],
      });
      continue;
    }
    const gpio = bp.gpio;
    const label = bp.label;

    // Flash pins (not broken out on the 30-pin board, but other boards may expose them).
    if (gpio !== null && (FLASH_GPIOS.includes(gpio) || bp.flags.includes('flash'))) {
      add({
        rule: 'flash_pin',
        severity: 'error',
        message: `${label} (GPIO ${gpio}) is wired to the board’s internal flash memory.`,
        hint: 'Never use GPIO 6 to 11. Move this wire to a free GPIO.',
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
          message: `${partName(c)} ${c.partPin} (power) goes to GND. The part gets no power.`,
          hint: `Move it to 3V3.`,
          targets: [pinT, wireT],
        });
      } else if (bp.kind === 'power' && bp.supplies !== undefined && c.partDef) {
        const max = partMaxVolt(c.partDef.voltage);
        const min = partMinVolt(c.partDef.voltage);
        if (bp.supplies > max + 0.2) {
          add({
            rule: 'voltage_mismatch',
            severity: 'error',
            message: `${partName(c)} runs on ${c.partDef.voltage} V but gets ${bp.supplies} V from ${label}.`,
            hint: `Move the power wire to 3V3. ${bp.supplies} V can damage the part and the ESP32 pins it talks to.`,
            targets: [pinT, wireT],
            source: `library: ${c.partDef.id}`,
          });
        } else if (bp.supplies < min - 0.2) {
          add({
            rule: 'voltage_mismatch',
            severity: 'warning',
            message: `${partName(c)} needs ${c.partDef.voltage} V but gets only ${bp.supplies} V from ${label}.`,
            hint: 'It may not work reliably. Check the part’s datasheet or use a level shifter.',
            targets: [pinT, wireT],
            source: `library: ${c.partDef.id}`,
          });
        }
      } else if (bp.kind === 'gpio') {
        add({
          rule: 'wrong_pin_type',
          severity: 'warning',
          message: `${partName(c)} is powered from ${label}, a signal pin.`,
          hint: 'A GPIO can only supply a few milliamps. Use 3V3 for power.',
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
          message: `${partName(c)} ${c.partPin} (ground) goes to ${label}${bp.kind === 'power' ? ', a power pin. That is a short circuit.' : ', not to GND.'}`,
          hint: 'Move it to a GND pin.',
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
        message: `${partName(c)} ${c.partPin} is a signal but goes to ${label}.`,
        hint: 'Move it to a GPIO pin.',
        targets: [pinT, wireT],
      });
      continue;
    }

    if (NEEDS_OUTPUT.includes(role) && bp.flags.includes('input_only')) {
      add({
        rule: 'output_on_input_only',
        severity: 'error',
        message: `${label} (GPIO ${gpio}) can only read signals, but ${partName(c)} ${c.partPin} needs a pin that can drive it.`,
        hint: 'GPIO 34 to 39 are input only. Move this wire to a pin such as D25, D26, D27 or D32.',
        targets: [pinT, wireT],
        source: 'datasheet: ESP32 Technical Reference Manual, IO_MUX and GPIO Matrix (GPIO 34-39 input only)',
      });
    }

    if (role === 'analog_out' && gpio !== null) {
      if (!isAdcGpio(gpio)) {
        add({
          rule: 'not_adc',
          severity: 'error',
          message: `${label} cannot measure voltage, so the ${partName(c)} value cannot be read here.`,
          hint: 'Move the wire to an ADC1 pin: GPIO 32 to 39 (D32, D33, D34, D35, VP, VN).',
          targets: [pinT, wireT],
          source: `${DATASHEET}, Pin Description (ADC channels)`,
        });
      } else if (ADC2_GPIOS.includes(gpio)) {
        add({
          rule: 'adc2_wifi',
          severity: 'info',
          message: `${label} is an ADC2 pin. It stops working while Wi-Fi is on.`,
          hint: 'If your project uses Wi-Fi, move this wire to an ADC1 pin (GPIO 32 to 39).',
          targets: [pinT],
          source: 'datasheet: ESP-IDF Programming Guide, ADC limitations',
        });
      }
    }

    if (bp.flags.includes('strapping')) {
      const is12 = gpio === 12;
      add({
        rule: 'strapping_pin',
        severity: is12 && (c.partDef?.pullupsOnBoard || role === 'i2c_sda' || role === 'i2c_scl') ? 'error' : 'warning',
        message: is12
          ? `${label} (GPIO 12) is a strapping pin. If ${partName(c)} holds it HIGH at reset, the board picks the wrong flash voltage and may not boot.`
          : `${label} (GPIO ${gpio}) is a strapping pin. Its level at reset changes how the board boots.`,
        hint: is12
          ? 'Move this wire to a pin that is not a strapping pin, such as D25, D26 or D27.'
          : 'It usually works, but if the board fails to boot or upload, move this wire first.',
        targets: [pinT],
        source: `${DATASHEET}, Strapping Pins`,
      });
    }

    if (bp.flags.includes('uart0')) {
      add({
        rule: 'uart0_pin',
        severity: 'warning',
        message: `${label} carries the USB serial link. Uploads and the serial monitor use it.`,
        hint: 'Use another pin, or disconnect this wire while uploading.',
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
        message: `${pinId} is wired to ${list.map((c) => `${partName(c)} ${c.partPin}`).join(' and ')}. These cannot share a pin.`,
        hint: 'Give each signal its own GPIO.',
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
        message: `${name}: SDA goes to ${sda.boardPin.label} and SCL to ${scl.boardPin.label}. That is the reverse of the ESP32 default (SDA = D21, SCL = D22).`,
        hint: 'Swap the two wires at the sensor, or set Wire.begin(22, 21) in your code.',
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
        message: `${p} is SDA for one I2C part and SCL for another. The bus lines are crossed between parts.`,
        hint: 'All parts on one I2C bus must share the same SDA pin and the same SCL pin.',
        targets: [`pin:${p}`],
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
          message: `${name} ${pp.name} is not connected${ground ? ' to GND' : ' to power'}.`,
          hint: ground
            ? 'Without a shared ground the signals have no reference. Add a wire to a GND pin.'
            : 'Add a wire from 3V3 to this pin.',
          targets: [`part:${inst.id}`],
          source: `library: ${def.id}`,
        });
      }
    }
  }

  const order = { error: 0, warning: 1, info: 2 } as const;
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
