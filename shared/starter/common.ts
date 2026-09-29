// Shared pieces of the starter project generators (shared/starter/*): the file list type, the
// "which scene and board this came from" header, safe names for the save-folder IPC, and the
// scene signals (which part pin is on which board GPIO) that every generator starts from.

import type { BoardDef, PartDef, PartPinRole, PinDef, Scene, ScenePart } from '../types';
import { pinById } from '../board';
import { t } from '../i18n';

export interface StarterFile {
  /** Path inside the project folder: a plain name, or up to three joined by "/" (see isSafeProjectPath). */
  name: string;
  text: string;
}

export interface StarterProject {
  /** Suggested folder name for "Save project folder…". */
  folder: string;
  files: StarterFile[];
  /** Plain-language notes for the user (already translated): pins the starter could not use, and why. */
  notes: string[];
}

/**
 * Names the save-folder IPC accepts: letters, digits, dot, dash and underscore, starting with a
 * letter or digit, at most 64 characters, never "..". No path separators, so a file can only land
 * inside the folder the user picked.
 */
export function isSafeProjectName(name: unknown): name is string {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name) && !name.includes('..');
}

/** Folder-friendly version of a project name: "Weather station" → "weather-station". */
export function slug(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'boardpilot-project';
}

/** Short, stable fingerprint of the scene (FNV-1a over parts and wires), printed in every file. */
export function sceneTag(scene: Scene): string {
  const text = JSON.stringify({
    board: scene.board,
    parts: scene.parts.map((p) => [p.id, p.partId]),
    wires: scene.wires.map((w) => [w.from.part, w.from.pin, w.to.part, w.to.pin]),
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** One line per part: "bme1 = GY-BME280 breakout". */
export function sceneParts(scene: Scene, parts: Record<string, PartDef>): string[] {
  return scene.parts.map((p) => `${p.id} = ${p.label && p.label !== parts[p.partId]?.name ? `${p.label}, ` : ''}${parts[p.partId]?.name ?? p.partId}`);
}

/** Text safe inside a // or # comment (one line). */
export const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/\*\//g, '* /');

/** A C identifier from a part or pin name: "bme1" → "BME1", "led-1" → "LED_1", "+" → "PLUS", "1" → "P1". */
export function cIdent(s: string): string {
  const x = (s === '+' ? 'PLUS' : s === '-' ? 'MINUS' : s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
  return !x ? 'X' : /^[0-9]/.test(x) ? `P${x}` : x;
}

/** A C string literal body for printf: escapes quotes, backslashes and %. */
export const cStr = (s: string) => oneLine(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');

/** Roles that carry no signal to a GPIO. */
const NO_SIGNAL: PartPinRole[] = ['power', 'ground', 'passive'];

/** A part pin wired to a board GPIO. */
export interface Signal {
  inst: ScenePart;
  def: PartDef;
  /** part pin name, e.g. "SDA" */
  pin: string;
  role: PartPinRole;
  needsOutput: boolean;
  board: PinDef;
  gpio: number;
}

/** Every part pin that is wired to a board GPIO, in scene order (power and ground left out). */
export function sceneSignals(scene: Scene, board: BoardDef, parts: Record<string, PartDef>): Signal[] {
  const out: Signal[] = [];
  const seen = new Set<string>();
  for (const w of scene.wires) {
    const boardEnd = w.from.part === 'board' ? w.from : w.to.part === 'board' ? w.to : null;
    const partEnd = w.from.part === 'board' ? w.to : w.from;
    if (!boardEnd || partEnd.part === 'board') continue;
    const inst = scene.parts.find((p) => p.id === partEnd.part);
    const def = inst ? parts[inst.partId] : undefined;
    const pp = def?.pins.find((p) => p.name === partEnd.pin);
    const bp = pinById(board, boardEnd.pin);
    if (!inst || !def || !pp || !bp || bp.gpio === null || bp.kind !== 'gpio' || NO_SIGNAL.includes(pp.role)) continue;
    const key = `${inst.id}.${pp.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ inst, def, pin: pp.name, role: pp.role, needsOutput: !!pp.needsOutput, board: bp, gpio: bp.gpio });
  }
  return out;
}

/** "Title, section" of the first board source whose section matches, for code comments. */
export function boardSource(board: BoardDef, re: RegExp): string | undefined {
  const s = board.sources?.find((x) => re.test(x.section ?? ''));
  return s ? `${s.title}, ${s.section}` : undefined;
}

/** "Title, section" of the part source that mentions `text` (a register), else the first source. */
export function partSource(def: PartDef, text?: string): string | undefined {
  const s = (text ? def.sources.find((x) => `${x.title} ${x.section ?? ''}`.includes(text)) : undefined) ?? def.sources[0];
  return s ? (s.section ? `${s.title}, ${s.section}` : s.title) : undefined;
}

/**
 * A file path inside the project folder: one to three plain names joined by "/" (ESP-IDF needs
 * main/main.c, the STM32 project keeps CubeMX's Core/Src/main.c). Each part follows
 * isSafeProjectName, so a path can never leave the folder the user picked.
 */
export function isSafeProjectPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length > 160) return false;
  const parts = path.split('/');
  return parts.length <= 3 && parts.every((p) => isSafeProjectName(p));
}

export const isLed = (d: PartDef) => d.model.shape === 'led' || d.starterSketch === 'led';
export const isButton = (d: PartDef) => d.model.shape === 'button' || d.starterSketch === 'button';

/** "BME280 SDA" style label of a signal, for notes. */
export const signalLabel = (s: Signal) => `${s.inst.label ?? s.def.name} ${s.pin}`;

/**
 * One owner per GPIO: claim(s, key) is true when the pin is free or already used for the same key
 * (a shared I2C bus), false with a note when another use has it.
 */
export function pinClaims(notes: string[]) {
  const owner = new Map<number, { key: string; label: string }>();
  const claim = (s: Signal, key: string): boolean => {
    const cur = owner.get(s.gpio);
    if (cur === undefined) {
      owner.set(s.gpio, { key, label: signalLabel(s) });
      return true;
    }
    if (cur.key === key) return true;
    notes.push(t('{pin} is wired to both {a} and {b}. The starter uses it for {a} only.', { pin: s.board.label, a: cur.label, b: signalLabel(s) }));
    return false;
  };
  return { claim, owner };
}

/** I2C parts that have both wires, grouped by the pair of pins they use. */
export interface I2cPair {
  sda: Signal;
  scl: Signal;
  /** the SDA signal of every part on these two pins */
  parts: Signal[];
}

/**
 * Groups the scene's I2C parts by their SDA/SCL pins. A part with only one of the two wires gets
 * a note and is returned in `lone`, so the generator can still name (but not use) its pin.
 */
export function i2cPairs(scene: Scene, signals: Signal[], notes: string[]): { pairs: I2cPair[]; lone: Signal[]; i2cParts: Set<string> } {
  const pairs: I2cPair[] = [];
  const lone: Signal[] = [];
  const i2cParts = new Set<string>();
  for (const inst of scene.parts) {
    const sda = signals.find((s) => s.inst.id === inst.id && s.role === 'i2c_sda');
    const scl = signals.find((s) => s.inst.id === inst.id && s.role === 'i2c_scl');
    if (!sda && !scl) continue;
    i2cParts.add(inst.id);
    if (!sda || !scl) {
      const have = (sda ?? scl) as Signal;
      notes.push(t('{part}: {pin} is not wired, so the starter leaves this I2C part out.', { part: have.inst.label ?? have.def.name, pin: sda ? 'SCL' : 'SDA' }));
      lone.push(have);
      continue;
    }
    const pair = pairs.find((b) => b.sda.gpio === sda.gpio && b.scl.gpio === scl.gpio);
    if (pair) pair.parts.push(sda);
    else pairs.push({ sda, scl, parts: [sda] });
  }
  return { pairs, lone, i2cParts };
}

/** The 7-bit addresses of an I2C part from its part file (0x08 to 0x77). */
export const i2cAddresses = (def: PartDef) => (def.addresses ?? []).map((a) => parseInt(a, 16)).filter((a) => Number.isFinite(a) && a >= 0x08 && a <= 0x77);

/** 0x76 → "0x76" (upper-case hex, at least two digits). */
export const hex2 = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, '0')}`;

/** The "Wiring" lines of the comment at the top of main.c. */
export function wiringComment(signals: Signal[], pinName: (s: Signal) => string): string[] {
  return signals.length ? signals.map((s) => `//   ${`${s.inst.id}.${s.pin}`.padEnd(16)} -> ${s.board.label} (${pinName(s)})`) : ['//   nothing wired yet'];
}

/** Markdown wiring table for README.md; `pinName` names the chip pin (GPIO 21, PB9...). */
export function wiringTable(signals: Signal[], pinHeader: string, pinName: (s: Signal) => string): string[] {
  return [
    `| Part | Part pin | Board pin | ${pinHeader} |`,
    '|---|---|---|---|',
    ...signals.map((s) => `| ${oneLine(s.inst.label ?? s.def.name)} (\`${s.inst.id}\`) | ${s.pin} | ${s.board.label} | ${pinName(s)} |`),
  ];
}
