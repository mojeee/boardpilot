// Wiring diagram: the project drawn flat, generated only from the scene, the board file and the
// part files. Pure layout (no React), so it is deterministic and unit-tested; the renderer draws
// the shapes as SVG.
//
// Layout: the board is a block on the left with the pins in use listed in their real header order
// (a gap mark where unused pins are skipped); each part is a block on the right with its pins in
// order; each wire runs board pin → its own vertical lane → part pin, so no two wires overlap.

import type { BoardDef, PartDef, PinDef, Scene, TargetRef, WiringFinding } from './types';
import { ROLE_HEX, partRoleColor, pinById, pinPositionMm, pinRoleInScene } from './board';

export interface DiagramPin {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  target: TargetRef;
}

export interface DiagramBlock {
  id: string;
  title: string;
  sub: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pins: DiagramPin[];
  target: TargetRef;
}

export interface DiagramWire {
  id: string;
  color: string;
  /** Polyline points. */
  points: [number, number][];
  target: TargetRef;
}

export interface DiagramMark {
  x: number;
  y: number;
  severity: WiringFinding['severity'];
  text: string;
  targets: TargetRef[];
}

export interface Diagram {
  width: number;
  height: number;
  board: DiagramBlock;
  /** y positions of "…" marks between non-adjacent board pins */
  gaps: number[];
  parts: DiagramBlock[];
  wires: DiagramWire[];
  marks: DiagramMark[];
}

const ROW = 22;
const PAD = 24;
const BOARD_W = 190;
const PART_W = 170;
const LANE = 10;
const HEAD = 44;

/** Header order of a board pin: along the board edge, the way the pins are physically lined up. */
function headerOrder(board: BoardDef): Map<string, number> {
  const withPos = board.pins.map((p) => {
    const [x, , z] = pinPositionMm(board, p);
    return { p, x, z };
  });
  // Walk the outline clockwise from the top-left: top edge left→right, right edge, bottom right→left, left edge.
  const { length, width } = board.pcbMm;
  const key = ({ x, z }: { x: number; z: number }) => {
    const dTop = z + width / 2;
    const dBottom = width / 2 - z;
    const dLeft = x + length / 2;
    const dRight = length / 2 - x;
    const m = Math.min(dTop, dBottom, dLeft, dRight);
    if (m === dTop) return x;
    if (m === dRight) return length + z;
    if (m === dBottom) return length * 2 + width - x;
    return length * 3 + width * 2 - z;
  };
  const sorted = [...withPos].sort((a, b) => key(a) - key(b));
  return new Map(sorted.map((s, i) => [s.p.id, i]));
}

export function sceneToDiagram(scene: Scene, board: BoardDef, parts: Record<string, PartDef>, findings: WiringFinding[] = []): Diagram {
  const order = headerOrder(board);
  const boardEnd = (w: Scene['wires'][number]) => (w.from.part === 'board' ? w.from : w.to.part === 'board' ? w.to : null);
  const partEnd = (w: Scene['wires'][number]) => (w.from.part === 'board' ? w.to : w.from);

  /* ---- board block: used pins in header order ---- */
  const usedIds = [...new Set(scene.wires.map((w) => boardEnd(w)?.pin).filter((x): x is string => !!x))];
  const used = usedIds
    .map((id) => pinById(board, id))
    .filter((p): p is PinDef => !!p)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const gaps: number[] = [];
  const boardPins: DiagramPin[] = [];
  let y = PAD + HEAD;
  used.forEach((p, i) => {
    if (i > 0 && (order.get(p.id) ?? 0) - (order.get(used[i - 1].id) ?? 0) > 1) {
      gaps.push(y - ROW / 2 + 4);
      y += ROW / 2;
    }
    boardPins.push({ id: p.id, label: p.gpio !== null && p.label !== String(p.gpio) && !/^GP\d/.test(p.label) ? `${p.label} · ${p.gpio}` : p.label, x: PAD + BOARD_W, y, color: ROLE_HEX[pinRoleInScene(board, scene, p.id)], target: `pin:${p.id}` });
    y += ROW;
  });
  const boardH = Math.max(y - PAD + 10, HEAD + ROW * 2);

  /* ---- parts, ordered so their wires cross as little as possible ---- */
  const avgRow = (partId: string) => {
    const rows = scene.wires.filter((w) => partEnd(w).part === partId).map((w) => boardPins.findIndex((p) => p.id === boardEnd(w)?.pin));
    return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : 1e6;
  };
  const partOrder = [...scene.parts].sort((a, b) => avgRow(a.id) - avgRow(b.id) || a.id.localeCompare(b.id));
  const wiredCount = scene.wires.filter((w) => boardEnd(w) && partEnd(w).part !== 'board').length;
  const partX = PAD + BOARD_W + 60 + Math.max(1, wiredCount) * LANE + 20;
  let py = PAD;
  const blocks: DiagramBlock[] = partOrder.map((sp) => {
    const def = parts[sp.partId];
    const pinsDef = def?.pins ?? [];
    const h = HEAD + pinsDef.length * ROW;
    const block: DiagramBlock = {
      id: sp.id,
      title: sp.label ?? def?.name ?? sp.partId,
      sub: def ? `${def.name}${def.addresses?.length ? ` · ${def.addresses[0]}` : ''}` : sp.partId,
      x: partX,
      y: py,
      w: PART_W,
      h,
      target: `part:${sp.id}`,
      pins: pinsDef.map((p, i) => ({ id: p.name, label: p.name, x: partX, y: py + HEAD + i * ROW + ROW / 2, color: ROLE_HEX[partRoleColor(p.role)], target: `part:${sp.id}` })),
    };
    py += h + 18;
    return block;
  });

  /* ---- wires: board pin → own lane → part pin ---- */
  const wires: DiagramWire[] = [];
  let lane = 0;
  const sortedWires = [...scene.wires].sort((a, b) => {
    const pa = blocks.findIndex((x) => x.id === partEnd(a).part);
    const pb = blocks.findIndex((x) => x.id === partEnd(b).part);
    return pa - pb || a.id.localeCompare(b.id);
  });
  for (const w of sortedWires) {
    const be = boardEnd(w);
    const pe = partEnd(w);
    if (!be || pe.part === 'board') continue;
    const bp = boardPins.find((p) => p.id === be.pin);
    const blk = blocks.find((b) => b.id === pe.part);
    const pp = blk?.pins.find((p) => p.id === pe.pin);
    if (!bp || !pp) continue;
    const lx = PAD + BOARD_W + 40 + lane * LANE;
    lane++;
    wires.push({ id: w.id, color: w.color, target: `wire:${w.id}`, points: [[bp.x, bp.y], [lx, bp.y], [lx, pp.y], [pp.x, pp.y]] });
  }

  /* ---- findings on the pin or wire they are about ---- */
  const marks: DiagramMark[] = [];
  for (const f of findings) {
    const wire = f.targets.map((tg) => wires.find((w) => w.target === tg)).find(Boolean);
    const pin = f.targets.map((tg) => boardPins.find((p) => p.target === tg)).find(Boolean);
    const part = f.targets.map((tg) => blocks.find((b) => b.target === tg)).find(Boolean);
    const at: [number, number] | undefined = wire ? [wire.points[1][0], (wire.points[1][1] + wire.points[2][1]) / 2] : pin ? [pin.x - BOARD_W + 12, pin.y] : part ? [part.x + part.w - 12, part.y + 14] : undefined;
    if (at) marks.push({ x: at[0], y: at[1], severity: f.severity, text: f.message, targets: f.targets });
  }

  const height = Math.max(PAD + boardH, py) + PAD;
  return {
    width: partX + PART_W + PAD,
    height,
    board: { id: board.id, title: board.name, sub: board.module, x: PAD, y: PAD, w: BOARD_W, h: boardH, pins: boardPins, target: 'part:board' },
    gaps,
    parts: blocks,
    wires,
    marks,
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** A standalone SVG of the diagram (design-token colours inlined), for export and reports. */
export function diagramToSvg(d: Diagram): string {
  const C = { bg: '#12171D', panel: '#1C232B', line: '#2C3540', text: '#E9EDF1', muted: '#A7B3BF', dim: '#7D8997', err: '#FF5D52', warn: '#F2A93B', info: '#3FB6E8' };
  const block = (b: DiagramBlock, side: 'left' | 'right') =>
    [
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="${C.panel}" stroke="${C.line}"/>`,
      `<text x="${b.x + 12}" y="${b.y + 20}" fill="${C.text}" font-family="IBM Plex Sans, sans-serif" font-size="13" font-weight="600">${esc(b.title)}</text>`,
      `<text x="${b.x + 12}" y="${b.y + 35}" fill="${C.dim}" font-family="IBM Plex Sans, sans-serif" font-size="11">${esc(b.sub.length > 30 ? `${b.sub.slice(0, 29)}…` : b.sub)}</text>`,
      ...b.pins.map(
        (p) =>
          `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="${p.color}"/><text x="${side === 'right' ? p.x - 10 : p.x + 10}" y="${p.y + 4}" text-anchor="${side === 'right' ? 'end' : 'start'}" fill="${C.muted}" font-family="IBM Plex Mono, monospace" font-size="11">${esc(p.label)}</text>`,
      ),
    ].join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="${d.width}" height="${d.height}">`,
    `<rect width="100%" height="100%" fill="${C.bg}"/>`,
    ...d.wires.map((w) => `<polyline points="${w.points.map((p) => p.join(',')).join(' ')}" stroke="${w.color}" stroke-width="2" fill="none" stroke-linejoin="round"/>`),
    block(d.board, 'right'),
    ...d.gaps.map((y) => `<text x="${d.board.x + d.board.w - 10}" y="${y}" text-anchor="end" fill="${C.dim}" font-size="11">⋮</text>`),
    ...d.parts.map((b) => block(b, 'left')),
    ...d.marks.map(
      (m) =>
        `<g><title>${esc(m.text)}</title><circle cx="${m.x}" cy="${m.y}" r="8" fill="${m.severity === 'error' ? C.err : m.severity === 'warning' ? C.warn : C.info}"/><text x="${m.x}" y="${m.y + 4}" text-anchor="middle" fill="${C.bg}" font-family="IBM Plex Sans, sans-serif" font-size="11" font-weight="700">!</text></g>`,
    ),
    '</svg>',
  ].join('\n');
}
