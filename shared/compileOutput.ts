// Reading the compiler's output ("Check with compiler" in the Code panel runs arduino-cli compile in
// the main process). Pure: the text arduino-cli printed in, the errors and warnings on the
// project's own files and lines out, plus the size summary and the libraries that are missing.
// Everything here is what the compiler said: a measurement of the code, not of the board.

import { t } from './i18n';

export interface CompileDiagnostic {
  /** Project file the message is about; absent when it is in a library or the core (see `external`). */
  file?: string;
  /** File name of a library or core file, for messages outside the project. */
  external?: string;
  line: number;
  col: number;
  severity: 'error' | 'warning';
  /** The compiler's own words. */
  message: string;
  /** What it usually means, in plain words ('' when there is nothing useful to add). */
  hint: string;
}

export interface CompileUse {
  used: number;
  max: number;
  pct: number;
}

export interface MissingLibrary {
  header: string;
  /** The Library Manager name that usually provides this header (a suggestion), if known. */
  library?: string;
}

export interface CompileReport {
  ok: boolean;
  fqbn: string;
  diagnostics: CompileDiagnostic[];
  flash?: CompileUse;
  ram?: CompileUse;
  missing: MissingLibrary[];
  /** The board core is not installed (arduino-cli core install …). */
  missingCore?: string;
  /** Last lines of the output, for the log when nothing else explains a failure. */
  tail: string[];
  ms: number;
}

/** Library Manager names for headers that beginners meet (what usually provides them). */
const HEADER_LIBS: Record<string, string> = {
  'Adafruit_BME280.h': 'Adafruit BME280 Library',
  'Adafruit_BMP280.h': 'Adafruit BMP280 Library',
  'Adafruit_SSD1306.h': 'Adafruit SSD1306',
  'Adafruit_GFX.h': 'Adafruit GFX Library',
  'Adafruit_Sensor.h': 'Adafruit Unified Sensor',
  'Adafruit_MPU6050.h': 'Adafruit MPU6050',
  'Adafruit_NeoPixel.h': 'Adafruit NeoPixel',
  'Adafruit_INA219.h': 'Adafruit INA219',
  'Adafruit_PWMServoDriver.h': 'Adafruit PWM Servo Driver Library',
  'DHT.h': 'DHT sensor library',
  'OneWire.h': 'OneWire',
  'DallasTemperature.h': 'DallasTemperature',
  'LiquidCrystal_I2C.h': 'LiquidCrystal I2C',
  'ESP32Servo.h': 'ESP32Servo',
  'Servo.h': 'Servo',
  'TinyGPSPlus.h': 'TinyGPSPlus',
  'TinyGPS++.h': 'TinyGPSPlus',
  'MFRC522.h': 'MFRC522',
  'RTClib.h': 'RTClib',
  'HX711.h': 'HX711 Arduino Library',
  'U8g2lib.h': 'U8g2',
  'TFT_eSPI.h': 'TFT_eSPI',
  'BH1750.h': 'BH1750',
  'Keypad.h': 'Keypad',
  'AccelStepper.h': 'AccelStepper',
  'LedControl.h': 'LedControl',
  'TM1637Display.h': 'TM1637',
  'GxEPD2_BW.h': 'GxEPD2',
  'IRremote.h': 'IRremote',
  'IRremote.hpp': 'IRremote',
  'BoardPilotProbe.h': 'BoardPilotProbe',
};

/** The library that usually provides a header (a suggestion the user confirms by installing it). */
export const libraryForHeader = (header: string): string | undefined => HEADER_LIBS[header.replace(/^.*\//, '')];

/** Plain-language help for the compiler messages beginners meet most. */
export function explainCompilerMessage(msg: string): string {
  let m: RegExpExecArray | null;
  if ((m = /'([^']+)' was not declared in this scope/.exec(msg)))
    return t('{name} is used but never defined. Check the spelling (capitals count), or add the #include or the variable it comes from.', { name: m[1] });
  if ((m = /expected '([;,)}\]])' before/.exec(msg)) || (m = /expected '([;,)}\]])' at end of input/.exec(msg)))
    return m[1] === ';' ? t('A semicolon ; is missing, usually at the end of the line before.') : t('A closing {c} is missing.', { c: m[1] });
  if (/expected '\}' at end of input/.test(msg)) return t('A closing brace } is missing: every { needs one.');
  if ((m = /'class (\w+)' has no member named '(\w+)'/.exec(msg)) || (m = /'(\w+)' has no member named '(\w+)'/.exec(msg)))
    return t('{object} has no function or field called {member}. Check the spelling, or the library version the example was written for.', { object: m[1], member: m[2] });
  if (/No such file or directory/.test(msg) && /\.(h|hpp)\b/.test(msg)) return t('A library is missing. Install it with the Arduino Library Manager, then check again.');
  if (/redefinition of/.test(msg)) return t('The same name is defined twice. Remove or rename one of them.');
  if (/invalid conversion from/.test(msg)) return t('A value has the wrong type for where it is used. A cast or a different variable type fixes it.');
  if (/too few arguments to function|too many arguments to function|no matching function for call/.test(msg))
    return t('This call has the wrong number or kind of values in its parentheses. Compare with the function’s definition.');
  if (/unused variable/.test(msg)) return t('A variable is set up but never used. Harmless; remove it to keep the code tidy.');
  if (/control reaches end of non-void function/.test(msg)) return t('A function promises to return a value but can end without return.');
  if (/stray '\\?\d*' in program|stray '.' in program/.test(msg)) return t('An unusual character is in the code, often a curly quote pasted from a web page. Retype the quotes.');
  return '';
}

const n = (s: string) => Number(s.replace(/[^\d]/g, ''));

/**
 * Read arduino-cli's output. `sketchDir` is the folder the project was written to (paths under it
 * are the project's files, matched against `files`); paths elsewhere are libraries or the core.
 */
export function parseCompileOutput(out: string, sketchDir: string, files: string[], fqbn = ''): Omit<CompileReport, 'ok' | 'ms'> {
  const dir = sketchDir.replace(/\\/g, '/').replace(/\/$/, '');
  const diagnostics: CompileDiagnostic[] = [];
  const missing: MissingLibrary[] = [];
  const seen = new Set<string>();
  let flash: CompileUse | undefined;
  let ram: CompileUse | undefined;
  let missingCore: string | undefined;
  // eslint-disable-next-line no-control-regex
  const lines = out.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trimEnd();
    const d = /^(.+?):(\d+):(?:(\d+):)?\s*(fatal error|error|warning):\s*(.+)$/.exec(line);
    // "note: suggested alternative: 'pinMode'" (older gcc) belongs to the message before it.
    const alt = d ? null : /:\s*note:\s*suggested alternative:\s*'([^']+)'/.exec(line);
    const last = diagnostics[diagnostics.length - 1];
    if (alt && last && !last.hint.includes(alt[1])) last.hint = [last.hint, t('The compiler suggests: {name}', { name: alt[1] })].filter(Boolean).join(' ');
    if (d) {
      const path = d[1].replace(/\\/g, '/');
      const severity = d[4] === 'warning' ? 'warning' : 'error';
      const message = d[5].trim();
      const rel = path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : null;
      const file = rel !== null ? (files.find((f) => f === rel) ?? files.find((f) => rel.endsWith(`/${f}`) || f.endsWith(`/${rel}`))) : undefined;
      const key = `${file ?? path}:${d[2]}:${message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const header = /^([\w./+-]+\.(?:h|hpp|hh)): No such file or directory/.exec(message)?.[1];
      if (header && !missing.some((x) => x.header === header)) missing.push({ header, library: libraryForHeader(header) });
      diagnostics.push({
        ...(file ? { file } : { external: path.replace(/^.*\//, '') }),
        line: Number(d[2]),
        col: d[3] ? Number(d[3]) : 1,
        severity,
        message,
        hint: [explainCompilerMessage(message), ...[/did you mean '([^']+)'\?/.exec(message)?.[1]].filter(Boolean).map((x) => t('The compiler suggests: {name}', { name: x! }))].filter(Boolean).join(' '),
      });
      continue;
    }
    const fl = /Sketch uses ([\d,.]+) bytes \((\d+)%\) of program storage space\. Maximum is ([\d,.]+) bytes/.exec(line);
    if (fl) flash = { used: n(fl[1]), pct: Number(fl[2]), max: n(fl[3]) };
    const rm = /Global variables use ([\d,.]+) bytes \((\d+)%\) of dynamic memory.*Maximum is ([\d,.]+) bytes/.exec(line);
    if (rm) ram = { used: n(rm[1]), pct: Number(rm[2]), max: n(rm[3]) };
    const core = /[Pp]latform '([\w-]+:[\w-]+)' (?:is )?not (?:found|installed)/.exec(line);
    if (core) missingCore = core[1];
  }
  const tail = lines.map((l) => l.trim()).filter(Boolean).slice(-8);
  return { fqbn, diagnostics, flash, ram, missing, ...(missingCore ? { missingCore } : {}), tail };
}

/** One plain sentence for the log and the status bar. */
export function compileSummary(r: CompileReport): string {
  const errors = r.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = r.diagnostics.length - errors;
  if (r.missingCore) return t('The board package {core} is not installed, so the code could not be compiled.', { core: r.missingCore });
  if (!r.ok && r.missing.length) return t('The code needs a library that is not installed: {libs}.', { libs: r.missing.map((m) => m.library ?? m.header).join(', ') });
  if (!r.ok) return errors ? t('The compiler found {n} errors. Fix them before flashing.', { n: errors }) : t('The compiler stopped without saying where. See the log.');
  const size = r.flash ? t('{pct}% of the flash', { pct: r.flash.pct }) : '';
  return warnings
    ? t('Compiled ({size}), with {n} warnings.', { size: size || r.fqbn, n: warnings })
    : t('Compiled without errors ({size}).', { size: size || r.fqbn });
}
