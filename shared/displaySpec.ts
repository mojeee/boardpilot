// Display Studio: what a display module shows, as data. A spec has screens (text, values, bars,
// graphs, icons, shapes and test patterns), the order and timing between them, and the values it
// shows (simulated in the app; read from the real parts in the generated code). The renderer
// (shared/displayRender.ts) draws it pixel-exact at the panel's resolution, and the code generator
// (shared/displayCode.ts) writes the same drawing for the real display.

import type { PartDef } from './types';
import { t } from './i18n';

/* ---------------- the panel ---------------- */

export type PanelColor = 'mono' | 'rgb565' | 'epaper';

export interface PanelInfo {
  widthPx: number;
  heightPx: number;
  color: PanelColor;
  round: boolean;
  /** the controller chip, e.g. "SSD1306", "ST7789" */
  controller: string;
  /** colour of lit pixels on a mono panel */
  ink: string;
}


const CONTROLLERS = ['SSD1306', 'SH1106', 'SSD1309', 'SSD1351', 'SSD1327', 'ST7789', 'ST7735', 'ST7796', 'ILI9341', 'ILI9488', 'GC9A01', 'PCD8544', 'ST7920', 'SSD1680', 'UC8151', 'IL3820'];

/**
 * The pixel panel of a part, or null when it is not a pixel display (a 16x2 character LCD, a
 * 7-segment module). Uses the part's `display` field when it has one, otherwise the resolution and
 * controller in its name (e.g. "SSD1306 OLED 128x64").
 */
export function panelOf(def: PartDef): PanelInfo | null {
  const text = `${def.id} ${def.name} ${def.keywords.join(' ')}`;
  const controller = CONTROLLERS.find((c) => text.toUpperCase().includes(c)) ?? (/nokia\s*5110/i.test(text) ? 'PCD8544' : '');
  const d = def.display;
  let w = d?.widthPx;
  let h = d?.heightPx;
  if (!w || !h) {
    const m = /(\d{2,3})\s*[x×]\s*(\d{2,3})/.exec(def.name) ?? /(\d{2,3})\s*[x×]\s*(\d{2,3})/.exec(def.keywords.join(' '));
    if (m) [w, h] = [Number(m[1]), Number(m[2])];
    else if (controller === 'PCD8544') [w, h] = [84, 48];
  }
  // Character LCDs and LED modules are not pixel panels the studio draws (yet).
  if (!w || !h || def.category !== 'display' || d?.chars || d?.color === 'led' || /lcd1602|lcd2004|7seg|max7219/i.test(def.id)) return null;
  const epaper = /e-?paper|e-?ink|epd/i.test(text);
  // SSD1351 is a colour OLED; SSD1327 has 16 greys, shown here as on/off (the closest the studio draws).
  const mono = controller !== 'SSD1351' && /oled|ssd13|sh1106|nokia|pcd8544|st7920|12864/i.test(text);
  // The part file says what a pixel is; the studio draws 18-bit panels at 16 bits (what Adafruit GFX
  // sends), 16-grey OLEDs and graphic STN LCDs as on/off pixels.
  const fromFile: PanelColor | undefined = d ? (d.color === 'rgb565' || d.color === 'rgb666' ? 'rgb565' : d.color === 'epaper' ? 'epaper' : 'mono') : undefined;
  const color: PanelColor = fromFile ?? (epaper ? 'epaper' : mono ? 'mono' : 'rgb565');
  // OLED modules come with white, blue or yellow-blue glass; white is the common one. LCDs: the file's tint.
  const ink = color === 'mono' ? (d?.tint && d.color !== 'mono' ? d.tint : /blue/i.test(text) ? '#5AC8FA' : /yellow/i.test(text) ? '#FFD84A' : '#E8F1FF') : '#FFFFFF';
  return { widthPx: w, heightPx: h, color, round: d?.round ?? ((def.model as { outline?: string }).outline === 'round' || /\bround\b|circular/i.test(text)), controller: controller || 'unknown', ink };
}

/* ---------------- the spec ---------------- */

/** A value the display shows. In the app it is simulated; `from` says what gives it on the real board. */
export type VarSource =
  | { sim: 'wave'; min: number; max: number; periodS: number }
  | { sim: 'ramp'; min: number; max: number; periodS: number }
  | { sim: 'steps'; values: number[]; everyS: number }
  | { sim: 'random'; min: number; max: number; everyS: number };

export interface DisplayVar {
  name: string;
  source: VarSource;
  unit: string;
  digits: number;
  /** what provides it on the real board, e.g. "bme1.temperature" (a part in the drawing) or "" */
  from: string;
}

export type PatternKind = 'colorbars' | 'checker' | 'gradient' | 'grid' | 'stripes' | 'bounce' | 'scroll' | 'rings' | 'fill';

interface ElBase {
  /** shown only while this condition holds, e.g. "temp > 30" ("" = always) */
  visibleIf: string;
  /** blink with this half-period in ms (0 = steady) */
  blinkMs: number;
}

export type DisplayElement = ElBase &
  (
    | { type: 'text'; x: number; y: number; text: string; size: number; color: string; align: 'left' | 'center' | 'right' }
    | { type: 'rect'; x: number; y: number; w: number; h: number; color: string; fill: boolean }
    | { type: 'line'; x: number; y: number; x2: number; y2: number; color: string }
    | { type: 'circle'; x: number; y: number; r: number; color: string; fill: boolean }
    | { type: 'bar'; x: number; y: number; w: number; h: number; value: string; min: number; max: number; color: string; vertical: boolean }
    | { type: 'graph'; x: number; y: number; w: number; h: number; value: string; min: number; max: number; color: string }
    /** a dial: `ticks` scale marks and a needle, angles in degrees clockwise from 12 o'clock */
    | { type: 'gauge'; x: number; y: number; r: number; value: string; min: number; max: number; color: string; startDeg: number; endDeg: number; ticks: number }
    | { type: 'icon'; x: number; y: number; name: IconName; scale: number; color: string }
    | { type: 'pattern'; x: number; y: number; w: number; h: number; kind: PatternKind; size: number; speed: number; colors: string[] }
  );

export type IconName = 'thermometer' | 'drop' | 'wifi' | 'battery' | 'warning' | 'heart' | 'sun' | 'bell' | 'check' | 'arrow_up' | 'arrow_down';
export const ICONS: IconName[] = ['thermometer', 'drop', 'wifi', 'battery', 'warning', 'heart', 'sun', 'bell', 'check', 'arrow_up', 'arrow_down'];

export interface DisplayScreen {
  id: string;
  background: string;
  elements: DisplayElement[];
}

export interface DisplayTransition {
  from: string;
  to: string;
  /** go after this many ms on `from` (0 = only on the condition) */
  afterMs: number;
  /** or as soon as this holds, e.g. "temp > 30" ("" = none) */
  when: string;
}

export interface DisplaySpec {
  title: string;
  /** scene part id of the display, e.g. "tft1" */
  part: string;
  /** 0-3, quarter turns as in Adafruit GFX setRotation */
  rotation: number;
  vars: DisplayVar[];
  screens: DisplayScreen[];
  start: string;
  transitions: DisplayTransition[];
}

/* ---------------- colours ---------------- */

const NAMED: Record<string, string> = {
  black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#00FF00', blue: '#0000FF', yellow: '#FFFF00', cyan: '#00FFFF',
  magenta: '#FF00FF', orange: '#FFA500', gray: '#808080', grey: '#808080', darkgray: '#404040', navy: '#000080', purple: '#800080',
};

/** "#RRGGBB" or a colour name → [r, g, b]; unknown → white. */
export function parseColor(c: string): [number, number, number] {
  const s = (NAMED[c.trim().toLowerCase()] ?? c).trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** RGB888 → RGB565, the 16-bit colour TFT controllers take. */
export const rgb565 = ([r, g, b]: [number, number, number]) => ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);

/** RGB565 → RGB888 as the panel shows it (the low bits repeat the high ones, like most controllers). */
export function from565(c: number): [number, number, number] {
  const r = (c >> 11) & 31;
  const g = (c >> 5) & 63;
  const b = c & 31;
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
}

/* ---------------- values and conditions ---------------- */

/** Deterministic pseudo-random in [0, 1) for a step index, the same in the app and the sketch. */
export function hash01(n: number): number {
  let x = (Math.imul(n | 0, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0;
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

/** A simulated value at time `ms`. */
export function varValue(v: DisplayVar, ms: number): number {
  const s = ms / 1000;
  const src = v.source;
  switch (src.sim) {
    case 'wave':
      return src.min + ((src.max - src.min) * (1 - Math.cos((2 * Math.PI * s) / Math.max(0.1, src.periodS)))) / 2;
    case 'ramp':
      return src.min + ((src.max - src.min) * (s % Math.max(0.1, src.periodS))) / Math.max(0.1, src.periodS);
    case 'steps':
      return src.values.length ? src.values[Math.floor(s / Math.max(0.1, src.everyS)) % src.values.length] : 0;
    case 'random':
      return src.min + (src.max - src.min) * hash01(Math.floor(s / Math.max(0.1, src.everyS)));
  }
}

const ATOM = /^([A-Za-z_]\w*)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?)$/;
const FLAG = /^!?[A-Za-z_]\w*$/;

/** The parts of a condition: "a > 1 && b < 2 || c" → [["a > 1", "b < 2"], ["c"]] (|| of &&), or null if not understood. */
export function parseCondition(cond: string): string[][] | null {
  const ors = cond.split('||').map((o) => o.split('&&').map((a) => a.trim()));
  return ors.every((and) => and.every((a) => ATOM.test(a) || FLAG.test(a))) ? ors : null;
}

/** Names of the values a condition uses. */
export const conditionVars = (cond: string): string[] => (parseCondition(cond) ?? []).flat().map((a) => /^!?([A-Za-z_]\w*)/.exec(a)![1]);

/**
 * The condition language of a spec: "temp > 30", "hum <= 40.5", "alarm" (non-zero), "!alarm",
 * joined with && and || (&& binds first, no brackets). Anything else is false (and checkSpec says so).
 */
export function testCondition(cond: string, vals: Record<string, number>): boolean {
  const c = cond.trim();
  if (!c) return true;
  const ors = parseCondition(c);
  if (!ors) return false;
  return ors.some((and) => and.every((a) => testAtom(a, vals)));
}

function testAtom(c: string, vals: Record<string, number>): boolean {
  const m = ATOM.exec(c);
  if (m) {
    const a = vals[m[1]] ?? 0;
    const b = Number(m[3]);
    return { '<': a < b, '<=': a <= b, '>': a > b, '>=': a >= b, '==': a === b, '!=': a !== b }[m[2] as '<'];
  }
  const neg = c.startsWith('!');
  const v = vals[c.replace(/^!/, '')] ?? 0;
  return neg ? v === 0 : v !== 0;
}

/** "{temp} °C" with the variable's digits → "23.4 °C". */
export function formatText(text: string, vars: DisplayVar[], vals: Record<string, number>): string {
  return text.replace(/\{([A-Za-z_]\w*)\}/g, (all, name: string) => {
    const v = vars.find((x) => x.name === name);
    return v ? (vals[name] ?? 0).toFixed(Math.max(0, Math.min(3, v.digits))) : all;
  });
}

/* ---------------- checks ---------------- */

export interface SpecProblem {
  severity: 'error' | 'warning';
  message: string;
}

/** Width and height in pixels after rotation. */
export function rotatedSize(panel: PanelInfo, rotation: number): [number, number] {
  return rotation % 2 ? [panel.heightPx, panel.widthPx] : [panel.widthPx, panel.heightPx];
}

/** What is wrong with a spec on a panel, in plain words: the assistant fixes errors before answering. */
export function checkSpec(spec: DisplaySpec, panel: PanelInfo): SpecProblem[] {
  const out: SpecProblem[] = [];
  const err = (message: string) => out.push({ severity: 'error', message });
  const warn = (message: string) => out.push({ severity: 'warning', message });
  const [W, H] = rotatedSize(panel, spec.rotation);
  const ids = new Set(spec.screens.map((s) => s.id));
  const varNames = new Set(spec.vars.map((v) => v.name));
  if (!spec.screens.length) err(t('The display has no screens.'));
  if (!ids.has(spec.start)) err(t('The first screen “{id}” does not exist.', { id: spec.start }));
  for (const tr of spec.transitions) {
    if (!ids.has(tr.from) || !ids.has(tr.to)) err(t('A change of screen goes from “{from}” to “{to}”, and one of them does not exist.', { from: tr.from, to: tr.to }));
    if (!tr.afterMs && !tr.when.trim()) err(t('The change from “{from}” to “{to}” has neither a time nor a condition.', { from: tr.from, to: tr.to }));
  }
  const usesVar = (s: string) => [...s.matchAll(/\{([A-Za-z_]\w*)\}/g)].map((m) => m[1]);
  const badCond = (where: string, c: string) => {
    if (c.trim() && !parseCondition(c.trim())) err(t('{where}: the condition “{cond}” is not understood. Use forms like temp > 30, alarm, !alarm, joined with && or ||.', { where, cond: c }));
  };
  for (const tr of spec.transitions) badCond(`${tr.from} → ${tr.to}`, tr.when);
  for (const sc of spec.screens) {
    for (const [i, el] of sc.elements.entries()) {
      const where = `${sc.id} #${i + 1} (${el.type})`;
      badCond(where, el.visibleIf);
      for (const name of [...('text' in el ? usesVar(el.text) : []), ...('value' in el ? [el.value] : []), ...conditionVars(el.visibleIf)]) {
        if (name && !varNames.has(name)) err(t('{where} uses the value “{name}”, which is not defined.', { where, name }));
      }
      if (el.type === 'text') {
        const lines = el.text.split('\n');
        const wPx = Math.max(...lines.map((l) => l.length)) * 6 * el.size - el.size;
        const x0 = el.align === 'center' ? el.x - wPx / 2 : el.align === 'right' ? el.x - wPx : el.x;
        if (x0 < 0 || x0 + wPx > W || el.y < 0 || el.y + lines.length * 8 * el.size - el.size > H)
          warn(t('{where}: the text “{text}” goes past the {w}x{h} screen.', { where, text: el.text.slice(0, 24), w: W, h: H }));
      } else if (el.type === 'gauge') {
        if (el.x - el.r < 0 || el.y - el.r < 0 || el.x + el.r >= W || el.y + el.r >= H) warn(t('{where} goes past the {w}x{h} screen.', { where, w: W, h: H }));
      } else if ('w' in el && 'h' in el) {
        if (el.x < 0 || el.y < 0 || el.x + el.w > W || el.y + el.h > H) warn(t('{where} goes past the {w}x{h} screen.', { where, w: W, h: H }));
      }
      if (panel.color !== 'rgb565' && el.type === 'pattern' && (el.kind === 'colorbars' || el.kind === 'gradient'))
        warn(t('{where}: a {kind} pattern needs a colour screen; on this one it shows in two tones only.', { where, kind: el.kind }));
    }
  }
  if (panel.color === 'epaper' && spec.screens.some((s) => s.elements.some((e) => e.type === 'pattern' && e.speed > 0)))
    warn(t('E-paper takes seconds to refresh: moving patterns will not look smooth on the real panel.'));
  return out;
}

/* ---------------- normalising what the assistant sends ---------------- */

const num = (v: unknown, d: number, lo = -10000, hi = 10000) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const ELEMENT_TYPES = ['text', 'rect', 'line', 'circle', 'bar', 'graph', 'gauge', 'icon', 'pattern'];
const PATTERNS: PatternKind[] = ['colorbars', 'checker', 'gradient', 'grid', 'stripes', 'bounce', 'scroll', 'rings', 'fill'];

/** A spec from loose JSON (the assistant's tool input): defaults filled, numbers clamped, unknown types dropped. */
export function normalizeSpec(raw: unknown): DisplaySpec {
  const r = obj(raw);
  const vars: DisplayVar[] = arr(r.vars).map((x) => {
    const v = obj(x);
    const s = obj(v.source);
    const sim = s.sim === 'ramp' || s.sim === 'steps' || s.sim === 'random' ? s.sim : 'wave';
    const source: VarSource =
      sim === 'steps'
        ? { sim, values: arr(s.values).filter((n): n is number => typeof n === 'number').slice(0, 32), everyS: num(s.everyS, 2, 0.1, 3600) }
        : sim === 'random'
          ? { sim, min: num(s.min, 0), max: num(s.max, 100), everyS: num(s.everyS, 1, 0.1, 3600) }
          : { sim, min: num(s.min, 0), max: num(s.max, 100), periodS: num(s.periodS, 10, 0.1, 3600) };
    return { name: str(v.name, 'value').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'value', source, unit: str(v.unit), digits: Math.round(num(v.digits, 1, 0, 3)), from: str(v.from) };
  });
  const color = (v: unknown, d: string) => str(v, d) || d;
  const screens: DisplayScreen[] = arr(r.screens).map((x, i) => {
    const sc = obj(x);
    const elements = arr(sc.elements)
      .map((y) => obj(y))
      .filter((e) => ELEMENT_TYPES.includes(str(e.type)))
      .map((e): DisplayElement => {
        const base = { visibleIf: str(e.visibleIf), blinkMs: Math.round(num(e.blinkMs, 0, 0, 10000)) };
        const xy = { x: Math.round(num(e.x, 0)), y: Math.round(num(e.y, 0)) };
        const wh = { w: Math.round(num(e.w, 10, 0, 2000)), h: Math.round(num(e.h, 10, 0, 2000)) };
        switch (str(e.type)) {
          case 'text':
            return { ...base, type: 'text', ...xy, text: str(e.text), size: Math.round(num(e.size, 1, 1, 8)), color: color(e.color, '#FFFFFF'), align: e.align === 'center' || e.align === 'right' ? e.align : 'left' };
          case 'rect':
            return { ...base, type: 'rect', ...xy, ...wh, color: color(e.color, '#FFFFFF'), fill: e.fill === true };
          case 'line':
            return { ...base, type: 'line', ...xy, x2: Math.round(num(e.x2, 0)), y2: Math.round(num(e.y2, 0)), color: color(e.color, '#FFFFFF') };
          case 'circle':
            return { ...base, type: 'circle', ...xy, r: Math.round(num(e.r, 5, 0, 1000)), color: color(e.color, '#FFFFFF'), fill: e.fill === true };
          case 'bar':
            return { ...base, type: 'bar', ...xy, ...wh, value: str(e.value), min: num(e.min, 0), max: num(e.max, 100), color: color(e.color, '#FFFFFF'), vertical: e.vertical === true };
          case 'graph':
            return { ...base, type: 'graph', ...xy, ...wh, value: str(e.value), min: num(e.min, 0), max: num(e.max, 100), color: color(e.color, '#FFFFFF') };
          case 'gauge':
            return {
              ...base,
              type: 'gauge',
              ...xy,
              r: Math.round(num(e.r, 40, 4, 1000)),
              value: str(e.value),
              min: num(e.min, 0),
              max: num(e.max, 100),
              color: color(e.color, '#FFFFFF'),
              startDeg: num(e.startDeg, -120, -360, 360),
              endDeg: num(e.endDeg, 120, -360, 360),
              ticks: Math.round(num(e.ticks, 10, 0, 60)),
            };
          case 'icon':
            return { ...base, type: 'icon', ...xy, name: (ICONS as string[]).includes(str(e.name)) ? (str(e.name) as IconName) : 'warning', scale: Math.round(num(e.scale, 1, 1, 8)), color: color(e.color, '#FFFFFF') };
          default:
            return {
              ...base,
              type: 'pattern',
              ...xy,
              ...wh,
              kind: (PATTERNS as string[]).includes(str(e.kind)) ? (str(e.kind) as PatternKind) : 'colorbars',
              size: Math.round(num(e.size, 8, 1, 500)),
              // Patterns move one way only: the sketch's integer maths needs a non-negative offset.
              speed: Math.round(Math.abs(num(e.speed, 0, -2000, 2000))),
              colors: arr(e.colors).filter((c): c is string => typeof c === 'string').slice(0, 12),
            };
        }
      });
    return { id: str(sc.id, `screen${i + 1}`).replace(/[^A-Za-z0-9_-]/g, '_') || `screen${i + 1}`, background: color(sc.background, '#000000'), elements };
  });
  const transitions: DisplayTransition[] = arr(r.transitions).map((x) => {
    const tr = obj(x);
    return { from: str(tr.from), to: str(tr.to), afterMs: Math.round(num(tr.afterMs, 0, 0, 3600000)), when: str(tr.when) };
  });
  return {
    title: str(r.title, 'Display') || 'Display',
    part: str(r.part),
    rotation: Math.round(num(r.rotation, 0, 0, 3)),
    vars,
    screens,
    start: str(r.start) || screens[0]?.id || '',
    transitions,
  };
}
