// Shared pieces of the starter project generators (shared/starter/*): the file list type, the
// "which scene and board this came from" header, safe names for the save-folder IPC, and the
// scene signals (which part pin is on which board GPIO) that every generator starts from.

import type { BoardDef, PartDef, PartPinRole, PinDef, Scene, ScenePart } from '../types';
import { pinById } from '../board';

export interface StarterFile {
  /** Plain file name inside the project folder (no folders, see isSafeProjectName). */
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
