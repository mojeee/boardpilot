// Project builder for the assistant ("Describe it"): the model picks parts from the library and may
// name the wires it wants; this module turns that into a real scene with the app's own rules.
// Pure functions, no AI here: part search with the facts that tell parts apart, a proposal built
// from library parts only (unknown ids are refused, wires to pins that do not exist are dropped),
// safe pins for everything the model left open (assignPins), then the wiring checker, the extras
// the rules imply (pull-ups, dividers, level shifters) and the pins still unwired.
// Nothing is applied to the user's project here: the UI shows the proposal and the user clicks Apply.

import type { BoardDef, PartDef, Scene, SceneWire, WiringFinding } from './types';
import { BOARDS, ROLE_HEX, gotchasFor, partRoleColor, pinById } from './board';
import { assignPins } from './assign';
import { checkWiring } from './wiring';
import { impliedExtras } from './bom';
import { t } from './i18n';

/* ---------------- part search ---------------- */

export interface PartSummary {
  id: string;
  name: string;
  category: PartDef['category'];
  measures: string[];
  bus: string;
  voltage: string;
  addresses: string[];
  pullupsOnBoard: boolean;
  pins: string[];
  /** Pin notes from the library ("only half-opens at 3.3 V"), which often decide between parts. */
  pinNotes: string[];
  /** How the part fits the board's logic voltage, in plain words. */
  fit: string;
  /** Known traps on this board (sourced in the library), shortened. */
  gotchas: string[];
  /** Typical supply current with its unit ("3.6 µA typical"), when a datasheet gives it. */
  current: string | null;
}

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'with', 'to', 'of', 'in', 'on', 'my', 'sensor', 'module', 'board', 'breakout', 'un', 'una', 'il', 'la', 'di', 'per', 'con']);

function volts(v: string): [number, number] {
  const nums = v.split('-').map(Number).filter((n) => Number.isFinite(n));
  return nums.length ? [Math.min(...nums), Math.max(...nums)] : [3.3, 3.3];
}

/** How a part's supply voltage fits the board's logic level. */
export function voltageFit(def: PartDef, board: BoardDef): string {
  const [lo, hi] = volts(def.voltage);
  if (board.logicVolt >= 5 && hi < 4.5) return t('3.3 V part on a 5 V board: needs a level shifter on its signal lines.');
  if (board.logicVolt < 4 && lo >= 4.5) return t('5 V part on a 3.3 V board: power it from 5 V; its outputs may need a divider.');
  return t('Works at the board’s {v} V logic.', { v: board.logicVolt });
}

export function summarizePart(def: PartDef, board: BoardDef): PartSummary {
  return {
    id: def.id,
    name: def.name,
    category: def.category,
    measures: def.measures ?? [],
    bus: def.bus ?? 'gpio',
    voltage: def.voltage,
    addresses: def.addresses ?? [],
    pullupsOnBoard: !!def.pullupsOnBoard,
    pins: def.pins.map((p) => `${p.name}:${p.role}`),
    pinNotes: def.pins.filter((p) => p.notes).map((p) => `${p.name}: ${p.notes!.length > 140 ? `${p.notes!.slice(0, 137)}…` : p.notes}`).slice(0, 4),
    fit: voltageFit(def, board),
    gotchas: gotchasFor(def, board).map((g) => (g.text.length > 160 ? `${g.text.slice(0, 157)}…` : g.text)).slice(0, 3),
    current: def.current ? formatCurrent(def.current) : null,
  };
}

/** "0.0036" mA → "3.6 µA": models misread bare mA numbers, so currents always carry their unit. */
export function formatMa(ma: number): string {
  if (ma >= 1000) return `${+(ma / 1000).toPrecision(3)} A`;
  if (ma >= 1) return `${+ma.toPrecision(3)} mA`;
  return `${+(ma * 1000).toPrecision(3)} µA`;
}

function formatCurrent(c: NonNullable<PartDef['current']>): string {
  const parts = [`${formatMa(c.typMa)} typical`];
  if (c.sleepMa !== undefined) parts.push(`${formatMa(c.sleepMa)} asleep`);
  if (c.peakMa !== undefined) parts.push(`${formatMa(c.peakMa)} peak`);
  return parts.join(', ');
}

/** Library parts matching the words of `query`, best first. Matches id, name, keywords and measures. */
export function searchParts(
  query: string,
  parts: Record<string, PartDef>,
  board: BoardDef,
  opts: { category?: PartDef['category'] | null; bus?: PartDef['bus'] | null; limit?: number } = {},
): PartSummary[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9.+-]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  const scored: { def: PartDef; score: number }[] = [];
  for (const def of Object.values(parts)) {
    if (opts.category && def.category !== opts.category) continue;
    if (opts.bus && def.bus !== opts.bus) continue;
    const id = def.id.toLowerCase();
    const name = def.name.toLowerCase();
    const kws = def.keywords.map((k) => k.toLowerCase());
    const measures = (def.measures ?? []).map((m) => m.toLowerCase());
    let score = 0;
    for (const w of words) {
      if (id === w) score += 8;
      else if (id.includes(w)) score += 5;
      if (kws.includes(w)) score += 4;
      else if (kws.some((k) => k.includes(w))) score += 2;
      if (name.includes(w)) score += 3;
      if (measures.some((m) => m.includes(w))) score += 3;
    }
    if (score > 0 || !words.length) scored.push({ def, score });
  }
  // Ties go to the parts the library knows best (starter code, chip-ID check, sourced traps and
  // currents): those are the common, well-documented parts a beginner should start with.
  const known = (d: PartDef) => (d.starterSketch ? 2 : 0) + (d.idCheck ? 1 : 0) + (d.gotchas?.length ? 1 : 0) + (d.current ? 1 : 0) + (d.registers ? 1 : 0);
  scored.sort((a, b) => b.score - a.score || known(b.def) - known(a.def) || a.def.id.localeCompare(b.def.id));
  // Small result lists keep requests inside the free demo's 48 KB limit.
  return scored.slice(0, Math.min(Math.max(opts.limit ?? 6, 1), 12)).map((s) => summarizePart(s.def, board));
}

/** Everything the library knows about one part that matters for choosing and wiring it. */
export function partDetails(def: PartDef, board: BoardDef) {
  return {
    ...summarizePart(def, board),
    pins: def.pins.map((p) => ({ name: p.name, role: p.role, ...(p.notes ? { notes: p.notes } : {}) })),
    idCheck: def.idCheck ?? null,
    gotchas: gotchasFor(def, board).map((g) => ({ text: g.text, source: `${g.source.title}${g.source.section ? `, ${g.source.section}` : ''}` })),
    current: def.current ? `${formatCurrent(def.current)} (${def.current.source.title})` : null,
    sources: def.sources,
  };
}

/* ---------------- proposals ---------------- */

export interface ProposalPartInput {
  id: string;
  partId: string;
  label: string;
  why: string;
}

export interface ProposalWireInput {
  boardPin: string;
  part: string;
  pin: string;
}

/** A wire between two parts (a pump on a MOSFET module's output, a lock on a relay). */
export interface ProposalLinkInput {
  fromPart: string;
  fromPin: string;
  toPart: string;
  toPin: string;
}

export interface ProposalInput {
  title: string;
  summary: string;
  /** A board id from /boards when the project should use another board, else empty. */
  board: string;
  parts: ProposalPartInput[];
  /** Wires the model wants; everything else gets safe pins from the board's rules. */
  wires: ProposalWireInput[];
  /** Wires between parts; the wiring checker only checks board pins, so these are drawn as asked. */
  links: ProposalLinkInput[];
  /** Keep the parts and wires already in the user's project and add to them. */
  keepExisting: boolean;
}

export interface ProposalWiringRow {
  part: string;
  partLabel: string;
  pin: string;
  role: string;
  boardPin: string;
  boardLabel: string;
  gpio: number | null;
  color: string;
  /** true: picked by the app's safe-pin rules; false: asked for by the assistant (or already drawn). */
  auto: boolean;
}

export interface ProjectProposal {
  title: string;
  summary: string;
  board: string;
  boardName: string;
  parts: { id: string; partId: string; name: string; label: string; why: string; added: boolean }[];
  scene: Scene;
  wiring: ProposalWiringRow[];
  findings: WiringFinding[];
  /** Things to buy that the drawing implies (pull-ups, dividers, level shifters). */
  extras: string[];
  /** Part pins left without a wire (other than passive ones). */
  unwired: string[];
  /** What the app changed or refused in the assistant's request. */
  notes: string[];
}

export type BuildResult = { ok: true; proposal: ProjectProposal } | { ok: false; errors: string[] };

const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/;

/** Board pin by id or by printed label, ignoring case ("d21", "GPIO21" and "21" also work when unambiguous). */
export function findBoardPin(board: BoardDef, name: string) {
  const n = name.trim().toLowerCase();
  const exact = board.pins.find((p) => p.id.toLowerCase() === n) ?? board.pins.find((p) => p.label.toLowerCase() === n);
  if (exact) return exact;
  const g = /^(?:gpio|gp|io|d)?(\d+)$/.exec(n);
  if (g) {
    const hits = board.pins.filter((p) => p.kind === 'gpio' && p.gpio === Number(g[1]));
    if (hits.length === 1) return hits[0];
  }
  return undefined;
}

function closestIds(id: string, parts: Record<string, PartDef>, board: BoardDef): string[] {
  return searchParts(id.replace(/[-_]/g, ' '), parts, board, { limit: 3 }).map((p) => p.id);
}

/** The wiring of a scene as table rows (board pin ↔ part pin). */
export function wiringRows(scene: Scene, board: BoardDef, parts: Record<string, PartDef>, autoIds: Set<string> = new Set()): ProposalWiringRow[] {
  const rows: ProposalWiringRow[] = [];
  const nameOf = (id: string) => {
    const inst = scene.parts.find((p) => p.id === id);
    return inst?.label ?? (inst ? parts[inst.partId]?.name : undefined) ?? id;
  };
  for (const w of scene.wires) {
    const be = w.from.part === 'board' ? w.from : w.to.part === 'board' ? w.to : null;
    const pe = w.from.part === 'board' ? w.to : w.from;
    if (!be) {
      // Part to part: the "board" columns name the other part's pin.
      const inst = scene.parts.find((p) => p.id === w.from.part);
      rows.push({
        part: w.from.part,
        partLabel: nameOf(w.from.part),
        pin: w.from.pin,
        role: (inst && parts[inst.partId]?.pins.find((p) => p.name === w.from.pin)?.role) ?? '?',
        boardPin: '',
        boardLabel: `${nameOf(w.to.part)} ${w.to.pin}`,
        gpio: null,
        color: w.color,
        auto: false,
      });
      continue;
    }
    const inst = scene.parts.find((p) => p.id === pe.part);
    const def = inst ? parts[inst.partId] : undefined;
    const bp = pinById(board, be.pin);
    rows.push({
      part: pe.part,
      partLabel: inst?.label ?? def?.name ?? pe.part,
      pin: pe.pin,
      role: def?.pins.find((p) => p.name === pe.pin)?.role ?? '?',
      boardPin: be.pin,
      boardLabel: bp?.label ?? be.pin,
      gpio: bp?.gpio ?? null,
      color: w.color,
      auto: autoIds.has(w.id),
    });
  }
  return rows;
}

/** Part pins without a wire, as "part.PIN" (passive pins are left out: they need no board pin). */
export function unwiredPins(scene: Scene, parts: Record<string, PartDef>): string[] {
  const out: string[] = [];
  for (const inst of scene.parts) {
    const def = parts[inst.partId];
    if (!def) continue;
    for (const p of def.pins) {
      if (p.role === 'passive') continue;
      const wired = scene.wires.some((w) => (w.from.part === inst.id && w.from.pin === p.name) || (w.to.part === inst.id && w.to.pin === p.name));
      if (!wired) out.push(`${inst.id}.${p.name}`);
    }
  }
  return out;
}

/** Extras the drawing implies, in plain words. */
export function extrasText(scene: Scene, board: BoardDef, parts: Record<string, PartDef>): string[] {
  const x = impliedExtras(scene, board, parts);
  const out: string[] = [];
  if (x.i2cPullups) out.push(t('Two 4.7 kΩ pull-up resistors for SDA and SCL (no I2C part in the project has its own).'));
  for (const c of x.onewirePullups) out.push(t('A {k} kΩ pull-up on {part} {pin}.', { k: c.kOhm, part: c.part.label ?? c.def.name, pin: c.pin.name }));
  for (const c of x.dividers) out.push(t('A 1 kΩ + 2 kΩ divider: {part} {pin} sends 5 V into {board}.', { part: c.part.label ?? c.def.name, pin: c.pin.name, board: c.boardPin.label }));
  if (x.shifterLines) out.push(t('A level shifter for {n} line(s) between 5 V and 3.3 V.', { n: x.shifterLines }));
  return out;
}

/** Positions for parts in a row in front of the board, spaced by their real size. */
function rowPositions(defs: PartDef[], board: BoardDef, rowZ: number): [number, number, number][] {
  const GAP = 18;
  const sizes = defs.map((d) => d.model.size);
  const total = sizes.reduce((a, s) => a + s[0], 0) + GAP * Math.max(0, sizes.length - 1);
  let x = -total / 2;
  return sizes.map(([w, d]) => {
    const cx = x + w / 2;
    x += w + GAP;
    return [Math.round(cx), 0, Math.round(board.pcbMm.width / 2 + rowZ + d / 2)];
  });
}

export function buildProposal(input: ProposalInput, current: Scene, parts: Record<string, PartDef>): BuildResult {
  const errors: string[] = [];
  const notes: string[] = [];
  const boardId = input.board && BOARDS[input.board] ? input.board : current.board;
  if (input.board && !BOARDS[input.board]) errors.push(`Unknown board id "${input.board}". Board ids: ${Object.keys(BOARDS).join(', ')}.`);
  const board = BOARDS[boardId];
  // Keeping the user's drawing only makes sense on the same board.
  const keep = input.keepExisting && boardId === current.board;
  const base: Scene = keep ? { ...current, parts: [...current.parts], wires: [...current.wires] } : { board: boardId, parts: [], wires: [], ...(current.stateMachine ? { stateMachine: current.stateMachine } : {}) };

  if (!input.parts.length && !keep) errors.push('The proposal has no parts.');
  const taken = new Set(base.parts.map((p) => p.id));
  const added: { id: string; def: PartDef; label: string; why: string }[] = [];
  let n = 1;
  for (const p of input.parts) {
    const def = parts[p.partId];
    if (!def) {
      const near = closestIds(p.partId, parts, board);
      errors.push(`Unknown part id "${p.partId}".${near.length ? ` Closest library ids: ${near.join(', ')}.` : ''} Use search_parts and only ids it returns.`);
      continue;
    }
    let id = ID_RE.test(p.id) && p.id !== 'board' ? p.id : '';
    if (!id || taken.has(id)) {
      const stem = def.id.split('-')[0].replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'part';
      while (taken.has(`${stem}${n}`)) n++;
      id = `${stem}${n}`;
    }
    taken.add(id);
    added.push({ id, def, label: p.label.trim().slice(0, 40) || def.name, why: p.why.trim() });
  }
  if (errors.length) return { ok: false, errors };

  // New parts go in a row in front of the board, or a row further out when the drawing is kept.
  const rowZ = keep && base.parts.length ? 22 + Math.max(...base.parts.map((p) => (parts[p.partId]?.model.size[1] ?? 20) + 30)) : 22;
  const positions = rowPositions(
    added.map((a) => a.def),
    board,
    rowZ,
  );
  added.forEach((a, i) => base.parts.push({ id: a.id, partId: a.def.id, label: a.label, position: positions[i], confirmed: true }));

  // The assistant's wires, checked one by one. Bad ones are dropped and left to the safe-pin rules.
  const askedIds = new Set<string>();
  let w = 1;
  for (const wire of input.wires) {
    const inst = base.parts.find((p) => p.id === wire.part);
    const def = inst ? parts[inst.partId] : undefined;
    const bp = findBoardPin(board, wire.boardPin);
    const pp = def?.pins.find((x) => x.name.toLowerCase() === wire.pin.trim().toLowerCase());
    const label = `${wire.part}.${wire.pin} → ${wire.boardPin}`;
    if (!inst || !def) {
      notes.push(t('Ignored the wire {wire}: there is no part "{part}" in the proposal.', { wire: label, part: wire.part }));
      continue;
    }
    if (!bp) {
      notes.push(t('Ignored the wire {wire}: {board} has no pin "{pin}". A safe pin was picked instead.', { wire: label, board: board.name, pin: wire.boardPin }));
      continue;
    }
    if (!pp) {
      notes.push(t('Ignored the wire {wire}: {part} has no pin "{pin}" (its pins: {pins}).', { wire: label, part: def.name, pin: wire.pin, pins: def.pins.map((x) => x.name).join(', ') }));
      continue;
    }
    if (base.wires.some((x) => (x.from.part === inst.id && x.from.pin === pp.name) || (x.to.part === inst.id && x.to.pin === pp.name))) {
      notes.push(t('Ignored the wire {wire}: that part pin already has a wire.', { wire: label }));
      continue;
    }
    while (base.wires.some((x) => x.id === `w${w}`)) w++;
    const sw: SceneWire = { id: `w${w}`, from: { part: 'board', pin: bp.id }, to: { part: inst.id, pin: pp.name }, color: ROLE_HEX[partRoleColor(pp.role)] };
    base.wires.push(sw);
    askedIds.add(sw.id);
  }

  // Part-to-part wires before the safe-pin rules run, so a pin wired to another part (an RC522
  // signal through a level shifter) is never also wired straight to the board.
  let l = 1;
  for (const link of input.links) {
    const a = base.parts.find((p) => p.id === link.fromPart);
    const b = base.parts.find((p) => p.id === link.toPart);
    const pa = a && parts[a.partId]?.pins.find((x) => x.name.toLowerCase() === link.fromPin.trim().toLowerCase());
    const pb = b && parts[b.partId]?.pins.find((x) => x.name.toLowerCase() === link.toPin.trim().toLowerCase());
    const label = `${link.fromPart}.${link.fromPin} → ${link.toPart}.${link.toPin}`;
    if (!a || !b || a === b || !pa || !pb) {
      notes.push(t('Ignored the wire {wire}: one end is not a pin of a part in the proposal.', { wire: label }));
      continue;
    }
    while (base.wires.some((x) => x.id === `l${l}`)) l++;
    const role = pa.role !== 'passive' ? pa.role : pb.role;
    base.wires.push({ id: `l${l}`, from: { part: a.id, pin: pa.name }, to: { part: b.id, pin: pb.name }, color: ROLE_HEX[partRoleColor(role)] });
  }

  const before = new Set(base.wires.map((x) => x.id));
  const assigned = assignPins(base, board, parts);
  // Stable wire ids (assignPins uses the clock), so a proposal looks the same every time.
  let a = 1;
  const scene: Scene = {
    ...assigned.scene,
    wires: assigned.scene.wires.map((x) => {
      if (before.has(x.id)) return x;
      while (before.has(`a${a}`)) a++;
      const id = `a${a++}`;
      return { ...x, id };
    }),
  };
  // Pins with no free board pin left show up in `unwired` below.
  const autoIds = new Set(scene.wires.filter((x) => !before.has(x.id)).map((x) => x.id));

  const keptIds = new Set(keep ? current.parts.map((p) => p.id) : []);
  return {
    ok: true,
    proposal: {
      title: input.title.trim().slice(0, 80) || t('Project'),
      summary: input.summary.trim(),
      board: board.id,
      boardName: board.name,
      parts: scene.parts.map((p) => {
        const add = added.find((x) => x.id === p.id);
        return { id: p.id, partId: p.partId, name: parts[p.partId]?.name ?? p.partId, label: p.label ?? parts[p.partId]?.name ?? p.id, why: add?.why ?? '', added: !keptIds.has(p.id) };
      }),
      scene,
      wiring: wiringRows(scene, board, parts, autoIds),
      findings: checkWiring(scene, board, parts),
      extras: extrasText(scene, board, parts),
      unwired: unwiredPins(scene, parts),
      notes,
    },
  };
}

/** What the model gets back after a proposal or a check: short, so it can fix problems itself. */
export function proposalForModel(p: Pick<ProjectProposal, 'board' | 'wiring' | 'findings' | 'extras' | 'unwired' | 'notes'> & { parts: { id: string; partId: string }[] }) {
  const sev = (s: WiringFinding['severity']) => p.findings.filter((f) => f.severity === s).map((f) => `${f.message} ${f.hint}`.trim());
  return {
    board: p.board,
    parts: p.parts.map((x) => `${x.id} (${x.partId})`),
    wiring: p.wiring.map((r) => `${r.part}.${r.pin} [${r.role}] → ${r.boardPin ? '' : 'part '}${r.boardLabel}${r.gpio !== null ? ` (GPIO ${r.gpio})` : ''}${r.auto ? ' (safe-pin rule)' : ''}`),
    errors: sev('error'),
    warnings: sev('warning'),
    info: sev('info'),
    unwired: p.unwired,
    extrasToBuy: p.extras,
    notes: p.notes,
  };
}

/** The current project, checked: same shape as a proposal, for check_project. */
export function checkScene(scene: Scene, parts: Record<string, PartDef>) {
  const board = BOARDS[scene.board];
  return proposalForModel({
    board: board.id,
    parts: scene.parts,
    wiring: wiringRows(scene, board, parts),
    findings: checkWiring(scene, board, parts),
    extras: extrasText(scene, board, parts),
    unwired: unwiredPins(scene, parts),
    notes: [],
  });
}
