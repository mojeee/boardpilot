// The detailed 3D model of a part (Detail "Full"), generated from its definition: the PCB with its
// outline, mounting holes and print, the pin header, what sits on the board (model.components, or
// a generic chip), and for parts that are not boards the body of their kind (model.kind): LEDs with
// lens and legs, servos with horn, DHT grille, relay blocks, displays with glass and ribbon...
// Everything goes through a Kit, so a part is a few merged meshes plus a couple of printed decals.
// Models are cached per part definition and shared by every copy of the part in the scene.

import * as THREE from 'three';
import type { PartComponent, PartDef } from '@shared/types';
import { HEADER_INSET, PCB_T, PIN_ABOVE, SPACER_H, displayLayout, hasHeader, partComponents, partKind, partPinPoint, pcbTop, silkName, type DisplayLayout } from '@shared/partModel';
import { Kit, addHole, roundedRect, type KitMeshData } from './kit';
import { cachedMarking, partSilkTexture, type SilkText } from './textures';

const GOLD = '#d9b45a';
const TIN = '#cfd5db';
const STEEL = '#b9c0c8';
const BLACK = '#17191c';
const HOUSING = '#141619';
const CHIP = '#1c1e21';
const WHITE_PLASTIC = '#eeece6';
const BRASS = '#c9a24e';

export interface Decal {
  texture: THREE.Texture;
  /** centre of the decal, part frame */
  pos: [number, number, number];
  /** size along x and z */
  size: [number, number];
  /** turned around y (radians) */
  rotY?: number;
  /** drawn on top of the PCB print (chip markings) */
  order?: number;
}

export interface PartModelData {
  meshes: KitMeshData[];
  decals: Decal[];
  /** displays: where the live picture goes */
  display: DisplayLayout | null;
}

const isDark = (hex: string) => {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 < 0.45;
};
const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const mix = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

/** What drawing a component needs (boards use it too). */
export interface CompCtx {
  kit: Kit;
  decals: Decal[];
  /** footprints on the PCB that print must avoid */
  taken: { x0: number; x1: number; z0: number; z1: number }[];
}

interface Ctx extends CompCtx {
  def: PartDef;
  silk: SilkText[];
}

/* ---------------------------------------------------------------- PCB and header */

function pcbOutline(def: PartDef): THREE.Shape {
  const [w, d] = def.model.size;
  if (def.model.outline === 'probe') {
    // Soil probes: a long board with a pointed end, far from the pins (shape y = -z, pins at y = d / 2)
    const tip = Math.min(10, w * 0.5);
    const r = 1;
    const s = new THREE.Shape();
    s.moveTo(-w / 2, d / 2 - r);
    s.quadraticCurveTo(-w / 2, d / 2, -w / 2 + r, d / 2);
    s.lineTo(w / 2 - r, d / 2);
    s.quadraticCurveTo(w / 2, d / 2, w / 2, d / 2 - r);
    s.lineTo(w / 2, -d / 2 + tip);
    s.lineTo(0.6, -d / 2 + 0.3);
    s.quadraticCurveTo(0, -d / 2, -0.6, -d / 2 + 0.3);
    s.lineTo(-w / 2, -d / 2 + tip);
    s.lineTo(-w / 2, d / 2 - r);
    return s;
  }
  if (def.model.outline === 'round') {
    // Round display: a circle with a tab for the header.
    const r = w / 2;
    const cy = -(d / 2 - r); // circle centre (shape y = -z)
    const tw = Math.min(r * 0.8, (def.pins.length * 2.54) / 2 + 2);
    const s = new THREE.Shape();
    const yTop = d / 2;
    const yJoin = cy + Math.sqrt(r * r - tw * tw);
    const th = Math.atan2(yJoin - cy, tw);
    s.moveTo(-tw, yTop);
    s.lineTo(tw, yTop);
    s.lineTo(tw, yJoin);
    s.absarc(0, cy, r, th, Math.PI - th, true);
    s.lineTo(-tw, yTop);
    return s;
  }
  return roundedRect(w, d, Math.min(1, w / 8, d / 8));
}

/** Mounting holes: in the corners away from the pins, where nothing else sits. */
function holes(def: PartDef, comps: PartComponent[], disp: DisplayLayout | null): [number, number, number][] {
  const [w, d] = def.model.size;
  if (def.model.outline || w < 14 || d < 12) return [];
  const r = w >= 30 && d >= 24 ? 1.6 : 1.1;
  const m = r + 1.1;
  const spots: [number, number][] = [
    [-w / 2 + m, d / 2 - m],
    [w / 2 - m, d / 2 - m],
  ];
  if (disp || (w >= 30 && d >= 30)) spots.push([-w / 2 + m, -d / 2 + m], [w / 2 - m, -d / 2 + m]);
  const pinRow = -(d / 2 - HEADER_INSET);
  const span = (def.pins.length * 2.54) / 2 + 1;
  return spots
    .filter(([x, z]) => !(Math.abs(z - pinRow) < r + 2 && Math.abs(x) < span + r))
    .filter(([x, z]) => !comps.some((c) => Math.abs(c.at[0] - x) < c.size[0] / 2 + r + 0.3 && Math.abs(c.at[1] - z) < c.size[1] / 2 + r + 0.3))
    .filter(([x, z]) => !disp || !(Math.abs(disp.glass.x - x) < disp.glass.w / 2 + r && Math.abs(disp.glass.z - z) < disp.glass.d / 2 + r))
    .map(([x, z]) => [x, z, r]);
}

function pcb(c: Ctx, color: string, top: number, comps: PartComponent[], disp: DisplayLayout | null) {
  const shape = pcbOutline(c.def);
  const hs = holes(c.def, comps, disp);
  for (const [x, z, r] of hs) addHole(shape, x, z, r);
  c.kit.slab('satin', color, shape, top, 0, 16);
  for (const [x, z, r] of hs) {
    c.kit.add('metal', GOLD, new THREE.RingGeometry(r, r + 0.75, 20), [x, top + 0.01, z], [-Math.PI / 2, 0, 0]);
    c.taken.push({ x0: x - r - 1, x1: x + r + 1, z0: z - r - 1, z1: z + r + 1 });
  }
}

/** Male header standing on the PCB: one spacer and one gold pin per part pin, solder below. */
function header(c: Ctx, top: number) {
  const { def, kit } = c;
  def.pins.forEach((_, i) => {
    const [x, , z] = partPinPoint(def, i);
    kit.block('matte', HOUSING, [2.42, SPACER_H, 2.42], x, top, z, 0.12);
    const bottom = -2.6;
    const tipY = top + SPACER_H + PIN_ABOVE;
    kit.box('metal', GOLD, [0.64, tipY - bottom - 0.3, 0.64], [x, (tipY - 0.3 + bottom) / 2, z]);
    // chamfered tip
    kit.add('metal', GOLD, new THREE.CylinderGeometry(0.18, 0.45, 0.3, 4), [x, tipY - 0.15, z], [0, Math.PI / 4, 0]);
    // solder joint under the board
    kit.cyl('metal', TIN, 0.95, 0.5, x, -0.5, z, 10, 0.35);
  });
  const n = def.pins.length;
  const x0 = partPinPoint(def, 0)[0];
  const zRow = partPinPoint(def, 0)[2];
  c.taken.push({ x0: x0 - 1.6, x1: x0 + (n - 1) * 2.54 + 1.6, z0: zRow - 1.6, z1: zRow + 1.6 });
}

/** Pin names printed next to the header, towards the middle of the board. */
function pinPrint(c: Ctx) {
  const { def } = c;
  const [, d] = def.model.size;
  const zRow = -(d / 2 - HEADER_INSET);
  const size = 0.95;
  def.pins.forEach((p, i) => {
    const [x] = partPinPoint(def, i);
    const text = p.name.slice(0, 5);
    const len = text.length * 0.6 * size;
    const vertical = len > 2.3;
    const z = zRow + 1.75 + (vertical ? len / 2 : size / 2);
    const r = vertical ? { x0: x - size / 2, x1: x + size / 2, z0: z - len / 2, z1: z + len / 2 } : { x0: x - len / 2, x1: x + len / 2, z0: z - size / 2, z1: z + size / 2 };
    if (z + (vertical ? len / 2 : size / 2) > d / 2 - 0.4) return;
    if (c.taken.some((t) => overlaps(r, t))) return;
    c.silk.push({ text, x, z, size, vertical });
    c.taken.push(r);
  });
}

const overlaps = (a: { x0: number; x1: number; z0: number; z1: number }, b: { x0: number; x1: number; z0: number; z1: number }) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/** The part name, as large as fits in the free space nearest the far edge. */
function namePrint(c: Ctx) {
  const [w, d] = c.def.model.size;
  const text = silkName(c.def);
  for (let size = Math.min(2.2, d * 0.1); size >= 0.9; size -= 0.2) {
    const len = text.length * 0.6 * size;
    if (len > w - 2) continue;
    for (let z = d / 2 - 1.2 - size / 2; z > -d / 2 + 2; z -= 0.5) {
      for (const x of [0, -w / 4, w / 4]) {
        const r = { x0: x - len / 2, x1: x + len / 2, z0: z - size / 2 - 0.2, z1: z + size / 2 + 0.2 };
        if (r.x0 < -w / 2 + 0.9 || r.x1 > w / 2 - 0.9) continue;
        if (c.taken.some((t) => overlaps(r, t))) continue;
        c.silk.push({ text, x, z, size });
        c.taken.push(r);
        return;
      }
    }
  }
}

/* ---------------------------------------------------------------- components on a PCB */

function marking(c: CompCtx, text: string | undefined, x: number, y: number, z: number, w: number, d: number, color?: string) {
  if (!text || Math.min(w, d) < 1.8) return;
  const words = text.split(/\s+/);
  const lines = words.length > 1 && d > 3.5 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [text];
  c.decals.push({ texture: cachedMarking(lines, w / d, color), pos: [x, y + 0.015, z], size: [w * 0.88, d * 0.8], order: 2 });
}

function chip(c: CompCtx, comp: PartComponent, top: number) {
  const { kit } = c;
  const [x, z] = comp.at;
  const [sw, sd] = comp.rot ? [comp.size[1], comp.size[0]] : [comp.size[0], comp.size[1]];
  const pkg = comp.package ?? 'qfn';
  const h = comp.size[2] ?? (pkg === 'dip' ? 3.3 : pkg === 'soic' ? 1.5 : pkg === 'lqfp' ? 1.4 : pkg === 'sot223' ? 1.6 : pkg === 'sot23' ? 1.0 : 0.9);
  const body = comp.color ?? CHIP;
  const long = sw >= sd;
  let bw = sw;
  let bd = sd;
  let lift = 0;
  if (pkg === 'soic' || pkg === 'tssop' || pkg === 'msop' || pkg === 'dip') {
    const pitch = pkg === 'dip' ? 2.54 : pkg === 'soic' ? 1.27 : 0.65;
    const legOut = pkg === 'dip' ? 0.6 : pkg === 'soic' ? 1.0 : 0.6;
    if (long) bd = sd - legOut * 2;
    else bw = sw - legOut * 2;
    lift = pkg === 'dip' ? 0.6 : 0.15;
    const along = long ? bw : bd;
    const n = Math.max(2, Math.floor((along - pitch * 0.3) / pitch));
    for (let i = 0; i < n; i++) {
      const p = (i - (n - 1) / 2) * pitch;
      for (const s of [-1, 1]) {
        const legW = pkg === 'dip' ? 0.5 : pitch * 0.4;
        if (pkg === 'dip') {
          const o = (long ? bd : bw) / 2 + 0.25;
          if (long) kit.box('metal', TIN, [legW, lift + h * 0.4, 0.3], [x + p, (lift + h * 0.4) / 2 + top, z + s * o]);
          else kit.box('metal', TIN, [0.3, lift + h * 0.4, legW], [x + s * o, (lift + h * 0.4) / 2 + top, z + p]);
        } else {
          // gull wing: out from the body, down, out along the pad
          const o = (long ? bd : bw) / 2;
          const foot = legOut * 0.55;
          if (long) {
            kit.box('metal', TIN, [legW, 0.18, legOut * 0.5], [x + p, top + lift + h * 0.35, z + s * (o + legOut * 0.22)]);
            kit.box('metal', TIN, [legW, 0.16, foot], [x + p, top + 0.08, z + s * (o + legOut - foot / 2)]);
            kit.box('metal', TIN, [legW, lift + h * 0.35, 0.16], [x + p, top + (lift + h * 0.35) / 2, z + s * (o + legOut * 0.45)]);
          } else {
            kit.box('metal', TIN, [legOut * 0.5, 0.18, legW], [x + s * (o + legOut * 0.22), top + lift + h * 0.35, z + p]);
            kit.box('metal', TIN, [foot, 0.16, legW], [x + s * (o + legOut - foot / 2), top + 0.08, z + p]);
            kit.box('metal', TIN, [0.16, lift + h * 0.35, legW], [x + s * (o + legOut * 0.45), top + (lift + h * 0.35) / 2, z + p]);
          }
        }
      }
    }
  } else if (pkg === 'lqfp') {
    bw = sw - 1.6;
    bd = sd - 1.6;
    lift = 0.1;
    const n = Math.max(4, Math.round(bw / 0.5) - 1);
    for (let i = 0; i < n; i++) {
      const p = (i - (n - 1) / 2) * ((bw - 0.6) / n);
      for (const s of [-1, 1]) {
        kit.box('metal', TIN, [0.2, 0.15, 0.8], [x + p, top + 0.1, z + s * (bd / 2 + 0.4)]);
        kit.box('metal', TIN, [0.8, 0.15, 0.2], [x + s * (bw / 2 + 0.4), top + 0.1, z + p * (bd / bw)]);
      }
    }
  } else if (pkg === 'sot23' || pkg === 'sot223') {
    bd = sd * 0.6;
    const legs = pkg === 'sot223' ? [-1, 0, 1] : [-1, 1];
    for (const l of legs) kit.box('metal', TIN, [pkg === 'sot223' ? 0.7 : 0.4, 0.2, (sd - bd) / 2 + 0.1], [x + l * bw * 0.32, top + 0.1, z + bd / 2 + (sd - bd) / 4]);
    if (pkg === 'sot223') kit.box('metal', TIN, [bw * 0.8, 0.2, (sd - bd) / 2 + 0.1], [x, top + 0.1, z - bd / 2 - (sd - bd) / 4]);
    else kit.box('metal', TIN, [0.4, 0.2, (sd - bd) / 2 + 0.1], [x, top + 0.1, z - bd / 2 - (sd - bd) / 4]);
    lift = 0.1;
  } else {
    // QFN / LGA: flat body, tin pads peeking out at the sides
    const n = Math.max(2, Math.round(Math.min(bw, bd) / 0.55) - 1);
    for (let i = 0; i < n; i++) {
      const p = (i - (n - 1) / 2) * 0.5;
      for (const s of [-1, 1]) {
        kit.box('metal', TIN, [0.24, 0.12, 0.2], [x + p * (bw / Math.min(bw, bd)), top + 0.06, z + s * (bd / 2 + 0.05)]);
        kit.box('metal', TIN, [0.2, 0.12, 0.24], [x + s * (bw / 2 + 0.05), top + 0.06, z + p * (bd / Math.min(bw, bd))]);
      }
    }
  }
  if (comp.metal || pkg === 'lga') {
    // LGA with a metal lid (Bosch BME280: 2.5 × 2.5 × 0.93 mm, lid with a vent hole)
    kit.block('satin', '#3a3d42', [bw, h * 0.35, bd], x, top + lift, z);
    kit.block('brushed', '#c4c9cf', [bw - 0.12, h * 0.65, bd - 0.12], x, top + lift + h * 0.35, z, 0.08);
    kit.cyl('matte', '#101214', Math.min(0.18, bw / 10), 0.02, x - bw * 0.22, top + lift + h + 0.001, z - bd * 0.22, 10);
    return;
  }
  kit.block('satin', body, [bw, h, bd], x, top + lift, z, Math.min(0.12, h / 4));
  // pin-1 dot (DIP: the notch)
  if (pkg === 'dip') kit.cyl('matte', shade(body, 0.6), Math.min(0.7, (long ? bd : bw) / 5), 0.04, long ? x - bw / 2 + 0.2 : x, top + lift + h, long ? z : z - bd / 2 + 0.2, 12);
  else kit.cyl('matte', mix(body, '#ffffff', 0.25), Math.min(0.3, Math.min(bw, bd) / 8), 0.02, x - bw / 2 + Math.min(0.7, bw / 4), top + lift + h, z - bd / 2 + Math.min(0.7, bd / 4), 10);
  marking(c, comp.label, x, top + lift + h, z, bw, bd);
}

/** A metal mesh top (sonar transducers, gas sensor caps): concentric rings over a dark disc. */
function meshTop(kit: Kit, r: number, y: number, x: number, z: number) {
  kit.cyl('matte', '#0c0d0f', r, 0.05, x, y, z, 28);
  for (let i = 1; i <= 4; i++) kit.add('brushed', STEEL, new THREE.TorusGeometry((r * i) / 4.6, 0.09, 4, 32), [x, y + 0.06, z], [Math.PI / 2, 0, 0]);
  for (const a of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) kit.box('brushed', STEEL, [r * 1.9, 0.08, 0.14], [x, y + 0.06, z], [0, a, 0]);
}

/** One component standing on a PCB whose top is at y = top. */
export function component(c: CompCtx, comp: PartComponent, top: number) {
  const { kit } = c;
  const [x, z] = comp.at;
  const [sw, sd] = comp.rot ? [comp.size[1], comp.size[0]] : [comp.size[0], comp.size[1]];
  const sh = comp.size[2];
  c.taken.push({ x0: x - sw / 2 - 0.3, x1: x + sw / 2 + 0.3, z0: z - sd / 2 - 0.3, z1: z + sd / 2 + 0.3 });
  switch (comp.type) {
    case 'chip':
      return chip(c, comp, top);
    case 'crystal': {
      const h = sh ?? (sw > 6 ? 3.5 : 0.8);
      if (sw > 6 || sd > 6) {
        // HC-49/S: oval metal can on a flat base
        kit.block('matte', '#2b2d30', [sw, 0.4, sd], x, top, z);
        kit.add('brushed', '#d4d8dd', new THREE.CapsuleGeometry(Math.min(sw, sd) / 2 - 0.1, Math.max(sw, sd) - Math.min(sw, sd), 6, 18), [x, top + 0.4 + (h - 0.4) / 2, z], sw > sd ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0], [1, (h - 0.4) / Math.min(sw, sd), 1]);
      } else {
        kit.block('satin', '#d8c9a8', [sw, h * 0.4, sd], x, top, z);
        kit.block('brushed', '#cfd4da', [sw - 0.2, h * 0.6, sd - 0.2], x, top + h * 0.4, z, 0.05);
      }
      marking(c, comp.label, x, top + h, z, sw, sd, 'rgba(60,64,70,0.85)');
      return;
    }
    case 'transducer': {
      // Sonar transducer: aluminium can with a mesh front, on a black ring
      const r = Math.min(sw, sd) / 2;
      const h = sh ?? 12;
      kit.cyl('matte', '#1b1c1f', r * 1.02, 0.8, x, top, z, 32);
      kit.lathe('brushed', '#d9dde2', [[r * 0.82, 0], [r, 0], [r, h - 0.8], [r * 0.96, h - 0.8], [r * 0.9, h - 0.5], [r * 0.86, h - 0.55]], [x, top + 0.8, z], 40);
      meshTop(kit, r * 0.86, top + h - 0.6, x, z);
      return;
    }
    case 'dome': {
      // PIR: Fresnel lens dome on a square base
      const r = Math.min(sw, sd) / 2;
      const h = sh ?? r * 1.3;
      kit.block('matte', '#f1efe9', [sw, 1.6, sd], x, top, z, 0.4);
      kit.cyl('matte', '#f1efe9', r * 0.98, 1.2, x, top + 1.6, z, 32);
      const pts: [number, number][] = [];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * (Math.PI / 2);
        pts.push([Math.max(0.01, Math.cos(a) * r * 0.95), Math.sin(a) * (h - 2.8)]);
      }
      const geo = new THREE.LatheGeometry(pts.map(([px, py]) => new THREE.Vector2(px, py)), 14);
      const flat = geo.toNonIndexed();
      geo.dispose();
      flat.computeVertexNormals();
      kit.add('frosted', '#f6f4ee', flat, [x, top + 2.8, z]);
      // the facets of the Fresnel lens
      for (let i = 1; i < 4; i++) kit.add('frosted', '#e9e6dd', new THREE.TorusGeometry(r * 0.95 * Math.cos((i / 4) * (Math.PI / 2)), 0.12, 4, 28), [x, top + 2.8 + Math.sin((i / 4) * (Math.PI / 2)) * (h - 2.8), z], [Math.PI / 2, 0, 0]);
      return;
    }
    case 'terminal': {
      // Screw terminal block (5.0 mm pitch): coloured body, screws on top, wire openings at the side
      const n = comp.count ?? Math.max(2, Math.round(Math.max(sw, sd) / 5));
      const h = sh ?? 10;
      const col = comp.color ?? '#2667c9';
      kit.block('satin', col, [sw, h, sd], x, top, z, 0.3);
      const alongX = sw >= sd;
      const pitch = (alongX ? sw : sd) / n;
      for (let i = 0; i < n; i++) {
        const p = (i - (n - 1) / 2) * pitch;
        const sx = alongX ? x + p : x;
        const sz = alongX ? z : z + p;
        kit.cyl('matte', shade(col, 0.45), pitch * 0.36, 0.3, sx, top + h - 0.25, sz, 18);
        kit.cyl('metal', '#d0d5da', pitch * 0.3, 0.4, sx, top + h - 0.6, sz, 18);
        kit.box('matte', '#3a3d40', alongX ? [pitch * 0.5, 0.2, 0.25] : [0.25, 0.2, pitch * 0.5], [sx, top + h - 0.15, sz]);
        // wire opening on the outer side
        const o = alongX ? (z >= 0 ? 1 : -1) : x >= 0 ? 1 : -1;
        if (alongX) kit.box('matte', '#0b0c0d', [pitch * 0.55, h * 0.4, 0.1], [sx, top + h * 0.35, z + o * (sd / 2 + 0.01)]);
        else kit.box('matte', '#0b0c0d', [0.1, h * 0.4, pitch * 0.55], [x + o * (sw / 2 + 0.01), top + h * 0.35, sz]);
      }
      return;
    }
    case 'relay': {
      // Sugar-cube relay (Songle SRD-05VDC-SL-C: 19.0 × 15.5 × 15.3 mm)
      const h = sh ?? 15.3;
      const col = comp.color ?? '#2f6fe0';
      kit.block('satin', col, [sw, h, sd], x, top, z, 0.5);
      kit.block('satin', shade(col, 0.85), [sw - 1.2, 0.3, sd - 1.2], x, top + h - 0.05, z, 0.2);
      marking(c, comp.label ?? 'SRD-05VDC-SL-C', x, top + h + 0.25, z, sw * 0.9, sd * 0.7, 'rgba(240,244,250,0.92)');
      return;
    }
    case 'trimpot': {
      const h = sh ?? (sw > 6 ? 10 : 4);
      if (h > 6) {
        // 3296W multi-turn: blue box, brass screw on top
        kit.block('satin', comp.color ?? '#2f6fe0', [sw, h, sd], x, top, z, 0.3);
        kit.cyl('metal', BRASS, Math.min(sw, sd) * 0.24, 0.5, x + sw * 0.3, top + h, z, 16);
        kit.box('matte', '#5a4a24', [Math.min(sw, sd) * 0.4, 0.2, 0.18], [x + sw * 0.3, top + h + 0.45, z]);
      } else {
        // small open trimmer: square base, round rotor with a cross slot
        kit.block('satin', comp.color ?? '#2a5fc9', [sw, h * 0.5, sd], x, top, z, 0.2);
        kit.cyl('satin', '#f0efe9', Math.min(sw, sd) * 0.4, h * 0.5, x, top + h * 0.5, z, 20);
        kit.box('matte', '#8a8a86', [Math.min(sw, sd) * 0.55, 0.25, 0.35], [x, top + h, z]);
        kit.box('matte', '#8a8a86', [0.35, 0.25, Math.min(sw, sd) * 0.55], [x, top + h, z]);
      }
      return;
    }
    case 'led': {
      // SMD LED (0603/0805): white body with a coloured lens
      const h = sh ?? 0.6;
      kit.block('satin', '#f1f0ea', [sw, h * 0.6, sd], x, top, z);
      kit.block('gloss', comp.color ?? '#ff3b30', [sw * 0.7, h * 0.4, sd * 0.8], x, top + h * 0.6, z);
      kit.box('metal', TIN, [sw * 0.18, h * 0.62, sd + 0.02], [x - sw / 2 + sw * 0.09, top + h * 0.31, z]);
      kit.box('metal', TIN, [sw * 0.18, h * 0.62, sd + 0.02], [x + sw / 2 - sw * 0.09, top + h * 0.31, z]);
      return;
    }
    case 'smd': {
      // A row of chip resistors / capacitors
      const n = comp.count ?? 1;
      const [pw, pd] = [comp.size[0], comp.size[1]];
      const res = pw >= 1.5;
      const h = sh ?? (res ? 0.45 : 0.5);
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * (Math.min(pw, pd) + 0.7);
        const cx = comp.rot ? x + off : x;
        const cz = comp.rot ? z : z + off;
        const [bw, bd] = comp.rot ? [pd, pw] : [pw, pd];
        kit.block('satin', res ? '#1e1f22' : '#b49a6c', [bw, h, bd], cx, top, cz);
        const capL = pw * 0.2;
        for (const s of [-1, 1]) {
          if (comp.rot) kit.block('metal', TIN, [bw + 0.02, h + 0.02, capL], cx, top, cz + s * (bd / 2 - capL / 2));
          else kit.block('metal', TIN, [capL, h + 0.02, bd + 0.02], cx + s * (bw / 2 - capL / 2), top, cz);
        }
      }
      return;
    }
    case 'capacitor': {
      // Electrolytic capacitor: sleeve with a minus stripe, aluminium top with the vent cross
      const r = Math.min(sw, sd) / 2;
      const h = sh ?? r * 2.2;
      const col = comp.color ?? '#1d2b5c';
      kit.cyl('satin', col, r, h - 0.3, x, top, z, 28);
      kit.cyl('brushed', '#cfd4da', r * 0.92, 0.3, x, top + h - 0.3, z, 28);
      kit.box('matte', '#3a3f45', [r * 1.4, 0.06, 0.18], [x, top + h, z]);
      kit.box('matte', '#3a3f45', [0.18, 0.06, r * 1.4], [x, top + h, z]);
      kit.add('satin', mix(col, '#d8dde6', 0.6), new THREE.CylinderGeometry(r + 0.02, r + 0.02, h - 0.4, 10, 1, true, -0.45, 0.9), [x, top + (h - 0.3) / 2, z]);
      return;
    }
    case 'jst': {
      const h = sh ?? 6;
      kit.block('satin', comp.color ?? WHITE_PLASTIC, [sw, h, sd], x, top, z, 0.2);
      const n = comp.count ?? Math.max(2, Math.round(Math.max(sw, sd) / 2.3) - 1);
      for (let i = 0; i < n; i++) {
        const p = (i - (n - 1) / 2) * ((Math.max(sw, sd) - 1.6) / n);
        kit.box('matte', '#2a2a28', sw >= sd ? [1, 0.2, sd * 0.45] : [sw * 0.45, 0.2, 1], [sw >= sd ? x + p : x, top + h, sw >= sd ? z : z + p]);
      }
      return;
    }
    case 'button': {
      // 6 × 6 mm tactile switch: black base, metal frame, round plunger
      const h = sh ?? 5;
      kit.block('satin', '#1c1d20', [sw, h * 0.55, sd], x, top, z, 0.2);
      kit.block('brushed', '#c9ced4', [sw, 0.25, sd], x, top + h * 0.55, z);
      kit.cyl('satin', comp.color ?? '#222326', Math.min(sw, sd) * 0.3, h * 0.45, x, top + h * 0.55, z, 20);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box('metal', TIN, [0.5, 0.3, 0.9], [x + sx * (sw / 2 + 0.2), top + 0.15, z + sz * sd * 0.3]);
      return;
    }
    case 'can': {
      // Gas sensor (Hanwei MQ series): bakelite base, stainless double mesh cap
      const r = Math.min(sw, sd) / 2;
      const h = sh ?? 15;
      kit.cyl('satin', comp.color ?? '#b3652e', r, h * 0.25, x, top, z, 32);
      kit.cyl('brushed', '#cdd2d8', r * 0.9, h * 0.75 - 0.4, x, top + h * 0.25, z, 32);
      kit.add('brushed', '#b8bec6', new THREE.TorusGeometry(r * 0.9, 0.25, 6, 32), [x, top + h * 0.25 + 0.2, z], [Math.PI / 2, 0, 0]);
      meshTop(kit, r * 0.86, top + h - 0.4, x, z);
      // the mesh on the side: thin rings
      for (let i = 1; i < 5; i++) kit.add('metal', '#9aa2ab', new THREE.TorusGeometry(r * 0.905, 0.05, 3, 32), [x, top + h * 0.25 + (i * (h * 0.75)) / 5.5, z], [Math.PI / 2, 0, 0]);
      return;
    }
    case 'shield': {
      // RF shield can with its module name
      const h = sh ?? 2.2;
      kit.block('brushed', '#cbd0d6', [sw, h, sd], x, top, z, 0.15);
      marking(c, comp.label, x, top + h, z, sw, sd, 'rgba(60,66,74,0.9)');
      return;
    }
    case 'antenna': {
      // PCB meander antenna
      const n = Math.max(3, Math.round(sw / 1.8));
      for (let i = 0; i < n; i++) {
        const px = x - sw / 2 + (sw * (i + 0.5)) / n;
        kit.box('metal', GOLD, [0.3, 0.04, sd], [px, top + 0.02, z]);
        if (i < n - 1) kit.box('metal', GOLD, [sw / n + 0.3, 0.04, 0.3], [px + sw / n / 2, top + 0.02, z + (i % 2 ? -sd / 2 : sd / 2)]);
      }
      return;
    }
    case 'socket': {
      // micro SD / SD card socket: sheet metal with a dark opening at the edge
      const h = sh ?? 1.8;
      kit.block('brushed', '#c3c8ce', [sw, h, sd], x, top, z, 0.08);
      kit.box('matte', '#0c0d0f', [sw * 0.85, h * 0.5, 0.1], [x, top + h * 0.4, z + sd / 2 + 0.02]);
      for (let i = 0; i < 3; i++) kit.box('matte', '#8f969e', [sw * 0.8, 0.03, 0.25], [x, top + h + 0.01, z - sd / 4 + i * 0.6]);
      return;
    }
    case 'inductor': {
      const h = sh ?? 3;
      kit.block('satin', comp.color ?? '#202124', [sw, h, sd], x, top, z, Math.min(sw, sd) * 0.2);
      marking(c, comp.label, x, top + h, z, sw, sd, 'rgba(200,204,210,0.8)');
      return;
    }
    case 'lens': {
      // Optical sensor window (ToF, IR): black body with glass windows
      const h = sh ?? 1;
      kit.block('satin', comp.color ?? '#141518', [sw, h, sd], x, top, z, 0.1);
      const n = sw > sd * 1.4 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const px = n === 1 ? x : x + (i ? 1 : -1) * sw * 0.24;
        kit.cyl('clear', '#9fb6c8', Math.min(sw / (n * 2.6), sd * 0.32), 0.12, px, top + h, z, 16);
        kit.cyl('gloss', '#3a1d2e', Math.min(sw / (n * 2.6), sd * 0.32) * 0.6, 0.06, px, top + h - 0.02, z, 16);
      }
      return;
    }
    case 'mic': {
      // Electret capsule: metal can with a black felt top
      const r = Math.min(sw, sd) / 2;
      const h = sh ?? 6.5;
      kit.cyl('brushed', '#c9ced4', r, h - 0.2, x, top, z, 28);
      kit.cyl('matte', '#2a2b2e', r * 0.92, 0.25, x, top + h - 0.2, z, 28);
      return;
    }
    case 'knob': {
      // Rotary knob or joystick cap on a metal bushing
      const r = Math.min(sw, sd) / 2;
      const h = sh ?? 12;
      kit.cyl('brushed', '#c9ced4', r * 0.45, h * 0.3, x, top, z, 18);
      kit.cyl('satin', comp.color ?? '#1d1e21', r, h * 0.7, x, top + h * 0.3, z, 30, r * 0.9);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        kit.box('satin', comp.color ?? '#1d1e21', [0.35, h * 0.6, 0.5], [x + Math.cos(a) * r * 0.97, top + h * 0.3 + h * 0.32, z + Math.sin(a) * r * 0.97], [0, -a, 0]);
      }
      kit.box('matte', '#e8e8e2', [0.4, 0.05, r * 0.7], [x, top + h + 0.01, z - r * 0.4]);
      return;
    }
    case 'usb': {
      const h = sh ?? 2.6;
      kit.block('brushed', '#cdd2d8', [sw, h, sd], x, top, z, 0.3);
      kit.box('matte', '#0b0c0d', [sw * 0.8, h * 0.55, 0.1], [x, top + h * 0.5, z + (z > 0 ? sd / 2 + 0.01 : -sd / 2 - 0.01)]);
      return;
    }
    case 'diode': {
      const h = sh ?? 1;
      kit.block('satin', comp.color ?? '#1d1e21', [sw, h, sd], x, top, z, 0.1);
      kit.box('matte', '#bfc4ca', comp.rot || sd > sw ? [sw + 0.02, 0.02, sd * 0.12] : [sw * 0.12, 0.02, sd + 0.02], comp.rot || sd > sw ? [x, top + h, z - sd * 0.32] : [x - sw * 0.32, top + h, z]);
      return;
    }
    case 'resistor': {
      // Through-hole resistor (axial), beige body with colour bands, lying along x
      const len = Math.max(sw, sd);
      const r = Math.min(sw, sd) / 2;
      const along = sw >= sd ? 'x' : 'z';
      c.kit.rod('metal', TIN, 0.25, len + 3, [x, top + r, z], along, 6);
      c.kit.add('satin', '#d8c39a', new THREE.CapsuleGeometry(r, len - r * 2, 4, 14), [x, top + r, z], along === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
      ['#e04a2a', '#e04a2a', '#5a3a22', '#d4af37'].forEach((col, i) => {
        const p = -len * 0.28 + i * len * 0.17 + (i === 3 ? len * 0.06 : 0);
        c.kit.rod('satin', col, r * 1.04, len * 0.07, along === 'x' ? [x + p, top + r, z] : [x, top + r, z + p], along, 14);
      });
      return;
    }
    case 'digits': {
      // 7-segment digits block (TM1637, MAX7219 modules): grey case, black face, dark segments
      const h = sh ?? 7;
      kit.block('satin', '#d9d9d3', [sw, h - 0.2, sd], x, top, z, 0.2);
      kit.box('matte', '#141416', [sw - 0.8, 0.2, sd - 0.8], [x, top + h - 0.1, z]);
      segments(kit, x, z, sw - 1, sd - 1, top + h + 0.01, comp.count ?? 4);
      return;
    }
    case 'battery': {
      // CR2032 coin cell in its holder
      const r = Math.min(sw, sd) / 2;
      kit.cyl('satin', '#1d1e21', r + 0.6, 1.2, x, top, z, 32);
      kit.cyl('brushed', '#d3d8dd', r - 0.3, 3.2, x, top + 1.2, z, 40);
      kit.box('brushed', '#c3c8ce', [r * 0.5, 0.3, r * 1.6], [x, top + 4.5, z]);
      marking(c, 'CR2032', x, top + 4.4, z, r * 1.3, r * 0.7, 'rgba(70,76,84,0.85)');
      return;
    }
    case 'coil': {
      // Printed antenna coil (RFID readers): a few rectangular copper loops
      const n = comp.count ?? 4;
      for (let i = 0; i < n; i++) {
        const iw = sw - i * 1.6;
        const id = sd - i * 1.6;
        if (iw < 2 || id < 2) break;
        kit.box('metal', '#c99a52', [iw, 0.04, 0.5], [x, top + 0.02, z - id / 2]);
        kit.box('metal', '#c99a52', [iw, 0.04, 0.5], [x, top + 0.02, z + id / 2]);
        kit.box('metal', '#c99a52', [0.5, 0.04, id], [x - iw / 2, top + 0.02, z]);
        kit.box('metal', '#c99a52', [0.5, 0.04, id], [x + iw / 2, top + 0.02, z]);
      }
      return;
    }
    case 'patch': {
      // Ceramic GPS patch antenna: beige block with a silver square and the feed point
      const h = sh ?? 4;
      kit.block('satin', '#d8cba8', [sw, h, sd], x, top, z, 0.3);
      kit.box('brushed', '#d5d9de', [sw * 0.78, 0.05, sd * 0.78], [x, top + h + 0.02, z]);
      kit.cyl('metal', TIN, 0.6, 0.15, x + sw * 0.1, top + h, z - sd * 0.1, 10);
      return;
    }
    case 'heatsink': {
      // Black anodised fin heatsink
      const h = sh ?? 20;
      const fins = Math.max(3, Math.round(sw / 2.2));
      kit.block('satin', '#1b1c1f', [sw, 2.2, sd], x, top, z);
      for (let i = 0; i < fins; i++) kit.block('satin', '#1b1c1f', [Math.max(0.6, sw / fins - 1.2), h - 2.2, sd], x - sw / 2 + (sw * (i + 0.5)) / fins, top + 2.2, z);
      return;
    }
    case 'block':
    default: {
      const h = sh ?? 3;
      const col = comp.color ?? '#202327';
      kit.block('satin', col, [sw, h, sd], x, top, z, 0.3);
      marking(c, comp.label, x, top + h, z, sw, sd, isDark(col) ? undefined : 'rgba(40,44,50,0.85)');
    }
  }
}

/** Dark 7-segment digits drawn flat on a face (w × d), n digits along x. */
function segments(kit: Kit, cx: number, cz: number, w: number, d: number, y: number, n: number) {
  const dw = w / n;
  const sh = d * 0.3;
  const sw = Math.min(dw * 0.5, sh * 1.1);
  const t = Math.max(0.35, sh * 0.12);
  for (let k = 0; k < n; k++) {
    const x = cx - w / 2 + dw * (k + 0.5) - t;
    const seg = (x0: number, z0: number, horizontal: boolean) =>
      kit.box('matte', '#3a2526', horizontal ? [sw, 0.04, t] : [t, 0.04, sh - t], [x + x0, y, cz + z0], [0, 0.08, 0]);
    seg(0, -sh, true);
    seg(0, 0, true);
    seg(0, sh, true);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) seg((sx * sw) / 2 - sz * sh * 0.04, (sz * sh) / 2, false);
    kit.cyl('matte', '#3a2526', t * 0.6, 0.04, x + sw / 2 + t * 1.3, y, cz + sh + t * 0.3, 8);
  }
}

/* ---------------------------------------------------------------- displays */

function displayGlass(c: Ctx, lay: DisplayLayout) {
  const { def, kit } = c;
  const disp = def.display;
  if (!disp) return;
  const { glass, top } = lay;
  const base = PCB_T;
  const h = top - base;
  c.taken.push({ x0: glass.x - glass.w / 2 - 0.5, x1: glass.x + glass.w / 2 + 0.5, z0: glass.z - glass.d / 2 - 0.5, z1: glass.z + glass.d / 2 + 0.5 });
  if (disp.round) {
    const r = glass.w / 2;
    kit.cyl('satin', '#0d0e10', r + 0.6, h - 0.3, glass.x, base, glass.z, 48);
    kit.cyl('gloss', glassColor(def), r, 0.3, glass.x, top - 0.3, glass.z, 48);
    return;
  }
  if (disp.color === 'lcd') {
    // Character / graphic LCD: metal frame bezel around the window, backlight block under it
    const fw = glass.w + 6;
    const fd = glass.d + 7;
    kit.block('satin', '#1a1b1e', [Math.min(fw, def.model.size[0] - 1), h - 0.4, Math.min(fd, def.model.size[1] - 5)], glass.x, base, glass.z, 0.3);
    kit.block('brushed', '#2a2c30', [Math.min(fw, def.model.size[0] - 1) - 0.2, 0.4, Math.min(fd, def.model.size[1] - 5) - 0.2], glass.x, top - 0.4, glass.z, 0.1);
    kit.box('gloss', glassColor(def), [glass.w, 0.12, glass.d], [glass.x, top + 0.01, glass.z]);
    return;
  }
  if (disp.color === 'led') {
    // LED matrix / 7-segment block: black face, light edges
    kit.block('satin', '#202226', [glass.w, h, glass.d], glass.x, base, glass.z, 0.2);
    kit.box('matte', '#0a0b0c', [glass.w - 0.4, 0.05, glass.d - 0.4], [glass.x, top, glass.z]);
    return;
  }
  // OLED / TFT / e-paper: double-sided tape, glass, the active area shows through it
  kit.block('matte', '#e6e2d6', [glass.w - 1, 0.25, glass.d - 1], glass.x, base, glass.z);
  kit.block('gloss', mix(glassColor(def), '#8a99a8', 0.06), [glass.w, h - 0.25, glass.d], glass.x, base + 0.25, glass.z, 0.05);
  kit.box('gloss', glassColor(def), [glass.w - 0.1, 0.02, glass.d - 0.1], [glass.x, top + 0.005, glass.z]);
  // FPC ribbon from the glass edge far from the pins, round the board edge
  const [, d] = def.model.size;
  const fw = Math.min(glass.w * 0.45, 14);
  const fz0 = glass.z + glass.d / 2;
  const fz1 = d / 2;
  c.taken.push({ x0: glass.x - fw / 2 - 0.5, x1: glass.x + fw / 2 + 0.5, z0: fz0, z1: fz1 + 1 });
  if (fz1 - fz0 > 0.2) kit.box('gloss', '#c58a2c', [fw, 0.12, fz1 - fz0], [glass.x, base + 0.08, (fz0 + fz1) / 2]);
  kit.box('gloss', '#c58a2c', [fw, base + 0.6, 0.12], [glass.x, (base + 0.6) / 2 - 0.4, d / 2 + 0.07]);
  kit.box('gloss', '#b77d24', [fw * 0.6, 0.13, 1.6], [glass.x, base + 0.09, fz1 - 0.9]);
}

/** Glass colour with nothing on it. */
export function glassColor(def: PartDef): string {
  const d = def.display;
  if (d?.glassColor) return d.glassColor;
  switch (d?.color) {
    case 'epaper':
      return '#c9cac4';
    case 'lcd':
      return def.model.pcb ? def.model.color : '#a9bd45';
    case 'rgb565':
    case 'rgb666':
      return '#121417';
    default:
      return '#08090b';
  }
}

/* ---------------------------------------------------------------- bodies that are not boards */

/** Legs (or wires) from a point on the body to each pin, ending where the wire plugs on. */
function legs(c: Ctx, from: (i: number) => [number, number, number], color = TIN, r = 0.25) {
  c.def.pins.forEach((_, i) => {
    const [px, py, pz] = partPinPoint(c.def, i);
    const [fx, fy, fz] = from(i);
    const a = new THREE.Vector3(fx, fy, fz);
    const bend = new THREE.Vector3(fx, py, fz);
    const b = new THREE.Vector3(px, py, pz - 1.2);
    for (const [p, q] of [[a, bend], [bend, b]] as const) {
      const len = p.distanceTo(q);
      if (len < 0.05) continue;
      const mid = p.clone().add(q).multiplyScalar(0.5);
      const geo = new THREE.CylinderGeometry(r, r, len + r, 6);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
      const e = new THREE.Euler().setFromQuaternion(quat);
      c.kit.add('metal', color, geo, [mid.x, mid.y, mid.z], [e.x, e.y, e.z]);
    }
  });
}

/** A coloured cable from the body to each pin (servos, motors, probes). */
function cable(c: Ctx, from: [number, number, number], colors: string[]) {
  const n = c.def.pins.length;
  c.def.pins.forEach((_, i) => {
    const [px, py, pz] = partPinPoint(c.def, i);
    const start = new THREE.Vector3(from[0] + (i - (n - 1) / 2) * 0.9, from[1], from[2]);
    const end = new THREE.Vector3(px, py, pz - 1.2);
    const mid = start.clone().lerp(end, 0.5);
    mid.y = Math.max(start.y, end.y) * 0.5 + 0.6;
    const curve = new THREE.CatmullRomCurve3([start, start.clone().lerp(mid, 0.6), mid, end]);
    c.kit.add('satin', colors[i % colors.length], new THREE.TubeGeometry(curve, 16, 0.45, 6, false));
  });
}

function ledBody(c: Ctx, lens: string, frosted: boolean, r = 2.5) {
  const { kit } = c;
  // 5 mm LED: rim, cylinder with a dome, the die holder inside
  kit.cyl(frosted ? 'frosted' : 'clear', lens, r + 0.4, 1, 0, 0.3, 0, 24);
  const pts: [number, number][] = [[0.01, 0], [r, 0], [r, 5.6]];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push([Math.max(0.01, Math.cos(a) * r), 5.6 + Math.sin(a) * r]);
  }
  kit.lathe(frosted ? 'frosted' : 'clear', lens, pts, [0, 1.3, 0], 28);
  if (!frosted) {
    kit.box('metal', '#8b9097', [1.6, 2.6, 0.5], [-0.5, 2.6, 0]);
    kit.box('metal', '#8b9097', [0.6, 3.4, 0.5], [0.9, 3, 0]);
    kit.cyl('gloss', lens, 0.6, 0.4, -0.5, 3.9, 0, 10);
  }
}

function body(c: Ctx) {
  const { def, kit } = c;
  const [w, d, h] = def.model.size;
  const col = def.model.color;
  const kind = partKind(def);
  switch (kind) {
    case 'led':
    case 'rgb-led': {
      const rgb = kind === 'rgb-led';
      ledBody(c, rgb ? '#f4f4f0' : col, rgb);
      legs(c, (i) => [(i - (def.pins.length - 1) / 2) * 1.0, 0.6, 0]);
      if (/resistor/i.test(def.name) && def.pins.length === 2) {
        // the series resistor on the anode leg
        const [px, py, pz] = partPinPoint(def, 0);
        component(c, { type: 'resistor', at: [px, pz + 2], size: [2.2, 6, 2.2], rot: true }, py - 1.1);
      }
      return;
    }
    case 'pixel': {
      // WS2812B on a small round-cornered PCB: white 5050 package, clear window, the die
      pcb(c, col, PCB_T, [], null);
      kit.block('satin', '#f4f3ee', [5, 1.6, 5], 0, PCB_T, 1);
      kit.box('clear', '#e9eef2', [4, 0.1, 4], [0, PCB_T + 1.62, 1]);
      kit.box('metal', '#b8bec6', [1.2, 0.1, 1.6], [0, PCB_T + 1.1, 1]);
      legs(c, (i) => [(i - (def.pins.length - 1) / 2) * 2.54, PCB_T / 2, -d / 2 + 1]);
      return;
    }
    case 'buzzer': {
      kit.cyl('satin', col, w / 2, h - 0.4, 0, 0.4, 0, 36);
      kit.cyl('matte', '#2b2d30', w / 2 - 0.2, 0.4, 0, 0, 0, 36);
      kit.cyl('matte', '#060607', 1.1, 0.05, 0, h, 0, 16);
      kit.add('satin', shade(col, 1.4), new THREE.TorusGeometry(1.4, 0.15, 6, 20), [0, h, 0], [Math.PI / 2, 0, 0]);
      kit.box('satin', '#e8e8e2', [0.3, 0.02, 1.4], [w / 2 - 2.2, h + 0.01, -1.6]);
      kit.box('satin', '#e8e8e2', [1.4, 0.02, 0.3], [w / 2 - 2.2, h + 0.01, -1.6]);
      legs(c, (i) => [(i - (def.pins.length - 1) / 2) * 3.8, 0.4, 0]);
      return;
    }
    case 'piezo': {
      kit.cyl('metal', '#c9a24e', w / 2, 0.2, 0, 0, 0, 48);
      kit.cyl('satin', '#ecebe4', w * 0.37, 0.22, 0, 0.2, 0, 40);
      kit.cyl('brushed', '#cfd3d8', w * 0.34, 0.06, 0, 0.42, 0, 40);
      cable(c, [0, 0.5, -w * 0.2], ['#c0352b', '#1b1b1b']);
      return;
    }
    case 'ldr': {
      // Photoresistor: ceramic disc with the zig-zag CdS track under clear coating
      kit.cyl('satin', '#e4dfcf', 2.5, 2, 0, 0, 0, 24);
      for (let i = 0; i < 6; i++) kit.box('satin', '#b8432c', [3.4 - Math.abs(i - 2.5) * 0.4, 0.05, 0.28], [0, 2.01, -1.5 + i * 0.6]);
      kit.cyl('clear', '#f2efe4', 2.55, 0.25, 0, 2, 0, 24);
      legs(c, (i) => [(i - (def.pins.length - 1) / 2) * 3.4, 0.4, 0]);
      return;
    }
    case 'flex':
    case 'fsr': {
      if (kind === 'flex') {
        kit.block('satin', '#2a2116', [w * 0.85, 0.3, d - 6], 0, 0, 3);
        for (let i = 0; i < 12; i++) kit.box('brushed', '#c4c4bc', [w * 0.6, 0.02, 0.6], [0, 0.31, -d / 2 + 10 + i * ((d - 14) / 12)]);
      } else {
        const r = w / 2 - 0.5;
        kit.block('satin', '#2a2116', [w * 0.35, 0.3, d - w], 0, 0, -w / 2 + 2);
        kit.cyl('satin', '#2a2116', r, 0.3, 0, 0, d / 2 - r - 0.5, 36);
        kit.cyl('matte', '#3e3a33', r * 0.8, 0.02, 0, 0.3, d / 2 - r - 0.5, 36);
      }
      kit.block('metal', TIN, [w * 0.7, 0.8, 4], 0, 0, -d / 2 + 4);
      legs(c, (i) => [(i - (def.pins.length - 1) / 2) * 2.54, 0.4, -d / 2 + 2]);
      return;
    }
    case 'led-bar': {
      kit.block('satin', '#1c1d20', [w, h, d], 0, 0, 0, 0.2);
      const n = Math.max(1, Math.round(def.pins.length / 2));
      for (let i = 0; i < n; i++) kit.box('gloss', col, [(w - 2) / n - 0.9, 0.05, d * 0.6], [-w / 2 + 1 + ((i + 0.5) * (w - 2)) / n, h + 0.01, 0]);
      legs(c, (i) => [partPinPoint(def, i)[0], 0.3, -d / 2]);
      return;
    }
    case 'tactile':
    case 'tactile-cap':
    case 'touch': {
      if (kind === 'touch') {
        pcb(c, col, PCB_T, [], null);
        kit.cyl('metal', '#c8b06a', Math.min(w, d) * 0.32, 0.04, 0, PCB_T, d * 0.12, 32);
        kit.cyl('satin', col, Math.min(w, d) * 0.28, 0.05, 0, PCB_T + 0.01, d * 0.12, 32);
        legs(c, (i) => [partPinPoint(def, i)[0], PCB_T / 2, -d / 2 + 0.5]);
        return;
      }
      const capped = kind === 'tactile-cap';
      kit.block('satin', '#1c1d20', [w, capped ? 3.5 : h * 0.55, d], 0, 0, 0, 0.2);
      kit.block('brushed', '#c9ced4', [w, 0.3, d], 0, capped ? 3.5 : h * 0.55, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.cyl('metal', '#c9ced4', w * 0.06, 0.2, sx * w * 0.36, (capped ? 3.5 : h * 0.55) + 0.3, sz * d * 0.36, 8);
      if (capped) {
        kit.block('satin', '#2a2b2e', [w * 0.45, 2, d * 0.45], 0, 3.8, 0);
        kit.cyl('satin', col === '#2B2B2B' ? '#26272a' : col, w * 0.4, h - 5.8, 0, 5.8, 0, 32, w * 0.37);
      } else kit.cyl('satin', '#2b2c30', w * 0.28, h * 0.45 - 0.3, 0, h * 0.55 + 0.3, 0, 20);
      legs(c, (i) => [partPinPoint(def, i)[0], 0.5, -d / 2 + 0.6]);
      return;
    }
    case 'arcade': {
      const r = w / 2;
      kit.lathe('gloss', shade(col, 0.9), [[r * 0.75, 0], [r, 0], [r, 1.2], [r * 0.95, 3], [r * 0.82, 3.2], [r * 0.8, 1.5]], [0, h - 9, 0], 48);
      const pts: [number, number][] = [[0.01, 4.5]];
      for (let i = 0; i <= 8; i++) pts.push([Math.max(0.01, r * 0.74 * Math.cos(((8 - i) / 8) * (Math.PI / 2)) ** 0.6), 4.5 - Math.sin(((8 - i) / 8) * (Math.PI / 2)) * 3.5]);
      kit.lathe('gloss', col, pts.reverse(), [0, h - 9 + 1.2, 0], 48);
      kit.cyl('satin', '#1d1e21', r * 0.7, h - 9, 0, 0, 0, 32);
      kit.add('satin', '#1d1e21', new THREE.TorusGeometry(r * 0.72, 0.6, 6, 32), [0, h - 12, 0], [Math.PI / 2, 0, 0]);
      legs(c, (i) => [partPinPoint(def, i)[0] * 0.3, 0.5, -r * 0.4]);
      return;
    }
    case 'slide':
      kit.block('satin', col, [w, h * 0.6, d], 0, 0, 0, 0.1);
      kit.block('brushed', '#c9ced4', [w, 0.2, d], 0, h * 0.6, 0);
      kit.block('satin', '#1c1d20', [w * 0.25, h * 0.4, d * 0.5], -w * 0.15, h * 0.6, 0);
      legs(c, (i) => [partPinPoint(def, i)[0], 0.4, -d / 2 + 0.4]);
      return;
    case 'limit': {
      kit.block('satin', col, [w, h, d * 0.9], 0, 0, d * 0.05, 0.3);
      kit.cyl('satin', '#c33', 0.9, 0.8, -w * 0.3, h, d * 0.05, 12);
      // lever with a roller
      kit.box('brushed', '#cfd4da', [w * 0.95, 0.25, d * 0.4], [w * 0.02, h + 1.2, d * 0.05], [0, 0, 0.12]);
      kit.rod('satin', '#202226', 1.2, d * 0.4, [w * 0.47, h + 2.4, d * 0.05], 'z', 16);
      for (const s of [-1, 0, 1]) kit.box('metal', TIN, [0.5, 0.8, 3], [s * w * 0.3, 0.4, -d / 2 - 1]);
      legs(c, (i) => [partPinPoint(def, i)[0], 0.4, -d / 2]);
      return;
    }
    case 'reed':
      kit.rod('clear', '#e5f1f3', h / 2, w * 0.8, [0, h / 2, 0], 'x', 20);
      kit.box('metal', '#9aa2ab', [w * 0.45, 0.25, 0.5], [-w * 0.15, h / 2 + 0.1, 0]);
      kit.box('metal', '#9aa2ab', [w * 0.45, 0.25, 0.5], [w * 0.15, h / 2 - 0.1, 0]);
      legs(c, (i) => [(i ? 1 : -1) * w * 0.42, h / 2, 0]);
      return;
    case 'tilt':
      kit.cyl('brushed', '#c9ced4', Math.min(w, d) / 2 - 0.2, h - 1, 0, 1, 0, 24);
      kit.cyl('satin', '#1d1e21', Math.min(w, d) / 2 - 0.1, 1, 0, 0, 0, 24);
      legs(c, (i) => [(i - (def.pins.length - 1) / 2) * 2.54, 0.4, 0]);
      return;
    case 'to92': {
      // TO-92 lying on its round back, flat face up with the marking, legs towards the pins
      const bw = Math.min(4.6, w * 0.6);
      const bl = 4.6;
      const shape = new THREE.Shape();
      shape.moveTo(-bw / 2, 0);
      shape.lineTo(bw / 2, 0);
      shape.absarc(0, 0, bw / 2, 0, Math.PI, true);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: bl, bevelEnabled: false, curveSegments: 16 });
      geo.rotateX(Math.PI);
      kit.add('satin', col, geo, [0, bw / 2, bl / 2]);
      marking(c, def.name.split(/[ (]/)[0], 0, bw / 2, 0, bw, bl);
      legs(c, (i) => [(i - 1) * 1.27, 0.6, -bl / 2]);
      return;
    }
    case 'dip':
    case 'soic': {
      const bodyD = Math.min(d, 6.4);
      const bh = Math.min(h, 3.3);
      kit.block('satin', col, [w, bh, bodyD], 0, 0.6, 0, 0.15);
      kit.cyl('matte', shade(col, 0.5), 0.8, 0.05, -w / 2 + 0.2, 0.6 + bh, 0, 16);
      kit.cyl('matte', shade(col, 0.7), 0.4, 0.04, -w / 2 + 1.8, 0.6 + bh, bodyD / 2 - 1.1, 12);
      marking(c, def.name.split(/[ (]/)[0], 0, 0.6 + bh, 0, w * 0.8, bodyD);
      legs(c, (i) => [partPinPoint(def, i)[0], 0.6 + bh * 0.4, -bodyD / 2]);
      return;
    }
    case 'seg7': {
      // 7-segment display: grey case, black face with the segments
      kit.block('satin', '#d9d9d3', [w, h - 0.3, d], 0, 0, 0, 0.2);
      kit.box('matte', '#141416', [w - 1.2, 0.3, d - 1.2], [0, h - 0.15, 0]);
      const digits = Math.max(1, Math.round((w - 2) / 12.5));
      const dw = (w - 2) / digits;
      for (let k = 0; k < digits; k++) {
        const cx = -w / 2 + 1 + dw * (k + 0.5);
        const sh = d * 0.32;
        const sw = dw * 0.42;
        const seg = (x0: number, z0: number, horizontal: boolean) =>
          kit.box('matte', '#3a2b2c', horizontal ? [sw, 0.05, 0.9] : [0.9, 0.05, sh], [cx + x0, h + 0.01, z0], [0, -0.1, 0]);
        seg(0, -sh, true);
        seg(0, 0, true);
        seg(0, sh, true);
        for (const sx of [-1, 1]) for (const sz of [-0.5, 0.5]) seg((sx * sw) / 2 - sz * 0.3, sz * sh, false);
        kit.cyl('matte', '#3a2b2c', 0.5, 0.05, cx + sw / 2 + 1.4, h + 0.01, sh + 0.2, 10);
      }
      legs(c, (i) => [partPinPoint(def, i)[0], 0.4, -d / 2]);
      return;
    }
    case 'probe': {
      // Waterproof probe: stainless tube, heat shrink, black cable split into three wires
      const tube = Math.min(30, d * 0.55);
      kit.rod('brushed', '#d0d5db', 3, tube, [0, 3, d / 2 - tube / 2], 'z', 24);
      kit.add('brushed', '#d0d5db', new THREE.SphereGeometry(3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), [0, 3, d / 2], [Math.PI / 2, 0, 0]);
      kit.rod('satin', '#141516', 3.1, 5, [0, 3, d / 2 - tube - 2], 'z', 20);
      const z0 = d / 2 - tube - 4.5;
      kit.add('satin', '#141516', new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 3, z0), new THREE.Vector3(0, 1.8, z0 - 4), new THREE.Vector3(0, 1.5, -d / 2 + 6)]), 12, 1.6, 10, false));
      cable(c, [0, 1.5, -d / 2 + 6], ['#c0352b', '#1b1b1b', '#e1c337']);
      return;
    }
    case 'servo': {
      // Hobby servo standing up: case, mounting ears, gear tower, output shaft and horn
      const caseH = h * 0.78;
      const bodyW = w;
      const frosted = col.toUpperCase() === '#2E6FD8';
      kit.block(frosted ? 'frosted' : 'satin', col, [bodyW, caseH, d], 0, 0, 0, 0.6);
      kit.block(frosted ? 'frosted' : 'satin', col, [w * 1.42, 2.4, d], 0, caseH * 0.72, 0, 0.4);
      for (const s of [-1, 1]) kit.cyl('matte', '#0a0b0c', 1, 2.5, s * (w * 0.71 - 2.2), caseH * 0.72 - 0.05, 0, 12);
      kit.cyl(frosted ? 'frosted' : 'satin', col, d * 0.45, h * 0.1, bodyW / 2 - d / 2, caseH, 0, 28);
      kit.cyl(frosted ? 'frosted' : 'satin', col, d * 0.28, h * 0.06, -bodyW * 0.12, caseH, 0, 20);
      const top = caseH + h * 0.1;
      kit.cyl('metal', '#e2e2e2', 1.5, 1.6, bodyW / 2 - d / 2, top, 0, 16);
      // horn: hub and one long arm with holes
      const hx = bodyW / 2 - d / 2;
      kit.cyl('satin', '#f2f1ec', 3.4, 1.6, hx, top + 1.2, 0, 24);
      kit.block('satin', '#f2f1ec', [w * 0.55, 1.4, 3.6], hx - w * 0.2, top + 1.3, 0, 0.6);
      kit.cyl('satin', '#f2f1ec', 1.8, 1.4, hx - w * 0.47, top + 1.3, 0, 16);
      for (let i = 1; i <= 4; i++) kit.cyl('matte', '#0c0d0e', 0.4, 0.05, hx - i * w * 0.11, top + 2.72, 0, 8);
      kit.cyl('metal', '#a8adb4', 0.9, 0.2, hx, top + 2.8, 0, 12);
      cable(c, [-bodyW / 2 + 1, caseH * 0.15, -d / 2], ['#6b3a21', '#c0352b', '#e88c25']);
      return;
    }
    case 'stepper': {
      // NEMA 17: black end caps, silver laminated middle, aluminium front with the shaft
      const cap = h * 0.18;
      kit.block('satin', '#1b1c1f', [w, cap, d], 0, 0, 0, 2);
      for (let i = 0; i < 10; i++) kit.block('brushed', i % 2 ? '#aeb4bb' : '#c5cad0', [w - 0.4, (h - cap * 2) / 10, d - 0.4], 0, cap + (i * (h - cap * 2)) / 10, 0, 2.6);
      kit.block('satin', '#1b1c1f', [w, cap, d], 0, h - cap, 0, 2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.cyl('metal', '#9aa1a9', 1.6, 0.4, (sx * 31) / 2, h, (sz * 31) / 2, 12);
      kit.cyl('brushed', '#cfd4da', 11, 2, 0, h, 0, 32);
      kit.cyl('metal', '#e2e5e8', 2.5, 22, 0, h + 2, 0, 16);
      kit.box('metal', '#c2c6cb', [5, 15, 0.8], [0, h + 15, 2.1]);
      cable(c, [0, 4, -d / 2], ['#1b1b1b', '#2f6fe0', '#2e8b57', '#c0352b']);
      return;
    }
    case 'stepper-28byj': {
      const r = 14;
      kit.cyl('brushed', '#d0d5db', r, 19, 0, 0, d / 2 - r - 1, 40);
      kit.cyl('satin', '#2f6fe0', 8, 3, 0, 19, d / 2 - r - 1 - 4, 24);
      kit.cyl('brushed', '#cfd4da', 4.5, 1.5, 0, 19, d / 2 - r - 1 + 6, 18);
      kit.cyl('metal', '#e2e5e8', 2.5, 7, 0, 20.5, d / 2 - r - 1 + 6, 14);
      for (const s of [-1, 1]) {
        kit.block('brushed', '#cfd4da', [7, 0.8, 7], s * (r + 3), 18, d / 2 - r - 1, 2);
        kit.cyl('matte', '#111', 2.1, 0.1, s * (r + 4.2), 18.81, d / 2 - r - 1, 12);
      }
      kit.block('satin', '#2f6fe0', [16, 9, 5], 0, 0, -d / 2 + 6, 0.5);
      kit.block('satin', WHITE_PLASTIC, [12, 5, 6], 0, 0, -d / 2 + 2.5, 0.3);
      cable(c, [0, 4, -d / 2 + 3], ['#2f6fe0', '#e86fd8', '#e1c337', '#e88c25', '#c0352b']);
      return;
    }
    case 'dc-motor':
    case 'gear-motor': {
      if (kind === 'gear-motor') {
        // N20: gearbox frame, motor can, encoder board with magnet
        const r = w / 2;
        kit.block('brushed', '#d6c48a', [w, 10, 9], 0, 0, d / 2 - 4.5, 0.4);
        kit.rod('metal', '#e2e5e8', 1.5, 9, [0, 5, d / 2 + 4], 'z', 12);
        kit.add('brushed', '#cfd4da', new THREE.CapsuleGeometry(r * 0.62, 6, 4, 20), [0, 5, d / 2 - 9 - 7], [Math.PI / 2, 0, 0], [1, 1, 1]);
        kit.block('satin', '#1e5f3a', [w, 10, PCB_T], 0, 0, -d / 2 + 9);
        kit.cyl('satin', '#202226', 3, 2, 0, 5, -d / 2 + 7.4, 16);
        cable(c, [0, 2, -d / 2 + 8], ['#c0352b', '#1b1b1b', '#2f6fe0', '#2e8b57', '#e1c337', '#f2f2f2']);
        return;
      }
      // 130 motor lying along x: can with flats, plastic end cap, shaft, solder tabs
      const r = d / 2;
      kit.rod('brushed', '#cfd4da', r, w * 0.8, [w * 0.1, r, 0], 'x', 32);
      kit.rod('satin', '#efede6', r * 0.85, w * 0.2, [-w * 0.4, r, 0], 'x', 24);
      kit.rod('metal', '#e2e5e8', 1, 8, [w / 2 + 4, r, 0], 'x', 12);
      kit.cyl('brushed', '#cfd4da', 2.4, 0.6, 0, 0, 0, 16);
      for (const s of [-1, 1]) kit.box('metal', '#d9b45a', [0.3, 2.4, 1.4], [-w / 2 - 0.2, r + s * r * 0.45, -1]);
      cable(c, [-w / 2 - 0.4, r, -1], ['#c0352b', '#1b1b1b']);
      return;
    }
    case 'fan': {
      // Square frame with the round opening, hub with its sticker, seven angled blades
      const frame = roundedRect(w, d, 1.6);
      addHole(frame, 0, 0, w * 0.46);
      kit.slab('satin', col, frame, h, 0, 32);
      kit.cyl('satin', col, w * 0.46, 1, 0, 0, 0, 32);
      kit.cyl('satin', shade(col, 1.15), w * 0.17, h - 1.2, 0, 0.6, 0, 24);
      kit.cyl('satin', '#e4e0d6', w * 0.12, 0.05, 0, h - 0.6, 0, 24);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        kit.box('satin', shade(col, 1.3), [w * 0.28, 0.6, w * 0.13], [Math.cos(a) * w * 0.31, h * 0.55, -Math.sin(a) * w * 0.31], [0.45, a, 0]);
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.cyl('matte', '#060607', 1.6, 0.05, sx * (w / 2 - 2.5), h + 0.002, sz * (d / 2 - 2.5), 12);
      cable(c, [-w / 2 + 3, h * 0.5, -d / 2], ['#c0352b', '#1b1b1b']);
      return;
    }
    case 'speaker': {
      const r = Math.min(w, d) / 2;
      kit.lathe('satin', '#1b1c1f', [[r * 0.4, 0], [r * 0.55, 0], [r, h * 0.7], [r, h], [r * 0.92, h]], [0, 0, 0], 48, true);
      kit.lathe('matte', '#2a2b2e', [[r * 0.18, h * 0.4], [r * 0.88, h * 0.95]], [0, 0, 0], 48, true);
      kit.add('satin', '#1d1e20', new THREE.SphereGeometry(r * 0.24, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), [0, h * 0.32, 0]);
      kit.add('matte', '#2a2b2e', new THREE.TorusGeometry(r * 0.92, 0.9, 6, 48), [0, h - 0.1, 0], [Math.PI / 2, 0, 0]);
      kit.cyl('brushed', '#a7adb5', r * 0.5, h * 0.35, 0, -h * 0.35, 0, 32);
      cable(c, [0, 1, -r * 0.6], ['#c0352b', '#1b1b1b']);
      return;
    }
    case 'pump': {
      const r = Math.min(d, h) / 2;
      kit.rod('satin', col, r, w * 0.75, [-w * 0.1, r, 0], 'x', 32);
      kit.rod('satin', shade(col, 1.6), r * 0.85, w * 0.12, [w * 0.33, r, 0], 'x', 28);
      kit.rod('satin', col, 2.4, 9, [w * 0.33, r * 2 + 3, 0], 'z', 16);
      kit.cyl('satin', col, 2.4, 6, w * 0.33, r * 2 - 1, 0, 16);
      for (let i = 0; i < 5; i++) kit.box('matte', '#0a0a0b', [w * 0.08, 0.3, 1], [w * 0.3, 0.6, -r * 0.6 + i * r * 0.3]);
      cable(c, [-w / 2 + 2, r, -1], ['#c0352b', '#1b1b1b']);
      return;
    }
    case 'encoder': {
      const r = Math.min(w, d) / 2;
      kit.cyl('brushed', '#c7ccd2', r, h * 0.85, 0, 0, 0, 40);
      kit.cyl('satin', '#1b1c1f', r * 0.98, h * 0.15, 0, 0, 0, 40);
      kit.cyl('brushed', '#d7dbe0', r * 0.5, 2, 0, h * 0.85, 0, 32);
      kit.cyl('metal', '#e2e5e8', 3, 13, 0, h * 0.85 + 2, 0, 16);
      cable(c, [0, h * 0.4, -r], ['#2e8b57', '#f2f2f2', '#c0352b', '#1b1b1b', '#e1c337', '#2f6fe0']);
      return;
    }
    case 'solenoid':
    case 'valve': {
      if (kind === 'valve') {
        kit.block('satin', '#efece4', [w * 0.5, h * 0.4, d * 0.7], 0, 0, d * 0.1, 1);
        for (const s of [-1, 1]) kit.rod('satin', '#efece4', 5.5, w * 0.3, [s * w * 0.32, h * 0.2, d * 0.1], 'x', 24);
        kit.block('satin', '#1b1c1f', [w * 0.4, h * 0.55, d * 0.55], 0, h * 0.4, d * 0.1, 1.5);
        kit.block('metal', '#d0d5db', [w * 0.3, 0.6, d * 0.4], 0, h * 0.95, d * 0.1);
      } else {
        kit.block('brushed', '#cfd4da', [w * 0.8, h * 0.5, d], -w * 0.1, 0, 0, 0.4);
        kit.block('satin', '#2a2b2e', [w * 0.55, h * 0.45, d * 0.8], -w * 0.1, h * 0.5, 0, 1);
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(w * 0.18, 0);
        shape.lineTo(w * 0.18, h * 0.3);
        shape.lineTo(0, h * 0.45);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: d * 0.5, bevelEnabled: false });
        kit.add('brushed', '#dfe3e7', geo, [w * 0.3, 0, -d * 0.25]);
      }
      cable(c, [-w * 0.2, h * 0.3, -d / 2], ['#c0352b', '#1b1b1b']);
      return;
    }
    case 'ssr': {
      kit.block('satin', '#1b1c1f', [w, h * 0.7, d], 0, 0, 0, 0.8);
      kit.block('satin', '#e9e6dc', [w - 2, h * 0.3, d - 12], 0, h * 0.7, 0, 0.8);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          kit.cyl('metal', '#d4d9de', 3, 0.8, sx * w * 0.32, h * 0.7, sz * (d / 2 - 4), 16);
          kit.box('matte', '#3a3d40', [3.6, 0.2, 0.5], [sx * w * 0.32, h * 0.7 + 0.9, sz * (d / 2 - 4)]);
        }
      kit.cyl('gloss', '#ff4d4d', 0.9, 0.3, w * 0.35, h, 0, 12);
      marking(c, 'SSR-40DA', 0, h, 0, (w - 2) * 0.8, d - 14, 'rgba(30,34,40,0.85)');
      cable(c, [-w * 0.32, h * 0.7, -d / 2 + 4], ['#c0352b', '#1b1b1b', '#e1c337', '#2f6fe0']);
      return;
    }
    case 'box': {
      kit.block('satin', col, [w, h, d], 0, 0, 0, Math.min(1.5, h / 6));
      kit.block('satin', shade(col, 0.8), [w - 2, 0.3, d - 2], 0, h - 0.15, 0, 0.6);
      marking(c, silkName(def), 0, h + 0.15, 0, (w - 4) * 0.9, Math.min(d - 4, 10), isDark(col) ? undefined : 'rgba(40,44,50,0.85)');
      // connector for the pins
      const span = def.pins.length * 2.54 + 1.4;
      kit.block('satin', WHITE_PLASTIC, [span, Math.min(h * 0.6, 5.5), 4], 0, 0.2, -d / 2 + 1.6, 0.2);
      return;
    }
    default:
  }
  // dht: the moulded housing with its grille, a hanging tab and legs out of the bottom
  if (def.model.shape === 'dht') {
    const tab = d > 20 ? 6 : 0;
    kit.block('satin', col, [w, h, d - tab], 0, 0, -tab / 2, 0.5);
    if (tab) {
      const s = roundedRect(w * 0.6, tab + 1, 1.5, 0, d / 2 - tab / 2 - 0.5);
      addHole(s, 0, d / 2 - tab / 2, 1.5);
      kit.slab('satin', col, s, 1.4, h * 0.2);
    }
    const cols = Math.max(3, Math.round(w / 3));
    const rows = Math.max(3, Math.round((d - tab) * 0.6 / 2.4));
    const gz0 = -tab / 2 + (d - tab) * 0.12;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++)
        kit.box('matte', mix(col, '#000000', 0.82), [(w * 0.75) / cols - 0.7, 0.1, 1.2], [-w * 0.375 + ((i + 0.5) * w * 0.75) / cols, h + 0.001, gz0 - ((d - tab) * 0.3) + j * 2.4]);
    legs(c, (i) => [partPinPoint(def, i)[0], 0.6, -d / 2 + tab / 2]);
    return;
  }
  if (def.model.shape === 'pot') {
    // Rotary potentiometer: square plastic base, metal shell, threaded bushing, knurled knob
    kit.block('satin', col, [w, 2, d], 0, 0, 0, 0.3);
    kit.block('brushed', '#c3c8ce', [w - 0.2, 2.6, d - 0.6], 0, 2, 0, 0.4);
    kit.cyl('brushed', '#d3d7dc', 2.2, 2, 0, 4.6, 0, 18);
    const kr = Math.min(w, d) * 0.48;
    kit.cyl('satin', '#1f2023', kr, h - 3.2, 0, 6, 0, 30, kr * 0.92);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      kit.box('satin', '#1f2023', [0.35, (h - 3.2) * 0.85, 0.6], [Math.cos(a) * kr * 0.96, 6 + (h - 3.2) * 0.45, Math.sin(a) * kr * 0.96], [0, -a, 0]);
    }
    kit.box('matte', '#f2f2ec', [0.5, 0.05, kr * 0.75], [0, h + 2.81, -kr * 0.45]);
    legs(c, (i) => [partPinPoint(def, i)[0], 0.8, -d / 2]);
    return;
  }
  // anything else: the shape's plain block
  kit.block('satin', col, [w, h, d], 0, 0, 0, 0.4);
}

/* ---------------------------------------------------------------- the whole part */

function build(def: PartDef): PartModelData {
  const kit = new Kit();
  const c: Ctx = { def, kit, decals: [], silk: [], taken: [] };
  const lay = displayLayout(def);
  if (hasHeader(def)) {
    const top = pcbTop(def);
    const comps = partComponents(def).filter((x) => !(lay && x.type === 'block' && !def.model.components));
    const pcbColor = def.model.pcb ?? (def.display?.color === 'lcd' && !def.display.glassColor ? '#2b6b3c' : def.model.color);
    pcb(c, pcbColor, top, comps, lay);
    header(c, top);
    if (lay) displayGlass(c, lay);
    for (const comp of comps) component(c, comp, top);
    pinPrint(c);
    namePrint(c);
    const [w, d] = def.model.size;
    if (c.silk.length) {
      const tex = partSilkTexture(w, d, c.silk, isDark(pcbColor), !def.model.outline);
      c.decals.push({ texture: tex, pos: [0, top + 0.012, 0], size: [w, d], order: 1 });
    }
  } else {
    body(c);
  }
  return { meshes: kit.build(), decals: c.decals, display: lay };
}

const cache = new WeakMap<PartDef, PartModelData>();

/** The detailed model of a part, built once per definition. */
export function partModel(def: PartDef): PartModelData {
  let m = cache.get(def);
  if (!m) {
    m = build(def);
    cache.set(def, m);
  }
  return m;
}
