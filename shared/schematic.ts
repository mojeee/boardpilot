// Schematic: the project drawn as a circuit, generated only from the scene, the board file and the
// part files (the second view of the Diagram tab, next to the wiring diagram in shared/diagram.ts).
// Pure layout (no React), deterministic and unit-tested; the renderer shows the SVG it produces.
//
// Layout:
// - The board is one block on the left with only the pins in use: signal pins on its right edge
//   (name inside, GPIO number on the lead), power pins on top, ground pins at the bottom.
// - Parts are stacked on the right, each with its usual symbol where there is one (LED with its
//   resistor, push button, switch, potentiometer) or a box with pin names (modules, chips).
// - Power and ground are rail and ground symbols on each pin instead of long wires. Signal nets are
//   orthogonal wires, each in its own vertical lane; a net whose wire would cross another is drawn
//   with net labels at both ends instead (a shared I2C bus usually is).
// - Parts the wiring rules say are missing (I2C pull-ups, voltage dividers, a level shifter) are
//   drawn dashed in their own frame, "suggested, not in your drawing", never as if they were there.
// - Wiring findings sit on the pin or wire they are about, as in the wiring diagram.

import type { BoardDef, PartDef, PartPinRole, PinDef, Scene, ScenePart, TargetRef, WiringFinding } from './types';
import { ROLE_HEX, partRoleColor, pinBaseRole, pinById } from './board';
import { headerOrder } from './diagram';
import { impliedExtras } from './bom';
import { t } from './i18n';

/* ---------- output ---------- */

export type Pt = [number, number];
export type Dir = 'left' | 'right' | 'up' | 'down';

export type SchPrim =
  | { k: 'line'; pts: Pt[]; stroke: string; width?: number; /** fine: a short dash that keeps a zigzag readable */ dash?: boolean | 'fine'; closed?: boolean; fill?: string; target?: TargetRef }
  | { k: 'rect'; x: number; y: number; w: number; h: number; stroke: string; fill: string; rx?: number; dash?: boolean; target?: TargetRef }
  | { k: 'circle'; x: number; y: number; r: number; fill: string; stroke?: string; target?: TargetRef }
  | { k: 'text'; x: number; y: number; text: string; size: number; font: 'ui' | 'mono'; weight?: number; anchor: 'start' | 'middle' | 'end'; fill: string; target?: TargetRef };

export type SchItemKind = 'board' | 'part' | 'power' | 'ground' | 'label' | 'nc' | 'wire' | 'suggested';

export interface SchItem {
  id: string;
  kind: SchItemKind;
  /** What a click selects (a prim can override it, e.g. one board pin). */
  target?: TargetRef;
  /** Tooltip. */
  title?: string;
  /** Net name, for wires and net labels. */
  net?: string;
  prims: SchPrim[];
}

export interface SchMark {
  x: number;
  y: number;
  severity: WiringFinding['severity'];
  text: string;
  targets: TargetRef[];
}

export interface SchNet {
  id: string;
  name: string;
  kind: 'power' | 'ground' | 'signal';
  /** symbol: power and ground; wire: routed; label: net labels at every end */
  drawn: 'symbol' | 'wire' | 'label';
  /** scene wires in this net */
  wires: string[];
}

export interface Schematic {
  width: number;
  height: number;
  items: SchItem[];
  marks: SchMark[];
  nets: SchNet[];
}

/* ---------- geometry helpers (also used by the tests) ---------- */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Estimated text width: IBM Plex Mono is 0.6 em per character, Plex Sans a little less. */
export function textWidth(s: string, size: number, font: 'ui' | 'mono', weight = 400): number {
  const f = font === 'mono' ? 0.6 : weight >= 600 ? 0.64 : 0.58;
  return Math.ceil([...s].length * size * f);
}

export function primBox(p: SchPrim): Box {
  switch (p.k) {
    case 'line': {
      const xs = p.pts.map((q) => q[0]);
      const ys = p.pts.map((q) => q[1]);
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    }
    case 'rect':
      return { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h };
    case 'circle':
      return { x0: p.x - p.r, y0: p.y - p.r, x1: p.x + p.r, y1: p.y + p.r };
    case 'text': {
      const w = textWidth(p.text, p.size, p.font, p.weight);
      const x0 = p.anchor === 'start' ? p.x : p.anchor === 'middle' ? p.x - w / 2 : p.x - w;
      return { x0, y0: p.y - p.size * 0.8, x1: x0 + w, y1: p.y + p.size * 0.25 };
    }
  }
}

export function unionBox(boxes: Box[]): Box {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

export const itemBox = (it: SchItem): Box => unionBox(it.prims.map(primBox));

/** Strict overlap: boxes that only touch do not overlap. */
export const boxesOverlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function shiftPrim(p: SchPrim, dx: number, dy: number): SchPrim {
  switch (p.k) {
    case 'line':
      return { ...p, pts: p.pts.map(([x, y]) => [x + dx, y + dy] as Pt) };
    case 'rect':
    case 'circle':
    case 'text':
      return { ...p, x: p.x + dx, y: p.y + dy };
  }
}
const shiftItem = (it: SchItem, dx: number, dy: number): SchItem => ({ ...it, prims: it.prims.map((p) => shiftPrim(p, dx, dy)) });

/* ---------- drawing constants ---------- */

const PAD = 28;
const ROW = 24;
/** horizontal pin lead */
const STUB = 20;
/** vertical pin lead */
const VSTUB = 16;
const LANE = 14;
const PART_GAP = 18;

const C = {
  bg: '#12171D',
  panel: '#1C232B',
  text: '#E9EDF1',
  muted: '#A7B3BF',
  dim: '#7D8997',
  sym: '#A7B3BF',
  suggest: '#C9BEFF',
  err: '#FF5D52',
  warn: '#F2A93B',
  info: '#3FB6E8',
};

const txt = (x: number, y: number, text: string, o: Partial<Extract<SchPrim, { k: 'text' }>> = {}): SchPrim => ({
  k: 'text',
  x,
  y,
  text,
  size: 10,
  font: 'mono',
  anchor: 'start',
  fill: C.muted,
  ...o,
});
const line = (pts: Pt[], stroke: string = C.sym, o: Partial<Extract<SchPrim, { k: 'line' }>> = {}): SchPrim => ({ k: 'line', pts, stroke, ...o });

/** Resistor zigzag along a vertical lead, from y0 to y1. */
function zigzag(x: number, y0: number, y1: number, amp = 5, n = 6): Pt[] {
  const pts: Pt[] = [[x, y0]];
  const step = (y1 - y0) / n;
  for (let i = 0; i < n; i++) pts.push([x + (i % 2 ? -amp : amp), y0 + step * (i + 0.5)]);
  pts.push([x, y1]);
  return pts;
}

/** Symbol standard for resistors: ANSI/IEEE 315 zigzag (the default) or IEC 60617 rectangle. */
export type SymbolStyle = 'ansi' | 'iec';
let symbols: SymbolStyle = 'ansi';

/** A resistor along a vertical lead from y0 to y1, in the current symbol style. */
function resistor(x: number, y0: number, y1: number, stroke: string = C.sym, o: Partial<Extract<SchPrim, { k: 'line' }>> = {}): SchPrim[] {
  if (symbols === 'ansi') return [line(zigzag(x, y0, y1), stroke, o)];
  const lead = Math.min(4, (y1 - y0) / 6);
  return [
    line([[x, y0], [x, y0 + lead]], stroke, o),
    { k: 'rect', x: x - 5, y: y0 + lead, w: 10, h: y1 - y0 - 2 * lead, stroke, fill: 'none', dash: !!o.dash, target: o.target },
    line([[x, y1 - lead], [x, y1]], stroke, o),
  ];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ---------- nets ---------- */

interface NetEnd {
  key: string;
  board?: PinDef;
  part?: ScenePart;
  pin?: string;
  role?: PartPinRole;
}

interface Net {
  id: string;
  kind: 'power' | 'ground' | 'signal';
  name: string;
  color: string;
  /** rail label for power nets ("+3.3V") */
  rail: string;
  /** bus family: nets of the same bus are drawn the same way */
  group: string;
  ends: NetEnd[];
  wires: string[];
  /** scene wires touching each end key */
  wiresAt: Map<string, string[]>;
}

const partKey = (partId: string, pin: string) => `p:${partId}\u0000${pin}`;
const boardKey = (pinId: string) => `b:${pinId}`;

const BUS_NAME: Partial<Record<PartPinRole, string>> = { i2c_sda: 'SDA', i2c_scl: 'SCL', spi_mosi: 'MOSI', spi_miso: 'MISO', spi_sck: 'SCK', spi_cs: 'CS' };

function railLabel(p: PinDef): string {
  return p.supplies ? `+${p.supplies}V` : p.label;
}

function buildNets(scene: Scene, board: BoardDef, parts: Record<string, PartDef>): Net[] {
  const ends = new Map<string, NetEnd>();
  const endOf = (e: { part: string; pin: string }): NetEnd | null => {
    if (e.part === 'board') {
      const p = pinById(board, e.pin);
      return p ? { key: boardKey(p.id), board: p } : null;
    }
    const sp = scene.parts.find((x) => x.id === e.part);
    if (!sp) return null;
    const role = parts[sp.partId]?.pins.find((x) => x.name === e.pin)?.role ?? 'passive';
    return { key: partKey(sp.id, e.pin), part: sp, pin: e.pin, role };
  };
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r) ?? r;
    parent.set(k, r);
    return r;
  };
  const add = (e: NetEnd) => {
    if (!ends.has(e.key)) {
      ends.set(e.key, e);
      parent.set(e.key, e.key);
    }
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  const wireEnds: [string, string[]][] = [];
  for (const w of scene.wires) {
    const ks = [endOf(w.from), endOf(w.to)].filter((e): e is NetEnd => !!e);
    ks.forEach(add);
    if (ks.length === 2) union(ks[0].key, ks[1].key);
    if (ks.length) wireEnds.push([w.id, ks.map((e) => e.key)]);
  }
  // Board pins that are the same signal (Uno SDA = A4) are one net.
  for (const e of ends.values()) if (e.board?.sameAs && ends.has(boardKey(e.board.sameAs))) union(e.key, boardKey(e.board.sameAs));

  const byRoot = new Map<string, Net>();
  const nets: Net[] = [];
  for (const [wireId, keys] of wireEnds) {
    const root = find(keys[0]);
    let net = byRoot.get(root);
    if (!net) {
      net = { id: `n${nets.length}`, kind: 'signal', name: '', color: ROLE_HEX.gpio, rail: '', group: '', ends: [], wires: [], wiresAt: new Map() };
      byRoot.set(root, net);
      nets.push(net);
    }
    net.wires.push(wireId);
    for (const k of keys) {
      if (!net.ends.some((e) => e.key === k)) net.ends.push(ends.get(k) as NetEnd);
      net.wiresAt.set(k, [...(net.wiresAt.get(k) ?? []), wireId]);
    }
  }
  // sameAs pins joined after the wires: move their ends into one net.
  for (const e of ends.values()) {
    const net = byRoot.get(find(e.key));
    if (net && !net.ends.some((x) => x.key === e.key)) net.ends.push(e);
  }

  for (const net of nets) {
    const bps = net.ends.filter((e) => e.board).map((e) => e.board as PinDef);
    const pow = bps.find((p) => p.kind === 'power');
    const gnd = bps.find((p) => p.kind === 'ground');
    const roles = net.ends.filter((e) => e.role).map((e) => e.role as PartPinRole);
    if (pow) {
      net.kind = 'power';
      net.rail = railLabel(pow);
      net.name = net.rail;
      net.color = ROLE_HEX.power;
    } else if (gnd) {
      net.kind = 'ground';
      net.name = 'GND';
      net.color = ROLE_HEX.ground;
    } else {
      const bus = roles.map((r) => BUS_NAME[r]).find(Boolean);
      const sig = bps.find((p) => p.kind !== 'power' && p.kind !== 'ground');
      const firstPart = net.ends.find((e) => e.part);
      net.name = bus ?? sig?.label ?? `${(firstPart?.part?.label ?? firstPart?.part?.id ?? '?').replace(/\s+/g, '_')}_${firstPart?.pin ?? ''}`;
      net.group = roles.some((r) => r === 'i2c_sda' || r === 'i2c_scl') ? 'i2c' : roles.some((r) => r.startsWith('spi_')) ? 'spi' : '';
      net.color = roles.length ? ROLE_HEX[partRoleColor(roles[0])] : sig ? ROLE_HEX[pinBaseRole(sig)] : ROLE_HEX.gpio;
    }
    if (!net.group) net.group = net.id;
  }
  // Two nets with the same name (two chip selects, two I2C buses): add the board pin.
  for (const net of nets) {
    if (net.kind !== 'signal') continue;
    const same = nets.filter((n) => n.kind === 'signal' && n.name === net.name);
    if (same.length < 2) continue;
    same.forEach((n, i) => {
      const bp = n.ends.find((e) => e.board)?.board;
      n.name = `${n.name}_${bp?.label ?? i + 1}`;
    });
  }
  return nets;
}

/* ---------- terminals and what hangs on them ---------- */

interface Term {
  key: string;
  /** outer end of the lead: where wires, labels and rail symbols attach */
  end: Pt;
  dir: Dir;
  /** where a finding badge goes (on the lead) */
  mark: Pt;
  target: TargetRef;
}

function railItem(id: string, end: Pt, dir: Dir, label: string, target: TargetRef): SchItem {
  const [x, y] = end;
  const col = ROLE_HEX.power;
  const lab = (lx: number, ly: number, anchor: 'start' | 'middle' | 'end') => txt(lx, ly, label, { font: 'ui', weight: 600, fill: col, anchor });
  const prims: SchPrim[] =
    dir === 'up'
      ? [line([[x - 9, y], [x + 9, y]], col, { width: 2 }), lab(x, y - 5, 'middle')]
      : dir === 'down'
        ? [line([[x - 9, y], [x + 9, y]], col, { width: 2 }), lab(x, y + 13, 'middle')]
        : dir === 'left'
          ? [line([[x, y], [x - 6, y]], col), line([[x - 6, y - 8], [x - 6, y + 8]], col, { width: 2 }), lab(x - 10, y + 3.5, 'end')]
          : [line([[x, y], [x + 6, y]], col), line([[x + 6, y - 8], [x + 6, y + 8]], col, { width: 2 }), lab(x + 10, y + 3.5, 'start')];
  return { id, kind: 'power', target, net: label, prims };
}

function groundItem(id: string, end: Pt, dir: Dir, target: TargetRef): SchItem {
  const [x, y] = end;
  const col = ROLE_HEX.ground;
  const bars: [number, number][] = [
    [0, 9],
    [4, 5.5],
    [8, 2],
  ];
  const prims: SchPrim[] = bars.map(([d, h]) =>
    dir === 'down'
      ? line([[x - h, y + d], [x + h, y + d]], col, { width: 1.5 })
      : dir === 'up'
        ? line([[x - h, y - d], [x + h, y - d]], col, { width: 1.5 })
        : dir === 'left'
          ? line([[x - d, y - h], [x - d, y + h]], col, { width: 1.5 })
          : line([[x + d, y - h], [x + d, y + h]], col, { width: 1.5 }),
  );
  return { id, kind: 'ground', target, net: 'GND', title: 'GND', prims };
}

function labelItem(id: string, end: Pt, dir: Dir, name: string, color: string, target: TargetRef, dash = false): SchItem {
  const [x, y] = end;
  const w = textWidth(name, 10, 'mono');
  const tag = (pts: Pt[]): SchPrim => ({ k: 'line', pts, closed: true, stroke: color, fill: C.bg, dash });
  const prims: SchPrim[] =
    dir === 'left'
      ? [tag([[x, y], [x - 6, y - 7], [x - 12 - w, y - 7], [x - 12 - w, y + 7], [x - 6, y + 7]]), txt(x - 8, y + 3.5, name, { fill: color, anchor: 'end' })]
      : dir === 'right'
        ? [tag([[x, y], [x + 6, y - 7], [x + 12 + w, y - 7], [x + 12 + w, y + 7], [x + 6, y + 7]]), txt(x + 8, y + 3.5, name, { fill: color })]
        : dir === 'up'
          ? [line([[x, y], [x, y - 4]], color), { k: 'rect', x: x - w / 2 - 6, y: y - 18, w: w + 12, h: 14, stroke: color, fill: C.bg, rx: 3, dash }, txt(x, y - 7.5, name, { fill: color, anchor: 'middle' })]
          : [line([[x, y], [x, y + 4]], color), { k: 'rect', x: x - w / 2 - 6, y: y + 4, w: w + 12, h: 14, stroke: color, fill: C.bg, rx: 3, dash }, txt(x, y + 14.5, name, { fill: color, anchor: 'middle' })];
  return { id, kind: 'label', target, net: name, prims };
}

function ncItem(id: string, end: Pt, dir: Dir, target: TargetRef): SchItem {
  // The cross sits just past the end of the lead.
  const x = end[0] + (dir === 'left' ? -4 : dir === 'right' ? 4 : 0);
  const y = end[1] + (dir === 'up' ? -4 : dir === 'down' ? 4 : 0);
  return {
    id,
    kind: 'nc',
    target,
    title: t('Pin not connected'),
    prims: [line([[x - 4, y - 4], [x + 4, y + 4]], C.dim), line([[x - 4, y + 4], [x + 4, y - 4]], C.dim)],
  };
}

/** What hangs on a terminal: a rail or ground symbol, a net label, or a no-connect cross. Null when a wire goes there. */
function attachment(id: string, net: Net | undefined, term: Term, routed: boolean, target: TargetRef): SchItem | null {
  if (!net) return ncItem(id, term.end, term.dir, target);
  if (net.kind === 'power') return railItem(id, term.end, term.dir, net.rail, target);
  if (net.kind === 'ground') return groundItem(id, term.end, term.dir, target);
  return routed ? null : labelItem(id, term.end, term.dir, net.name, net.color, target);
}

/** Size of the attachment along the edge it sits on (for pin spacing) and across it (for zones). */
function attachmentSize(net: Net | undefined, dir: Dir): { along: number; across: number } {
  const probe = attachment('probe', net, { key: '', end: [0, 0], dir, mark: [0, 0], target: 'part:probe' }, false, 'part:probe');
  if (!probe) return { along: 0, across: 0 };
  const b = itemBox(probe);
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  return dir === 'up' || dir === 'down' ? { along: w, across: h } : { along: h, across: w };
}

/* ---------- symbols ---------- */

interface Built {
  item: SchItem;
  terms: Term[];
  /** the body (for a badge on the part itself) */
  body: Box;
}

interface IcPin {
  key: string;
  name: string;
  num?: string;
  target: TargetRef;
  /** attachment size along the edge, for spacing top and bottom pins */
  along?: number;
}

const HEADER = (hasTop: boolean) => (hasTop ? 20 : 4) + 18 + 14 + 4;

/** A box with pin names: the board, modules and chips. */
function icSymbol(o: {
  id: string;
  kind: 'board' | 'part';
  target: TargetRef;
  title: string;
  sub: string;
  tooltip?: string;
  x: number;
  y: number;
  side: 'left' | 'right';
  sidePins: IcPin[];
  sideYs?: number[];
  top: IcPin[];
  bottom: IcPin[];
  minW: number;
}): Built {
  const { x, y } = o;
  const title = clip(o.title, 28);
  const sub = clip(o.sub, 34);
  const nameW = (ps: IcPin[]) => Math.max(0, ...ps.map((p) => textWidth(p.name, 10, 'mono')));
  const spacing = (ps: IcPin[]) => Math.max(52, nameW(ps) + 12, ...ps.map((p) => (p.along ?? 0) + 12));
  const topSp = spacing(o.top);
  const botSp = spacing(o.bottom);
  const header = HEADER(o.top.length > 0);
  const ys = o.sideYs ?? o.sidePins.map((_, i) => y + header + ROW / 2 + i * ROW);
  const w = Math.max(
    o.minW,
    textWidth(title, 12, 'ui', 600) + 24,
    textWidth(sub, 10, 'ui') + 24,
    // side pin names, and room for a finding badge on the board's pins
    nameW(o.sidePins) + (o.side === 'right' ? 36 : 20),
    o.top.length * topSp + 8,
    o.bottom.length * botSp + 8,
  );
  const bottomY = (ys.length ? ys[ys.length - 1] + ROW / 2 : y + header) + (o.bottom.length ? 20 : 4);
  const h = bottomY - y;
  const prims: SchPrim[] = [{ k: 'rect', x, y, w, h, stroke: C.sym, fill: C.panel, rx: 3 }];
  const titleY = y + (o.top.length ? 20 : 4) + 13;
  prims.push(txt(x + 10, titleY, title, { font: 'ui', size: 12, weight: 600, fill: C.text }));
  prims.push(txt(x + 10, titleY + 15, sub, { font: 'ui', fill: C.dim }));
  const terms: Term[] = [];
  o.sidePins.forEach((p, i) => {
    const py = ys[i];
    if (o.side === 'left') {
      prims.push(line([[x, py], [x - STUB, py]], C.sym, { target: p.target }), txt(x + 6, py + 3.5, p.name, { target: p.target }));
      terms.push({ key: p.key, end: [x - STUB, py], dir: 'left', mark: [x - STUB / 2, py], target: p.target });
    } else {
      prims.push(line([[x + w, py], [x + w + STUB, py]], C.sym, { target: p.target }), txt(x + w - 6, py + 3.5, p.name, { anchor: 'end', target: p.target }));
      if (p.num) prims.push(txt(x + w + 3, py - 4, p.num, { size: 9, fill: C.dim, target: p.target }));
      terms.push({ key: p.key, end: [x + w + STUB, py], dir: 'right', mark: [x + 12, py], target: p.target });
    }
  });
  o.top.forEach((p, i) => {
    const px = x + topSp / 2 + i * topSp;
    prims.push(line([[px, y], [px, y - VSTUB]], C.sym, { target: p.target }), txt(px, y + 15, p.name, { anchor: 'middle', target: p.target }));
    terms.push({ key: p.key, end: [px, y - VSTUB], dir: 'up', mark: [px, y - VSTUB / 2], target: p.target });
  });
  o.bottom.forEach((p, i) => {
    const px = x + botSp / 2 + i * botSp;
    prims.push(line([[px, bottomY], [px, bottomY + VSTUB]], C.sym, { target: p.target }), txt(px, bottomY - 6, p.name, { anchor: 'middle', target: p.target }));
    terms.push({ key: p.key, end: [px, bottomY + VSTUB], dir: 'down', mark: [px, bottomY + VSTUB / 2], target: p.target });
  });
  return { item: { id: o.id, kind: o.kind, target: o.target, title: o.tooltip, prims }, terms, body: { x0: x, y0: y, x1: x + w, y1: bottomY } };
}

interface SymArgs {
  id: string;
  target: TargetRef;
  title: string;
  tooltip?: string;
  /** x of the left terminal end */
  xT: number;
  y: number;
}

/** LED (with its series resistor when the part has one): anode lead from the left, cathode at the bottom. */
function ledSymbol(o: SymArgs & { value?: string; a: string; k: string }): Built {
  const yA = o.y + 6;
  const cx = o.xT + STUB + 14;
  const tg = o.target;
  const prims: SchPrim[] = [line([[o.xT, yA], [cx, yA], [cx, yA + 8]])];
  if (o.value) {
    prims.push(...resistor(cx, yA + 8, yA + 36), line([[cx, yA + 36], [cx, yA + 46]]), txt(cx + 10, yA + 26, o.value));
  } else prims.push(line([[cx, yA + 8], [cx, yA + 46]]));
  const yT = yA + 46;
  prims.push(
    line([[cx - 8, yT], [cx + 8, yT], [cx, yT + 14]], C.sym, { closed: true, fill: C.panel }),
    line([[cx - 8, yT + 14], [cx + 8, yT + 14]], C.sym, { width: 1.5 }),
    line([[cx + 9, yT + 3], [cx + 16, yT - 4]]),
    line([[cx + 12, yT - 4], [cx + 16, yT - 4], [cx + 16, yT]]),
    line([[cx + 9, yT + 9], [cx + 16, yT + 2]]),
    line([[cx + 12, yT + 2], [cx + 16, yT + 2], [cx + 16, yT + 6]]),
    line([[cx, yT + 14], [cx, yT + 14 + VSTUB]]),
    txt(cx + 22, yT + 12, clip(o.title, 24), { font: 'ui', size: 11, weight: 600, fill: C.text }),
  );
  const yEnd = yT + 14 + VSTUB;
  return {
    item: { id: o.id, kind: 'part', target: tg, title: o.tooltip, prims },
    terms: [
      { key: o.a, end: [o.xT, yA], dir: 'left', mark: [o.xT + 10, yA], target: tg },
      { key: o.k, end: [cx, yEnd], dir: 'down', mark: [cx, yEnd - VSTUB / 2], target: tg },
    ],
    body: { x0: cx - 8, y0: yA, x1: cx + 16, y1: yT + 14 },
  };
}

/** Push button (normally open) or a plain switch: first pin from the left, second at the bottom. */
function switchSymbol(o: SymArgs & { push: boolean; a: string; b: string }): Built {
  const yA = o.y + 6;
  const cx = o.xT + STUB + 14;
  const prims: SchPrim[] = [
    line([[o.xT, yA], [cx, yA], [cx, yA + 12]]),
    { k: 'circle', x: cx, y: yA + 14.5, r: 2.5, fill: C.bg, stroke: C.sym },
    { k: 'circle', x: cx, y: yA + 39.5, r: 2.5, fill: C.bg, stroke: C.sym },
  ];
  if (o.push) {
    prims.push(line([[cx + 8, yA + 10], [cx + 8, yA + 44]], C.sym, { width: 1.5 }), line([[cx + 8, yA + 27], [cx + 18, yA + 27]]), line([[cx + 18, yA + 21], [cx + 18, yA + 33]], C.sym, { width: 1.5 }));
  } else {
    prims.push(line([[cx, yA + 37], [cx + 11, yA + 15]], C.sym, { width: 1.5 }));
  }
  const yEnd = yA + 42 + VSTUB;
  prims.push(line([[cx, yA + 42], [cx, yEnd]]), txt(cx + 26, yA + 31, clip(o.title, 24), { font: 'ui', size: 11, weight: 600, fill: C.text }));
  return {
    item: { id: o.id, kind: 'part', target: o.target, title: o.tooltip, prims },
    terms: [
      { key: o.a, end: [o.xT, yA], dir: 'left', mark: [o.xT + 10, yA], target: o.target },
      { key: o.b, end: [cx, yEnd], dir: 'down', mark: [cx, yEnd - VSTUB / 2], target: o.target },
    ],
    body: { x0: cx - 3, y0: yA + 10, x1: cx + 18, y1: yA + 44 },
  };
}

/** Potentiometer: supply on top, ground at the bottom, the wiper (the output) from the left. */
function potSymbol(o: SymArgs & { value?: string; top: string; wiper: string; bottom: string }): Built {
  const y = o.y;
  const cx = o.xT + STUB + 16;
  const ym = y + 30;
  const prims: SchPrim[] = [
    line([[cx, y], [cx, y + 14]]),
    ...resistor(cx, y + 14, y + 46),
    line([[cx, y + 46], [cx, y + 60]]),
    line([[o.xT, ym], [cx - 10, ym]]),
    line([[cx - 5, ym], [cx - 12, ym - 4], [cx - 12, ym + 4]], C.sym, { closed: true, fill: C.sym }),
    txt(cx + 10, ym + 12, clip(o.title, 24), { font: 'ui', size: 11, weight: 600, fill: C.text }),
  ];
  if (o.value) prims.push(txt(cx + 10, ym - 4, o.value));
  return {
    item: { id: o.id, kind: 'part', target: o.target, title: o.tooltip, prims },
    terms: [
      { key: o.top, end: [cx, y], dir: 'up', mark: [cx, y + 7], target: o.target },
      { key: o.wiper, end: [o.xT, ym], dir: 'left', mark: [o.xT + 10, ym], target: o.target },
      { key: o.bottom, end: [cx, y + 60], dir: 'down', mark: [cx, y + 53], target: o.target },
    ],
    body: { x0: cx - 5, y0: y + 14, x1: cx + 5, y1: y + 46 },
  };
}

/** Resistance written in a part name ("LED with 220 Ω resistor" → "220 Ω"). */
function valueIn(name: string): string | undefined {
  const m = /(\d+(?:[.,]\d+)?)\s*([kM]?)Ω/.exec(name);
  return m ? `${m[1]} ${m[2]}Ω` : undefined;
}

function buildPart(sp: ScenePart, def: PartDef | undefined, scene: Scene, netOf: (key: string) => Net | undefined): Built {
  const target: TargetRef = `part:${sp.id}`;
  const title = sp.label ?? def?.name ?? sp.partId;
  const pins =
    def?.pins ??
    [...new Set(scene.wires.flatMap((w) => [w.from, w.to]).filter((e) => e.part === sp.id).map((e) => e.pin))].map((name) => ({ name, role: 'passive' as PartPinRole }));
  const key = (pin: string) => partKey(sp.id, pin);
  const base = { id: `part-${sp.id}`, target, title, tooltip: def?.name, xT: 0, y: 0 };
  const shape = def?.model.shape;
  const roles = pins.map((p) => p.role).join(',');
  if (def && shape === 'led' && roles === 'digital_in,ground' && /\bLED\b/.test(def.name)) {
    return ledSymbol({ ...base, value: valueIn(def.name), a: key(pins[0].name), k: key(pins[1].name) });
  }
  if (def && shape === 'button' && pins.length === 2) {
    return switchSymbol({ ...base, push: /button/i.test(`${def.id} ${def.name}`), a: key(pins[0].name), b: key(pins[1].name) });
  }
  if (def && shape === 'pot' && pins.length === 3) {
    const top = pins.find((p) => p.role === 'power') ?? pins[0];
    const bottom = pins.find((p) => p.role === 'ground') ?? pins[2];
    const wiper = pins.find((p) => p !== top && p !== bottom) ?? pins[1];
    return potSymbol({ ...base, value: valueIn(def.name), top: key(top.name), wiper: key(wiper.name), bottom: key(bottom.name) });
  }
  // A box: pins on power nets on top, ground at the bottom, the rest on the left facing the board.
  const side = (p: { name: string; role: PartPinRole }): 'left' | 'top' | 'bottom' => {
    const net = netOf(key(p.name));
    if (net) return net.kind === 'power' ? 'top' : net.kind === 'ground' ? 'bottom' : 'left';
    return p.role === 'power' ? 'top' : p.role === 'ground' ? 'bottom' : 'left';
  };
  const ic = (p: { name: string }, dir: Dir): IcPin => ({ key: key(p.name), name: p.name, target, along: attachmentSize(netOf(key(p.name)), dir).along });
  return icSymbol({
    ...base,
    kind: 'part',
    sub: def ? `${def.name}${def.addresses?.length ? ` · ${def.addresses[0]}` : ''}` : sp.partId,
    x: STUB,
    y: 0,
    side: 'left',
    sidePins: pins.filter((p) => side(p) === 'left').map((p) => ic(p, 'left')),
    top: pins.filter((p) => side(p) === 'top').map((p) => ic(p, 'up')),
    bottom: pins.filter((p) => side(p) === 'bottom').map((p) => ic(p, 'down')),
    minW: 130,
  });
}

/* ---------- routing ---------- */

interface Route {
  net: Net;
  anchor: Term;
  branches: Term[];
  yb: number;
  straight: boolean;
}

type Seg = { h: true; y: number; x0: number; x1: number } | { h: false; x: number; y0: number; y1: number };

function segsOf(r: Route, lane: number | undefined, xm: number, xt: number): Seg[] {
  if (r.straight || lane === undefined) return [{ h: true, y: r.yb, x0: xm, x1: xt }];
  const ys = [r.yb, ...r.branches.map((b) => b.end[1])];
  return [{ h: true, y: r.yb, x0: xm, x1: lane }, { h: false, x: lane, y0: Math.min(...ys), y1: Math.max(...ys) }, ...r.branches.map((b): Seg => ({ h: true, y: b.end[1], x0: lane, x1: xt }))];
}

/** Do two segments share any point (a crossing, a touch or an overlap)? */
export function segsMeet(a: Seg, b: Seg): boolean {
  if (a.h && b.h) return a.y === b.y && Math.max(a.x0, b.x0) <= Math.min(a.x1, b.x1);
  if (!a.h && !b.h) return a.x === b.x && Math.max(a.y0, b.y0) <= Math.min(a.y1, b.y1);
  const hs = (a.h ? a : b) as Extract<Seg, { h: true }>;
  const vs = (a.h ? b : a) as Extract<Seg, { h: false }>;
  return vs.x >= hs.x0 && vs.x <= hs.x1 && hs.y >= vs.y0 && hs.y <= vs.y1;
}

/** Pairs of routes whose wires would meet, with lanes in this left-to-right order. */
function conflicts(routes: Route[], order: Route[]): [Route, Route][] {
  const lane = new Map(order.map((r, i) => [r, i + 1]));
  const segs = new Map(routes.map((r) => [r, segsOf(r, lane.get(r), 0, order.length + 2)]));
  const out: [Route, Route][] = [];
  for (let i = 0; i < routes.length; i++)
    for (let j = i + 1; j < routes.length; j++) {
      const a = segs.get(routes[i]) ?? [];
      const b = segs.get(routes[j]) ?? [];
      if (a.some((s) => b.some((u) => segsMeet(s, u)))) out.push([routes[i], routes[j]]);
    }
  return out;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Lane order with the fewest meeting wires (every order for a few lanes, good guesses for more). */
function bestOrder(routes: Route[]): { order: Route[]; clashes: [Route, Route][] } {
  const laned = routes.filter((r) => !r.straight);
  const mean = (r: Route) => r.branches.reduce((a, b) => a + b.end[1], 0) / r.branches.length;
  const byYb = [...laned].sort((a, b) => a.yb - b.yb);
  const ups = byYb.filter((r) => mean(r) < r.yb);
  const downs = byYb.filter((r) => mean(r) >= r.yb).reverse();
  const candidates =
    laned.length <= 6
      ? permutations(byYb)
      : [byYb, [...byYb].reverse(), [...ups, ...downs], [...downs, ...ups], [...laned].sort((a, b) => mean(a) - mean(b)), [...laned].sort((a, b) => mean(b) - mean(a))];
  let best = { order: candidates[0], clashes: conflicts(routes, candidates[0]) };
  for (const c of candidates.slice(1)) {
    if (!best.clashes.length) break;
    const cl = conflicts(routes, c);
    if (cl.length < best.clashes.length) best = { order: c, clashes: cl };
  }
  return best;
}

/* ---------- suggested parts ---------- */

function suggestions(
  scene: Scene,
  board: BoardDef,
  parts: Record<string, PartDef>,
  nets: Net[],
  netOf: (key: string) => Net | undefined,
): { units: { prims: SchPrim[]; w: number; h: number; title: string }[]; named: Set<Net> } {
  const ex = impliedExtras(scene, board, parts);
  const S = C.suggest;
  const units: { prims: SchPrim[]; w: number; h: number; title: string }[] = [];
  const named = new Set<Net>();
  const logicRail = `+${board.logicVolt}V`;

  /** A dashed resistor from a rail down to a net label: one pull-up. */
  const pullup = (cx: number, top: number, rail: string, net: string, value: string, target?: TargetRef): SchPrim[] => {
    const tw = textWidth(net, 10, 'mono');
    return [
      txt(cx, top + 10, rail, { font: 'ui', weight: 600, fill: ROLE_HEX.power, anchor: 'middle', target }),
      line([[cx - 9, top + 14], [cx + 9, top + 14]], ROLE_HEX.power, { width: 2, target }),
      line([[cx, top + 14], [cx, top + 22]], S, { dash: true, target }),
      ...resistor(cx, top + 22, top + 52, S, { dash: 'fine', target }),
      line([[cx, top + 52], [cx, top + 62]], S, { dash: true, target }),
      { k: 'rect', x: cx - tw / 2 - 6, y: top + 62, w: tw + 12, h: 14, stroke: S, fill: C.bg, rx: 3, dash: true, target },
      txt(cx, top + 72.5, net, { fill: S, anchor: 'middle', target }),
      txt(cx + 9, top + 40, value, { size: 9, fill: S, target }),
    ];
  };

  if (ex.i2cPullups) {
    const i2cNets = nets.filter((n) => n.group === 'i2c');
    i2cNets.forEach((n) => named.add(n));
    const names = i2cNets.length ? i2cNets.map((n) => n.name) : ['SDA', 'SCL'];
    // The pull-ups go to the supply of the I2C parts.
    const i2cPart = scene.parts.find((p) => parts[p.partId]?.bus === 'i2c');
    const pw = i2cPart && parts[i2cPart.partId]?.pins.find((p) => p.role === 'power');
    const rail = (pw && netOf(partKey(i2cPart.id, pw.name))?.rail) || logicRail;
    const anchor = i2cNets[0]?.ends.find((e) => e.board)?.board;
    const target: TargetRef | undefined = anchor ? `pin:${anchor.id}` : undefined;
    const title = t('I2C pull-ups');
    const step = Math.max(64, ...names.map((n) => textWidth(n, 10, 'mono') + 22));
    const prims = [txt(0, 10, title, { font: 'ui', size: 11, weight: 600, fill: S, target }), ...names.flatMap((n, i) => pullup(24 + i * step, 18, rail, n, '4.7 kΩ', target))];
    units.push({ prims, w: Math.max(textWidth(title, 11, 'ui', 600), 24 + (names.length - 1) * step + 50), h: 96, title: t('No I2C part here has pull-up resistors on board; the bus needs one on SDA and one on SCL.') });
  }

  for (const c of ex.onewirePullups) {
    const net = netOf(boardKey(c.boardPin.id));
    if (net) named.add(net);
    const title = t('Pull-up');
    const target: TargetRef = `wire:${c.wireId}`;
    const prims = [txt(0, 10, title, { font: 'ui', size: 11, weight: 600, fill: S, target }), ...pullup(24, 18, logicRail, net?.name ?? c.boardPin.label, `${c.kOhm} kΩ`, target)];
    units.push({ prims, w: Math.max(textWidth(title, 11, 'ui', 600), 24 + 50), h: 96, title: t('{part}: {note}', { part: c.def.name, note: t(c.pin.notes ?? '') }) });
  }

  for (const c of ex.dividers) {
    const from = `${c.part.label ?? c.def.name.split(/[ (]/)[0]} ${c.pin.name}`;
    const to = c.boardPin.label;
    const target: TargetRef = `wire:${c.wireId}`;
    const title = t('Voltage divider');
    const fw = textWidth(from, 10, 'mono');
    const tw = textWidth(to, 10, 'mono');
    const cx = Math.max(fw / 2 + 8, 24);
    const node = 98;
    const prims: SchPrim[] = [
      txt(0, 10, title, { font: 'ui', size: 11, weight: 600, fill: S, target }),
      { k: 'rect', x: cx - fw / 2 - 6, y: 18, w: fw + 12, h: 14, stroke: S, fill: C.bg, rx: 3, dash: true, target },
      txt(cx, 28.5, from, { fill: S, anchor: 'middle', target }),
      line([[cx, 32], [cx, 42]], S, { dash: true, target }),
      ...resistor(cx, 42, 72, S, { dash: 'fine', target }),
      txt(cx + 9, 60, '1 kΩ', { size: 9, fill: S, target }),
      line([[cx, 72], [cx, 110]], S, { dash: true, target }),
      { k: 'circle', x: cx, y: node, r: 2.5, fill: S, target },
      line([[cx, node], [cx + 40, node]], S, { dash: true, target }),
      { k: 'rect', x: cx + 40, y: node - 7, w: tw + 12, h: 14, stroke: S, fill: C.bg, rx: 3, dash: true, target },
      txt(cx + 46, node + 3.5, to, { fill: S, target }),
      ...resistor(cx, 110, 140, S, { dash: 'fine', target }),
      txt(cx + 9, 128, '2 kΩ', { size: 9, fill: S, target }),
      line([[cx, 140], [cx, 148]], S, { dash: true, target }),
      ...groundItem('g', [cx, 148], 'down', target).prims,
    ];
    units.push({
      prims,
      w: Math.max(textWidth(title, 11, 'ui', 600), cx + fw / 2 + 6, cx + 52 + tw),
      h: 158,
      title: t('These 5 V outputs go into 3.3 V pins; a divider brings 5 V down to about 3.3 V.'),
    });
  }

  if (ex.shifterLines) {
    const title = t('Level shifter');
    const text = t('{n} signal lines', { n: ex.shifterLines });
    const bw = Math.max(textWidth(text, 10, 'ui'), 60) + 20;
    const prims: SchPrim[] = [
      txt(0, 10, title, { font: 'ui', size: 11, weight: 600, fill: S }),
      { k: 'rect', x: 0, y: 20, w: bw, h: 44, stroke: S, fill: C.panel, rx: 3, dash: true },
      txt(10, 38, `${board.logicVolt >= 5 ? '5 V' : '3.3 V'} ⇄ ${board.logicVolt >= 5 ? '3.3 V' : '5 V'}`, { fill: S }),
      txt(10, 54, text, { font: 'ui', fill: S }),
    ];
    units.push({
      prims,
      w: Math.max(textWidth(title, 11, 'ui', 600), bw),
      h: 64,
      title: board.logicVolt >= 5 ? t('3.3 V parts on a 5 V board: their signal pins must not get 5 V.') : t('5 V parts on a 3.3 V board, on lines that go both ways.'),
    });
  }
  return { units, named };
}

/* ---------- the schematic ---------- */

export function sceneToSchematic(scene: Scene, board: BoardDef, parts: Record<string, PartDef>, findings: WiringFinding[] = [], opts: { symbols?: SymbolStyle } = {}): Schematic {
  symbols = opts.symbols ?? 'ansi';
  try {
    return buildSchematic(scene, board, parts, findings);
  } finally {
    symbols = 'ansi';
  }
}

function buildSchematic(scene: Scene, board: BoardDef, parts: Record<string, PartDef>, findings: WiringFinding[]): Schematic {
  const nets = buildNets(scene, board, parts);
  const netByKey = new Map<string, Net>();
  for (const n of nets) for (const e of n.ends) netByKey.set(e.key, n);
  const netOf = (k: string) => netByKey.get(k);
  const wireAt = (k: string): TargetRef | undefined => {
    const w = netOf(k)?.wiresAt.get(k)?.[0];
    return w ? `wire:${w}` : undefined;
  };

  /* parts, stacked on the right (x fixed later) */
  const built = scene.parts.map((sp) => {
    const b = buildPart(sp, parts[sp.partId], scene, netOf);
    const atts = b.terms.map((tm) => attachment('probe', netOf(tm.key), tm, false, tm.target)).filter((a): a is SchItem => !!a);
    const fp = unionBox([itemBox(b.item), ...atts.map(itemBox)]);
    return { sp, b, fp };
  });

  /* board: which pins, where */
  const order = headerOrder(board);
  const byOrder = (a: PinDef, b: PinDef) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  const used = [...new Map(nets.flatMap((n) => n.ends.filter((e) => e.board).map((e) => [e.key, e.board as PinDef] as const))).values()];
  const topPins = used.filter((p) => p.kind === 'power').sort(byOrder);
  const botPins = used.filter((p) => p.kind === 'ground').sort(byOrder);
  const sidePins = used.filter((p) => p.kind !== 'power' && p.kind !== 'ground');
  const railRoom = topPins.length ? VSTUB + Math.max(...topPins.map((p) => attachmentSize(netOf(boardKey(p.id)), 'up').across)) + 2 : 0;
  const mcuY = PAD + railRoom;
  const firstPinY = mcuY + HEADER(topPins.length > 0) + ROW / 2;

  // Parts from the top; each board pin wants to sit level with the part pin it goes to.
  let cursor = PAD;
  const partDy = built.map(({ fp }) => {
    const dy = cursor - fp.y0;
    cursor += fp.y1 - fp.y0 + PART_GAP;
    return dy;
  });
  const termY = new Map<string, number>();
  built.forEach(({ b }, i) => b.terms.forEach((tm) => termY.set(tm.key, tm.end[1] + partDy[i])));
  const targetOf = (p: PinDef): number | undefined => {
    const net = netOf(boardKey(p.id));
    if (!net) return undefined;
    const ys = net.ends.filter((e) => e.part).map((e) => termY.get(e.key)).filter((y): y is number => y !== undefined);
    return ys.length ? Math.min(...ys) : undefined;
  };
  const targets = sidePins.map(targetOf).filter((y): y is number => y !== undefined);
  const shift = targets.length ? Math.max(0, firstPinY - Math.min(...targets)) : 0;
  const sideSorted = sidePins
    .map((p) => ({ p, y: targetOf(p) }))
    .map((s) => ({ ...s, y: s.y === undefined ? undefined : s.y + shift }))
    .sort((a, b) => (a.y ?? Infinity) - (b.y ?? Infinity) || byOrder(a.p, b.p));
  let prev = -Infinity;
  const sideYs = sideSorted.map((s) => (prev = Math.max(s.y ?? -Infinity, prev + ROW, firstPinY)));

  const pinLabel = (p: PinDef) => (p.chipPin && p.chipPin !== p.label && !p.label.includes(p.chipPin) ? `${p.label} ${p.chipPin}` : p.label);
  const mcuPin = (p: PinDef, dir: Dir): IcPin => ({
    key: boardKey(p.id),
    name: pinLabel(p),
    num: p.gpio !== null ? String(p.gpio) : undefined,
    target: `pin:${p.id}`,
    along: attachmentSize(netOf(boardKey(p.id)), dir).along,
  });
  const mcu = icSymbol({
    id: 'board',
    kind: 'board',
    target: 'part:board',
    title: board.name,
    sub: board.module,
    tooltip: board.name,
    x: PAD,
    y: mcuY,
    side: 'right',
    sidePins: sideSorted.map((s) => mcuPin(s.p, 'right')),
    sideYs,
    top: topPins.map((p) => mcuPin(p, 'up')),
    bottom: botPins.map((p) => mcuPin(p, 'down')),
    minW: 170,
  });

  // Part terminals at their final height (x still relative to the terminal column).
  const partsY = built.map(({ b }, i) => ({ item: shiftItem(b.item, 0, partDy[i] + shift), terms: b.terms.map((tm) => moveTerm(tm, 0, partDy[i] + shift)), body: moveBox(b.body, 0, partDy[i] + shift) }));

  /* routes: board pin → part pins on the left of their symbol */
  const allPartTerms = partsY.flatMap((p) => p.terms);
  const routes: Route[] = [];
  for (const net of nets) {
    if (net.kind !== 'signal') continue;
    const anchor = mcu.terms.filter((tm) => tm.dir === 'right' && net.ends.some((e) => e.key === tm.key)).sort((a, b) => a.end[1] - b.end[1])[0];
    const branches = allPartTerms.filter((tm) => tm.dir === 'left' && net.ends.some((e) => e.key === tm.key)).sort((a, b) => a.end[1] - b.end[1]);
    if (!anchor || !branches.length) continue;
    routes.push({ net, anchor, branches, yb: anchor.end[1], straight: branches.length === 1 && branches[0].end[1] === anchor.end[1] });
  }
  // Nets whose wires would meet are drawn with labels instead, a whole bus at a time.
  let active = routes;
  let best = bestOrder(active);
  while (best.clashes.length) {
    const count = new Map<Route, number>();
    for (const [a, b] of best.clashes) {
      count.set(a, (count.get(a) ?? 0) + 1);
      count.set(b, (count.get(b) ?? 0) + 1);
    }
    const worst = [...count.entries()].sort((a, b) => b[1] - a[1] || active.indexOf(b[0]) - active.indexOf(a[0]))[0][0];
    active = active.filter((r) => r.net.group !== worst.net.group);
    best = bestOrder(active);
  }
  const routedNet = new Set(active.map((r) => r.net));
  const laneIndex = new Map(best.order.map((r, i) => [r, i]));
  const isRoutedTerm = (tm: Term) => active.some((r) => r.anchor === tm || r.branches.includes(tm));

  /* suggested parts (needs to know which nets get their name written) */
  const sug = suggestions(scene, board, parts, nets, netOf);
  const hasLabel = (net: Net) =>
    [...mcu.terms, ...allPartTerms].some((tm) => !isRoutedTerm(tm) && net.ends.some((e) => e.key === tm.key));
  const showName = (r: Route) => r.net.group === 'i2c' || r.net.group === 'spi' || sug.named.has(r.net) || hasLabel(r.net);

  /* x: board | its labels and wire names | lanes | part labels | parts */
  const xm = mcu.terms.find((tm) => tm.dir === 'right')?.end[0] ?? mcu.body.x1 + STUB;
  const acrossOf = (tm: Term) => (isRoutedTerm(tm) ? 0 : attachmentSize(netOf(tm.key), tm.dir).across);
  const zm = Math.max(
    16,
    ...mcu.terms.filter((tm) => tm.dir === 'right').map((tm) => acrossOf(tm) + 10),
    ...active.filter(showName).map((r) => textWidth(r.net.name, 10, 'mono') + 12),
  );
  const laneX = (i: number) => xm + zm + 12 + i * LANE;
  const nLanes = best.order.length;
  const afterLanes = nLanes ? laneX(nLanes - 1) + 14 : xm + zm + 12;
  const zp = Math.max(24, ...allPartTerms.filter((tm) => tm.dir === 'left').map((tm) => acrossOf(tm) + 10));
  const xt = Math.max(afterLanes + zp, xm + 72);
  const placed = partsY.map((p) => ({ item: shiftItem(p.item, xt, 0), terms: p.terms.map((tm) => moveTerm(tm, xt, 0)), body: moveBox(p.body, xt, 0) }));
  const partTerms = placed.flatMap((p) => p.terms);
  const termFor = new Map(partTerms.map((tm) => [tm.key, tm]));

  const items: SchItem[] = [];

  /* wires */
  for (const r of active) {
    const lane = laneIndex.has(r) ? laneX(laneIndex.get(r) as number) : undefined;
    const bs = r.branches.map((b) => termFor.get(b.key) ?? b);
    const col = r.net.color;
    const [x0, yb] = r.anchor.end;
    const ys = [yb, ...bs.map((b) => b.end[1])];
    const ymin = Math.min(...ys);
    const ymax = Math.max(...ys);
    bs.forEach((b, i) => {
      const target = wireAt(b.key) ?? wireAt(r.anchor.key) ?? `pin:${r.anchor.key.slice(2)}`;
      const prims: SchPrim[] = [];
      if (lane === undefined) prims.push(line([[x0, yb], [b.end[0], b.end[1]]], col, { width: 1.5 }));
      else if (i === 0) {
        prims.push(line([[x0, yb], [lane, yb], [lane, b.end[1]], [b.end[0], b.end[1]]], col, { width: 1.5 }));
        if (ymin < Math.min(yb, b.end[1]) || ymax > Math.max(yb, b.end[1])) prims.push(line([[lane, ymin], [lane, ymax]], col, { width: 1.5 }));
        // A dot wherever three or more wire ends meet on the lane.
        for (const y of [...new Set(ys)]) {
          const deg = (y === yb ? 1 : 0) + (bs.some((x) => x.end[1] === y) ? 1 : 0) + (y > ymin ? 1 : 0) + (y < ymax ? 1 : 0);
          if (deg >= 3) prims.push({ k: 'circle', x: lane, y, r: 3, fill: col });
        }
      } else {
        prims.push(line([[lane, b.end[1]], [b.end[0], b.end[1]]], col, { width: 1.5 }));
      }
      if (i === 0 && showName(r)) prims.push(txt(x0 + 4, yb - 4, r.net.name, { fill: col }));
      items.push({ id: `wire-${r.net.id}-${i}`, kind: 'wire', target, net: r.net.name, prims });
    });
  }

  /* the board and the parts, with what hangs on their pins */
  items.push(mcu.item);
  mcu.terms.forEach((tm, i) => {
    const a = routedNet.has(netOf(tm.key) as Net) && isRoutedTerm(tm) ? null : attachment(`board-att-${i}`, netOf(tm.key), tm, false, tm.target);
    if (a) items.push(a);
  });
  placed.forEach((p, pi) => {
    items.push(p.item);
    p.terms.forEach((tm, i) => {
      const routedHere = active.some((r) => r.branches.some((b) => b.key === tm.key));
      if (routedHere) return;
      const a = attachment(`part-att-${pi}-${i}`, netOf(tm.key), tm, false, wireAt(tm.key) ?? tm.target);
      if (a) items.push(a);
    });
  });

  /* suggested parts, dashed, in their own frame below everything */
  const drawnBox = unionBox(items.map(itemBox));
  if (sug.units.length) {
    const gy = drawnBox.y1 + 28;
    const head = t('Suggested, not in your drawing');
    const note = t('The wiring rules say these parts are missing. Add them before you power the board.');
    const maxRow = Math.max(drawnBox.x1 - PAD - 28, 460);
    const prims: SchPrim[] = [];
    let ux = PAD + 14;
    let uy = gy + 50;
    let rowH = 0;
    let right = PAD + 14 + Math.max(textWidth(head, 11, 'ui', 600), textWidth(note, 10, 'ui'));
    for (const u of sug.units) {
      if (ux > PAD + 14 && ux + u.w > PAD + 14 + maxRow) {
        ux = PAD + 14;
        uy += rowH + 20;
        rowH = 0;
      }
      prims.push(...u.prims.map((p) => shiftPrim(p, ux, uy)));
      right = Math.max(right, ux + u.w);
      rowH = Math.max(rowH, u.h);
      ux += u.w + 32;
    }
    const fh = uy + rowH + 14 - gy;
    items.push({
      id: 'suggested',
      kind: 'suggested',
      title: sug.units.map((u) => u.title).join('\n'),
      prims: [
        { k: 'rect', x: PAD, y: gy, w: right + 14 - PAD, h: fh, stroke: C.suggest, fill: 'none', rx: 8, dash: true },
        txt(PAD + 14, gy + 20, head, { font: 'ui', size: 11, weight: 600, fill: C.suggest }),
        txt(PAD + 14, gy + 36, note, { font: 'ui', fill: C.dim }),
        ...prims,
      ],
    });
  }

  /* findings, on the wire, pin or part they are about */
  const marks: SchMark[] = [];
  const termOfWire = (wireId: string): Term | undefined => {
    const w = scene.wires.find((x) => x.id === wireId);
    if (!w) return undefined;
    const ends = [w.from, w.to];
    const pe = ends.find((e) => e.part !== 'board');
    if (pe) {
      const tm = termFor.get(partKey(pe.part, pe.pin));
      if (tm) return tm;
    }
    const be = ends.find((e) => e.part === 'board');
    return be ? mcu.terms.find((tm) => tm.key === boardKey(be.pin)) : undefined;
  };
  for (const f of findings) {
    const at =
      f.targets.map((tg) => (tg.startsWith('wire:') ? termOfWire(tg.slice(5))?.mark : undefined)).find(Boolean) ??
      f.targets.map((tg) => (tg.startsWith('pin:') ? mcu.terms.find((tm) => tm.target === tg)?.mark : undefined)).find(Boolean) ??
      f.targets
        .map((tg) => {
          const i = scene.parts.findIndex((p) => `part:${p.id}` === tg);
          return i >= 0 ? ([placed[i].body.x1, placed[i].body.y0] as Pt) : undefined;
        })
        .find(Boolean);
    if (!at) continue;
    const same = marks.find((m) => m.x === at[0] && m.y === at[1]);
    if (same) {
      same.text += `\n${f.message}`;
      same.targets = [...new Set([...same.targets, ...f.targets])];
      if (f.severity === 'error' || (f.severity === 'warning' && same.severity === 'info')) same.severity = f.severity;
    } else marks.push({ x: at[0], y: at[1], severity: f.severity, text: f.message, targets: f.targets });
  }

  const all = unionBox([...items.map(itemBox), ...marks.map((m) => ({ x0: m.x - 8, y0: m.y - 8, x1: m.x + 8, y1: m.y + 8 }))]);
  return {
    width: Math.ceil(all.x1 + PAD),
    height: Math.ceil(all.y1 + PAD),
    items,
    marks,
    nets: nets.map((n) => ({
      id: n.id,
      name: n.name,
      kind: n.kind,
      drawn: n.kind !== 'signal' ? 'symbol' : routedNet.has(n) ? 'wire' : 'label',
      wires: n.wires,
    })),
  };

  function moveTerm(tm: Term, dx: number, dy: number): Term {
    return { ...tm, end: [tm.end[0] + dx, tm.end[1] + dy], mark: [tm.mark[0] + dx, tm.mark[1] + dy] };
  }
  function moveBox(b: Box, dx: number, dy: number): Box {
    return { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy };
  }
}

/* ---------- SVG ---------- */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const n1 = (v: number) => String(Math.round(v * 10) / 10);

function primSvg(p: SchPrim): string {
  switch (p.k) {
    case 'line': {
      const pts = p.pts.map((q) => `${n1(q[0])},${n1(q[1])}`).join(' ');
      const dash = p.dash === 'fine' ? ' stroke-dasharray="2.5 1.5"' : p.dash ? ' stroke-dasharray="4 3"' : '';
      return p.closed
        ? `<polygon points="${pts}" fill="${p.fill ?? 'none'}" stroke="${p.stroke}" stroke-width="${p.width ?? 1.2}" stroke-linejoin="round"${dash}/>`
        : `<polyline points="${pts}" fill="none" stroke="${p.stroke}" stroke-width="${p.width ?? 1.2}" stroke-linejoin="round" stroke-linecap="round"${dash}/>`;
    }
    case 'rect':
      return `<rect x="${n1(p.x)}" y="${n1(p.y)}" width="${n1(p.w)}" height="${n1(p.h)}" rx="${p.rx ?? 0}" fill="${p.fill}" stroke="${p.stroke}"${p.dash ? ' stroke-dasharray="4 3"' : ''}/>`;
    case 'circle':
      return `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${p.r}" fill="${p.fill}"${p.stroke ? ` stroke="${p.stroke}"` : ''}/>`;
    case 'text':
      return `<text x="${n1(p.x)}" y="${n1(p.y)}" font-family="${p.font === 'mono' ? 'IBM Plex Mono, monospace' : 'IBM Plex Sans, sans-serif'}" font-size="${p.size}"${p.weight ? ` font-weight="${p.weight}"` : ''} text-anchor="${p.anchor}" fill="${p.fill}">${esc(p.text)}</text>`;
  }
}

export interface SchSvgOptions {
  /** Add data-target attributes (and the "hot" class on these targets) for the in-app view. */
  interactive?: boolean;
  hot?: (t: TargetRef) => boolean;
}

/** A standalone SVG of the schematic (design-token colours inlined), for the view, export and reports. */
export function schematicToSvg(s: Schematic, opts: SchSvgOptions = {}): string {
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.width} ${s.height}" width="${s.width}" height="${s.height}">`,
    `<rect width="100%" height="100%" fill="${C.bg}"/>`,
  ];
  const ordered = [...s.items.filter((i) => i.kind === 'wire'), ...s.items.filter((i) => i.kind !== 'wire')];
  for (const it of ordered) {
    out.push(`<g${opts.interactive ? ` class="sch-${it.kind}"` : ''}>`);
    if (it.title) out.push(`<title>${esc(it.title)}</title>`);
    if (opts.interactive && it.kind === 'wire') {
      for (const p of it.prims) if (p.k === 'line') out.push(`<polyline points="${p.pts.map((q) => `${n1(q[0])},${n1(q[1])}`).join(' ')}" fill="none" stroke="transparent" stroke-width="10" data-target="${it.target ?? ''}"/>`);
    }
    // Consecutive prims with the same click target share a group.
    let open: string | undefined;
    for (const p of it.prims) {
      const tg = opts.interactive ? p.target ?? it.target : undefined;
      if (tg !== open) {
        if (open !== undefined) out.push('</g>');
        if (tg !== undefined) out.push(`<g data-target="${tg}"${opts.hot?.(tg) ? ' class="hot"' : ''}>`);
        open = tg;
      }
      out.push(primSvg(p));
    }
    if (open !== undefined) out.push('</g>');
    out.push('</g>');
  }
  s.marks.forEach((m, i) => {
    const col = m.severity === 'error' ? C.err : m.severity === 'warning' ? C.warn : C.info;
    out.push(
      `<g${opts.interactive ? ` data-mark="${i}" class="sch-mark"` : ''}><title>${esc(m.text)}</title><circle cx="${n1(m.x)}" cy="${n1(m.y)}" r="7" fill="${col}"/><text x="${n1(m.x)}" y="${n1(m.y + 4)}" text-anchor="middle" fill="${C.bg}" font-family="IBM Plex Sans, sans-serif" font-size="11" font-weight="700">!</text></g>`,
    );
  });
  out.push('</svg>');
  return out.join('\n');
}
