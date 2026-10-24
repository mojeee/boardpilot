// Where things are on a part's 3D model, from its definition (model.shape, size, kind,
// components, display). Pure maths shared by the 3D view, the display texture hook and tests.
// Part frame: x along the pin row, z away from it (the pins are on the -z edge), y up from the
// bottom of the part, mm, (0, 0) the centre of the footprint.

import type { PartComponent, PartDef, PartKind } from './types';

export const PCB_T = 1.6;
/** Standard 2.54 mm male header: plastic spacer height and mating pin length above it. */
export const SPACER_H = 2.5;
export const PIN_ABOVE = 6;
/** Distance from the pin edge of the PCB to the header row. */
export const HEADER_INSET = 1.3;

/** Shapes whose pins stick out of the body as legs or wires instead of a header on a PCB. */
const LEGGED = new Set(['led', 'button', 'pot', 'motor']);

/** The body variant: model.kind, or the usual one for the shape. */
export function partKind(def: PartDef): PartKind | undefined {
  if (def.model.kind) return def.model.kind;
  switch (def.model.shape) {
    case 'led':
      return 'led';
    case 'button':
      return 'tactile';
    case 'chip':
      return def.pins.length <= 3 ? 'to92' : 'dip';
    case 'relay':
      return 'relay-module';
    default:
      return undefined;
  }
}

/** The part has a PCB with a pin header on it (breakouts, modules, displays, relay boards). */
export function hasHeader(def: PartDef): boolean {
  const s = def.model.shape;
  if (s === 'breakout' || s === 'module' || s === 'oled') return partKind(def) !== 'box';
  return s === 'relay' && partKind(def) === 'relay-module';
}

/** Top of the PCB above the part's bottom. */
export function pcbTop(def: PartDef): number {
  const [, , h] = def.model.size;
  return def.model.shape === 'breakout' ? Math.min(h, PCB_T) || PCB_T : PCB_T;
}

/**
 * Where a wire plugs onto a pin, part frame: the top of the header spacer for parts with a header
 * (the plug slides down the pin onto it), the end of the leg for the others.
 */
export function partPinPoint(def: PartDef, index: number): [number, number, number] {
  const n = def.pins.length;
  const [, d, h] = def.model.size;
  const x = (index - (n - 1) / 2) * 2.54;
  if (hasHeader(def)) return [x, pcbTop(def) + SPACER_H, -(d / 2 - HEADER_INSET)];
  if (def.model.shape === 'relay') return [x, 0.8, -(d / 2 + 1.5)];
  const edge = LEGGED.has(def.model.shape) ? d / 2 + 1.5 : d / 2 - HEADER_INSET;
  // Sealed boxes: the pins come out of a connector low on the body.
  return [x, partKind(def) === 'box' ? Math.min(h / 2, 3) : 0.8, -edge];
}

export interface Rect2 {
  /** centre, mm */
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface DisplayLayout {
  /** glass (or LED block / LCD window) */
  glass: Rect2;
  /** where the pixels are */
  active: Rect2;
  /** top of the glass above the part's bottom */
  top: number;
}

/** Room the header takes at the pin edge (spacers plus a margin). */
const HEADER_BAND = 4.2;

/**
 * Glass and active area of a display part: the glass is centred across, in the space below the
 * header; the active area sits in the glass at display.centerMm (or centred).
 */
export function displayLayout(def: PartDef): DisplayLayout | null {
  const disp = def.display;
  if (!disp) return null;
  const [w, d] = def.model.size;
  const border = disp.color === 'led' ? 0.8 : disp.color === 'lcd' ? 3 : 2.2;
  // A panel larger than the module outline in the data keeps its aspect: scale it down to fit.
  const maxW = w - 0.4;
  const maxD = d - HEADER_BAND - 0.4;
  const k = Math.min(1, maxW / disp.activeMm[0], maxD / disp.activeMm[1]);
  const aw = disp.activeMm[0] * k;
  const ad = disp.activeMm[1] * k;
  const gw = Math.min(disp.glassMm?.[0] ?? aw + border * 2, maxW);
  const gd = Math.min(disp.glassMm?.[1] ?? ad + border * 2, maxD);
  const zMin = -d / 2 + HEADER_BAND;
  const gz = (zMin + d / 2) / 2;
  const glass: Rect2 = { x: 0, z: gz, w: Math.max(gw, Math.min(aw, w - 0.4)), d: Math.max(gd, Math.min(ad, d - HEADER_BAND)) };
  const [cx, cz] = disp.centerMm ?? [glass.x, glass.z];
  const active: Rect2 = { x: cx, z: cz, w: Math.min(aw, glass.w), d: Math.min(ad, glass.d) };
  const thick = disp.color === 'lcd' ? 7 : disp.color === 'led' ? 6 : disp.color === 'epaper' ? 1 : def.model.size[2] >= 5 ? 2.6 : 1.4;
  return { glass, active, top: PCB_T + thick };
}

/** Chip package size (body) for a breakout without components: a 3 × 3 mm QFN or LGA. */
export function defaultComponents(def: PartDef): PartComponent[] {
  const [w, d, h] = def.model.size;
  const s = def.model.shape;
  if (s === 'breakout') {
    const size = Math.max(2, Math.min(4, w * 0.22, d * 0.22));
    return [
      { type: 'chip', at: [0, 1], size: [size, size, 0.9], package: 'qfn', label: chipLabel(def) },
      { type: 'smd', at: [-w * 0.28, d * 0.12], size: [1.6, 0.8], count: 2, rot: true },
      { type: 'smd', at: [w * 0.28, d * 0.12], size: [1.0, 0.5], count: 2, rot: true },
    ];
  }
  if (s === 'module' && partKind(def) !== 'box') {
    // A generic module: its electronics under a block, or a chip on a thin board.
    if (h > 4)
      return [
        { type: 'block', at: [0, 1.5], size: [w * 0.6, Math.max(3, d * 0.5), h - PCB_T], label: chipLabel(def) },
        { type: 'smd', at: [-w * 0.38, d * 0.25], size: [1.6, 0.8], count: 2, rot: true },
      ];
    return [{ type: 'chip', at: [0, 1], size: [Math.min(6, w * 0.3), Math.min(6, d * 0.3), 1], package: 'qfn', label: chipLabel(def) }];
  }
  return [];
}

/** The chip's part number from the part name ("GY-BME280 breakout" → "BME280"). */
export function chipLabel(def: PartDef): string {
  const words = def.name.replace(/\(.*?\)/g, ' ').split(/[\s/]+/).filter(Boolean);
  const code = words.find((x) => /\d/.test(x) && /[A-Z]/.test(x)) ?? words[0] ?? '';
  return code.replace(/^GY-/, '').slice(0, 12);
}

/** The name printed on the PCB. */
export function silkName(def: PartDef): string {
  if (def.model.silk) return def.model.silk;
  return (def.name.split(/[ (]/)[0] ?? def.id).slice(0, 14);
}

/** Every part component, data or default. */
export function partComponents(def: PartDef): PartComponent[] {
  return def.model.components?.length ? def.model.components : defaultComponents(def);
}
