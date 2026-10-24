// Draws a Display Studio spec into a framebuffer at the panel's real resolution. The drawing
// primitives follow Adafruit GFX (Bresenham lines, midpoint circles, fillCircleHelper), the text uses
// shared/displayFont.ts, and every pattern is integer math, so the C the code generator writes
// (shared/displayCode.ts) lights the same pixels on the real display. Colour panels keep RGB565 (the
// preview shows the real 16-bit banding); mono OLEDs and e-paper keep one bit per pixel.

import { CELL_H, CELL_W, GLYPH_H, GLYPH_W, glyphCode, glyphPixel } from './displayFont';
import {
  formatText,
  from565,
  parseColor,
  rgb565,
  rotatedSize,
  testCondition,
  varValue,
  type DisplayElement,
  type DisplaySpec,
  type IconName,
  type PanelInfo,
} from './displaySpec';

/** 8x8 icons, one byte per row, bit 7 = left column. Same bytes in the generated sketch. */
// prettier-ignore
export const ICON_BITS: Record<IconName, number[]> = {
  thermometer: [0x18, 0x24, 0x24, 0x24, 0x24, 0x5A, 0x5A, 0x3C],
  drop:        [0x08, 0x18, 0x1C, 0x3E, 0x3E, 0x7F, 0x7F, 0x3E],
  wifi:        [0x3C, 0x42, 0x81, 0x3C, 0x42, 0x18, 0x18, 0x00],
  battery:     [0x7E, 0x42, 0x5B, 0x5B, 0x5B, 0x5B, 0x42, 0x7E],
  warning:     [0x18, 0x18, 0x3C, 0x24, 0x66, 0x7E, 0xE7, 0xFF],
  heart:       [0x66, 0xFF, 0xFF, 0xFF, 0x7E, 0x3C, 0x18, 0x00],
  sun:         [0x91, 0x42, 0x18, 0x3C, 0x3C, 0x18, 0x42, 0x89],
  bell:        [0x18, 0x3C, 0x3C, 0x3C, 0x7E, 0xFF, 0x00, 0x18],
  check:       [0x00, 0x01, 0x03, 0x86, 0xCC, 0x78, 0x30, 0x00],
  arrow_up:    [0x18, 0x3C, 0x7E, 0xFF, 0x18, 0x18, 0x18, 0x18],
  arrow_down:  [0x18, 0x18, 0x18, 0x18, 0xFF, 0x7E, 0x3C, 0x18],
};

/** Ms between two samples of a graph (the sketch samples at the same rate). */
export const GRAPH_STEP_MS = 250;

/** The 8 bars of the colour-bar test pattern. */
export const COLOR_BARS = ['#FFFFFF', '#FFFF00', '#00FFFF', '#00FF00', '#FF00FF', '#FF0000', '#0000FF', '#000000'];

/** A pixel colour as stored: RGB565 on colour panels, 0/1 (dark/light) on mono and e-paper. */
const store = (panel: PanelInfo, rgb: [number, number, number]) => {
  if (panel.color === 'rgb565') return rgb565(rgb);
  // Same rule as the sketch: light when (r*3 + g*6 + b) / 10 >= 128.
  return (rgb[0] * 3 + rgb[1] * 6 + rgb[2]) / 10 >= 128 ? 1 : 0;
};

/** Integer hue (0-255) → RGB, as the sketch computes it for the rainbow gradient. */
export function hueRgb(h: number): [number, number, number] {
  const r = h & 255;
  const seg = Math.floor(r / 43);
  const f = (r - seg * 43) * 6;
  const q = 255 - f;
  switch (seg) {
    case 0: return [255, f, 0];
    case 1: return [q, 255, 0];
    case 2: return [0, 255, f];
    case 3: return [0, q, 255];
    case 4: return [f, 0, 255];
    default: return [255, 0, q];
  }
}

/** A triangle wave between 0 and `len` (the bouncing ball's path). */
const tri = (p: number, len: number) => (len <= 0 ? 0 : len - Math.abs((((p % (2 * len)) + 2 * len) % (2 * len)) - len));

export class Framebuffer {
  readonly w: number;
  readonly h: number;
  readonly px: Uint16Array;
  constructor(readonly panel: PanelInfo, readonly rotation: number) {
    [this.w, this.h] = rotatedSize(panel, rotation);
    this.px = new Uint16Array(this.w * this.h);
  }

  pixel(x: number, y: number, c: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }
  fillRect(x: number, y: number, w: number, h: number, c: number) {
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) this.px[j * this.w + i] = c;
  }
  vline(x: number, y: number, h: number, c: number) {
    this.fillRect(x, y, 1, h, c);
  }
  hline(x: number, y: number, w: number, c: number) {
    this.fillRect(x, y, w, 1, c);
  }
  drawRect(x: number, y: number, w: number, h: number, c: number) {
    this.hline(x, y, w, c);
    this.hline(x, y + h - 1, w, c);
    this.vline(x, y, h, c);
    this.vline(x + w - 1, y, h, c);
  }
  /** Adafruit GFX writeLine (Bresenham). */
  line(x0: number, y0: number, x1: number, y1: number, c: number) {
    const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (steep) [x0, y0, x1, y1] = [y0, x0, y1, x1];
    if (x0 > x1) [x0, x1, y0, y1] = [x1, x0, y1, y0];
    const dx = x1 - x0;
    const dy = Math.abs(y1 - y0);
    let err = Math.trunc(dx / 2);
    const ystep = y0 < y1 ? 1 : -1;
    for (; x0 <= x1; x0++) {
      if (steep) this.pixel(y0, x0, c);
      else this.pixel(x0, y0, c);
      err -= dy;
      if (err < 0) {
        y0 += ystep;
        err += dx;
      }
    }
  }
  /** Adafruit GFX drawCircle (midpoint). */
  circle(x0: number, y0: number, r: number, c: number) {
    let f = 1 - r;
    let ddx = 1;
    let ddy = -2 * r;
    let x = 0;
    let y = r;
    this.pixel(x0, y0 + r, c);
    this.pixel(x0, y0 - r, c);
    this.pixel(x0 + r, y0, c);
    this.pixel(x0 - r, y0, c);
    while (x < y) {
      if (f >= 0) {
        y--;
        ddy += 2;
        f += ddy;
      }
      x++;
      ddx += 2;
      f += ddx;
      for (const [a, b] of [[x, y], [-x, y], [x, -y], [-x, -y], [y, x], [-y, x], [y, -x], [-y, -x]]) this.pixel(x0 + a, y0 + b, c);
    }
  }
  /** Adafruit GFX fillCircle: a centre line, then fillCircleHelper(corners 3, delta 0). */
  fillCircle(x0: number, y0: number, r: number, c: number) {
    this.vline(x0, y0 - r, 2 * r + 1, c);
    let f = 1 - r;
    let ddx = 1;
    let ddy = -2 * r;
    let x = 0;
    let y = r;
    let px = x;
    let py = y;
    const delta = 1;
    while (x < y) {
      if (f >= 0) {
        y--;
        ddy += 2;
        f += ddy;
      }
      x++;
      ddx += 2;
      f += ddx;
      if (x < y + 1) {
        this.vline(x0 + x, y0 - y, 2 * y + delta, c);
        this.vline(x0 - x, y0 - y, 2 * y + delta, c);
      }
      if (y !== py) {
        this.vline(x0 + py, y0 - px, 2 * px + delta, c);
        this.vline(x0 - py, y0 - px, 2 * px + delta, c);
        py = y;
      }
      px = x;
    }
  }
  /** Text in the 5x7 font, `size` times bigger, with "\n" for new lines. */
  text(x: number, y: number, s: string, size: number, c: number) {
    let cx = x;
    let cy = y;
    for (const ch of s) {
      if (ch === '\n') {
        cx = x;
        cy += CELL_H * size;
        continue;
      }
      const code = glyphCode(ch);
      for (let col = 0; col < GLYPH_W; col++)
        for (let row = 0; row < GLYPH_H; row++) if (glyphPixel(code, col, row)) this.fillRect(cx + col * size, cy + row * size, size, size, c);
      cx += CELL_W * size;
    }
  }

  /** RGBA for a canvas, in the panel's native orientation (what the glass shows). */
  toRgba(native = false): Uint8ClampedArray {
    const W = native ? this.panel.widthPx : this.w;
    const H = native ? this.panel.heightPx : this.h;
    const out = new Uint8ClampedArray(W * H * 4);
    const ink = parseColor(this.panel.ink);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // Native pixel (x, y) shows the logical pixel GFX setRotation maps to it.
        let lx = x;
        let ly = y;
        if (native) {
          const r = this.rotation & 3;
          if (r === 1) [lx, ly] = [y, this.panel.widthPx - 1 - x];
          else if (r === 2) [lx, ly] = [this.panel.widthPx - 1 - x, this.panel.heightPx - 1 - y];
          else if (r === 3) [lx, ly] = [this.panel.heightPx - 1 - y, x];
        }
        const v = this.px[ly * this.w + lx];
        const rgb: [number, number, number] =
          this.panel.color === 'rgb565' ? from565(v) : this.panel.color === 'mono' ? (v ? ink : [0, 0, 0]) : v ? [236, 236, 228] : [24, 24, 24];
        const i = (y * W + x) * 4;
        out[i] = rgb[0];
        out[i + 1] = rgb[1];
        out[i + 2] = rgb[2];
        out[i + 3] = 255;
      }
    }
    return out;
  }
}

/* ---------------- elements ---------------- */

function drawPattern(fb: Framebuffer, el: Extract<DisplayElement, { type: 'pattern' }>, ms: number) {
  const c = (hex: string) => store(fb.panel, parseColor(hex));
  const colors = el.colors.length ? el.colors : el.kind === 'colorbars' ? COLOR_BARS : ['#FFFFFF', '#000000'];
  const size = Math.max(1, Math.round(el.size));
  // Pixels moved so far: speed in px/s, integer like the sketch's (ms * speed) / 1000.
  const off = Math.floor((ms * Math.round(el.speed)) / 1000);
  const { x, y, w, h } = el;
  switch (el.kind) {
    case 'colorbars':
      for (let i = 0; i < w; i++) {
        const k = Math.floor((((i + off) % w) + w) % w * colors.length / w);
        fb.vline(x + i, y, h, c(colors[k]));
      }
      return;
    case 'checker':
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) fb.pixel(x + i, y + j, c(colors[(Math.floor((i + off) / size) + Math.floor(j / size)) % 2 === 0 ? 0 : 1 % colors.length]));
      return;
    case 'gradient':
      for (let i = 0; i < w; i++) {
        const p = Math.floor(((((i + off) % w) + w) % w) * 255 / Math.max(1, w - 1));
        if (fb.panel.color === 'rgb565' && el.colors.length < 2) fb.vline(x + i, y, h, store(fb.panel, hueRgb(p)));
        else {
          const a = parseColor(colors[0]);
          const b = parseColor(colors[1 % colors.length]);
          // Math.trunc: C integer division rounds toward zero.
          fb.vline(x + i, y, h, store(fb.panel, [0, 1, 2].map((k) => a[k] + Math.trunc(((b[k] - a[k]) * p) / 255)) as [number, number, number]));
        }
      }
      return;
    case 'grid':
      fb.fillRect(x, y, w, h, c(colors[1 % colors.length]));
      for (let i = 0; i < w; i++) if ((i + off) % size === 0) fb.vline(x + i, y, h, c(colors[0]));
      for (let j = 0; j < h; j++) if (j % size === 0) fb.hline(x, y + j, w, c(colors[0]));
      return;
    case 'stripes':
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) fb.pixel(x + i, y + j, c(colors[Math.floor((((i + j + off) % (2 * size)) + 2 * size) % (2 * size) / size) % colors.length]));
      return;
    case 'scroll':
      for (let j = 0; j < h; j++) fb.hline(x, y + j, w, c(colors[Math.floor((((j + off) % (2 * size)) + 2 * size) % (2 * size) / size) % colors.length]));
      return;
    case 'rings': {
      fb.fillRect(x, y, w, h, c(colors[1 % colors.length]));
      const cx = x + Math.floor(w / 2);
      const cy = y + Math.floor(h / 2);
      const maxR = Math.floor(Math.min(w, h) / 2) - 1;
      for (let r = off % size; r <= maxR; r += size) if (r > 0) fb.circle(cx, cy, r, c(colors[0]));
      return;
    }
    case 'bounce': {
      fb.fillRect(x, y, w, h, c(colors[1 % colors.length]));
      const r = size;
      const bx = x + r + Math.floor(tri(off, w - 1 - 2 * r));
      const by = y + r + Math.floor(tri(Math.floor((off * 7) / 10), h - 1 - 2 * r));
      fb.fillCircle(bx, by, r, c(colors[0]));
      return;
    }
    case 'fill': {
      const period = Math.max(100, size * 100);
      fb.fillRect(x, y, w, h, c(colors[Math.floor(ms / period) % colors.length]));
      return;
    }
  }
}

export interface SimState {
  screen: string;
  enteredAt: number;
}

/** Runs a spec over time: which screen shows, the values, and the frame at any moment. */
export class DisplaySim {
  state: SimState;
  constructor(
    readonly spec: DisplaySpec,
    readonly panel: PanelInfo,
    /** values set by hand in the studio (sliders) override the simulation */
    public overrides: Record<string, number> = {},
  ) {
    this.state = { screen: spec.start, enteredAt: 0 };
  }

  values(ms: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const v of this.spec.vars) out[v.name] = v.name in this.overrides ? this.overrides[v.name] : varValue(v, ms);
    return out;
  }

  /** Follow the screen changes up to time `ms` (call with increasing times). */
  advance(ms: number) {
    for (let guard = 0; guard < 16; guard++) {
      const vals = this.values(ms);
      const tr = this.spec.transitions.find(
        (x) => x.from === this.state.screen && ((x.afterMs > 0 && ms - this.state.enteredAt >= x.afterMs) || (x.when.trim() && testCondition(x.when, vals))),
      );
      if (!tr || tr.to === this.state.screen) return;
      // A timed change happens exactly at its time, so the sketch and the app switch on the same ms.
      const at = tr.afterMs > 0 && !(tr.when.trim() && testCondition(tr.when, vals)) ? this.state.enteredAt + tr.afterMs : ms;
      this.state = { screen: tr.to, enteredAt: at };
    }
  }

  /** Draw the current screen at time `ms` into `fb`. */
  draw(fb: Framebuffer, ms: number) {
    const screen = this.spec.screens.find((s) => s.id === this.state.screen) ?? this.spec.screens[0];
    const st = (hex: string) => store(this.panel, parseColor(hex));
    fb.fillRect(0, 0, fb.w, fb.h, st(screen?.background ?? '#000000'));
    if (!screen) return;
    const vals = this.values(ms);
    for (const el of screen.elements) {
      if (el.visibleIf.trim() && !testCondition(el.visibleIf, vals)) continue;
      if (el.blinkMs > 0 && Math.floor(ms / el.blinkMs) % 2 === 1) continue;
      switch (el.type) {
        case 'text': {
          const s = formatText(el.text, this.spec.vars, vals);
          const size = Math.max(1, Math.round(el.size));
          const lines = s.split('\n');
          lines.forEach((ln, i) => {
            const wPx = ln.length * CELL_W * size - size;
            const x0 = el.align === 'center' ? el.x - Math.floor(wPx / 2) : el.align === 'right' ? el.x - wPx : el.x;
            fb.text(x0, el.y + i * CELL_H * size, ln, size, st(el.color));
          });
          break;
        }
        case 'rect':
          if (el.fill) fb.fillRect(el.x, el.y, el.w, el.h, st(el.color));
          else fb.drawRect(el.x, el.y, el.w, el.h, st(el.color));
          break;
        case 'line':
          fb.line(el.x, el.y, el.x2, el.y2, st(el.color));
          break;
        case 'circle':
          if (el.fill) fb.fillCircle(el.x, el.y, el.r, st(el.color));
          else fb.circle(el.x, el.y, el.r, st(el.color));
          break;
        case 'bar': {
          const v = vals[el.value] ?? 0;
          const frac = Math.max(0, Math.min(1, (v - el.min) / (el.max - el.min || 1)));
          fb.drawRect(el.x, el.y, el.w, el.h, st(el.color));
          if (el.vertical) {
            const fill = Math.round((el.h - 4) * frac);
            fb.fillRect(el.x + 2, el.y + el.h - 2 - fill, el.w - 4, fill, st(el.color));
          } else fb.fillRect(el.x + 2, el.y + 2, Math.round((el.w - 4) * frac), el.h - 4, st(el.color));
          break;
        }
        case 'graph': {
          fb.drawRect(el.x, el.y, el.w, el.h, st(el.color));
          const n = Math.max(2, el.w - 2);
          const v = this.spec.vars.find((x) => x.name === el.value);
          let prev: [number, number] | null = null;
          const now = Math.floor(ms / GRAPH_STEP_MS);
          for (let i = 0; i < n; i++) {
            const k = now - (n - 1 - i);
            if (k < 0) continue;
            const val = v ? (v.name in this.overrides ? this.overrides[v.name] : varValue(v, k * GRAPH_STEP_MS)) : 0;
            const frac = Math.max(0, Math.min(1, (val - el.min) / (el.max - el.min || 1)));
            const pt: [number, number] = [el.x + 1 + i, el.y + el.h - 2 - Math.round(frac * (el.h - 3))];
            if (prev) fb.line(prev[0], prev[1], pt[0], pt[1], st(el.color));
            prev = pt;
          }
          break;
        }
        case 'icon': {
          const bits = ICON_BITS[el.name] ?? ICON_BITS.warning;
          const s = Math.max(1, Math.round(el.scale));
          for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) if ((bits[row] >> (7 - col)) & 1) fb.fillRect(el.x + col * s, el.y + row * s, s, s, st(el.color));
          break;
        }
        case 'pattern':
          drawPattern(fb, el, ms);
          break;
      }
    }
  }

  /** Advance to `ms` and draw: one frame. */
  frame(fb: Framebuffer, ms: number) {
    this.advance(ms);
    this.draw(fb, ms);
  }
}
