// Board detail for the 3D view's "Full" setting, generated from the board file: the package of each
// chip (legs by package type, from the part number where the label names one), the small parts
// every design has next to its components (a series resistor per LED, decoupling capacitors per
// chip) and a few copper traces between the parts that are connected on every such board (USB →
// USB-serial chip → MCU, regulator → MCU, LEDs → MCU). These are drawn for looks; they are not a
// schematic and the app never states them as facts about a board.

import type { BoardComponent, BoardDef } from './types';
import { pinPositionMm, rectToMm } from './board';

export type ChipPackage = 'qfn' | 'lqfp' | 'soic' | 'dip' | 'sot223' | 'sot23' | 'module' | 'none';

/**
 * The package of a chip on the board. Part-number conventions: STM32 "…T6" is LQFP and "…U6" is
 * UFQFPN (ST part numbering), ATmega "-AU" is TQFP and "-PU" is DIP (Microchip ordering codes);
 * AMS1117 and NCP1117 are SOT-223, CP2102/CP2102N and ATmega16U2 are QFN (their datasheets).
 */
export function chipPackage(c: BoardComponent, board?: BoardDef): ChipPackage {
  if (c.package) return c.package;
  const l = (c.label ?? '').toUpperCase();
  switch (c.type) {
    case 'module':
      return 'module';
    case 'regulator':
      if (/AMS1117|NCP1117|LM1117|5V REG/.test(l)) return 'sot223';
      if (/SMPS|RT61|LD39|DFN/.test(l)) return 'qfn';
      return 'sot23';
    case 'bridge':
      if (/CH340|CH341/.test(l)) return 'soic';
      return 'qfn';
    case 'mcu':
      if (/STM32\w+T\d/.test(l)) return 'lqfp';
      if (/STM32\w+U\d/.test(l)) return 'qfn';
      if (/ATMEGA2560/.test(l)) return 'lqfp';
      if (/ATMEGA328P/.test(l)) return board?.id === 'arduino-uno-r3' ? 'dip' : 'lqfp';
      if (/IMX|I\.MX/.test(l)) return 'lqfp';
      return 'qfn';
    case 'chip':
      if (/FLASH|W25Q/.test(l)) return 'soic';
      if (/STM32\w+T\d/.test(l)) return 'lqfp';
      return 'qfn';
    default:
      return 'none';
  }
}

export interface Passive {
  kind: 'res' | 'cap';
  /** centre in board mm (x along the length, z across), size in mm */
  x: number;
  z: number;
  w: number;
  d: number;
  /** turned 90° */
  rot: boolean;
}

export interface Trace {
  /** points in board mm (x, z) */
  points: [number, number][];
}

/** A component's rectangle in board mm, centred coordinates. */
function box(board: BoardDef, c: BoardComponent) {
  const r = rectToMm(board, c.rect);
  return { x0: r.cx - r.w / 2, x1: r.cx + r.w / 2, z0: r.cz - r.h / 2, z1: r.cz + r.h / 2, cx: r.cx, cz: r.cz };
}

/** Everything a small part must stay clear of: the components and the pins (with a margin). */
function obstacles(board: BoardDef) {
  const rects = board.components.map((c) => box(board, c));
  const pins = board.pins.map((p) => {
    const [x, , z] = pinPositionMm(board, p);
    return { x0: x - 1.6, x1: x + 1.6, z0: z - 1.6, z1: z + 1.6, cx: x, cz: z };
  });
  return [...rects, ...pins];
}

const overlaps = (a: { x0: number; x1: number; z0: number; z1: number }, b: { x0: number; x1: number; z0: number; z1: number }) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/** Small resistors and capacitors next to the components that always have them. */
export function passivesFor(board: BoardDef): Passive[] {
  const { length: L, width: W } = board.pcbMm;
  const blocked = obstacles(board);
  const out: Passive[] = [];
  const free = (p: Passive) => {
    const r = { x0: p.x - (p.rot ? p.d : p.w) / 2 - 0.3, x1: p.x + (p.rot ? p.d : p.w) / 2 + 0.3, z0: p.z - (p.rot ? p.w : p.d) / 2 - 0.3, z1: p.z + (p.rot ? p.w : p.d) / 2 + 0.3 };
    if (r.x0 < -L / 2 + 0.8 || r.x1 > L / 2 - 0.8 || r.z0 < -W / 2 + 0.8 || r.z1 > W / 2 - 0.8) return false;
    return !blocked.some((b) => overlaps(r, b)) && !out.some((o) => overlaps(r, { x0: o.x - 1.2, x1: o.x + 1.2, z0: o.z - 1.2, z1: o.z + 1.2 }));
  };
  /** Try spots around a component, nearest side first; keep the first that is free. */
  const place = (c: BoardComponent, kind: Passive['kind'], n: number) => {
    const b = box(board, c);
    const [w, d] = kind === 'res' ? [1.6, 0.8] : [1.0, 0.5];
    let placed = 0;
    for (const gap of [1.2, 2.4, 3.6]) {
      const spots: [number, number, boolean][] = [
        [b.x1 + gap, b.cz, true],
        [b.x0 - gap, b.cz, true],
        [b.cx, b.z1 + gap, false],
        [b.cx, b.z0 - gap, false],
        [b.x1 + gap, b.z0 + 1.2, true],
        [b.x0 - gap, b.z1 - 1.2, true],
        [b.cx - 2, b.z1 + gap, false],
        [b.cx + 2, b.z0 - gap, false],
      ];
      for (const [x, z, rot] of spots) {
        if (placed >= n) return;
        const p: Passive = { kind, x, z, w, d, rot };
        if (free(p)) {
          out.push(p);
          placed++;
        }
      }
    }
  };
  for (const c of board.components) {
    if (c.type === 'led') place(c, 'res', 1);
    else if (c.type === 'mcu' || c.type === 'bridge') place(c, 'cap', 2);
    else if (c.type === 'regulator') place(c, 'cap', 2);
    else if (c.type === 'button') place(c, 'res', 1);
  }
  return out;
}

/** A few copper traces between parts that are connected on every such board. */
export function tracesFor(board: BoardDef): Trace[] {
  const find = (...types: BoardComponent['type'][]) => board.components.filter((c) => types.includes(c.type));
  const brain = find('mcu', 'module')[0];
  if (!brain) return [];
  const B = box(board, brain);
  const route = (c: BoardComponent, to = B): Trace => {
    const a = box(board, c);
    // From the side of the component that faces the target, out along x, then along z (one bend).
    const sx = to.cx > a.cx ? a.x1 : a.x0;
    const ex = to.cx > a.cx ? to.x0 : to.x1;
    const mid = (sx + ex) / 2;
    return { points: [[sx, a.cz], [mid, a.cz], [mid, to.cz + (a.cz - to.cz) * 0.3], [ex, to.cz + (a.cz - to.cz) * 0.3]] };
  };
  const out: Trace[] = [];
  const usb = find('usb')[0];
  const bridge = find('bridge')[0];
  if (usb && bridge) out.push(route(usb, box(board, bridge)));
  if (bridge) out.push(route(bridge));
  else if (usb) out.push(route(usb));
  for (const c of find('regulator', 'led', 'crystal', 'chip')) if (c !== brain) out.push(route(c));
  // Traces never leave the board.
  const { length: L, width: W } = board.pcbMm;
  return out.filter((tr) => tr.points.every(([x, z]) => Math.abs(x) < L / 2 - 0.5 && Math.abs(z) < W / 2 - 0.5));
}

/** The board LED that shows a GPIO (the "L" LED on D13, GP25 on the Pico…): the pin flagged onboard_led. */
export function isPowerLed(c: BoardComponent) {
  return c.type === 'led' && /PWR|POWER|^ON$/i.test(c.label ?? '');
}
