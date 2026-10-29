// Reads an old project from its files: board or MCU, framework, parts, buses, protocols, pins,
// libraries and documents. Pure functions on file texts (the scanner in app/main/archive reads the
// disk), so every format is tested without a filesystem. Only what a file actually says is kept,
// each value with the file and line it came from; nothing is guessed from the README.

import type { PartDef, Scene } from '../types';
import { BOARDS } from '../board';
import { partsFromDescription } from '../describe';
import { stripComments } from '../codeCheck';
import { ROLE_LABEL, displayPinsFromCode, displayPinsFromFlags, tftEspiDrivers, type DisplayPin } from '../displayPins';
import { HEADERS, libDepFacts, type HeaderFacts } from './includeMap';
import type {
  ArchiveBus,
  ArchiveDoc,
  ArchiveKind,
  ArchivePart,
  ArchiveProject,
  ArchiveProtocol,
  Evidence,
  Fact,
  Framework,
  ProjectFile,
} from './types';

export const SOURCE_EXT = /\.(ino|c|cc|cpp|h|hpp)$/i;
export const DOC_EXT = /\.(md|txt|pdf|docx?|xlsx?|odt|ods|csv|rtf)$/i;
const SCHEMATIC_EXT = /\.(kicad_sch|kicad_pcb|kicad_pro|sch|brd|schdoc|pcbdoc)$/i;

/** Files whose presence makes a folder a project (the scanner stops descending there). */
export function isProjectMarker(name: string): boolean {
  return /^platformio\.ini$/i.test(name) || /\.ino$/i.test(name) || /\.ioc$/i.test(name) || /^sdkconfig(\.defaults)?$/i.test(name) || /\.kicad_pro$/i.test(name) || /\.boardpilot\.json$/i.test(name);
}

/* ---------------- small helpers ---------------- */

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

/** Collects facts once per value (the first evidence wins). */
class Bag<T> {
  readonly items: Fact<T>[] = [];
  private seen = new Set<string>();
  constructor(private readonly key: (v: T) => string) {}
  add(value: T, evidence: Evidence) {
    const k = this.key(value);
    if (this.seen.has(k)) return;
    this.seen.add(k);
    this.items.push({ value, source: 'detected', evidence });
  }
}

/** The library part a name from a schematic or BOM refers to ("SHT31-DIS", "MAX485ESA"), if any. */
export function partForName(name: string, parts: Record<string, PartDef>): string | undefined {
  // the most specific word wins: "SSR G3MB-202P fan" is the G3MB relay, not a fan
  const hits = [...partsFromDescription(name, parts), ...partsFromDescription(name.replace(/[-_:/,()]+/g, ' '), parts)];
  const best = hits.sort((a, b) => b.matched.length - a.matched.length)[0];
  if (best) return best.partId;
  // chip names with a package suffix: MAX485ESA → max485, DS18B20U → ds18b20
  const compact = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (compact.length < 5 || !/\d/.test(compact)) return undefined;
  for (const p of Object.values(parts)) {
    const kw = (p.keywords[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (kw.length >= 5 && /\d/.test(kw) && compact.startsWith(kw)) return p.id;
  }
  return undefined;
}

/** The part a pin label names by its first word: RELAY_PIN, NTC_MANDATA, RS485_DE, BUTTON. */
export function partForLabel(label: string, parts: Record<string, PartDef>): string | undefined {
  const first = label.split(/[^A-Za-z0-9]+/).filter(Boolean)[0] ?? '';
  return first.length >= 3 ? partsFromDescription(first, parts)[0]?.partId : undefined;
}

const partName = (partId: string | undefined, raw: string, parts: Record<string, PartDef>) => (partId && parts[partId] ? parts[partId].name : raw);

/** MCU text → board family words used for comparison ("STM32G071RBTx" → "stm32g0"). */
export function mcuFamily(mcu: string): string {
  const m = mcu.toUpperCase();
  if (/ESP32-?S3/.test(m)) return 'esp32s3';
  if (/ESP32-?C3/.test(m)) return 'esp32c3';
  if (/ESP32/.test(m)) return 'esp32';
  if (/ESP8266/.test(m)) return 'esp8266';
  if (/RP2350/.test(m)) return 'rp2350';
  if (/RP2040/.test(m)) return 'rp2040';
  if (/ATMEGA|ATTINY/.test(m)) return 'avr';
  const stm = /STM32([A-Z]\d)/.exec(m);
  if (stm) return `stm32${stm[1].toLowerCase()}`;
  if (/NRF52/.test(m)) return 'nrf52';
  if (/PIC(\d+)/.test(m)) return `pic${/PIC(\d+)/.exec(m)![1]}`;
  if (/IMXRT|RT106/.test(m)) return 'imxrt';
  return m.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
}

/** Display controllers named by a TFT_eSPI driver define or a LovyanGFX panel class that have exactly one part in the library. */
const CONTROLLER_PART: Record<string, string> = { ILI9341: 'ili9341-tft-28', GC9A01: 'gc9a01-round', ILI9488: 'ili9488-tft-35', ST7796: 'st7796-tft-35' };

/** Display pins a library setup names, as archive facts (each with the file and line it was read from). */
function addDisplayPins(acc: Acc, file: string, pins: DisplayPin[]) {
  for (const p of pins) {
    const ev = { file, line: p.line };
    acc.pins.add({ pin: `GPIO ${p.gpio}`, use: `${ROLE_LABEL[p.role]} (${p.name})` }, ev);
    if (p.role === 'mosi' || p.role === 'sclk' || p.role === 'miso' || p.role === 'touch_sclk') acc.buses.add('spi', ev);
    if (p.role === 'touch_sda' || p.role === 'touch_scl') acc.buses.add('i2c', ev);
  }
}

/** TFT_eSPI driver defines and LovyanGFX panel classes: the controller is a library fact, and a part when it is unambiguous. */
function addDisplayController(acc: Acc, f: ProjectFile, text: string, parts: Record<string, PartDef>) {
  const hits = [...tftEspiDrivers(text).map((d) => ({ ...d, lib: 'TFT_eSPI' })), ...[...text.matchAll(/\bPanel_([A-Z]+\d+[A-Z]?)\b/g)].map((m) => ({ controller: m[1], line: lineOf(text, m.index ?? 0), lib: 'LovyanGFX' }))];
  for (const h of hits) {
    const ev = { file: f.path, line: h.line };
    acc.libraries.add(`${h.lib} (${h.controller})`, ev);
    const partId = CONTROLLER_PART[h.controller.replace(/-/g, '')];
    if (partId && parts[partId]) acc.parts.add({ name: parts[partId].name, partId }, ev);
  }
}

/** PlatformIO board ids for the boards in /boards (source: docs.platformio.org/en/latest/boards). */
const PIO_BOARDS: Record<string, string> = {
  esp32dev: 'esp32-devkitc-30',
  'esp32-s3-devkitc-1': 'esp32-s3-devkitc-1',
  'esp32-c3-devkitm-1': 'esp32-c3-devkitm-1',
  uno: 'arduino-uno-r3',
  nanoatmega328: 'arduino-nano',
  nanoatmega328new: 'arduino-nano',
  megaatmega2560: 'arduino-mega-2560',
  pico: 'rpi-pico',
  rpipico: 'rpi-pico',
  rpipicow: 'rpi-pico-w',
  rpipico2: 'rpi-pico-2',
  blackpill_f411ce: 'blackpill-f411ce',
  nucleo_f401re: 'nucleo-f401re',
  teensy41: 'teensy-41',
  nrf52840_dk: 'nrf52840-dk',
};

function boardFromFqbn(fqbn: string): string | undefined {
  const base = fqbn.split(':').slice(0, 3).join(':');
  return Object.values(BOARDS).find((b) => b.toolchain.fqbn === fqbn || b.toolchain.fqbn.split(':').slice(0, 3).join(':') === base)?.id;
}

/* ---------------- the analysis ---------------- */

interface Acc {
  framework: Fact<Framework> | null;
  board: Fact<{ boardId?: string; mcu: string }> | null;
  parts: Bag<ArchivePart>;
  buses: Bag<ArchiveBus>;
  protocols: Bag<ArchiveProtocol>;
  pins: Bag<{ pin: string; use: string }>;
  libraries: Bag<string>;
  summary: Fact | null;
  keywords: Set<string>;
  mainSource?: string;
  scene?: Scene;
  kinds: Set<ArchiveKind>;
}

function setFramework(acc: Acc, value: Framework, evidence: Evidence) {
  // the build system wins over what the sources look like
  const rank: Framework[] = ['unknown', 'kicad', 'arduino', 'pico-sdk', 'stm32cube', 'esp-idf', 'platformio', 'boardpilot'];
  if (!acc.framework || rank.indexOf(value) > rank.indexOf(acc.framework.value)) acc.framework = { value, source: 'detected', evidence };
}

function setBoard(acc: Acc, value: { boardId?: string; mcu: string }, evidence: Evidence) {
  // a named board beats an MCU name; the first of each kind wins
  if (!acc.board || (!acc.board.value.boardId && value.boardId)) acc.board = { value, source: 'detected', evidence };
}

function applyHeader(acc: Acc, f: HeaderFacts, ev: Evidence, parts: Record<string, PartDef>) {
  acc.libraries.add(f.library, ev);
  if (f.partId && parts[f.partId]) acc.parts.add({ name: parts[f.partId].name, partId: f.partId }, ev);
  if (f.bus) acc.buses.add(f.bus, ev);
  if (f.protocol) acc.protocols.add(f.protocol, ev);
}

function readPlatformio(acc: Acc, f: ProjectFile, parts: Record<string, PartDef>) {
  setFramework(acc, 'platformio', { file: f.path });
  const lines = f.text.split('\n');
  let inDeps = false;
  lines.forEach((raw, i) => {
    const line = raw.replace(/[;#].*$/, '');
    const ev = { file: f.path, line: i + 1 };
    const kv = /^\s*([\w.]+)\s*=\s*(.*)$/.exec(line);
    if (kv) {
      inDeps = kv[1] === 'lib_deps';
      const v = kv[2].trim();
      if (kv[1] === 'board' && v) {
        const boardId = PIO_BOARDS[v.toLowerCase()];
        setBoard(acc, { boardId, mcu: boardId ? BOARDS[boardId].chip : v }, ev);
      }
      if (kv[1] === 'board_build.mcu' && v && !acc.board?.value.boardId) setBoard(acc, { mcu: v }, ev);
      if (inDeps && v) for (const d of v.split(',')) addDep(acc, d.trim(), ev, parts);
      return;
    }
    if (/^\s*\[/.test(line)) inDeps = false;
    else if (inDeps && /^\s+\S/.test(line)) addDep(acc, line.trim(), ev, parts);
  });
  // TFT_eSPI can be configured from build flags (-D TFT_MOSI=23) instead of User_Setup.h
  addDisplayPins(acc, f.path, displayPinsFromFlags(f.text));
  addDisplayController(acc, f, f.text, parts);
}

function addDep(acc: Acc, dep: string, ev: Evidence, parts: Record<string, PartDef>) {
  if (!dep) return;
  const facts = libDepFacts(dep);
  if (facts) applyHeader(acc, facts, ev, parts);
}

/** Calls that name a bus or protocol in C/C++ (Arduino core, ESP-IDF, STM32 HAL). */
const CALL_FACTS: [RegExp, { bus?: ArchiveBus; protocol?: ArchiveProtocol }][] = [
  [/\bWire\d?\.begin\s*\(|\bHAL_I2C_\w+\s*\(|\bi2c_master_\w+\s*\(|\bi2c_param_config\s*\(/, { bus: 'i2c' }],
  [/\bSPI\d?\.begin\s*\(|\bHAL_SPI_\w+\s*\(|\bspi_bus_initialize\s*\(/, { bus: 'spi' }],
  [/\bSerial[1-3]\.begin\s*\(|\bHAL_UART_\w+\s*\(|\buart_driver_install\s*\(/, { bus: 'uart' }],
  [/\banalogRead\s*\(|\bHAL_ADC_\w+\s*\(|\badc1_get_raw\s*\(|\badc_oneshot_read\s*\(/, { bus: 'adc' }],
  [/\btwai_driver_install\s*\(|\bHAL_CAN_\w+\s*\(|\bHAL_FDCAN_\w+\s*\(/, { bus: 'can' }],
  [/\bWiFi\.begin\s*\(|\besp_wifi_start\s*\(/, { protocol: 'wifi' }],
  [/\bmodbus\w*|\bMODBUS\w*|\bMB_FUNC_\w+/i, { protocol: 'modbus' }],
  [/\bOpenTherm\b|\bopentherm\w*/i, { protocol: 'opentherm' }],
  [/\bmqtt\w*\s*\(|\bPubSubClient\b/i, { protocol: 'mqtt' }],
];

function readSource(acc: Acc, f: ProjectFile, parts: Record<string, PartDef>) {
  const ext = f.path.toLowerCase();
  if (ext.endsWith('.ino')) setFramework(acc, 'arduino', { file: f.path });
  if (!acc.mainSource || /(^|\/)(main\.(c|cpp)|[^/]+\.ino)$/i.test(f.path)) {
    if (!acc.mainSource || !/\.ino$/i.test(acc.mainSource)) acc.mainSource = f.path;
  }
  for (const m of f.text.matchAll(/^[ \t]*#[ \t]*include[ \t]*[<"]([^>"]+)[>"]/gm)) {
    const header = m[1].split('/').pop()!.toLowerCase();
    const ev = { file: f.path, line: lineOf(f.text, m.index ?? 0) };
    if (header === 'arduino.h') setFramework(acc, 'arduino', ev);
    if (/^stm32\w+_hal\.h$/.test(header)) {
      setFramework(acc, 'stm32cube', ev);
      const fam = /^stm32(\w\d)/.exec(header);
      if (fam) setBoard(acc, { mcu: `STM32${fam[1].toUpperCase()}` }, ev);
    }
    if (/^pico\/stdlib\.h$/.test(m[1])) setFramework(acc, 'pico-sdk', ev);
    if (/^freertos\/freertos\.h$|^esp_\w+\.h$/.test(m[1].toLowerCase()) && !/\.ino$/i.test(f.path)) setFramework(acc, 'esp-idf', ev);
    const known = HEADERS[header];
    if (known) applyHeader(acc, known, ev, parts);
    else if (!/^(stdio|stdlib|string|stdint|stdbool|math|arduino)\.h$/.test(header) && !/^stm32|^main\.h$|^freertos|^esp_|^driver/.test(header) && /^[A-Za-z]/.test(header) && !f.text.includes(`"${m[1]}"`))
      acc.libraries.add(m[1].replace(/\.h(pp)?$/i, ''), ev);
  }
  const code = stripComments(f.text);
  for (const [re, facts] of CALL_FACTS) {
    const m = re.exec(code);
    if (!m) continue;
    const ev = { file: f.path, line: lineOf(code, m.index) };
    if (facts.bus) acc.buses.add(facts.bus, ev);
    if (facts.protocol) acc.protocols.add(facts.protocol, ev);
  }
  // display pins: TFT_eSPI User_Setup.h defines, LovyanGFX cfg.pin_*, Adafruit constructors
  addDisplayPins(acc, f.path, displayPinsFromCode(code));
  addDisplayController(acc, f, code, parts);
  // pins: pinMode(NAME, MODE) with NAME resolved through #define / const int
  const consts = new Map<string, string>();
  for (const m of code.matchAll(/^[ \t]*#define[ \t]+(\w+)[ \t]+\(?(\w+)\)?[ \t]*$/gm)) consts.set(m[1], m[2]);
  for (const m of code.matchAll(/\b(?:const\s+|constexpr\s+|static\s+)*(?:int|uint8_t|byte|gpio_num_t|pin_size_t)\s+(\w+)\s*=\s*\(?(\w+)\)?\s*;/g)) if (!consts.has(m[1])) consts.set(m[1], m[2]);
  for (const m of code.matchAll(/\bpinMode\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/g)) {
    const name = m[1];
    const value = consts.get(name) ?? name;
    const mode = m[2].toLowerCase().replace('input_pullup', 'input pull-up');
    const use = value === name ? mode : `${name.toLowerCase().replace(/_pin$/, '').replace(/_/g, ' ')} (${mode})`;
    const ev = { file: f.path, line: lineOf(code, m.index ?? 0) };
    acc.pins.add({ pin: /^\d+$/.test(value) ? `GPIO ${value}` : value, use }, ev);
    const partId = value === name ? undefined : partForLabel(name, parts);
    if (partId) acc.parts.add({ name: parts[partId].name, partId }, ev);
  }
}

function readSdkconfig(acc: Acc, f: ProjectFile) {
  setFramework(acc, 'esp-idf', { file: f.path });
  const m = /^CONFIG_IDF_TARGET="?(\w+)"?/m.exec(f.text);
  if (m) setBoard(acc, { mcu: m[1].toUpperCase().replace(/^ESP32(\w)/, 'ESP32-$1') }, { file: f.path, line: lineOf(f.text, m.index) });
}

function readIdfComponent(acc: Acc, f: ProjectFile, parts: Record<string, PartDef>) {
  let inDeps = false;
  f.text.split('\n').forEach((line, i) => {
    if (/^dependencies:/.test(line)) inDeps = true;
    else if (/^\S/.test(line)) inDeps = false;
    const dep = /^ {2}["']?([\w./-]+)["']?:/.exec(line);
    if (inDeps && dep && dep[1] !== 'idf') addDep(acc, dep[1], { file: f.path, line: i + 1 }, parts);
  });
}

function readCmake(acc: Acc, f: ProjectFile) {
  if (/\$ENV\{IDF_PATH\}|idf_component_register|project\.cmake/.test(f.text)) setFramework(acc, 'esp-idf', { file: f.path });
  if (/pico_sdk_import|pico_sdk_init/.test(f.text)) setFramework(acc, 'pico-sdk', { file: f.path });
}

/** STM32CubeMX project: the MCU and every configured pin (source: the .ioc key=value format). */
function readIoc(acc: Acc, f: ProjectFile, parts: Record<string, PartDef>) {
  setFramework(acc, 'stm32cube', { file: f.path });
  const lines = f.text.split('\n');
  const labels = new Map<string, string>();
  lines.forEach((l) => {
    const m = /^(P[A-K]\d{1,2})[\w-]*\.GPIO_Label=(.+)$/.exec(l.trim());
    if (m) labels.set(m[1], m[2].trim());
  });
  // the exact part number (UserName) is better than the family pattern (Name)
  const mcuLine = lines.findIndex((l) => /^Mcu\.UserName=/.test(l.trim()));
  const nameLine = mcuLine >= 0 ? mcuLine : lines.findIndex((l) => /^Mcu\.Name=/.test(l.trim()));
  if (nameLine >= 0) setBoard(acc, { mcu: lines[nameLine].trim().replace(/^Mcu\.\w+=/, '').replace(/\(.*\)/, '') }, { file: f.path, line: nameLine + 1 });
  lines.forEach((raw, i) => {
    const l = raw.trim();
    const ev = { file: f.path, line: i + 1 };
    const sig = /^(P[A-K]\d{1,2})[\w-]*\.Signal=(\S+)/.exec(l);
    if (!sig) return;
    const [, pin, signal] = sig;
    const label = labels.get(pin);
    acc.pins.add({ pin, use: label ? `${label} (${signal})` : signal }, ev);
    const partId = label ? partForLabel(label, parts) : undefined;
    if (partId) acc.parts.add({ name: parts[partId].name, partId }, ev);
    if (/^I2C\d/.test(signal)) acc.buses.add('i2c', ev);
    else if (/^SPI\d/.test(signal)) acc.buses.add('spi', ev);
    else if (/^(USART|UART|LPUART)\d/.test(signal)) acc.buses.add('uart', ev);
    else if (/^ADC\d?_IN/.test(signal)) acc.buses.add('adc', ev);
    else if (/^(FD)?CAN\d?_/.test(signal)) acc.buses.add('can', ev);
    if (/^(USART|UART)\d_DE$/.test(signal) || /rs485|modbus/i.test(label ?? '')) acc.buses.add('rs485', ev);
  });
}

const MCU_NAME = /^(STM32|ESP32|ESP8266|ATMEGA|ATTINY|RP2040|RP2350|NRF52|PIC\d|SAMD|R7FA|GD32)/i;

/** Library ids of generic symbols that say nothing about the project (resistors, power flags). */
const GENERIC_SYMBOL = /^(power|Device:(R|C|L|D|Q_|Crystal|Fuse|Ferrite|LED|R_Small|C_Small|C_Polarized)|Connector\w*:|Mechanical:|Jumper:|Switch:SW_Push)/;

/** KiCad schematic: the symbols placed (lib_id) and their values; MCU symbols give the board. */
function readKicad(acc: Acc, f: ProjectFile, parts: Record<string, PartDef>) {
  setFramework(acc, 'kicad', { file: f.path });
  // symbols placed on the sheet (not the library copies at the top of the file)
  const libSymbolsEnd = f.text.indexOf('(lib_symbols');
  const body = libSymbolsEnd >= 0 ? f.text.slice(0, libSymbolsEnd) + ' '.repeat(Math.max(0, closingIndex(f.text, libSymbolsEnd) - libSymbolsEnd)) + f.text.slice(closingIndex(f.text, libSymbolsEnd)) : f.text;
  for (const m of body.matchAll(/\(symbol\s+\(lib_id\s+"([^"]+)"\)/g)) {
    const libId = m[1];
    const ev = { file: f.path, line: lineOf(f.text, m.index ?? 0) };
    // the Value property of this placed symbol, if close by
    const after = body.slice(m.index ?? 0, (m.index ?? 0) + 1500);
    const value = /\(property\s+"Value"\s+"([^"]+)"/.exec(after)?.[1] ?? libId.split(':').pop()!;
    if (GENERIC_SYMBOL.test(libId)) continue;
    if (/^(MCU_|RF_Module:ESP|MCU_Module:)/.test(libId) || MCU_NAME.test(value)) {
      setBoard(acc, { mcu: value }, ev);
      continue;
    }
    const partId = partForName(value, parts);
    acc.parts.add({ name: partName(partId, value, parts), ...(partId ? { partId } : {}) }, ev);
    if (/MAX48[1-5]|SP3485|ADM248|THVD|SN65HVD7/i.test(value)) acc.buses.add('rs485', ev);
  }
}

/** Index of the parenthesis closing the one opened at `start`. */
function closingIndex(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i + 1;
  }
  return text.length;
}

/** A BOM table (CSV): the Value / Part / Description column, one part per row. */
function readBom(acc: Acc, f: ProjectFile, parts: Record<string, PartDef>) {
  const rows = f.text.split(/\r?\n/).filter((r) => r.trim());
  if (rows.length < 2) return;
  const sep = (rows[0].match(/;/g)?.length ?? 0) > (rows[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const cells = (r: string) => r.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
  const head = cells(rows[0]).map((h) => h.toLowerCase());
  const isBom = head.some((h) => /^(ref|reference|designator|qty|quantity)/.test(h));
  const col = head.findIndex((h) => /^(value|part|part number|mpn|component)$/.test(h));
  if (!isBom || col < 0) return;
  rows.slice(1).forEach((r, i) => {
    const v = cells(r)[col];
    if (!v || /^\d+(\.\d+)?\s*[kmµunp]?(Ω|ohm|f|h|r)?$/i.test(v)) return; // plain values: 10k, 100nF
    if (MCU_NAME.test(v)) {
      setBoard(acc, { mcu: v }, { file: f.path, line: i + 2 });
      return;
    }
    const partId = partForName(v, parts);
    if (!partId) return; // only parts we recognise; a BOM has many passives
    acc.parts.add({ name: parts[partId].name, partId }, { file: f.path, line: i + 2 });
  });
}

function readBoardpilot(acc: Acc, f: ProjectFile, parts: Record<string, PartDef>) {
  let raw: unknown;
  try {
    raw = JSON.parse(f.text);
  } catch {
    return;
  }
  const file = raw as { scene?: Scene; title?: string };
  const scene = (file.scene ?? raw) as Scene;
  if (!scene || typeof scene.board !== 'string' || !Array.isArray(scene.parts)) return;
  acc.kinds.add('boardpilot');
  acc.scene = scene;
  const ev = { file: f.path };
  setFramework(acc, 'boardpilot', ev);
  const b = BOARDS[scene.board];
  setBoard(acc, { boardId: b ? b.id : undefined, mcu: b ? b.chip : scene.board }, ev);
  for (const p of scene.parts) {
    const def = parts[p.partId];
    acc.parts.add({ name: def?.name ?? p.partId, ...(def ? { partId: p.partId } : {}) }, ev);
    if (def?.bus === 'i2c' || def?.bus === 'spi' || def?.bus === 'onewire') acc.buses.add(def.bus, ev);
    if (def?.bus === 'analog') acc.buses.add('adc', ev);
  }
}

/** README: the first paragraph as the summary, headings and words as keywords. */
function readReadme(acc: Acc, f: ProjectFile) {
  const lines = f.text.split('\n');
  for (const h of lines.filter((l) => /^#{1,3}\s/.test(l))) addWords(acc.keywords, h.replace(/^#+/, ''));
  addWords(acc.keywords, f.text.slice(0, 4000));
  if (acc.summary) return;
  const start = lines.findIndex((l) => l.trim() && !/^#|^[-=]{3,}|^!\[|^</.test(l.trim()));
  if (start < 0) return;
  const para: string[] = [];
  for (let i = start; i < lines.length && lines[i].trim() && para.join(' ').length < 240; i++) para.push(lines[i].trim());
  const text = para.join(' ').replace(/[*_`]/g, '').slice(0, 280);
  if (text) acc.summary = { value: text, source: 'detected', evidence: { file: f.path, line: start + 1 } };
}

const STOPWORDS = new Set(
  'the and for with that this from are was una uno per con che del della dei delle nel nella sul sulla alla allo alle gli lo il la le di da in su un project progetto readme file version versione note notes'.split(' '),
);

export function addWords(set: Set<string>, text: string) {
  for (const w of text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/))
    if (w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w)) set.add(w);
}

/**
 * Everything the files of one project say. `files` are relative to the project folder; binary or
 * too-big files have empty text and only count as documents or schematics.
 */
export function analyzeProject(
  root: string,
  archiveRoot: string,
  name: string,
  files: ProjectFile[],
  parts: Record<string, PartDef>,
  now: number,
): ArchiveProject {
  const acc: Acc = {
    framework: null,
    board: null,
    parts: new Bag((p) => p.partId ?? p.name.toLowerCase()),
    buses: new Bag((b) => b),
    protocols: new Bag((p) => p),
    pins: new Bag((p) => `${p.pin}:${p.use}`),
    libraries: new Bag((l) => l.toLowerCase().replace(/\blibrary\b/g, '').replace(/[^a-z0-9]/g, '')),
    summary: null,
    keywords: new Set(),
    kinds: new Set(),
  };
  addWords(acc.keywords, name);
  const docs: ArchiveDoc[] = [];
  // build files first, so the framework and board they name win over what the sources suggest
  const order = (p: string) => (/platformio\.ini$|\.ioc$|sdkconfig/i.test(p) ? 0 : /\.boardpilot\.json$|\.kicad_sch$/i.test(p) ? 1 : 2);
  for (const f of [...files].sort((a, b) => order(a.path) - order(b.path) || a.path.localeCompare(b.path))) {
    const base = f.path.split('/').pop()!.toLowerCase();
    if (base === 'platformio.ini') readPlatformio(acc, f, parts);
    else if (/\.boardpilot\.json$/.test(base)) readBoardpilot(acc, f, parts);
    else if (/^sdkconfig(\.defaults)?$/.test(base)) readSdkconfig(acc, f);
    else if (base === 'idf_component.yml') readIdfComponent(acc, f, parts);
    else if (base === 'cmakelists.txt') readCmake(acc, f);
    else if (base.endsWith('.ioc')) readIoc(acc, f, parts);
    else if (base.endsWith('.kicad_sch')) readKicad(acc, f, parts);
    if (SOURCE_EXT.test(base)) {
      acc.kinds.add('firmware');
      readSource(acc, f, parts);
    }
    if (/\.ioc$|platformio\.ini$|^sdkconfig/.test(base)) acc.kinds.add('firmware');
    if (SCHEMATIC_EXT.test(base)) acc.kinds.add('schematic');
    if (DOC_EXT.test(base) && base !== 'cmakelists.txt' && !/^(license|licence|changelog)/.test(base)) {
      acc.kinds.add('docs');
      docs.push({ path: f.path, type: base.split('.').pop()! });
      if (base.endsWith('.csv')) readBom(acc, f, parts);
      if (/^readme/.test(base)) readReadme(acc, f);
    }
  }
  // a library part brings its bus (a DS18B20 on a schematic means 1-Wire)
  for (const p of acc.parts.items) {
    const bus = p.value.partId ? parts[p.value.partId]?.bus : undefined;
    if (bus === 'i2c' || bus === 'spi' || bus === 'onewire') acc.buses.add(bus, p.evidence ?? { file: '' });
    else if (bus === 'analog') acc.buses.add('adc', p.evidence ?? { file: '' });
  }
  if (!acc.summary) {
    // a comment block at the top of the main source, as written
    const main = files.find((f) => f.path === acc.mainSource);
    const m = main && /^\s*(?:\/\*+([\s\S]*?)\*\/|((?:\/\/[^\n]*\n){1,6}))/.exec(main.text);
    const text = m ? (m[1] ?? m[2] ?? '').replace(/^\s*(\*|\/\/)\s?/gm, '').replace(/\s+/g, ' ').trim().slice(0, 280) : '';
    if (text) acc.summary = { value: text, source: 'detected', evidence: { file: main!.path, line: 1 } };
  }
  return {
    id: projectId(root),
    root,
    archiveRoot,
    name,
    kinds: [...acc.kinds],
    framework: acc.framework ?? { value: 'unknown', source: 'detected' },
    board: acc.board,
    parts: acc.parts.items,
    buses: acc.buses.items,
    protocols: acc.protocols.items,
    pins: acc.pins.items.slice(0, 40),
    libraries: acc.libraries.items.slice(0, 40),
    docs: docs.slice(0, 60),
    summary: acc.summary,
    keywords: [...acc.keywords].slice(0, 200),
    ...(acc.mainSource ? { mainSource: acc.mainSource } : {}),
    ...(acc.scene ? { scene: acc.scene } : {}),
    lastModified: files.reduce((m, f) => Math.max(m, f.mtime), 0),
    scannedAt: now,
    fileCount: files.length,
  };
}

/** A short stable id for a folder path (FNV-1a), the same on every scan. */
export function projectId(root: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < root.length; i++) {
    h ^= root.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `p${(h >>> 0).toString(36)}`;
}
