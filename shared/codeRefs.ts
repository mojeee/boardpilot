// Where the code talks about board pins, with exact positions: the Code panel underlines each one
// in its pin's colour, shows a card on hover (what the pin can do, what the drawing wires to it)
// and focuses the 3D view on click. Pure text reading, like the code checker (shared/codeCheck):
// a pin is recognised only when the text says so plainly (a number in a pin call, a #define or
// constant used as a pin, GPIO_NUM_n, LED_BUILTIN, A0/D5, PA5).

import type { BoardDef, PartDef, PartPinRole, PinDef, Scene } from './types';
import { calls, constants, pinResolver, stripComments } from './codeCheck';
import { isAdcPin, isEspFamily, pinRoleInScene, type PinRoleColor } from './board';
import { stm32Name } from './templates';
import { t } from './i18n';

export interface PinRef {
  /** Offsets in the text: [from, to). */
  from: number;
  to: number;
  pin: PinDef;
  /** The constant this reference goes through (LED_PIN), when it is not a plain number. */
  via?: string;
}

/**
 * Calls whose arguments are pins, by name (the object part, Wire/Wire1/Serial2, is matched
 * separately) → the argument indexes that are pins.
 */
const PIN_ARGS: Record<string, number[]> = {
  pinMode: [0],
  digitalWrite: [0],
  digitalRead: [0],
  analogRead: [0],
  analogReadMilliVolts: [0],
  analogWrite: [0],
  ledcAttach: [0],
  ledcAttachPin: [0],
  ledcAttachChannel: [0],
  tone: [0],
  noTone: [0],
  pulseIn: [0],
  pulseInLong: [0],
  shiftOut: [0, 1],
  shiftIn: [0, 1],
  digitalPinToInterrupt: [0],
  attachInterrupt: [0],
  detachInterrupt: [0],
  touchRead: [0],
  dacWrite: [0],
  // ESP-IDF and Pico SDK
  gpio_set_direction: [0],
  gpio_set_level: [0],
  gpio_get_level: [0],
  gpio_reset_pin: [0],
  gpio_set_pull_mode: [0],
  gpio_pullup_en: [0],
  gpio_pulldown_en: [0],
  gpio_init: [0],
  gpio_set_dir: [0],
  gpio_put: [0],
  gpio_get: [0],
  gpio_pull_up: [0],
  gpio_pull_down: [0],
  gpio_set_function: [0],
  adc_gpio_init: [0],
};

/** Pin arguments of a call, or none. Object calls (Wire.begin) depend on the board and the argument count. */
function pinArgs(name: string, argc: number, board: BoardDef): number[] {
  const m = /^(\w+)\s*\.\s*(\w+)$/.exec(name);
  if (!m) return PIN_ARGS[name] ?? [];
  const [, obj, fn] = m;
  if (/^Wire\d?$/.test(obj)) {
    if (fn === 'setPins') return [0, 1];
    if (fn === 'setSDA' || fn === 'setSCL') return [0];
    // Wire.begin(sda, scl) on ESP32; on other cores Wire.begin(address) starts a target device.
    if (fn === 'begin' && argc >= 2 && isEspFamily(board)) return [0, 1];
    return [];
  }
  if (/^SPI\d?$/.test(obj) && fn === 'begin' && isEspFamily(board)) return [0, 1, 2, 3];
  if (/^Serial\d$/.test(obj) && fn === 'begin' && argc >= 4) return [2, 3];
  if (/^Serial\d$/.test(obj) && (fn === 'setRX' || fn === 'setTX')) return [0];
  return [];
}

/** Names that read like a pin constant: LED_PIN, I2C_SDA, BUTTON, RELAY_GPIO, TFT_CS… */
const PIN_NAME = /(^|_)(PIN|GPIO|SDA|SCL|SCK|MISO|MOSI|CS|SS|DC|RST|RESET|RX|TX|LED\d*|BTN\d*|BUTTON\d*|RELAY\d*|BUZZER|SERVO\d*|TRIG|ECHO|DATA|CLK|DIO|IRQ)(_|\d*$)|PIN$|^PIN/i;
const LITERAL = /^(\d+|GPIO_NUM_\d+|LED_BUILTIN|[AD]\d+|P[A-K]_?\d+)$/;

/** Every place the text refers to a board pin, sorted by position. */
export function pinRefs(source: string, board: BoardDef): PinRef[] {
  const code = stripComments(source);
  const consts = constants(code);
  const resolve = pinResolver(consts, board);
  const out = new Map<number, PinRef>();
  const push = (from: number, to: number, pin: PinDef | null | undefined, via?: string) => {
    if (!pin || to <= from || out.has(from)) return;
    out.set(from, { from, to, pin, ...(via ? { via } : {}) });
  };

  // Constants used as pins: in a pin argument, or named like a pin and set to one.
  const pinConsts = new Set<string>();
  const all = calls(code);
  for (const c of all) {
    for (const i of pinArgs(c.name, c.args.length, board)) {
      const a = c.args[i];
      if (a && consts.has(a)) pinConsts.add(a);
    }
  }
  for (const [name, value] of consts) if (PIN_NAME.test(name) && (LITERAL.test(value) || consts.has(value)) && resolve(name)) pinConsts.add(name);
  // A constant set to a pin constant is one too (#define SDA_PIN I2C_SDA), and the other way round.
  for (let k = 0; k < 3; k++) {
    for (const [name, value] of consts) {
      if (pinConsts.has(name) && consts.has(value)) pinConsts.add(value);
      if (pinConsts.has(value)) pinConsts.add(name);
    }
  }
  for (const name of [...pinConsts]) if (!resolve(name)) pinConsts.delete(name);

  // Literal pins in pin arguments.
  for (const c of all) {
    for (const i of pinArgs(c.name, c.args.length, board)) {
      const a = c.args[i];
      if (a && LITERAL.test(a)) push(c.argPos[i], c.argPos[i] + a.length, resolve(a));
    }
  }
  // Every use of a pin constant, and the value in its definition.
  for (const name of pinConsts) {
    const pin = resolve(name);
    for (const m of code.matchAll(new RegExp(`\\b${name}\\b`, 'g'))) push(m.index, m.index + name.length, pin, name);
    const def = new RegExp(`(?:#define[ \\t]+|\\b)${name}\\b[ \\t]*=?[ \\t]*\\(?(\\w+)`).exec(code);
    if (def && LITERAL.test(def[1])) {
      const at = def.index + def[0].length - def[1].length;
      push(at, at + def[1].length, pin);
    }
  }
  // Names that are always pins.
  for (const m of code.matchAll(/\b(GPIO_NUM_\d+|LED_BUILTIN)\b/g)) push(m.index, m.index + m[0].length, resolve(m[0]));
  return [...out.values()].sort((a, b) => a.from - b.from);
}

/** The reference at an offset (the cursor or the mouse), if any. */
export const pinRefAt = (refs: PinRef[], pos: number) => refs.find((r) => pos >= r.from && pos <= r.to);

/** How the pin is written in code with this board's Arduino core (25, PA5, 13 for D13 on the nRF52 DK). */
export function pinCodeName(board: BoardDef, p: PinDef): string {
  if (p.gpio === null) return p.label;
  if (board.family === 'stm32') return stm32Name(p);
  if (board.family === 'nrf52') return /^D\d+$/.test(p.id) ? p.id.slice(1) : String(p.gpio);
  return String(p.gpio);
}

/** "D21 (GPIO 21)", or the label when the number says nothing more. */
export function pinTitle(board: BoardDef, p: PinDef): string {
  const n = pinCodeName(board, p);
  return n !== p.label ? `${p.label} (${board.family === 'stm32' || board.family === 'nrf52' ? n : `GPIO ${n}`})` : p.label;
}

export interface PinWire {
  partId: string;
  part: string;
  pin: string;
  role?: PartPinRole;
}

export interface PinFacts {
  title: string;
  /** Pin role colour (as in the 3D view), for the underline and the card. */
  role: PinRoleColor;
  /** What the drawing connects to the pin. */
  wired: PinWire[];
  /** Cautions from the board file, in plain words, already translated. */
  cautions: string[];
  /** What else the pin can do (ADC, touch, I2C default…), short names. */
  functions: string[];
}

/** What a pin is and what is on it, for the hover card. From the board file and the drawing only. */
export function pinFacts(p: PinDef, board: BoardDef, scene: Scene, parts: Record<string, PartDef>): PinFacts {
  const wired: PinWire[] = [];
  for (const w of scene.wires) {
    const end = w.from.part === 'board' && w.from.pin === p.id ? w.to : w.to.part === 'board' && w.to.pin === p.id ? w.from : null;
    if (!end || end.part === 'board') continue;
    const inst = scene.parts.find((x) => x.id === end.part);
    const def = inst ? parts[inst.partId] : undefined;
    wired.push({ partId: end.part, part: inst?.label ?? def?.name ?? end.part, pin: end.pin, role: def?.pins.find((x) => x.name === end.pin)?.role });
  }
  const f = p.flags;
  const cautions: string[] = [];
  if (f.includes('flash')) cautions.push(t('Connected to the board’s flash memory: never use it.'));
  if (f.includes('input_only')) cautions.push(t('Input only: it cannot drive an LED or a relay.'));
  if (f.includes('strapping_critical')) cautions.push(t('Strapping pin: a HIGH level at reset can stop the board from booting.'));
  else if (f.includes('strapping')) cautions.push(t('Strapping pin: its level at reset changes how the board starts.'));
  if (f.includes('no_internal_pull')) cautions.push(t('No internal pull-up or pull-down: a button needs an external resistor.'));
  if (f.includes('adc2')) cautions.push(t('ADC2: analog readings fail while Wi-Fi is on.'));
  if (f.includes('uart0')) cautions.push(t('Used by the USB serial port (upload and Serial Monitor).'));
  if (f.includes('usb')) cautions.push(t('Native USB data line.'));
  if (f.includes('swd')) cautions.push(t('Debug port: using it can lock out the debugger.'));
  if (f.includes('reserved')) cautions.push(t('Used by something on the board: use it only with care.'));
  if (f.includes('onboard_led')) cautions.push(t('The board’s own LED is on this pin.'));
  const functions = [
    ...(isAdcPin(p) ? [f.includes('adc2') ? 'ADC2' : f.includes('adc1') ? 'ADC1' : 'ADC'] : []),
    ...(f.includes('touch') ? ['touch'] : []),
    ...(f.includes('dac') ? ['DAC'] : []),
    ...p.functions.filter((x) => !/^GPIO$|^ADC|^TOUCH|^DAC/i.test(x)).map((x) => x.replace(/_default$/, ' (default)').replace(/_/g, ' ')),
  ].slice(0, 6);
  return { title: pinTitle(board, p), role: pinRoleInScene(board, scene, p.id), wired, cautions, functions };
}
