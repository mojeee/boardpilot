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
import { displayPinsFromCode, pinNumber, type DisplayPinRole } from './displayPins';

export interface CodeFinding {
  id: string;
  rule:
    | 'code_i2c_pins'
    | 'code_spi_pins'
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
  /** 1-based line in the sketch (in `file` when set) */
  line: number;
  /** The project file the line is in (checkProject); absent for a single sketch. */
  file?: string;
  /** Where on the line: 0-based column and length of the call the finding is about. */
  span?: { col: number; len: number };
  targets: TargetRef[];
  source: string;
  /** A one-click fix: the whole line rewritten (only offered when it is a plain, safe edit). */
  fix?: CodeFix;
}

export interface CodeFix {
  text: string;
}

export interface CodeCheckOptions {
  /** Baud rate the serial monitor listens at, to compare with Serial.begin(). */
  monitorBaud?: number;
  /** For several files checked as one text (checkProject): the file and line a line of the text came from. */
  mapLine?: (line: number) => { line: number; file?: string };
}

export interface Call {
  name: string;
  args: string[];
  line: number;
  /** Offset of the call's name in the code, of each argument, and just after the closing parenthesis. */
  index: number;
  argPos: number[];
  end: number;
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

/** Split call arguments at top-level commas, with the offset of each (trimmed) argument in `s`. */
function splitArgs(s: string): { args: string[]; pos: number[] } {
  const args: string[] = [];
  const pos: number[] = [];
  let depth = 0;
  let start = 0;
  const push = (end: number) => {
    const raw = s.slice(start, end);
    if (!raw.trim()) return;
    args.push(raw.trim());
    pos.push(start + (raw.length - raw.trimStart().length));
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      push(i);
      start = i + 1;
    }
  }
  push(s.length);
  return { args, pos };
}

/** Every function call (including Wire.begin, Serial.begin, obj.attach) with its arguments. Pass comment-free code (stripComments). */
export function calls(code: string): Call[] {
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
    const { args, pos } = splitArgs(code.slice(start, i - 1));
    out.push({ name: m[1], args, line: lineAt(code, m.index), index: m.index, argPos: pos.map((p) => start + p), end: i });
  }
  return out;
}

/** Constants: #define NAME value, and (const) integer variables assigned a literal or a pin name. */
export function constants(code: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of code.matchAll(/^[ \t]*#define[ \t]+(\w+)[ \t]+\(?([\w]+)\)?[ \t]*$/gm)) out.set(m[1], m[2]);
  const decl = /\b(?:static\s+)?(?:const\s+|constexpr\s+)?(?:unsigned\s+)?(?:int|uint8_t|int8_t|uint16_t|int16_t|byte|short|long|pin_size_t|gpio_num_t|auto)\s+(\w+)\s*=\s*\(?(\w+)\)?\s*[;,]/g;
  for (const m of code.matchAll(decl)) if (!out.has(m[1])) out.set(m[1], m[2]);
  return out;
}

/**
 * The board pin an expression in code refers to, if it can be worked out from the text: a number,
 * a #define or constant, LED_BUILTIN, GPIO_NUM_n, A0/D5, or an STM32 chip name (PA5, PB_3).
 * undefined: an expression we cannot follow (a variable, a sum); null: a pin the board does not have.
 */
export function pinResolver(consts: Map<string, string>, board: BoardDef): (expr: string) => PinDef | null | undefined {
  const headerNumbering = board.family === 'stm32' || board.family === 'nrf52';
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
  return (expr) => resolve(expr);
}

export function checkCode(source: string, scene: Scene, board: BoardDef, parts: Record<string, PartDef>, opts: CodeCheckOptions = {}): CodeFinding[] {
  const code = stripComments(source);
  const consts = constants(code);
  const all = calls(code);
  const findings: CodeFinding[] = [];
  const seen = new Set<string>();
  const SRC = t('check of the drawing against your code (not a measurement)');
  const where = (line: number) => (opts.mapLine && line > 0 ? opts.mapLine(line) : { line });
  /** The line for a message: "12", or "3 (pins.h)" for a line in another project file. */
  const ln = (line: number) => {
    const w = where(line);
    return w.file ? `${w.line} (${w.file})` : w.line;
  };
  /** The call the current finding is about, for its span on the line. */
  let cur: Call | undefined;
  const add = (f: Omit<CodeFinding, 'id' | 'source'>) => {
    const w = where(f.line);
    const id = `${f.rule}:${w.file ? `${w.file}:` : ''}${w.line}:${f.targets.join(',')}`;
    if (seen.has(id)) return;
    seen.add(id);
    let span: CodeFinding['span'];
    if (cur && f.line > 0 && cur.line === f.line) {
      const lineStart = code.lastIndexOf('\n', cur.index - 1) + 1;
      const lineEnd = code.indexOf('\n', cur.index);
      span = { col: cur.index - lineStart, len: Math.max(1, Math.min(cur.end, lineEnd < 0 ? code.length : lineEnd) - cur.index) };
    }
    findings.push({ id, source: SRC, ...f, line: w.line, ...(w.file ? { file: w.file } : {}), ...(span ? { span } : {}) });
  };
  const esp = isEspFamily(board);
  const headerNumbering = board.family === 'stm32' || board.family === 'nrf52';
  const srcLines = source.split('\n');
  /**
   * The line with the first arguments of `name(…)` replaced, when the call sits on that one line
   * and those arguments are plain numbers (a named constant is left for the user to change).
   */
  const fixCall = (line: number, name: string, args: string[]): CodeFix | undefined => {
    const src = srcLines[line - 1];
    if (!src || args.some((a) => !a)) return undefined;
    const m = new RegExp(`${name.replace('.', '\\s*\\.\\s*')}\\s*\\(([^()]*)\\)`).exec(src);
    if (!m) return undefined;
    const old = m[1].split(',').map((a) => a.trim());
    if (old.length < args.length || old.slice(0, args.length).some((a) => !/^\d+$/.test(a))) return undefined;
    return { text: `${src.slice(0, m.index)}${name}(${[...args, ...old.slice(args.length)].join(', ')})${src.slice(m.index + m[0].length)}` };
  };

  const resolve = pinResolver(consts, board);
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
  const written = new Map<string, { pin: PinDef; line: number; call: Call }>();
  const mentioned = new Set<string>();

  for (const c of all) {
    cur = c;
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
          message: t('Line {line}: pin {pin} is not on this board’s header.', { line: ln(c.line), pin: first }),
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
          message: t('Line {line}: {pin} is connected to the board’s flash memory. Using it stops the program.', { line: ln(c.line), pin: label(p) }),
          hint: t('Use another pin.'),
          line: c.line,
          targets: [pinT(p)],
        });
      } else if (/OUTPUT/.test(mode) && p.flags.includes('input_only')) {
        add({
          rule: 'code_output_on_input_only',
          severity: 'error',
          message: t('Line {line}: pinMode({pin}, OUTPUT), but {pin} can only be an input.', { line: ln(c.line), pin: label(p) }),
          hint: t('Pick an output-capable pin for this signal and move the wire to it.'),
          line: c.line,
          targets: [pinT(p)],
        });
      } else if (/INPUT_PULL(UP|DOWN)/.test(mode) && p.flags.includes('no_internal_pull')) {
        add({
          rule: 'code_no_pullup',
          severity: 'warning',
          message: t('Line {line}: {mode} on {pin}, but this pin has no internal pull resistor. A button there reads random values.', {
            line: ln(c.line),
            mode: mode.trim(),
            pin: label(p),
          }),
          hint: t('Add an external 10 kΩ resistor, or use a pin that has internal pull-ups.'),
          line: c.line,
          targets: [pinT(p)],
        });
      }
      if (/OUTPUT/.test(mode)) written.set(p.id, { pin: p, line: c.line, call: c });
    }

    if (['digitalWrite', 'analogWrite', 'ledcAttachPin', 'ledcAttach', 'tone'].includes(c.name)) {
      const p = resolve(first);
      if (!p) continue;
      if (p.flags.includes('input_only')) {
        add({
          rule: 'code_output_on_input_only',
          severity: 'error',
          message: t('Line {line}: {fn}({pin}, …), but {pin} can only be an input.', { line: ln(c.line), fn: c.name, pin: label(p) }),
          hint: t('Pick an output-capable pin for this signal and move the wire to it.'),
          line: c.line,
          targets: [pinT(p)],
        });
      }
      if (!written.has(p.id)) written.set(p.id, { pin: p, line: c.line, call: c });
    }

    if (c.name === 'analogRead' || c.name === 'analogReadMilliVolts') {
      const p = resolve(first);
      if (!p) continue;
      if (!isAdcPin(p)) {
        add({
          rule: 'code_not_adc',
          severity: 'error',
          message: t('Line {line}: {fn}({pin}), but {pin} has no analog input.', { line: ln(c.line), fn: c.name, pin: label(p) }),
          hint: t('Use an analog pin such as {pins}.', { pins: board.rules.adcPins.slice(0, 3).map((id) => pinById(board, id)?.label ?? id).join(', ') }),
          line: c.line,
          targets: [pinT(p)],
        });
      } else if (board.rules.adcWifiConflict && usesWifi && p.flags.includes('adc2')) {
        add({
          rule: 'code_adc2_wifi',
          severity: 'warning',
          message: t('Line {line}: {pin} is an ADC2 pin, and this sketch turns on Wi-Fi. ADC2 readings fail while Wi-Fi is on.', { line: ln(c.line), pin: label(p) }),
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
      i2cCompare(sda, scl, c.line, c.name);
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
            line: ln(c.line),
            call: c.name,
            pin: label(p),
            role: c.name === 'Wire.setSDA' ? 'SDA' : 'SCL',
            want: label(want),
          }),
          hint: t('Change the code to {call}({want}), or move the wire.', { call: c.name, want: want.gpio !== null ? String(want.gpio) : want.label }),
          line: c.line,
          targets: [pinT(p), pinT(want)],
          fix: !headerNumbering && want.gpio !== null ? fixCall(c.line, c.name, [String(want.gpio)]) : undefined,
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
            line: ln(c.line),
            baud,
            monitor: opts.monitorBaud,
          }),
          hint: t('Set the monitor to {baud} baud, or change Serial.begin.', { baud }),
          line: c.line,
          targets: [],
          fix: fixCall(c.line, 'Serial.begin', [String(opts.monitorBaud)]),
        });
      }
    }
  }

  function i2cCompare(sda: PinDef, scl: PinDef, line: number, call?: string) {
    if (!drawnSda || !drawnScl || (sda.id === drawnSda.id && scl.id === drawnScl.id)) return;
    const swapped = sda.id === drawnScl.id && scl.id === drawnSda.id;
    add({
      rule: 'code_i2c_pins',
      severity: swapped ? 'error' : 'warning',
      message: swapped
        ? t('Line {line}: the code sets SDA = {sda} and SCL = {scl}, the reverse of the drawing (SDA on {dsda}, SCL on {dscl}).', {
            line: ln(line),
            sda: label(sda),
            scl: label(scl),
            dsda: label(drawnSda),
            dscl: label(drawnScl),
          })
        : t('Line {line}: the code sets SDA = {sda} and SCL = {scl}, but the drawing has SDA on {dsda} and SCL on {dscl}.', {
            line: ln(line),
            sda: label(sda),
            scl: label(scl),
            dsda: label(drawnSda),
            dscl: label(drawnScl),
          }),
      hint: t('Change the code to Wire.begin({sda}, {scl}), or move the wires to match the code.', { sda: String(drawnSda.gpio), scl: String(drawnScl.gpio) }),
      line,
      targets: [pinT(sda), pinT(scl), pinT(drawnSda), pinT(drawnScl)],
      fix: call && drawnSda.gpio !== null && drawnScl.gpio !== null ? fixCall(line, call, [String(drawnSda.gpio), String(drawnScl.gpio)]) : undefined,
    });
  }

  // ESP32 Wire.begin() without pins uses the board default: flag a drawing on other pins.
  if (esp && drawnSda && drawnScl) {
    const plain = all.find((c) => c.name === 'Wire.begin' && c.args.length === 0);
    const withPins = all.some((c) => (c.name === 'Wire.begin' || c.name === 'Wire.setPins') && c.args.length >= 2);
    const dsda = pinById(board, board.rules.i2c.sda);
    const dscl = pinById(board, board.rules.i2c.scl);
    cur = plain;
    if (plain && !withPins && dsda && dscl) i2cCompare(dsda, dscl, plain.line);
  }

  /* ---- SPI and display pins: library setups (TFT_eSPI, LovyanGFX, Adafruit) and SPI.begin vs the drawing ---- */
  cur = undefined;
  {
    interface CodeSpi {
      role: DisplayPinRole;
      pin: PinDef | null;
      name: string;
      line: number;
    }
    const found: CodeSpi[] = [];
    const take = (role: DisplayPinRole, gpio: number, name: string, line: number) => {
      if (!found.some((x) => x.role === role)) found.push({ role, pin: resolve(String(gpio)) ?? null, name, line });
    };
    for (const d of displayPinsFromCode(code)) take(d.role, d.gpio, d.name, d.line);
    const plainSpiBegin = all.find((c) => c.name === 'SPI.begin' && c.args.length === 0);
    for (const c of all) {
      const num = (i: number) => (c.args[i] === undefined ? null : pinNumber(c.args[i], consts));
      // ESP32: SPI.begin(sck, miso, mosi[, ss])
      if (c.name === 'SPI.begin' && c.args.length >= 3) {
        const [sck, miso, mosi] = [num(0), num(1), num(2)];
        if (sck !== null) take('sclk', sck, 'SPI.begin sck', c.line);
        if (miso !== null) take('miso', miso, 'SPI.begin miso', c.line);
        if (mosi !== null) take('mosi', mosi, 'SPI.begin mosi', c.line);
      }
      // Pico (arduino-pico): SPI.setSCK / setTX (= MOSI) / setRX (= MISO)
      const n0 = num(0);
      if (n0 !== null && c.name === 'SPI.setSCK') take('sclk', n0, 'SPI.setSCK', c.line);
      if (n0 !== null && c.name === 'SPI.setTX') take('mosi', n0, 'SPI.setTX', c.line);
      if (n0 !== null && c.name === 'SPI.setRX') take('miso', n0, 'SPI.setRX', c.line);
    }
    // a plain SPI.begin() on an ESP32 uses the board's default SPI pins
    const dflt = board.rules.spi;
    if (esp && plainSpiBegin && dflt && !found.some((x) => x.role === 'sclk' || x.role === 'mosi')) {
      for (const [role, id] of [['sclk', dflt.sck], ['mosi', dflt.mosi], ['miso', dflt.miso]] as const) {
        const g = pinById(board, id)?.gpio;
        if (g !== null && g !== undefined) take(role, g, 'SPI.begin()', plainSpiBegin.line);
      }
    }

    // what the drawing has: the board pins wired to a part pin with each SPI role, or to a display pin by its name
    const onBoard = (pred: (def: PartDef, pinName: string, role: PartPinRole | undefined) => boolean) => {
      const out = new Map<string, PinDef>();
      for (const w of scene.wires) {
        const boardEnd = w.from.part === 'board' ? w.from : w.to.part === 'board' ? w.to : null;
        const partEnd = w.from.part === 'board' ? w.to : w.from;
        const inst = scene.parts.find((p) => p.id === partEnd.part);
        const def = inst ? parts[inst.partId] : undefined;
        const bp = boardEnd ? pinById(board, boardEnd.pin) : undefined;
        if (bp && def && pred(def, partEnd.pin, def.pins.find((x) => x.name === partEnd.pin)?.role)) out.set(bp.id, bp);
      }
      return out;
    };
    const isSpiPart = (def: PartDef) => def.pins.some((x) => x.role === 'spi_sck' || x.role === 'spi_mosi');
    const cs = onBoard((_d, _n, r) => r === 'spi_cs');
    const drawn: Partial<Record<DisplayPinRole, Map<string, PinDef>>> = {
      sclk: onBoard((_d, _n, r) => r === 'spi_sck'),
      mosi: onBoard((_d, _n, r) => r === 'spi_mosi'),
      miso: onBoard((_d, _n, r) => r === 'spi_miso'),
      cs,
      touch_cs: cs,
      dc: onBoard((d, n) => isSpiPart(d) && /^(dc|rs|a0|d\/c|dc\/rs)$/i.test(n.trim())),
      rst: onBoard((d, n) => isSpiPart(d) && /^(res|rst|reset|resetb)$/i.test(n.trim())),
    };
    const SIGNAL: Partial<Record<DisplayPinRole, string>> = {
      sclk: t('clock (SCLK)'),
      mosi: t('data out (MOSI)'),
      miso: t('data in (MISO)'),
      cs: t('chip select'),
      dc: t('data/command (DC)'),
      rst: t('reset'),
      touch_cs: t('touch chip select'),
    };
    const OUTPUTS: DisplayPinRole[] = ['sclk', 'mosi', 'cs', 'dc', 'rst', 'bl'];

    for (const f of found) if (f.pin) mentioned.add(f.pin.id);

    // clock and data out swapped: the clock pin of the code is the drawn MOSI and the other way round
    const sck = found.find((x) => x.role === 'sclk');
    const mosi = found.find((x) => x.role === 'mosi');
    const dSck = drawn.sclk;
    const dMosi = drawn.mosi;
    let swapped = false;
    if (sck?.pin && mosi?.pin && dSck?.size && dMosi?.size && dSck.has(mosi.pin.id) && dMosi.has(sck.pin.id) && !dSck.has(sck.pin.id)) {
      swapped = true;
      const dS = [...dSck.values()][0];
      const dM = [...dMosi.values()][0];
      add({
        rule: 'code_spi_pins',
        severity: 'error',
        message: t('Line {line}: the code sets the SPI clock to {sck} and data out (MOSI) to {mosi}, the reverse of the drawing (clock on {dsck}, MOSI on {dmosi}).', {
          line: ln(mosi.line),
          sck: label(sck.pin),
          mosi: label(mosi.pin),
          dsck: label(dS),
          dmosi: label(dM),
        }),
        hint: t('Swap the two pins in the code, or move the wires to match the code.'),
        line: mosi.line,
        targets: [pinT(sck.pin), pinT(mosi.pin), pinT(dS), pinT(dM)],
      });
    }
    for (const f of found) {
      const set = drawn[f.role];
      if (!f.pin || !set?.size || set.has(f.pin.id)) continue;
      if (swapped && (f.role === 'sclk' || f.role === 'mosi')) continue;
      const want = [...set.values()][0];
      add({
        rule: 'code_spi_pins',
        severity: 'warning',
        message: t('Line {line}: the code puts the SPI {signal} on {pin} ({name}), but the drawing has it on {want}.', {
          line: ln(f.line),
          signal: SIGNAL[f.role] ?? f.role,
          pin: label(f.pin),
          name: f.name,
          want: [...set.values()].map(label).join(' / '),
        }),
        hint: t('Change the code to use {want}, or move the wire to {pin}.', { want: want.gpio !== null && !headerNumbering ? String(want.gpio) : want.label, pin: label(f.pin) }),
        line: f.line,
        targets: [pinT(f.pin), pinT(want)],
      });
    }
    // pins the board does not have, or cannot use for this signal, whatever the drawing says
    for (const f of found) {
      if (f.name === 'SPI.begin()') continue;
      if (f.pin === null) {
        add({
          rule: 'code_unknown_pin',
          severity: 'warning',
          message: t('Line {line}: the display pin {name} is not on this board’s header.', { line: ln(f.line), name: f.name }),
          hint: t('Check the pin number against the board’s pinout (2D pinout view).'),
          line: f.line,
          targets: [],
        });
      } else if (f.pin.flags.includes('flash')) {
        add({
          rule: 'code_flash_pin',
          severity: 'error',
          message: t('Line {line}: {pin} is connected to the board’s flash memory. Using it stops the program.', { line: ln(f.line), pin: label(f.pin) }),
          hint: t('Use another pin.'),
          line: f.line,
          targets: [pinT(f.pin)],
        });
      } else if (OUTPUTS.includes(f.role) && f.pin.flags.includes('input_only')) {
        add({
          rule: 'code_output_on_input_only',
          severity: 'error',
          message: t('Line {line}: {pin} is used as the display {signal} ({name}), but {pin} can only be an input.', { line: ln(f.line), pin: label(f.pin), signal: SIGNAL[f.role] ?? f.role, name: f.name }),
          hint: t('Pick an output-capable pin for this signal and move the wire to it.'),
          line: f.line,
          targets: [pinT(f.pin)],
        });
      }
    }
  }

  // Outputs: a part the board drives is wired to one pin while the code writes another.
  const drivenPins = board.pins.filter((p) => partPinOn(p.id).some((x) => x.role && BOARD_DRIVES.includes(x.role)));
  const unusedDriven = drivenPins.filter((p) => !mentioned.has(p.id));
  const strayWrites = [...written.values()].filter((w) => wiresTo(w.pin.id).length === 0);
  for (const w of strayWrites) {
    cur = w.call;
    const guess = unusedDriven.length === 1 ? unusedDriven[0] : undefined;
    add({
      rule: 'code_pin_not_wired',
      severity: 'warning',
      message: guess
        ? t('Line {line}: the code drives {pin}, but nothing is wired there. In the drawing, {part} is on {wired}.', {
            line: ln(w.line),
            pin: label(w.pin),
            part: partPinOn(guess.id).filter((x) => x.role && BOARD_DRIVES.includes(x.role)).map(partLabel).join(', '),
            wired: label(guess),
          })
        : t('Line {line}: the code drives {pin}, but nothing is wired there in the drawing.', { line: ln(w.line), pin: label(w.pin) }),
      hint: guess
        ? t('Change the pin in the code to {wired}, or move the wire to {pin}.', { wired: guess.gpio !== null && !headerNumbering ? String(guess.gpio) : guess.label, pin: label(w.pin) })
        : t('Check the pin number, or add the part to the drawing.'),
      line: w.line,
      targets: guess ? [pinT(w.pin), pinT(guess)] : [pinT(w.pin)],
    });
  }
  // A driven part the code never mentions (only when the code does use pins, to avoid noise on
  // sketches that set everything up through libraries).
  cur = undefined;
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
