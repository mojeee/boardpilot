// Code vs wiring checker. Pure function: the user's Arduino sketch + the drawing (scene, board,
// parts) in, findings out. It reads the code as text (no compiler), so every finding is a check of
// the drawing against the code, never a measurement, and says so in its source.
//
// Pin numbers in code are Arduino pin numbers. They equal the board file's `gpio` on ESP32, Pico,
// AVR and Teensy; on STM32 (STM32duino) and the nRF52840 DK a plain number n is the header pin Dn,
// and STM32 code can also use chip names (PA5, PB_3).

import type { BoardDef, PartDef, PartPinRole, PinDef, Scene, TargetRef } from './types';
import { isAdcPin, isEspFamily, pinById } from './board';
import { t } from './i18n';

export interface CodeFinding {
  id: string;
  rule:
    | 'code_i2c_pins'
    | 'code_output_on_input_only'
    | 'code_flash_pin'
    | 'code_no_pullup'
    | 'code_not_adc'
    | 'code_adc2_wifi'
    | 'code_pin_not_wired'
    | 'code_wired_pin_unused'
    | 'code_baud'
    | 'code_unknown_pin';
  severity: 'error' | 'warning' | 'info';
  message: string;
  hint: string;
  /** 1-based line in the sketch */
  line: number;
  targets: TargetRef[];
  source: string;
}

export interface CodeCheckOptions {
  /** Baud rate the serial monitor listens at, to compare with Serial.begin(). */
  monitorBaud?: number;
}

interface Call {
  name: string;
  args: string[];
  line: number;
}

/** Roles where the board drives the part: the code should write this pin. */
const BOARD_DRIVES: PartPinRole[] = ['digital_in'];

/** Blank out comments and string contents, keeping line breaks so line numbers stay right. */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/"(?:\\.|[^"\\\n])*"/g, (m) => `"${' '.repeat(Math.max(0, m.length - 2))}"`);
}

const lineAt = (src: string, index: number) => src.slice(0, index).split('\n').length;

/** Split call arguments at top-level commas. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Every function call (including Wire.begin, Serial.begin, obj.attach) with its arguments. */
function calls(code: string): Call[] {
  const out: Call[] = [];
  const re = /([A-Za-z_][\w.]*(?:->\w+)?)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    // Find the matching parenthesis.
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < code.length && depth > 0) {
      if (code[i] === '(') depth++;
      else if (code[i] === ')') depth--;
      i++;
    }
    out.push({ name: m[1], args: splitArgs(code.slice(start, i - 1)), line: lineAt(code, m.index) });
  }
  return out;
}

/** Constants: #define NAME value, and (const) integer variables assigned a literal or a pin name. */
function constants(code: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of code.matchAll(/^[ \t]*#define[ \t]+(\w+)[ \t]+\(?([\w]+)\)?[ \t]*$/gm)) out.set(m[1], m[2]);
  const decl = /\b(?:static\s+)?(?:const\s+|constexpr\s+)?(?:unsigned\s+)?(?:int|uint8_t|int8_t|uint16_t|int16_t|byte|short|long|pin_size_t|gpio_num_t|auto)\s+(\w+)\s*=\s*\(?(\w+)\)?\s*[;,]/g;
  for (const m of code.matchAll(decl)) if (!out.has(m[1])) out.set(m[1], m[2]);
  return out;
}

export function checkCode(source: string, scene: Scene, board: BoardDef, parts: Record<string, PartDef>, opts: CodeCheckOptions = {}): CodeFinding[] {
  const code = stripComments(source);
  const consts = constants(code);
  const all = calls(code);
  const findings: CodeFinding[] = [];
  const seen = new Set<string>();
  const SRC = t('check of the drawing against your code (not a measurement)');
  const add = (f: Omit<CodeFinding, 'id' | 'source'>) => {
    const id = `${f.rule}:${f.line}:${f.targets.join(',')}`;
    if (seen.has(id)) return;
    seen.add(id);
    findings.push({ id, source: SRC, ...f });
  };
  const esp = isEspFamily(board);
  const headerNumbering = board.family === 'stm32' || board.family === 'nrf52';

  /** The board pin an expression in code refers to, if it can be worked out from the text. */
  const resolve = (expr: string, depth = 0): PinDef | null | undefined => {
    const e = expr.trim().replace(/^\(|\)$/g, '').replace(/^(?:\(?\s*(?:uint8_t|int|gpio_num_t|pin_size_t)\s*\)\s*)/, '');
    if (!e) return undefined;
    if (consts.has(e) && depth < 4) return resolve(consts.get(e) ?? '', depth + 1);
    if (e === 'LED_BUILTIN') return board.pins.find((p) => p.flags.includes('onboard_led')) ?? null;
    const gpioNum = /^GPIO_NUM_(\d+)$/.exec(e);
    if (/^\d+$/.test(e) || gpioNum) {
      const n = Number(gpioNum ? gpioNum[1] : e);
      if (headerNumbering) return pinById(board, `D${n}`) ?? null;
      return board.pins.find((p) => p.gpio === n && p.kind === 'gpio' && !p.sameAs) ?? board.pins.find((p) => p.gpio === n) ?? null;
    }
    if (/^[AD]\d+$/.test(e)) return pinById(board, e) ?? board.pins.find((p) => p.label === e) ?? null;
    const chip = /^P([A-K])_?(\d+)$/.exec(e);
    if (chip) return board.pins.find((p) => (p.chipPin ?? p.id).replace('_', '') === `P${chip[1]}${chip[2]}` && p.kind === 'gpio') ?? null;
    return undefined; // an expression we cannot follow (a variable, a sum): stay quiet
  };
  const label = (p: PinDef) => (p.gpio !== null && !headerNumbering && p.label !== String(p.gpio) ? `${p.label} (GPIO ${p.gpio})` : p.label);
  const pinT = (p: PinDef): TargetRef => `pin:${p.id}`;

  /* ---- what the drawing says ---- */
  const wiresTo = (pinId: string) => scene.wires.filter((w) => (w.from.part === 'board' && w.from.pin === pinId) || (w.to.part === 'board' && w.to.pin === pinId));
  const partPinOn = (pinId: string) =>
    wiresTo(pinId).map((w) => {
      const end = w.from.part === 'board' ? w.to : w.from;
      const inst = scene.parts.find((p) => p.id === end.part);
      const def = inst ? parts[inst.partId] : undefined;
      return { w, inst, def, pin: end.pin, role: def?.pins.find((x) => x.name === end.pin)?.role };
    });
  const i2cPin = (role: 'i2c_sda' | 'i2c_scl') => {
    for (const w of scene.wires) {
      const boardEnd = w.from.part === 'board' ? w.from : w.to.part === 'board' ? w.to : null;
      const partEnd = w.from.part === 'board' ? w.to : w.from;
      const inst = scene.parts.find((p) => p.id === partEnd.part);
      const def = inst ? parts[inst.partId] : undefined;
      if (boardEnd && def?.pins.find((x) => x.name === partEnd.pin)?.role === role) return pinById(board, boardEnd.pin);
    }
    return undefined;
  };
  const drawnSda = i2cPin('i2c_sda');
  const drawnScl = i2cPin('i2c_scl');
  const partLabel = (x: ReturnType<typeof partPinOn>[number]) => `${x.inst?.label ?? x.def?.name ?? x.inst?.id ?? '?'} ${x.pin}`;

  /* ---- pin use in the code ---- */
  const usesWifi = /\bWiFi\s*\.\s*(begin|softAP|mode)\s*\(/.test(code) || /\besp_wifi_start\s*\(/.test(code);
  const written = new Map<string, { pin: PinDef; line: number }>();
  const mentioned = new Set<string>();

  for (const c of all) {
    // Any resolvable argument of any call counts as "the code uses this pin" (library objects too).
    for (const a of c.args) {
      const p = resolve(a);
      if (p) mentioned.add(p.id);
    }
    const fn = c.name.replace(/^.*[.>]/, '');
    const first = c.args[0];
    if (!first) continue;

    if (fn === 'pinMode' && c.name === 'pinMode') {
      const p = resolve(first);
      if (p === null) {
        add({
          rule: 'code_unknown_pin',
          severity: 'warning',
          message: t('Line {line}: pin {pin} is not on this board’s header.', { line: c.line, pin: first }),
          hint: t('Check the pin number against the board’s pinout (2D pinout view).'),
          line: c.line,
          targets: [],
        });
        continue;
      }
      if (!p) continue;
      const mode = c.args[1] ?? '';
      if (p.flags.includes('flash')) {
        add({
          rule: 'code_flash_pin',
          severity: 'error',
          message: t('Line {line}: {pin} is connected to the board’s flash memory. Using it stops the program.', { line: c.line, pin: label(p) }),
          hint: t('Use another pin.'),
          line: c.line,
          targets: [pinT(p)],
        });
      } else if (/OUTPUT/.test(mode) && p.flags.includes('input_only')) {
        add({
          rule: 'code_output_on_input_only',
          severity: 'error',
          message: t('Line {line}: pinMode({pin}, OUTPUT), but {pin} can only be an input.', { line: c.line, pin: label(p) }),
          hint: t('Pick an output-capable pin for this signal and move the wire to it.'),
          line: c.line,
          targets: [pinT(p)],
        });
      } else if (/INPUT_PULL(UP|DOWN)/.test(mode) && p.flags.includes('no_internal_pull')) {
        add({
          rule: 'code_no_pullup',
          severity: 'warning',
          message: t('Line {line}: {mode} on {pin}, but this pin has no internal pull resistor. A button there reads random values.', {
            line: c.line,
            mode: mode.trim(),
            pin: label(p),
          }),
          hint: t('Add an external 10 kΩ resistor, or use a pin that has internal pull-ups.'),
          line: c.line,
          targets: [pinT(p)],
        });
      }
      if (/OUTPUT/.test(mode)) written.set(p.id, { pin: p, line: c.line });
    }

    if (['digitalWrite', 'analogWrite', 'ledcAttachPin', 'ledcAttach', 'tone'].includes(c.name)) {
      const p = resolve(first);
      if (!p) continue;
      if (p.flags.includes('input_only')) {
        add({
          rule: 'code_output_on_input_only',
          severity: 'error',
          message: t('Line {line}: {fn}({pin}, …), but {pin} can only be an input.', { line: c.line, fn: c.name, pin: label(p) }),
          hint: t('Pick an output-capable pin for this signal and move the wire to it.'),
          line: c.line,
          targets: [pinT(p)],
        });
      }
      if (!written.has(p.id)) written.set(p.id, { pin: p, line: c.line });
    }

    if (c.name === 'analogRead' || c.name === 'analogReadMilliVolts') {
      const p = resolve(first);
      if (!p) continue;
      if (!isAdcPin(p)) {
        add({
          rule: 'code_not_adc',
          severity: 'error',
          message: t('Line {line}: {fn}({pin}), but {pin} has no analog input.', { line: c.line, fn: c.name, pin: label(p) }),
          hint: t('Use an analog pin such as {pins}.', { pins: board.rules.adcPins.slice(0, 3).map((id) => pinById(board, id)?.label ?? id).join(', ') }),
          line: c.line,
          targets: [pinT(p)],
        });
      } else if (board.rules.adcWifiConflict && usesWifi && p.flags.includes('adc2')) {
        add({
          rule: 'code_adc2_wifi',
          severity: 'warning',
          message: t('Line {line}: {pin} is an ADC2 pin, and this sketch turns on Wi-Fi. ADC2 readings fail while Wi-Fi is on.', { line: c.line, pin: label(p) }),
          hint: t('Move the analog wire to an ADC1 pin such as {pins}.', {
            pins: board.rules.adcPins.filter((id) => pinById(board, id)?.flags.includes('adc1')).slice(0, 3).map((id) => pinById(board, id)?.label ?? id).join(', '),
          }),
          line: c.line,
          targets: [pinT(p)],
        });
      }
    }

    // I2C pins set in code vs the drawing.
    if ((c.name === 'Wire.begin' || c.name === 'Wire.setPins') && c.args.length >= 2 && esp && drawnSda && drawnScl) {
      const sda = resolve(c.args[0]);
      const scl = resolve(c.args[1]);
      if (!sda || !scl) continue;
      i2cCompare(sda, scl, c.line);
    }
    if ((c.name === 'Wire.setSDA' || c.name === 'Wire.setSCL') && drawnSda && drawnScl) {
      const p = resolve(first);
      const want = c.name === 'Wire.setSDA' ? drawnSda : drawnScl;
      const other = c.name === 'Wire.setSDA' ? drawnScl : drawnSda;
      if (p && p.id !== want.id) {
        add({
          rule: 'code_i2c_pins',
          severity: p.id === other.id ? 'error' : 'warning',
          message: t('Line {line}: {call}({pin}), but the drawing has {role} on {want}.', {
            line: c.line,
            call: c.name,
            pin: label(p),
            role: c.name === 'Wire.setSDA' ? 'SDA' : 'SCL',
            want: label(want),
          }),
          hint: t('Change the code to {call}({want}), or move the wire.', { call: c.name, want: want.gpio !== null ? String(want.gpio) : want.label }),
          line: c.line,
          targets: [pinT(p), pinT(want)],
        });
      }
    }

    if (c.name === 'Serial.begin' && opts.monitorBaud) {
      const baud = Number(consts.get(first) ?? first);
      if (Number.isFinite(baud) && baud > 0 && baud !== opts.monitorBaud) {
        add({
          rule: 'code_baud',
          severity: 'warning',
          message: t('Line {line}: Serial.begin({baud}), but the monitor listens at {monitor}. The output will look like garbage.', {
            line: c.line,
            baud,
            monitor: opts.monitorBaud,
          }),
          hint: t('Set the monitor to {baud} baud, or change Serial.begin.', { baud }),
          line: c.line,
          targets: [],
        });
      }
    }
  }

  function i2cCompare(sda: PinDef, scl: PinDef, line: number) {
    if (!drawnSda || !drawnScl || (sda.id === drawnSda.id && scl.id === drawnScl.id)) return;
    const swapped = sda.id === drawnScl.id && scl.id === drawnSda.id;
    add({
      rule: 'code_i2c_pins',
      severity: swapped ? 'error' : 'warning',
      message: swapped
        ? t('Line {line}: the code sets SDA = {sda} and SCL = {scl}, the reverse of the drawing (SDA on {dsda}, SCL on {dscl}).', {
            line,
            sda: label(sda),
            scl: label(scl),
            dsda: label(drawnSda),
            dscl: label(drawnScl),
          })
        : t('Line {line}: the code sets SDA = {sda} and SCL = {scl}, but the drawing has SDA on {dsda} and SCL on {dscl}.', {
            line,
            sda: label(sda),
            scl: label(scl),
            dsda: label(drawnSda),
            dscl: label(drawnScl),
          }),
      hint: t('Change the code to Wire.begin({sda}, {scl}), or move the wires to match the code.', { sda: String(drawnSda.gpio), scl: String(drawnScl.gpio) }),
      line,
      targets: [pinT(sda), pinT(scl), pinT(drawnSda), pinT(drawnScl)],
    });
  }

  // ESP32 Wire.begin() without pins uses the board default: flag a drawing on other pins.
  if (esp && drawnSda && drawnScl) {
    const plain = all.find((c) => c.name === 'Wire.begin' && c.args.length === 0);
    const withPins = all.some((c) => (c.name === 'Wire.begin' || c.name === 'Wire.setPins') && c.args.length >= 2);
    const dsda = pinById(board, board.rules.i2c.sda);
    const dscl = pinById(board, board.rules.i2c.scl);
    if (plain && !withPins && dsda && dscl) i2cCompare(dsda, dscl, plain.line);
  }

  // Outputs: a part the board drives is wired to one pin while the code writes another.
  const drivenPins = board.pins.filter((p) => partPinOn(p.id).some((x) => x.role && BOARD_DRIVES.includes(x.role)));
  const unusedDriven = drivenPins.filter((p) => !mentioned.has(p.id));
  const strayWrites = [...written.values()].filter((w) => wiresTo(w.pin.id).length === 0);
  for (const w of strayWrites) {
    const guess = unusedDriven.length === 1 ? unusedDriven[0] : undefined;
    add({
      rule: 'code_pin_not_wired',
      severity: 'warning',
      message: guess
        ? t('Line {line}: the code drives {pin}, but nothing is wired there. In the drawing, {part} is on {wired}.', {
            line: w.line,
            pin: label(w.pin),
            part: partPinOn(guess.id).filter((x) => x.role && BOARD_DRIVES.includes(x.role)).map(partLabel).join(', '),
            wired: label(guess),
          })
        : t('Line {line}: the code drives {pin}, but nothing is wired there in the drawing.', { line: w.line, pin: label(w.pin) }),
      hint: guess
        ? t('Change the pin in the code to {wired}, or move the wire to {pin}.', { wired: guess.gpio !== null && !headerNumbering ? String(guess.gpio) : guess.label, pin: label(w.pin) })
        : t('Check the pin number, or add the part to the drawing.'),
      line: w.line,
      targets: guess ? [pinT(w.pin), pinT(guess)] : [pinT(w.pin)],
    });
  }
  // A driven part the code never mentions (only when the code does use pins, to avoid noise on
  // sketches that set everything up through libraries).
  if (mentioned.size > 0) {
    for (const p of unusedDriven) {
      if (strayWrites.length === 1 && unusedDriven.length === 1) continue; // already explained above
      add({
        rule: 'code_wired_pin_unused',
        severity: 'info',
        message: t('{part} is wired to {pin}, but the code never uses {pin}.', {
          part: partPinOn(p.id).filter((x) => x.role && BOARD_DRIVES.includes(x.role)).map(partLabel).join(', '),
          pin: label(p),
        }),
        hint: t('If the code uses a variable for this pin, check that it is set to {n}.', { n: p.gpio !== null && !headerNumbering ? String(p.gpio) : p.label }),
        line: 0,
        targets: [pinT(p)],
      });
    }
  }

  const order = { error: 0, warning: 1, info: 2 } as const;
  return findings.sort((a, b) => order[a.severity] - order[b.severity] || a.line - b.line);
}
