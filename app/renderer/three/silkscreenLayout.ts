// Where the silkscreen text goes on a PCB: pin names next to their pins and the board name in the
// largest free spot. Pure maths, tested in tests/silkscreen.test.ts.

import type { BoardDef } from '@shared/types';
import { pinMount, pinOutward, pinPositionMm, rectToMm } from '@shared/board';

/** Character width as a share of the font size, for a monospace font. */
export const CHAR_W = 0.6;

export interface Label {
  text: string;
  /** centre, mm from the PCB top-left corner */
  x: number;
  y: number;
  /** text height in mm */
  size: number;
  vertical: boolean;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function labelRect(l: Label): Rect {
  const len = l.text.length * CHAR_W * l.size;
  const [w, h] = l.vertical ? [l.size, len] : [len, l.size];
  return { x0: l.x - w / 2, y0: l.y - h / 2, x1: l.x + w / 2, y1: l.y + h / 2 };
}

/** Where the pin labels and the board name go. Exported for tests. */
export function silkscreenLayout(board: BoardDef): Label[] {
  const { length, width } = board.pcbMm;
  const pins = board.pins.map((p) => {
    const [x, , z] = pinPositionMm(board, p);
    return { p, x: x + length / 2, y: z + width / 2 };
  });
  // Chips, buttons and connectors sit on top of the print: keep labels out from under them.
  const comps: Rect[] = board.components.map((c) => {
    const m = rectToMm(board, c.rect);
    const cx = m.cx + length / 2;
    const cy = m.cz + width / 2;
    return { x0: cx - m.w / 2 - 0.4, y0: cy - m.h / 2 - 0.4, x1: cx + m.w / 2 + 0.4, y1: cy + m.h / 2 + 0.4 };
  });
  const size = 1.25;
  const out: Label[] = [];
  const holes: Rect[] = (board.holesMm ?? []).map(([hx, hy, d]) => ({ x0: hx - d / 2 - 1, y0: hy - d / 2 - 1, x1: hx + d / 2 + 1, y1: hy + d / 2 + 1 }));
  const taken: Rect[] = [...holes];
  /** On the board, clear of every other pin's pad and of labels already placed. */
  const fits = (r: Rect, p: BoardDef['pins'][number]) =>
    r.x0 >= 0.3 &&
    r.y0 >= 0.3 &&
    r.x1 <= length - 0.3 &&
    r.y1 <= width - 0.3 &&
    !pins.some((q) => q.p !== p && overlaps(r, { x0: q.x - 1.2, y0: q.y - 1.2, x1: q.x + 1.2, y1: q.y + 1.2 })) &&
    !taken.some((t) => overlaps(r, t));
  const spots: { l: Label; r: Rect; x: number; y: number; dist: number; p: BoardDef['pins'][number] }[] = [];
  for (const { p, x, y } of pins) {
    const [ox, oz] = pinOutward(board, p);
    const housing = pinMount(board, p) === 'male-down' ? 0.9 : 1.35;
    const text = p.label.length > 6 ? p.label.slice(0, 6) : p.label;
    const len = text.length * CHAR_W * size;
    const dist = housing + 0.45 + len / 2;
    // Towards the middle of the board first (like most boards print it), then any free side.
    const dirs: [number, number][] = [[-ox, -oz], [0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [ix, iy] of dirs) {
      const l: Label = { text, x: x + ix * dist, y: y + iy * dist, size, vertical: ix === 0 };
      const r = labelRect(l);
      if (!fits(r, p)) continue;
      out.push(l);
      taken.push(r);
      spots.push({ l, r, x, y, dist, p });
      break;
    }
  }
  // Second pass: a label that ended up under a chip or button moves to another free side, if any.
  const underPart = (r: Rect) => comps.some((c) => overlaps(r, { x0: c.x0 + 0.4, y0: c.y0 + 0.4, x1: c.x1 - 0.4, y1: c.y1 - 0.4 }));
  for (const s of spots) {
    if (!underPart(s.r)) continue;
    const i = out.indexOf(s.l);
    taken.splice(taken.indexOf(s.r), 1); // free its own spot while looking for a better one
    let moved = false;
    for (const [ix, iy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as [number, number][]) {
      const l: Label = { ...s.l, x: s.x + ix * s.dist, y: s.y + iy * s.dist, vertical: ix === 0 };
      const r = labelRect(l);
      if (!fits(r, s.p) || underPart(r)) continue;
      out[i] = l;
      taken.push(r);
      moved = true;
      break;
    }
    if (!moved) taken.push(s.r);
  }

  // The board name: the free spot closest to the middle, as large as fits (down to 1.2 mm).
  const obstacles = [...comps, ...taken, ...pins.map((q) => ({ x0: q.x - 1.5, y0: q.y - 1.5, x1: q.x + 1.5, y1: q.y + 1.5 }))];
  for (const text of [board.name, board.name.replace(/\s*\(.*\)$/, '')]) {
    for (let s = Math.min(2.4, width * 0.09); s >= 1.2; s -= 0.3) {
      let best: Label | null = null;
      let bestD = Infinity;
      for (let y = 1; y < width - 1; y += 0.5)
        for (let x = 1; x < length - 1; x += 0.5) {
          const l: Label = { text, x, y, size: s, vertical: false };
          const r = labelRect(l);
          if (r.x0 < 0.8 || r.y0 < 0.8 || r.x1 > length - 0.8 || r.y1 > width - 0.8) continue;
          if (obstacles.some((o) => overlaps(r, o))) continue;
          const d = (x - length / 2) ** 2 + (y - width / 2) ** 2;
          if (d < bestD) {
            bestD = d;
            best = l;
          }
        }
      if (best) return [...out, best];
    }
  }
  return out;
}
