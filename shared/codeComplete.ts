// What the Code panel offers while typing (autocomplete), from the board file, the drawing and a
// short table of the libraries the starter code uses. Pure data: the editor turns it into
// CodeMirror completions. Pins come first when the cursor is in a pin argument, ranked by what the
// drawing wires and what the call needs (an output, an analog input); flash pins are never offered.

import type { BoardDef, PartDef, PinDef, Scene } from './types';
import { canOutput, isAdcPin } from './board';
import { constants, pinResolver, stripComments } from './codeCheck';
import { pinCodeName, pinFacts } from './codeRefs';
import { t } from './i18n';

export type CompletionContext =
  | { kind: 'pin'; fn: string; arg: number }
  | { kind: 'member'; object: string; prefix: string }
  | { kind: 'word'; prefix: string };

/** Calls whose argument `arg` is a pin, for the context below (same table as codeRefs, by name). */
function pinArgOf(fn: string, arg: number, board: BoardDef): boolean {
  const simple: Record<string, number[]> = {
    pinMode: [0], digitalWrite: [0], digitalRead: [0], analogRead: [0], analogReadMilliVolts: [0], analogWrite: [0],
    ledcAttach: [0], ledcAttachPin: [0], tone: [0], noTone: [0], pulseIn: [0], digitalPinToInterrupt: [0], touchRead: [0], dacWrite: [0],
    shiftOut: [0, 1], shiftIn: [0, 1], gpio_set_direction: [0], gpio_set_level: [0], gpio_get_level: [0], gpio_init: [0], gpio_set_dir: [0], gpio_put: [0], gpio_get: [0],
  };
  const m = /^(\w+)\.(\w+)$/.exec(fn);
  if (!m) return simple[fn]?.includes(arg) ?? false;
  const esp = board.family === 'esp32' || board.family === 'esp32s3' || board.family === 'esp32c3';
  if (/^Wire\d?$/.test(m[1])) return (m[2] === 'begin' && esp && arg <= 1) || (m[2] === 'setPins' && arg <= 1) || ((m[2] === 'setSDA' || m[2] === 'setSCL') && arg === 0);
  if (/^SPI\d?$/.test(m[1])) return m[2] === 'begin' && esp && arg <= 3;
  if (/^Serial\d$/.test(m[1])) return m[2] === 'begin' && (arg === 2 || arg === 3);
  return false;
}

/** What the text before the cursor (on its line and the lines before) asks for. */
export function completionContext(before: string, board: BoardDef): CompletionContext {
  const member = /([A-Za-z_]\w*)\s*(?:\.|->)\s*(\w*)$/.exec(before);
  if (member) return { kind: 'member', object: member[1], prefix: member[2] };
  const prefix = /(\w*)$/.exec(before)?.[1] ?? '';
  // The innermost open parenthesis and the argument the cursor is in.
  let depth = 0;
  let commas = 0;
  for (let i = before.length - 1; i >= 0 && before.length - i < 400; i--) {
    const ch = before[i];
    if (ch === ')' || ch === ']' || ch === '}') depth++;
    else if ((ch === '(' || ch === '[' || ch === '{') && depth > 0) depth--;
    else if (ch === ',' && depth === 0) commas++;
    else if (ch === ';' && depth === 0) break;
    else if (ch === '(' && depth === 0) {
      const name = /([A-Za-z_][\w]*(?:\s*\.\s*\w+)?)\s*$/.exec(before.slice(0, i))?.[1]?.replace(/\s+/g, '');
      if (name && pinArgOf(name, commas, board)) return { kind: 'pin', fn: name, arg: commas };
      break;
    } else if (ch === '{' && depth === 0) break;
  }
  return { kind: 'word', prefix };
}

export interface PinOption {
  /** What is inserted: the pin as code writes it (25, PA5). */
  label: string;
  /** "D25 (GPIO 25) · LED A" */
  detail: string;
  /** Cautions, one per line. */
  info: string;
  boost: number;
  pinId: string;
}

const OUTPUT_FNS = /^(digitalWrite|analogWrite|ledcAttach|ledcAttachPin|tone|noTone|dacWrite|gpio_set_level|gpio_put|shiftOut)$/;
const ANALOG_FNS = /^(analogRead|analogReadMilliVolts|adc_gpio_init)$/;
const INPUT_FNS = /^(digitalRead|pulseIn|pulseInLong|digitalPinToInterrupt|attachInterrupt|gpio_get_level|gpio_get|shiftIn)$/;

/** Pins for a pin argument, the ones the drawing wires first. */
export function pinOptions(fn: string, arg: number, board: BoardDef, scene: Scene, parts: Record<string, PartDef>): PinOption[] {
  const wantsOut = OUTPUT_FNS.test(fn) && !(fn === 'shiftIn' && arg === 0);
  const wantsAdc = ANALOG_FNS.test(fn);
  const wire = /^Wire\d?\.(begin|setPins|setSDA|setSCL)$/.exec(fn);
  const wantRole = wire ? (fn.endsWith('setSCL') || arg === 1 ? 'scl' : 'sda') : null;
  const out: PinOption[] = [];
  for (const p of board.pins) {
    if (p.kind !== 'gpio' || p.sameAs || p.flags.includes('flash')) continue;
    if (wantsAdc && !isAdcPin(p)) continue;
    const f = pinFacts(p, board, scene, parts);
    const wiredText = f.wired.map((w) => `${w.part} ${w.pin}`).join(', ');
    let boost = 0;
    const roles = f.wired.map((w) => w.role);
    if (f.wired.length) boost += 10;
    // The part on the pin fits the call: the board drives an LED, reads a button, reads an analog output.
    if (wantsOut && roles.some((r) => r === 'digital_in' || r === 'passive')) boost += 25;
    if (INPUT_FNS.test(fn) && roles.some((r) => r === 'digital_out' || r === 'int' || r === 'passive' || r === 'onewire')) boost += 25;
    if (wantsAdc && roles.includes('analog_out')) boost += 25;
    if (fn === 'pinMode' && roles.some((r) => r && !['i2c_sda', 'i2c_scl', 'power', 'ground'].includes(r))) boost += 25;
    // A bus pin (I2C, SPI) is busy: not a good pick for a plain digital call.
    if (!wire && roles.some((r) => r === 'i2c_sda' || r === 'i2c_scl' || r?.startsWith('spi_'))) boost -= 20;
    if (wantRole && f.role === wantRole) boost += 40;
    if (wire && !f.wired.length && p.id === (wantRole === 'scl' ? board.rules.i2c.scl : board.rules.i2c.sda)) boost += 20;
    const cautions = [...f.cautions];
    if (wantsOut && !canOutput(p)) {
      boost -= 60;
      cautions.unshift(t('This call drives the pin, and this pin cannot be an output.'));
    }
    if (p.flags.includes('strapping_critical') || p.flags.includes('reserved') || p.flags.includes('usb') || p.flags.includes('swd')) boost -= 15;
    out.push({ label: pinCodeName(board, p), detail: [f.title, wiredText].filter(Boolean).join(' · '), info: cautions.join('\n'), boost, pinId: p.id });
  }
  return out.sort((a, b) => b.boost - a.boost);
}

export interface ApiEntry {
  label: string;
  /** CodeMirror snippet: ${name} marks a field the Tab key moves to. */
  snippet: string;
  info: string;
  /** Header or library the call comes from, for the source line. */
  source: string;
  /** Only on these board families (absent: all). */
  families?: BoardDef['family'][];
}

const ESP: BoardDef['family'][] = ['esp32', 'esp32s3', 'esp32c3'];

/** Arduino calls a beginner meets first, with plain-language help. */
export function arduinoApi(): ApiEntry[] {
  const core = 'Arduino core (Arduino.h)';
  return [
    { label: 'pinMode', snippet: 'pinMode(${pin}, ${OUTPUT});', info: t('Sets a pin as OUTPUT, INPUT or INPUT_PULLUP. Call it once in setup().'), source: core },
    { label: 'digitalWrite', snippet: 'digitalWrite(${pin}, ${HIGH});', info: t('Drives an output pin HIGH (3.3 V or 5 V) or LOW (0 V).'), source: core },
    { label: 'digitalRead', snippet: 'digitalRead(${pin})', info: t('Reads a pin: HIGH or LOW.'), source: core },
    { label: 'analogRead', snippet: 'analogRead(${pin})', info: t('Reads the voltage on an analog pin as a number (0 to 4095 on most 3.3 V boards, 0 to 1023 on AVR).'), source: core },
    { label: 'analogReadMilliVolts', snippet: 'analogReadMilliVolts(${pin})', info: t('Reads the voltage on an analog pin in millivolts, corrected with the chip’s calibration.'), source: 'Arduino-ESP32 core', families: ESP },
    { label: 'analogWrite', snippet: 'analogWrite(${pin}, ${128});', info: t('PWM output: 0 is always off, 255 always on, values between dim an LED or slow a motor.'), source: core },
    { label: 'delay', snippet: 'delay(${ms});', info: t('Waits this many milliseconds. Nothing else runs meanwhile: prefer millis() for longer waits.'), source: core },
    { label: 'millis', snippet: 'millis()', info: t('Milliseconds since the board started. Use it to do things every N ms without stopping the program.'), source: core },
    { label: 'micros', snippet: 'micros()', info: t('Microseconds since the board started, for short timings.'), source: core },
    { label: 'attachInterrupt', snippet: 'attachInterrupt(digitalPinToInterrupt(${pin}), ${onChange}, ${FALLING});', info: t('Runs a function the moment a pin changes. Keep that function very short.'), source: core },
    { label: 'tone', snippet: 'tone(${pin}, ${440});', info: t('Plays a square wave of this frequency (Hz) on a pin, for a passive buzzer.'), source: core },
    { label: 'map', snippet: 'map(${value}, ${0}, ${4095}, ${0}, ${100})', info: t('Rescales a number from one range to another (whole numbers only).'), source: core },
    { label: 'constrain', snippet: 'constrain(${value}, ${0}, ${100})', info: t('Keeps a number between a minimum and a maximum.'), source: core },
    { label: 'everyMs', snippet: 'static unsigned long last = 0;\nif (millis() - last >= ${1000}) {\n  last = millis();\n  ${}\n}', info: t('Runs the code inside every N milliseconds without blocking the loop.'), source: t('pattern') },
    { label: 'setup', snippet: 'void setup() {\n  Serial.begin(115200);\n  ${}\n}', info: t('Runs once when the board starts.'), source: core },
    { label: 'loop', snippet: 'void loop() {\n  ${}\n}', info: t('Runs again and again after setup().'), source: core },
  ];
}

export interface MemberEntry {
  name: string;
  snippet: string;
  info: string;
}

export interface LibraryClass {
  /** Arduino library name (Library Manager) and its header. */
  library: string;
  header: string;
  members: MemberEntry[];
}

/** The classes of the libraries the starter code uses, and the core objects. */
export function libraryClasses(): Record<string, LibraryClass> {
  const serial: LibraryClass = {
    library: 'Arduino core',
    header: 'HardwareSerial.h',
    members: [
      { name: 'begin', snippet: 'begin(${115200})', info: t('Opens the serial port at this speed (baud). The Monitor must use the same speed.') },
      { name: 'println', snippet: 'println(${})', info: t('Prints a value and starts a new line.') },
      { name: 'print', snippet: 'print(${})', info: t('Prints a value without a new line.') },
      { name: 'printf', snippet: 'printf("${%d}\\n", ${value})', info: t('Prints text with values filled in, like C printf.') },
      { name: 'available', snippet: 'available()', info: t('How many received bytes are waiting to be read.') },
      { name: 'read', snippet: 'read()', info: t('Reads one received byte (-1 when there is none).') },
      { name: 'readStringUntil', snippet: "readStringUntil('\\n')", info: t('Reads received text up to a character, usually the end of the line.') },
    ],
  };
  return {
    HardwareSerial: serial,
    TwoWire: {
      library: 'Wire (Arduino core)',
      header: 'Wire.h',
      members: [
        { name: 'begin', snippet: 'begin(${SDA}, ${SCL})', info: t('Starts I2C. On ESP32 you choose the SDA and SCL pins; other boards use fixed pins: call begin().') },
        { name: 'setClock', snippet: 'setClock(${100000})', info: t('I2C speed in Hz: 100000 (standard) works with every part, 400000 with most.') },
        { name: 'beginTransmission', snippet: 'beginTransmission(${0x76})', info: t('Starts a message to the device at this address.') },
        { name: 'write', snippet: 'write(${0xD0})', info: t('Queues a byte to send (a register number or data).') },
        { name: 'endTransmission', snippet: 'endTransmission()', info: t('Sends the message. 0 means the device answered; 2 means no device at that address.') },
        { name: 'requestFrom', snippet: 'requestFrom(${0x76}, ${1})', info: t('Asks the device for this many bytes.') },
        { name: 'read', snippet: 'read()', info: t('Reads one byte the device sent.') },
      ],
    },
    BoardPilotProbe: {
      library: 'BoardPilotProbe (firmware/probe)',
      header: 'BoardPilotProbe.h',
      members: [
        { name: 'begin', snippet: 'begin(${100})', info: t('Starts the probe: values are sent to BoardPilot Monitor every N ms.') },
        { name: 'value', snippet: 'value("${name}", ${value}, ${pin})', info: t('Sends a named value to the Monitor plot; the pin number colours it like the pin.') },
        { name: 'step', snippet: 'step("${what happens now}")', info: t('Tells BoardPilot which step the program is on (shown live in the Code panel).') },
        { name: 'state', snippet: 'state("${IDLE}")', info: t('Tells BoardPilot the state machine’s current state.') },
        { name: 'loop', snippet: 'loop()', info: t('Call it in every loop(): it sends the values.') },
      ],
    },
    Adafruit_BME280: {
      library: 'Adafruit BME280 Library',
      header: 'Adafruit_BME280.h',
      members: [
        { name: 'begin', snippet: 'begin(${0x76}, &Wire)', info: t('Starts the sensor at this I2C address (0x76 or 0x77). Returns false when it does not answer.') },
        { name: 'readTemperature', snippet: 'readTemperature()', info: t('Temperature in °C.') },
        { name: 'readHumidity', snippet: 'readHumidity()', info: t('Relative humidity in %. A BMP280 has no humidity sensor.') },
        { name: 'readPressure', snippet: 'readPressure()', info: t('Pressure in pascal (divide by 100 for hPa).') },
      ],
    },
    Adafruit_SSD1306: {
      library: 'Adafruit SSD1306',
      header: 'Adafruit_SSD1306.h',
      members: [
        { name: 'begin', snippet: 'begin(SSD1306_SWITCHCAPVCC, ${0x3C})', info: t('Starts the display at this I2C address (usually 0x3C). Returns false when it does not answer.') },
        { name: 'clearDisplay', snippet: 'clearDisplay()', info: t('Clears the picture in memory (call display() to show it).') },
        { name: 'display', snippet: 'display()', info: t('Sends the picture in memory to the screen.') },
        { name: 'setTextSize', snippet: 'setTextSize(${1})', info: t('Text size: 1 is 6×8 pixels per letter, 2 doubles it.') },
        { name: 'setTextColor', snippet: 'setTextColor(SSD1306_WHITE)', info: t('Colour of the next text.') },
        { name: 'setCursor', snippet: 'setCursor(${0}, ${0})', info: t('Where the next text starts, in pixels from the top left corner.') },
        { name: 'println', snippet: 'println(${})', info: t('Writes text and moves to the next line.') },
        { name: 'drawLine', snippet: 'drawLine(${0}, ${0}, ${127}, ${63}, SSD1306_WHITE)', info: t('Draws a line between two points.') },
        { name: 'fillRect', snippet: 'fillRect(${0}, ${0}, ${10}, ${10}, SSD1306_WHITE)', info: t('Draws a filled rectangle.') },
      ],
    },
    DHT: {
      library: 'DHT sensor library',
      header: 'DHT.h',
      members: [
        { name: 'begin', snippet: 'begin()', info: t('Starts the sensor.') },
        { name: 'readTemperature', snippet: 'readTemperature()', info: t('Temperature in °C (NaN when the reading failed). At most one reading every 2 seconds.') },
        { name: 'readHumidity', snippet: 'readHumidity()', info: t('Relative humidity in % (NaN when the reading failed).') },
      ],
    },
  };
}

/** The class of each object in the code: declared objects (Adafruit_BME280 bme1;) and the core ones. */
export function objectClasses(source: string): Map<string, string> {
  const code = stripComments(source);
  const known = libraryClasses();
  const out = new Map<string, string>([
    ['Serial', 'HardwareSerial'],
    ['Serial1', 'HardwareSerial'],
    ['Serial2', 'HardwareSerial'],
    ['Wire', 'TwoWire'],
    ['Wire1', 'TwoWire'],
  ]);
  for (const m of code.matchAll(/\b([A-Z]\w*)\s*\*?\s+(\w+)\s*(?:\(|;|=|\{)/g)) if (known[m[1]]) out.set(m[2], m[1]);
  return out;
}

/** Members of an object in the code, with the library they come from. */
export function memberOptions(object: string, source: string): { cls: string; lib: LibraryClass } | null {
  const cls = objectClasses(source).get(object);
  const lib = cls ? libraryClasses()[cls] : undefined;
  return cls && lib ? { cls, lib } : null;
}

/** Pin constants the code defines (#define LED_PIN 25), offered first in a pin argument. */
export function pinConstantOptions(source: string, board: BoardDef): { name: string; pin: PinDef }[] {
  const consts = constants(stripComments(source));
  const resolve = pinResolver(consts, board);
  const out: { name: string; pin: PinDef }[] = [];
  for (const name of consts.keys()) {
    const p = resolve(name);
    if (p && p.kind === 'gpio') out.push({ name, pin: p });
  }
  return out;
}

