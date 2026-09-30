// Changes to the project (drawing and code) asked for by an AI: the in-app assistant (edit_project tool) and
// any MCP agent use this one module. A change list is checked against the board and part files
// first (unknown pins or parts are refused with a plain reason), then applied to a copy of the
// scene; the wiring rules run on the result. Nothing here touches the board or the open project:
// the app shows the changes and applies them only after the user clicks Apply (undoable).

import type { BoardDef, PartDef, PartPinRole, Result, Scene, ScenePart, SceneWire, TargetRef, WireEnd, WiringFinding } from './types';
import { ROLE_HEX, getBoard, partRoleColor, pinById } from './board';
import { assignPins } from './assign';
import { checkWiring } from './wiring';

export type SceneOp =
  | { op: 'add_part'; partId: string; id?: string; label?: string }
  | { op: 'remove_part'; id: string }
  | { op: 'rename_part'; id: string; label: string }
  | { op: 'add_wire'; from: WireEnd; to: WireEnd }
  | { op: 'remove_wire'; id: string }
  | { op: 'assign_pins' }
  | { op: 'set_code'; text: string; name?: string };

/** One line of the change list. `text` is an English template (translated with t() in the UI). */
export interface SceneChange {
  text: string;
  vars: Record<string, string>;
  target?: TargetRef;
}

export interface SceneEditResult {
  scene: Scene;
  changes: SceneChange[];
  /** Wiring findings on the result. */
  findings: WiringFinding[];
  /** The findings that were not there before the change. */
  newFindings: WiringFinding[];
}

export const MAX_SCENE_OPS = 30;

/** Change-list templates. Italian entries live in shared/i18n/it/app.ts (checked by tests). */
export const CHANGE_TEXT = {
  addPart: 'Add {part} as {id}.',
  removePart: 'Remove {name} and its wires.',
  renamePart: 'Rename {id} to “{label}”.',
  addWire: 'Wire {from} to {to}.',
  removeWire: 'Remove the wire {from} – {to}.',
  assigned: 'Pin assigned: {note}',
  nothingToAssign: 'Every part pin already has a wire: no pins to assign.',
  setCode: 'Replace the code in {name} ({lines} lines).',
} as const;

/** Tool input schema, shared by the in-app assistant and MCP. */
export const SCENE_EDIT_SCHEMA = {
  type: 'object',
  properties: {
    changes: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_SCENE_OPS,
      description: 'Applied in order; a later change can use a part added by an earlier one (give it an id).',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['add_part', 'remove_part', 'rename_part', 'add_wire', 'remove_wire', 'assign_pins', 'set_code'] },
          partId: { type: 'string', description: 'add_part: parts library id, e.g. "bme280-gy", "led-resistor"' },
          id: { type: 'string', description: 'add_part: the new part\'s id in the project (optional, e.g. "led2"); remove_part/rename_part: the part id; remove_wire: the wire id' },
          label: { type: 'string', description: 'add_part/rename_part: the name shown in the drawing' },
          from: { type: 'object', properties: { part: { type: 'string' }, pin: { type: 'string' } }, required: ['part', 'pin'], description: 'add_wire: {part:"board", pin:"D25"} for a board pin, or {part:"led1", pin:"A"}' },
          to: { type: 'object', properties: { part: { type: 'string' }, pin: { type: 'string' } }, required: ['part', 'pin'] },
          text: { type: 'string', description: 'set_code: the whole sketch (Arduino C++); it replaces the project’s code' },
          name: { type: 'string', description: 'set_code: file name, e.g. "blink.ino" (optional: keeps the current name)' },
        },
        required: ['op'],
      },
    },
    reason: { type: 'string', description: 'one plain sentence for the user: why these changes' },
  },
  required: ['changes', 'reason'],
  additionalProperties: false,
};

export const SCENE_EDIT_DESCRIPTION =
  'Change the project drawing: add_part (partId from the parts library, optional id and label), remove_part (id; its wires go too), rename_part (id, label), ' +
  'add_wire (from/to: {part:"board", pin:<board pin id like "D25">} or {part:<part id>, pin:<part pin name>}), remove_wire (id), assign_pins (wire every unwired part pin with the safe-pin rules), set_code (text: the whole sketch, optional name; it is checked against the wiring). ' +
  'The changes are checked against the board and part files, the wiring rules run on the result, and the user sees the list in BoardPilot and clicks Apply (⌘Z undoes it). Nothing is written to the board.';

const PART_ID = /^[a-z][a-z0-9_-]{0,23}$/i;

/** Plain parsing of the tool input; throws with a plain reason when the shape is wrong. */
export function parseSceneOps(raw: unknown): SceneOp[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('changes must be a non-empty list');
  if (raw.length > MAX_SCENE_OPS) throw new Error(`at most ${MAX_SCENE_OPS} changes at once`);
  const s = (v: unknown, what: string): string => {
    if (typeof v !== 'string' || !v.trim()) throw new Error(`${what} must be a non-empty string`);
    return v.trim();
  };
  const end = (v: unknown, what: string): WireEnd => {
    if (typeof v !== 'object' || v === null) throw new Error(`${what} must be {part, pin}`);
    const o = v as Record<string, unknown>;
    return { part: s(o.part, `${what}.part`), pin: s(o.pin, `${what}.pin`) };
  };
  return raw.map((x, i): SceneOp => {
    if (typeof x !== 'object' || x === null) throw new Error(`change ${i + 1} must be an object`);
    const o = x as Record<string, unknown>;
    const where = `change ${i + 1}`;
    switch (o.op) {
      case 'add_part':
        return { op: 'add_part', partId: s(o.partId, `${where}: partId`), id: typeof o.id === 'string' && o.id ? o.id : undefined, label: typeof o.label === 'string' && o.label ? o.label : undefined };
      case 'remove_part':
        return { op: 'remove_part', id: s(o.id, `${where}: id`) };
      case 'rename_part':
        return { op: 'rename_part', id: s(o.id, `${where}: id`), label: s(o.label, `${where}: label`) };
      case 'add_wire':
        return { op: 'add_wire', from: end(o.from, `${where}: from`), to: end(o.to, `${where}: to`) };
      case 'remove_wire':
        return { op: 'remove_wire', id: s(o.id, `${where}: id`) };
      case 'assign_pins':
        return { op: 'assign_pins' };
      case 'set_code': {
        if (typeof o.text !== 'string' || !o.text.trim()) throw new Error(`${where}: text must be the sketch`);
        if (o.text.length > 200_000) throw new Error(`${where}: the sketch is too long`);
        return { op: 'set_code', text: o.text, name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : undefined };
      }
      default:
        throw new Error(`${where}: unknown op ${JSON.stringify(o.op)}`);
    }
  });
}

const SLOTS: [number, number][] = [
  [12, 44], [-18, 44], [40, 44], [-2, -42], [24, -44], [-26, -42], [50, -44], [-48, 44],
  [70, 20], [-70, 20], [70, -30], [-70, -30], [12, 76], [-30, 76], [40, -76], [-10, -76],
];

/** A free spot on the desk next to the board for a new part. */
export function freeSpot(parts: ScenePart[]): [number, number] {
  const free = SLOTS.find(([x, z]) => !parts.some((p) => Math.abs(p.position[0] - x) < 14 && Math.abs(p.position[2] - z) < 14));
  return free ?? [90 + (parts.length % 4) * 22, -60 + Math.floor(parts.length / 4) * 24];
}

/** The id a new part of this kind gets: "bme280-gy" → bme1, bme2… (the same scheme as the app). */
export function newPartId(parts: ScenePart[], partId: string): string {
  const base = partId.replace(/-.*$/, '').replace(/[^a-z0-9]/gi, '') || 'part';
  let n = 1;
  while (parts.some((p) => p.id === `${base}${n}`)) n++;
  return `${base}${n}`;
}

const fail = (humanMessage: string, hint: string): Result<never> => ({ ok: false, error: { code: 'invalid_change', humanMessage, hint } });

/** Apply the changes to a copy of the scene, or say which change cannot be made and why. */
export function applySceneOps(base: Scene, ops: SceneOp[], parts: Record<string, PartDef>, board: BoardDef = getBoard(base.board)): Result<SceneEditResult> {
  let scene: Scene = { ...base, parts: [...base.parts], wires: [...base.wires] };
  const changes: SceneChange[] = [];
  const partOf = (id: string) => scene.parts.find((p) => p.id === id);
  const endName = (e: WireEnd) => {
    if (e.part === 'board') return pinById(board, e.pin)?.label ?? e.pin;
    const p = partOf(e.part);
    return `${p?.label ?? e.part} ${e.pin}`;
  };

  for (const [i, op] of ops.entries()) {
    const n = `Change ${i + 1}`;
    switch (op.op) {
      case 'add_part': {
        const def = parts[op.partId];
        if (!def) return fail(`${n}: there is no part "${op.partId}" in the parts library.`, 'Use an exact id from search_parts.');
        let id = op.id;
        if (id !== undefined) {
          if (!PART_ID.test(id) || id === 'board') return fail(`${n}: "${id}" cannot be a part id.`, 'Use letters, digits, - or _, starting with a letter (e.g. "led2").');
          if (partOf(id)) return fail(`${n}: the project already has a part "${id}".`, 'Pick another id or leave it out.');
        } else id = newPartId(scene.parts, op.partId);
        const [x, z] = freeSpot(scene.parts);
        const label = (op.label ?? def.name.split(/[ (]/)[0]).slice(0, 30);
        scene = { ...scene, parts: [...scene.parts, { id, partId: op.partId, position: [x, 0, z], label, confirmed: true }] };
        changes.push({ text: CHANGE_TEXT.addPart, vars: { part: def.name, id }, target: `part:${id}` });
        break;
      }
      case 'remove_part': {
        const p = partOf(op.id);
        if (!p) return fail(`${n}: the project has no part "${op.id}".`, 'Call get_scene for the part ids.');
        scene = { ...scene, parts: scene.parts.filter((x) => x.id !== op.id), wires: scene.wires.filter((w) => w.from.part !== op.id && w.to.part !== op.id) };
        changes.push({ text: CHANGE_TEXT.removePart, vars: { name: p.label ?? p.id } });
        break;
      }
      case 'rename_part': {
        if (!partOf(op.id)) return fail(`${n}: the project has no part "${op.id}".`, 'Call get_scene for the part ids.');
        const label = op.label.slice(0, 30);
        scene = { ...scene, parts: scene.parts.map((x) => (x.id === op.id ? { ...x, label } : x)) };
        changes.push({ text: CHANGE_TEXT.renamePart, vars: { id: op.id, label }, target: `part:${op.id}` });
        break;
      }
      case 'add_wire': {
        let role: PartPinRole | undefined;
        for (const e of [op.from, op.to]) {
          if (e.part === 'board') {
            if (!pinById(board, e.pin)) return fail(`${n}: the ${board.name} has no pin "${e.pin}".`, 'Use a pin id from get_board (e.g. "D25", "GND1", "3V3").');
            continue;
          }
          const p = partOf(e.part);
          if (!p) return fail(`${n}: the project has no part "${e.part}".`, 'Add it first (add_part with an id), or call get_scene.');
          const pp = parts[p.partId]?.pins.find((x) => x.name === e.pin);
          if (!pp) return fail(`${n}: ${p.label ?? p.id} has no pin "${e.pin}".`, `Its pins: ${(parts[p.partId]?.pins ?? []).map((x) => x.name).join(', ')}.`);
          role ??= pp.role;
        }
        if (op.from.part === 'board' && op.to.part === 'board') return fail(`${n}: a wire needs a part at one end at least.`, 'Connect a board pin to a part pin.');
        if (op.from.part === op.to.part && op.from.pin === op.to.pin) return fail(`${n}: both ends are the same pin.`, 'Pick two different pins.');
        const same = (a: WireEnd, b: WireEnd) => a.part === b.part && a.pin === b.pin;
        if (scene.wires.some((w) => (same(w.from, op.from) && same(w.to, op.to)) || (same(w.from, op.to) && same(w.to, op.from))))
          return fail(`${n}: ${endName(op.from)} and ${endName(op.to)} are already wired.`, 'Leave this change out.');
        let k = scene.wires.length + 1;
        while (scene.wires.some((w) => w.id === `w${k}`)) k++;
        // Board end first, like the wires the app draws.
        const [from, to] = op.to.part === 'board' ? [op.to, op.from] : [op.from, op.to];
        const wire: SceneWire = { id: `w${k}`, from, to, color: ROLE_HEX[partRoleColor(role ?? 'digital_out')] };
        scene = { ...scene, wires: [...scene.wires, wire] };
        changes.push({ text: CHANGE_TEXT.addWire, vars: { from: endName(from), to: endName(to) }, target: `wire:${wire.id}` });
        break;
      }
      case 'remove_wire': {
        const w = scene.wires.find((x) => x.id === op.id);
        if (!w) return fail(`${n}: the project has no wire "${op.id}".`, 'Call get_scene for the wire ids.');
        changes.push({ text: CHANGE_TEXT.removeWire, vars: { from: endName(w.from), to: endName(w.to) } });
        scene = { ...scene, wires: scene.wires.filter((x) => x.id !== op.id) };
        break;
      }
      case 'assign_pins': {
        const r = assignPins(scene, board, parts);
        scene = r.scene;
        if (r.notes.length) for (const note of r.notes) changes.push({ text: CHANGE_TEXT.assigned, vars: { note } });
        else changes.push({ text: CHANGE_TEXT.nothingToAssign, vars: {} });
        break;
      }
      case 'set_code': {
        const name = op.name ?? scene.sketch?.name ?? 'sketch.ino';
        if (!/^[\w .-]{1,60}\.(ino|cpp|c|h)$/.test(name)) return fail(`${n}: "${name}" is not a sketch file name.`, 'Use a name like "blink.ino".');
        scene = { ...scene, sketch: { name, text: op.text } };
        changes.push({ text: CHANGE_TEXT.setCode, vars: { name, lines: String(op.text.split(/\r?\n/).length) } });
        break;
      }
    }
  }

  const before = new Set(checkWiring(base, board, parts).map((f) => f.id));
  const findings = checkWiring(scene, board, parts);
  return { ok: true, value: { scene, changes, findings, newFindings: findings.filter((f) => !before.has(f.id)) } };
}

/** A change line in plain words; pass t() to translate. */
export const describeChange = (c: SceneChange, tr: (text: string, vars?: Record<string, string>) => string = (s, v) => s.replace(/\{(\w+)\}/g, (m, k: string) => v?.[k] ?? m)) =>
  tr(c.text, c.vars);
