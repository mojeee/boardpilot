// Pico SDK starter project for RP2040 / RP2350 boards, generated from the project scene.
//
// Output: CMakeLists.txt, pico_sdk_import.cmake (the SDK's own file), main.c and README.md.
// main.c uses only the GPIOs wired in the scene, with the numbers from the board file. Which pin
// can be I2C, SPI, PWM or ADC comes from each pin's `functions` in the board file (datasheet
// function-select table), never from a hard-coded list. Part "drivers" stay trivial: a chip id
// register when the part file documents one (idCheck), an address probe otherwise, a digital
// level or an ADC reading. Anything more points to the part's datasheet.

import type { BoardDef, PartDef, Scene } from '../types';
import { pinById } from '../board';
import { t } from '../i18n';
import { PICO_SDK_IMPORT_CMAKE } from './picoSdkImport';
import { boardSource, cIdent, cStr, oneLine, partSource, sceneParts, sceneSignals, sceneTag, slug, type Signal, type StarterProject } from './common';

export const isRpBoard = (b: BoardDef) => b.family === 'rp2040' || b.family === 'rp2350';

/** The CMake target and the .uf2 file name. */
export const PICO_TARGET = 'boardpilot_starter';

/** I2C clock for every bus: 100 kHz standard mode, which every I2C part supports. */
const I2C_HZ = 100_000;
/** Timeout for each I2C transfer, so a missing part prints a message instead of hanging. */
const I2C_TIMEOUT_US = 10_000;
/** LED PWM: 1 kHz with TOP = 999 (1000 brightness steps). */
const PWM_TOP = 999;
const PWM_HZ = 1000;
/** Main loop period and how often values are printed. */
const TICK_MS = 20;
const REPORT_TICKS = 50;

const isLed = (d: PartDef) => d.model.shape === 'led' || d.starterSketch === 'led';
const isButton = (d: PartDef) => d.model.shape === 'button' || d.starterSketch === 'button';

/** Block number of a peripheral function on this pin, e.g. I2C0_SDA → 0, SPI1_SCK → 1. */
function fnIndex(p: { functions: string[] }, re: RegExp): number | null {
  for (const f of p.functions) {
    const m = re.exec(f);
    if (m) return Number(m[1]);
  }
  return null;
}

interface PwmOut {
  slice: number;
  channel: string;
}
function pwmOf(p: { functions: string[] }): PwmOut | null {
  for (const f of p.functions) {
    const m = /^PWM(\d+)_([AB])$/.exec(f);
    if (m) return { slice: Number(m[1]), channel: m[2] };
  }
  return null;
}

export interface PicoOptions {
  /** Project name for the header and the folder, e.g. the template name. */
  name?: string;
}

export function generatePicoSdk(scene: Scene, board: BoardDef, parts: Record<string, PartDef>, opts: PicoOptions = {}): StarterProject {
  const name = opts.name?.trim() || 'BoardPilot project';
  const tag = sceneTag(scene);
  const notes: string[] = [];
  const signals = sceneSignals(scene, board, parts);
  const chip = board.chip;
  const fnSrc = boardSource(board, /function select/i) ?? `${board.rules.datasheet}, GPIO function select`;
  const adcSrc = boardSource(board, /Using the ADC|GPIO and ADC/) ?? `${board.rules.datasheet}, ADC`;

  const defines: string[] = [];
  const globals: string[] = [];
  const helpers: string[] = [];
  const setup: string[] = [];
  const fast: string[] = [];
  const report: string[] = [];
  const libs = new Set<string>(['pico_stdlib']);
  const includes = new Set<string>(['#include <stdio.h>', '#include "pico/stdlib.h"']);
  /** GPIO → who uses it (key "I2C0" or "bme1.SDA", and a label for notes). One owner per pin. */
  const owner = new Map<number, { key: string; label: string }>();
  const defined = new Set<string>();
  const define = (macro: string, gpio: number, comment: string) => {
    if (defined.has(macro)) return;
    defined.add(macro);
    defines.push(`#define ${macro} ${gpio}`.padEnd(32) + `// ${oneLine(comment)}`);
  };
  const who = (s: Signal) => `${s.inst.label ?? s.def.name} ${s.pin}`;
  /** Claims a GPIO for one use; false (with a note) when another use already has it. */
  const claim = (s: Signal, key: string): boolean => {
    const cur = owner.get(s.gpio);
    if (cur === undefined) {
      owner.set(s.gpio, { key, label: who(s) });
      return true;
    }
    if (cur.key === key) return true;
    notes.push(t('{pin} is wired to both {a} and {b}. The starter uses it for {a} only.', { pin: s.board.label, a: cur.label, b: who(s) }));
    return false;
  };

  /* ---------------- I2C: one bus per SDA/SCL pair, block from the pin functions ---------------- */
  interface I2cBus {
    sda: Signal;
    scl: Signal;
    block: number | null;
    parts: Signal[];
  }
  const buses: I2cBus[] = [];
  const i2cParts = new Set<string>();
  for (const inst of scene.parts) {
    const sda = signals.find((s) => s.inst.id === inst.id && s.role === 'i2c_sda');
    const scl = signals.find((s) => s.inst.id === inst.id && s.role === 'i2c_scl');
    if (!sda && !scl) continue;
    i2cParts.add(inst.id);
    if (!sda || !scl) {
      const have = (sda ?? scl) as Signal;
      notes.push(t('{part}: {pin} is not wired, so the starter leaves this I2C part out.', { part: have.inst.label ?? have.def.name, pin: sda ? 'SCL' : 'SDA' }));
      claim(have, `${have.inst.id}.${have.pin}`);
      define(`${cIdent(have.inst.id)}_${cIdent(have.pin)}_PIN`, have.gpio, `${who(have)} (${have.board.label}), not used: the other I2C wire is missing`);
      continue;
    }
    const bus = buses.find((b) => b.sda.gpio === sda.gpio && b.scl.gpio === scl.gpio);
    if (bus) {
      bus.parts.push(sda);
      continue;
    }
    const a = fnIndex(sda.board, /^I2C(\d)_SDA$/);
    const b = fnIndex(scl.board, /^I2C(\d)_SCL$/);
    let block = a !== null && a === b ? a : null;
    if (block === null) {
      notes.push(
        t('SDA ({sda}) and SCL ({scl}) are not an I2C pair on this chip, so the starter does not start I2C there. Move the wires to a pair such as {dsda} and {dscl}.', {
          sda: sda.board.label,
          scl: scl.board.label,
          dsda: pinById(board, board.rules.i2c.sda)?.label ?? board.rules.i2c.sda,
          dscl: pinById(board, board.rules.i2c.scl)?.label ?? board.rules.i2c.scl,
        }),
      );
    } else if (buses.some((x) => x.block === block)) {
      notes.push(t('The I2C pins {sda} and {scl} use the same I2C block as another pair, so the starter leaves them out. Put all I2C parts on the same two pins.', { sda: sda.board.label, scl: scl.board.label }));
      block = null;
    }
    buses.push({ sda, scl, block, parts: [sda] });
  }
  let busNo = 0;
  for (const bus of buses) {
    const base = bus.block !== null ? `I2C${bus.block}` : `I2C_UNUSED${++busNo}`;
    const key = bus.block !== null ? `I2C${bus.block}` : `${bus.sda.inst.id} I2C`;
    const okSda = claim(bus.sda, key);
    const okScl = claim(bus.scl, key);
    const users = bus.parts.map((s) => s.inst.id).join(', ') + (bus.block === null ? ', I2C not started (see the notes in README.md)' : '');
    define(`${base}_SDA_PIN`, bus.sda.gpio, `${bus.sda.board.label}, SDA of ${users}`);
    define(`${base}_SCL_PIN`, bus.scl.gpio, `${bus.scl.board.label}, SCL of ${users}`);
    if (bus.block === null || !okSda || !okScl) {
      bus.block = null;
      continue;
    }
    libs.add('hardware_i2c');
    includes.add('#include "hardware/i2c.h"');
    const port = `i2c${bus.block}`;
    setup.push(
      '',
      `    // I2C${bus.block} at ${I2C_HZ / 1000} kHz on ${bus.sda.board.label} (SDA) and ${bus.scl.board.label} (SCL).`,
      `    // These pins can be I2C${bus.block}: ${oneLine(fnSrc)}.`,
      `    i2c_init(${port}, ${I2C_HZ});`,
      `    gpio_set_function(${base}_SDA_PIN, GPIO_FUNC_I2C);`,
      `    gpio_set_function(${base}_SCL_PIN, GPIO_FUNC_I2C);`,
      `    // Weak internal pull-ups, as in the Pico SDK i2c examples. Breakouts usually have their own.`,
      `    gpio_pull_up(${base}_SDA_PIN);`,
      `    gpio_pull_up(${base}_SCL_PIN);`,
    );
  }
  const busOf = (instId: string) => buses.find((b) => b.block !== null && b.parts.some((s) => s.inst.id === instId));
  let needReadReg = false;
  let needAnswers = false;

  /* ---------------- SPI: SCK, MOSI and MISO on one SPI block, CS as a plain GPIO ---------------- */
  interface SpiBus {
    key: string;
    block: number | null;
    sck?: Signal;
    mosi?: Signal;
    miso?: Signal;
  }
  const spiBuses: SpiBus[] = [];
  for (const inst of scene.parts) {
    const get = (role: Signal['role']) => signals.find((s) => s.inst.id === inst.id && s.role === role);
    const sck = get('spi_sck');
    const mosi = get('spi_mosi');
    const miso = get('spi_miso');
    const cs = get('spi_cs');
    if (!sck && !mosi && !miso && !cs) continue;
    const label = inst.label ?? parts[inst.partId]?.name ?? inst.id;
    let block: number | null = sck ? fnIndex(sck.board, /^SPI(\d)_SCK$/) : null;
    if (block !== null && mosi && fnIndex(mosi.board, /^SPI(\d)_MOSI$/) !== block) block = null;
    if (block !== null && miso && fnIndex(miso.board, /^SPI(\d)_MISO$/) !== block) block = null;
    const key = block !== null ? `SPI${block}` : `${inst.id} SPI`;
    let bus = spiBuses.find((b) => b.key === key);
    if (bus && block !== null && ((sck && bus.sck && bus.sck.gpio !== sck.gpio) || (mosi && bus.mosi && bus.mosi.gpio !== mosi.gpio) || (miso && bus.miso && bus.miso.gpio !== miso.gpio))) {
      notes.push(t('{part} uses other pins of an SPI block that another part already uses, so the starter leaves its SPI out.', { part: label }));
      block = null;
      bus = undefined;
    } else if (block === null) {
      notes.push(t('The SPI pins of {part} are not one SPI block on this chip, so the starter does not start SPI for it.', { part: label }));
    }
    if (!bus) {
      bus = { key: block !== null ? key : `${inst.id} SPI`, block };
      spiBuses.push(bus);
    }
    const base = block !== null ? `SPI${block}` : `${cIdent(inst.id)}_SPI`;
    for (const [role, s] of [['SCK', sck], ['MOSI', mosi], ['MISO', miso]] as const) {
      if (!s) continue;
      if (!claim(s, bus.key)) continue;
      define(`${base}_${role}_PIN`, s.gpio, `${s.board.label}, ${role}`);
      if (role === 'SCK') bus.sck ??= s;
      if (role === 'MOSI') bus.mosi ??= s;
      if (role === 'MISO') bus.miso ??= s;
    }
    if (cs && claim(cs, `${cs.inst.id}.${cs.pin}`)) {
      const macro = `${cIdent(inst.id)}_CS_PIN`;
      define(macro, cs.gpio, `${cs.board.label}, chip select of ${inst.id}`);
      setup.push('', `    // ${oneLine(label)} chip select: a plain output, HIGH = not selected.`, `    gpio_init(${macro});`, `    gpio_set_dir(${macro}, GPIO_OUT);`, `    gpio_put(${macro}, 1);`);
    }
  }
  for (const bus of spiBuses) {
    if (bus.block === null || !bus.sck) continue;
    libs.add('hardware_spi');
    includes.add('#include "hardware/spi.h"');
    const base = `SPI${bus.block}`;
    setup.push(
      '',
      `    // SPI${bus.block} at 1 MHz. These pins can be SPI${bus.block}: ${oneLine(fnSrc)}.`,
      `    spi_init(spi${bus.block}, 1000 * 1000);`,
      ...(['sck', 'mosi', 'miso'] as const).filter((r) => bus[r]).map((r) => `    gpio_set_function(${base}_${r.toUpperCase()}_PIN, GPIO_FUNC_SPI);`),
      '    // Talking to the part needs its command set: see the part datasheet.',
    );
  }

  /* ---------------- everything else, part by part ---------------- */
  const pwmUsed = new Set<string>();
  let fade = false;
  const pwmHz = board.clocks?.pwmHz ?? board.clocks?.cpuHz ?? 125_000_000;
  const div = pwmHz / (PWM_HZ * (PWM_TOP + 1));
  const divInt = Math.min(255, Math.max(1, Math.floor(div)));
  const divFrac = Math.min(15, Math.round((div - divInt) * 16));
  const pwmSrc = board.family === 'rp2040' ? 'RP2040 Datasheet 4.5.2.6 Configuring PWM Period' : `${board.rules.datasheet}, PWM chapter`;
  const clockSrc = board.clocks ? `${board.clocks.source.title}, ${board.clocks.source.section ?? ''}`.replace(/, $/, '') : board.rules.datasheet;

  for (const inst of scene.parts) {
    const def = parts[inst.partId];
    if (!def) continue;
    const label = oneLine(inst.label ?? def.name);
    const mine = signals.filter((s) => s.inst.id === inst.id && !['i2c_sda', 'i2c_scl', 'spi_sck', 'spi_mosi', 'spi_miso', 'spi_cs'].includes(s.role));
    const src = partSource(def);
    const driverSrc = def.sources[0]?.title ?? 'the part datasheet';

    // I2C part: chip id register when the part file documents one, else an address probe.
    if (i2cParts.has(inst.id)) {
      const bus = busOf(inst.id);
      const addrs = (def.addresses ?? []).map((a) => parseInt(a, 16)).filter((a) => Number.isFinite(a) && a >= 0x08 && a <= 0x77);
      if (bus && addrs.length) {
        const port = `i2c${bus.block}`;
        const list = addrs.map((a) => `0x${a.toString(16).toUpperCase().padStart(2, '0')}`);
        const v = cIdent(inst.id).toLowerCase();
        report.push('', `        // ${label} (${inst.id}) on I2C${bus.block}, address ${list.join(' or ')}.`);
        if (def.idCheck) {
          needReadReg = true;
          const reg = parseInt(def.idCheck.register, 16);
          const expect = parseInt(def.idCheck.expect, 16);
          report.push(
            `        // Chip id: register ${def.idCheck.register} reads ${def.idCheck.expect}. Source: ${oneLine(partSource(def, def.idCheck.register) ?? def.name)}.`,
            `        // Real readings need the part's driver: see ${oneLine(driverSrc)}.`,
            '        {',
            `            const uint8_t ${v}_addr[] = {${list.join(', ')}};`,
            '            bool found = false;',
            `            for (unsigned i = 0; i < sizeof ${v}_addr && !found; i++) {`,
            '                uint8_t id = 0;',
            `                if (read_reg(${port}, ${v}_addr[i], 0x${reg.toString(16).toUpperCase().padStart(2, '0')}, &id) == 1) {`,
            `                    printf("${cStr(inst.id)} (${cStr(label)}) at 0x%02X: chip id 0x%02X (expected 0x${expect.toString(16).toUpperCase().padStart(2, '0')})\\n", ${v}_addr[i], id);`,
            ...Object.entries(def.idCheck.otherValues ?? {}).flatMap(([val, text]) => {
              const n = parseInt(val, 16);
              return Number.isFinite(n) ? [`                    if (id == 0x${n.toString(16).toUpperCase().padStart(2, '0')}) printf("  ${cStr(text)}\\n");`] : [];
            }),
            '                    found = true;',
            '                }',
            '            }',
            `            if (!found) printf("${cStr(inst.id)} (${cStr(label)}): no answer at ${list.join(' or ')}. Check the wiring, or run Debug in BoardPilot.\\n");`,
            '        }',
          );
        } else {
          needAnswers = true;
          report.push(
            `        // No chip id register in the parts library: only checks that the part answers.`,
            `        // Using it needs the part's driver: see ${oneLine(driverSrc)}.`,
            '        {',
            `            const uint8_t ${v}_addr[] = {${list.join(', ')}};`,
            '            int at = -1;',
            `            for (unsigned i = 0; i < sizeof ${v}_addr && at < 0; i++) if (answers(${port}, ${v}_addr[i])) at = ${v}_addr[i];`,
            `            if (at >= 0) printf("${cStr(inst.id)} (${cStr(label)}) answers at 0x%02X\\n", at);`,
            `            else printf("${cStr(inst.id)} (${cStr(label)}): no answer at ${list.join(' or ')}. Check the wiring, or run Debug in BoardPilot.\\n");`,
            '        }',
          );
        }
      }
    }

    for (const s of mine) {
      if (!claim(s, `${s.inst.id}.${s.pin}`)) continue;
      const macro = mine.length === 1 ? `${cIdent(inst.id)}_PIN` : `${cIdent(inst.id)}_${cIdent(s.pin)}_PIN`;
      const at = `${s.board.label}`;
      const shown = `${inst.id} ${s.pin} (${at})`;

      // Part input driven by the board: an LED fades with PWM, anything else starts LOW.
      if (s.role === 'digital_in') {
        const pwm = isLed(def) ? pwmOf(s.board) : null;
        const pwmKey = pwm ? `${pwm.slice}${pwm.channel}` : '';
        if (pwm && !pwmUsed.has(pwmKey)) {
          pwmUsed.add(pwmKey);
          fade = true;
          libs.add('hardware_pwm');
          includes.add('#include "hardware/pwm.h"');
          define(macro, s.gpio, `${label} pin ${s.pin}, PWM slice ${pwm.slice} channel ${pwm.channel}`);
          setup.push(
            '',
            `    // ${label}: PWM at ${PWM_HZ} Hz, ${PWM_TOP + 1} brightness steps. f = clk_sys / (DIV x (TOP + 1)):`,
            `    // ${pwmHz / 1e6} MHz / (${div} x ${PWM_TOP + 1}) = ${PWM_HZ} Hz. Sources: ${pwmSrc}; clk_sys: ${oneLine(clockSrc)}.`,
            `    gpio_set_function(${macro}, GPIO_FUNC_PWM);`,
            '    {',
            `        uint slice = pwm_gpio_to_slice_num(${macro});`,
            `        pwm_set_clkdiv_int_frac(slice, ${divInt}, ${divFrac});`,
            `        pwm_set_wrap(slice, ${PWM_TOP});`,
            `        pwm_set_gpio_level(${macro}, 0);`,
            '        pwm_set_enabled(slice, true);',
            '    }',
          );
          fast.push(`        pwm_set_gpio_level(${macro}, fade);  // ${label}: fades up and down`);
        } else {
          define(macro, s.gpio, `${label} pin ${s.pin}, output`);
          setup.push('', `    // ${label} ${s.pin}: output, starts LOW.`, `    gpio_init(${macro});`, `    gpio_set_dir(${macro}, GPIO_OUT);`, `    gpio_put(${macro}, 0);`);
          if (isLed(def)) fast.push(`        gpio_put(${macro}, (tick / 25) % 2);  // ${label}: blinks (0.5 s on, 0.5 s off)`);
          else fast.push(`        // gpio_put(${macro}, 1);  // switches ${label} ${s.pin} on`);
        }
        continue;
      }

      // Analog output of the part: the ADC, when the pin has an ADC input.
      if (s.role === 'analog_out') {
        const ch = fnIndex(s.board, /^ADC(\d)$/);
        if (ch !== null) {
          libs.add('hardware_adc');
          includes.add('#include "hardware/adc.h"');
          define(macro, s.gpio, `${label} pin ${s.pin}, ADC input ${ch}`);
          defines.push(`#define ${macro.replace(/_PIN$/, '_ADC')} ${ch}`.padEnd(32) + `// ADC input of ${at}: ${oneLine(adcSrc)}`);
          setup.push('', `    // ${label} ${s.pin}: analog input ${ch} (${at}).`, `    adc_gpio_init(${macro});`);
          const v = cIdent(`${inst.id}_${mine.length > 1 ? s.pin : ''}`).toLowerCase();
          report.push(
            '',
            `        // ${label} ${s.pin}: 12-bit ADC, 0 to 4095 for 0 to ${board.rules.adcMaxMv} mV (ADC_VREF on the 3.3 V supply). Source: ${oneLine(adcSrc)}.`,
            `        adc_select_input(${macro.replace(/_PIN$/, '_ADC')});`,
            '        {',
            `            uint16_t ${v}_raw = adc_read();`,
            `            printf("${cStr(shown)}: raw %u, about %lu mV\\n", ${v}_raw, (unsigned long)${v}_raw * ${board.rules.adcMaxMv}UL / 4095UL);`,
            '        }',
          );
          continue;
        }
        notes.push(t('{part}: {pin} is not an analog pin, so the starter reads it as a digital level. Move the wire to {pins} for a real reading.', {
          part: label,
          pin: at,
          pins: board.rules.adcPins.map((id) => pinById(board, id)?.label ?? id).join(', '),
        }));
      }

      // Everything the board reads: buttons with the internal pull-up, other outputs as they are.
      define(macro, s.gpio, `${label} pin ${s.pin}, input`);
      if (s.role === 'onewire') {
        setup.push(
          '',
          `    // ${label} ${s.pin}: single-wire data line, idle HIGH through a pull-up. Reading the part`,
          `    // needs exact microsecond timing: see ${oneLine(src ?? 'the part datasheet')}. The starter only shows the level.`,
          `    gpio_init(${macro});`,
          `    gpio_set_dir(${macro}, GPIO_IN);`,
          `    gpio_pull_up(${macro});`,
        );
        report.push(`        printf("${cStr(shown)}: level %d\\n", gpio_get(${macro}));`);
      } else if (isButton(def)) {
        const v = cIdent(inst.id).toLowerCase();
        globals.push(`static bool ${v}_was = false;`);
        setup.push('', `    // ${label}: input with the internal pull-up; pressing connects the pin to GND (reads 0).`, `    gpio_init(${macro});`, `    gpio_set_dir(${macro}, GPIO_IN);`, `    gpio_pull_up(${macro});`);
        fast.push(
          '        {',
          `            bool now = !gpio_get(${macro});`,
          `            if (now != ${v}_was) printf("${cStr(inst.id)} (${cStr(label)}): %s\\n", now ? "pressed" : "released");`,
          `            ${v}_was = now;`,
          '        }',
        );
      } else {
        setup.push('', `    // ${label} ${s.pin}: input; the part drives the level.`, `    gpio_init(${macro});`, `    gpio_set_dir(${macro}, GPIO_IN);`);
        report.push(`        printf("${cStr(shown)}: level %d\\n", gpio_get(${macro}));`);
      }
    }
  }
  if (libs.has('hardware_adc')) setup.unshift('', '    adc_init();');
  if (needReadReg)
    helpers.push(
      '// Reads one register: writes the register address, then reads one byte after a repeated start.',
      '// Returns 1 when a byte came back, or a negative PICO_ERROR_* code (no answer, timeout).',
      'static int read_reg(i2c_inst_t *port, uint8_t addr, uint8_t reg, uint8_t *value) {',
      `    int r = i2c_write_timeout_us(port, addr, &reg, 1, true, ${I2C_TIMEOUT_US});`,
      '    if (r < 0) return r;',
      `    return i2c_read_timeout_us(port, addr, value, 1, false, ${I2C_TIMEOUT_US});`,
      '}',
      '',
    );
  if (needAnswers)
    helpers.push(
      '// True when a device acknowledges this address (a one-byte read, as in the Pico SDK bus_scan example).',
      'static bool answers(i2c_inst_t *port, uint8_t addr) {',
      '    uint8_t rx;',
      `    return i2c_read_timeout_us(port, addr, &rx, 1, false, ${I2C_TIMEOUT_US}) >= 0;`,
      '}',
      '',
    );

  const wiring = signals.map((s) => ({ part: s.inst.id, name: s.inst.label ?? s.def.name, pin: s.pin, board: s.board.label, gpio: s.gpio }));
  const header = [
    `${name}: Pico SDK starter generated by BoardPilot`,
    `Board: ${board.name} (${board.id}, ${chip}, PICO_BOARD=${board.toolchain.picoBoard ?? 'pico'})`,
    `Scene ${tag}: ${sceneParts(scene, parts).join('; ') || 'no parts'}`,
  ].map(oneLine);

  const main = [
    ...header.map((l) => `// ${l}`),
    '//',
    '// Wiring (as in the 3D view):',
    ...(wiring.length ? wiring.map((w) => `//   ${`${w.part}.${w.pin}`.padEnd(16)} -> ${w.board} (GPIO ${w.gpio})`) : ['//   nothing wired yet']),
    '//',
    '// Output: USB serial (any baud rate). Values are printed once a second.',
    '',
    ...[...includes],
    '',
    ...(defines.length ? [...defines, ''] : []),
    ...(globals.length ? [...globals, ''] : []),
    ...helpers,
    'int main(void) {',
    '    stdio_init_all();',
    '    sleep_ms(2000);  // gives the computer time to open the USB serial port',
    `    printf("${cStr(name)} on ${cStr(board.name)} (scene ${tag})\\n");`,
    ...setup,
    '',
    '    uint32_t tick = 0;',
    '    while (true) {',
    ...(fade ? [`        uint16_t fade = (uint16_t)(((tick / 100) % 2 ? 100 - tick % 100 : tick % 100) * ${Math.floor((PWM_TOP + 1) / 100)});`] : []),
    ...fast,
    `        if (tick % ${REPORT_TICKS} == 0) {`,
    ...(report.length ? report.map((l) => (l ? `    ${l}` : l)).slice(report[0] === '' ? 1 : 0) : [`            printf("running, %lu s\\n", (unsigned long)(tick / ${REPORT_TICKS}));`]),
    '        }',
    '        tick++;',
    `        sleep_ms(${TICK_MS});`,
    '    }',
    '}',
    '',
  ].join('\n');

  const cmake = [
    ...header.map((l) => `# ${l}`),
    '# Build: set PICO_SDK_PATH to your pico-sdk folder, then: cmake -S . -B build && cmake --build build',
    '',
    'cmake_minimum_required(VERSION 3.13)',
    '',
    `set(PICO_BOARD ${board.toolchain.picoBoard ?? 'pico'} CACHE STRING "Board type")`,
    '',
    '# Finds the Pico SDK (must come before project()).',
    'include(pico_sdk_import.cmake)',
    '',
    `project(${PICO_TARGET} C CXX ASM)`,
    'set(CMAKE_C_STANDARD 11)',
    'set(CMAKE_CXX_STANDARD 17)',
    '',
    'pico_sdk_init()',
    '',
    `add_executable(${PICO_TARGET} main.c)`,
    `target_link_libraries(${PICO_TARGET} ${[...libs].join(' ')})`,
    '',
    '# printf goes to USB serial, not to the UART pins.',
    `pico_enable_stdio_usb(${PICO_TARGET} 1)`,
    `pico_enable_stdio_uart(${PICO_TARGET} 0)`,
    '',
    '# Also writes the .uf2 file to drag onto the board.',
    `pico_add_extra_outputs(${PICO_TARGET})`,
    '',
  ].join('\n');

  const importFile = [...header.map((l) => `# ${l}`), '# The file below is the Pico SDK original (external/pico_sdk_import.cmake), unchanged.', '', PICO_SDK_IMPORT_CMAKE].join('\n');

  const readme = [
    `# ${oneLine(name)}`,
    '',
    `Pico SDK starter project generated by BoardPilot for the **${board.name}** (\`${board.id}\`, ${chip}).`,
    `Scene \`${tag}\`: ${sceneParts(scene, parts).join('; ') || 'no parts'}.`,
    '',
    '## Wiring',
    '',
    '| Part | Part pin | Board pin | GPIO |',
    '|---|---|---|---|',
    ...wiring.map((w) => `| ${oneLine(w.name)} (\`${w.part}\`) | ${w.pin} | ${w.board} | ${w.gpio} |`),
    ...(notes.length ? ['', '## Notes', '', ...notes.map((n) => `- ${oneLine(n)}`)] : []),
    '',
    '## Build',
    '',
    '1. Install the Pico SDK, the Arm GCC toolchain (`arm-none-eabi-gcc`) and CMake. See "Getting started with Raspberry Pi Pico-series".',
    '2. Point `PICO_SDK_PATH` to the SDK folder, for example `export PICO_SDK_PATH=~/pico-sdk`.',
    '3. In this folder: `cmake -S . -B build`, then `cmake --build build`.',
    `4. Hold BOOTSEL while plugging in the USB cable, then copy \`build/${PICO_TARGET}.uf2\` to the drive that appears.`,
    '5. Open the serial monitor (in BoardPilot: Monitor). The program prints the values once a second.',
    '',
    'Every hardware fact used in `main.c` has its datasheet source in a comment next to it.',
    '',
  ].join('\n');

  return {
    folder: `${slug(name)}-pico-sdk`,
    files: [
      { name: 'CMakeLists.txt', text: cmake },
      { name: 'pico_sdk_import.cmake', text: importFile },
      { name: 'main.c', text: main },
      { name: 'README.md', text: readme },
    ],
    notes,
  };
}
