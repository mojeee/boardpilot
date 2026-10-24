// The "Full" detail of a board, generated from its file and merged into a few meshes (kit.ts):
// chips with the legs of their package and their part number, the radio module with its shield,
// castellated pads and antenna, USB connectors by type (micro, mini, USB-C, USB-B), the DC jack,
// crystals, tactile switches, slide switches, pin headers (ICSP, SWD), card sockets, the small
// resistors and capacitors next to the parts and a few copper traces (shared/boardDetail.ts).
// The board LEDs are not here: they light up, so BoardDetail.tsx draws them on their own.

import * as THREE from 'three';
import type { BoardComponent, BoardDef, PartComponent } from '@shared/types';
import { rectToMm } from '@shared/board';
import { chipPackage, passivesFor, tracesFor } from '@shared/boardDetail';
import { Kit, type KitMeshData } from './kit';
import { component, type CompCtx, type Decal } from './partModels';
import { cachedMarking } from './textures';

const GOLD = '#d9b45a';
const SHELL = '#cfd4da';
const HOUSING = '#141619';

export interface BoardModelData {
  meshes: KitMeshData[];
  decals: Decal[];
}

/** Which way a connector at the board edge opens: the nearest edge. */
function outward(board: BoardDef, cx: number, cz: number): [number, number] {
  const { length: L, width: W } = board.pcbMm;
  return Math.abs(cx) / (L / 2) >= Math.abs(cz) / (W / 2) ? [Math.sign(cx) || -1, 0] : [0, Math.sign(cz) || 1];
}

/** USB receptacle: metal shell, dark opening facing out, plastic tongue, solder tabs. */
function usb(kit: Kit, board: BoardDef, c: BoardComponent, top: number) {
  const r = rectToMm(board, c.rect);
  const label = c.label ?? '';
  const [ox, oz] = outward(board, r.cx, r.cz);
  const along = ox !== 0; // the plug goes in along x
  // shell size: depth into the board, width across, height
  const depth = along ? r.w : r.h;
  const width = along ? r.h : r.w;
  const kind = /USB-B|type-b/i.test(label) ? 'b' : /USB-C/i.test(label) ? 'c' : /mini/i.test(label) ? 'mini' : 'micro';
  const h = c.heightMm ?? (kind === 'b' ? 10.9 : kind === 'mini' ? 3.9 : kind === 'c' ? 3.2 : 2.8);
  const rot = along ? 0 : Math.PI / 2;
  // local frame: x = into the board (opening at -x of the local frame when ox = -1)
  const s = along ? ox : oz;
  kit.at([r.cx, top, r.cz], rot * (along ? 1 : -1), () => {
    const face = (s * depth) / 2;
    if (kind === 'c') {
      kit.block('brushed', c.color ?? SHELL, [depth, h, width], 0, 0, 0, h / 2 - 0.05);
      kit.block('matte', '#0b0c0d', [0.1, h * 0.6, width * 0.82], face + s * 0.01, h * 0.2, 0, h * 0.28);
      kit.box('satin', '#1d1e21', [0.12, h * 0.16, width * 0.6], [face + s * 0.02, h * 0.5, 0]);
    } else {
      kit.block('brushed', c.color ?? SHELL, [depth, h, width], 0, 0, 0, 0.12);
      kit.box('matte', '#0b0c0d', [0.1, h * (kind === 'b' ? 0.75 : 0.62), width * (kind === 'b' ? 0.7 : 0.8)], [face + s * 0.01, h * 0.5, 0]);
      kit.box('satin', kind === 'b' ? '#ecebe6' : '#1d1e21', [0.12, h * (kind === 'b' ? 0.3 : 0.18), width * (kind === 'b' ? 0.45 : 0.6)], [face + s * 0.02, h * 0.45, 0]);
      // the seam and the little latch dimples on top
      kit.box('metal', '#aeb5bd', [depth * 0.9, 0.04, 0.12], [0, h + 0.01, 0]);
      for (const t of [-1, 1]) kit.box('metal', '#a0a7af', [0.5, 0.05, 0.4], [face - s * 1.2, h + 0.01, (t * width) / 4]);
    }
    // side tabs soldered to the board
    for (const t of [-1, 1]) kit.box('brushed', c.color ?? SHELL, [Math.min(2, depth * 0.3), Math.min(1.4, h * 0.6), 0.25], [-face * 0.3, Math.min(0.7, h * 0.3), (t * (width + 0.25)) / 2]);
  });
}

/** DC barrel jack: black body, the round opening facing out, the centre pin. */
function jack(kit: Kit, board: BoardDef, c: BoardComponent, top: number) {
  const r = rectToMm(board, c.rect);
  const [ox, oz] = outward(board, r.cx, r.cz);
  const h = c.heightMm ?? 10.8;
  kit.block('satin', c.color ?? '#141518', [r.w, h, r.h], r.cx, top, r.cz, 0.4);
  const fx = r.cx + (ox * r.w) / 2;
  const fz = r.cz + (oz * r.h) / 2;
  const geo = new THREE.CylinderGeometry(3.3, 3.3, 0.6, 28);
  kit.add('satin', '#202225', geo, [fx + ox * 0.3, top + h * 0.55, fz + oz * 0.3], ox ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
  kit.add('matte', '#050506', new THREE.CylinderGeometry(2.6, 2.6, 0.2, 24), [fx + ox * 0.62, top + h * 0.55, fz + oz * 0.62], ox ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
  kit.add('metal', SHELL, new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10), [fx + ox * 0.7, top + h * 0.55, fz + oz * 0.7], ox ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
}

/** Pin header block (ICSP, SWD, jumpers): spacers and gold pins on a 2.54 mm grid. */
function headerBlock(kit: Kit, cx: number, cz: number, w: number, d: number, top: number) {
  const cols = Math.max(1, Math.round(w / 2.54));
  const rows = Math.max(1, Math.round(d / 2.54));
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = cx + (i - (cols - 1) / 2) * 2.54;
      const z = cz + (j - (rows - 1) / 2) * 2.54;
      kit.block('matte', HOUSING, [2.42, 2.5, 2.42], x, top, z, 0.12);
      kit.box('metal', GOLD, [0.64, 8.2, 0.64], [x, top + 4.1, z]);
    }
}

/** The radio module: its own PCB with castellated pads, the shield with the name, the antenna. */
function module(c: CompCtx, board: BoardDef, comp: BoardComponent, top: number) {
  const { kit } = c;
  const r = rectToMm(board, comp.rect);
  kit.block('satin', '#14261a', [r.w, 0.8, r.h], r.cx, top, r.cz);
  // castellated pads along the long sides and the shield end
  const pitch = 1.27;
  const n = Math.max(2, Math.floor((r.w * 0.68) / pitch));
  const x0 = r.cx - r.w / 2 + 0.8;
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) kit.box('metal', GOLD, [0.7, 0.82, 0.5], [x0 + i * pitch + 0.35, top + 0.41, r.cz + s * (r.h / 2 - 0.2)]);
  const shieldLen = Math.min(18, r.w * 0.7);
  const shieldX = r.cx - r.w / 2 + shieldLen / 2 + 0.4;
  kit.block('brushed', '#cfd4da', [shieldLen - 0.4, 2.4, r.h - 1.6], shieldX, top + 0.8, r.cz, 0.12);
  kit.box('metal', '#b6bdc5', [shieldLen - 1.2, 0.04, 0.2], [shieldX, top + 3.21, r.cz + (r.h - 1.6) / 2 - 0.6]);
  if (comp.label) c.decals.push({ texture: cachedMarking([comp.label], (shieldLen - 0.4) / (r.h * 0.6), 'rgba(70,76,84,0.9)'), pos: [shieldX, top + 3.22, r.cz], size: [(shieldLen - 0.4) * 0.9, (r.h - 1.6) * 0.6], order: 2 });
  const ax0 = r.cx - r.w / 2 + shieldLen + 0.8;
  const ax1 = r.cx + r.w / 2 - 0.6;
  if (ax1 - ax0 > 2) component(c, { type: 'antenna', at: [(ax0 + ax1) / 2, r.cz], size: [ax1 - ax0, Math.min(11, r.h - 3)] }, top + 0.8);
}

function build(board: BoardDef, top: number): BoardModelData {
  const kit = new Kit();
  const c: CompCtx = { kit, decals: [], taken: [] };
  for (const comp of board.components) {
    const r = rectToMm(board, comp.rect);
    const at: [number, number] = [r.cx, r.cz];
    const h = comp.heightMm;
    const label = comp.label ?? '';
    switch (comp.type) {
      case 'mcu':
      case 'chip':
      case 'bridge':
      case 'regulator': {
        const pkg = chipPackage(comp, board);
        const p: PartComponent['package'] = pkg === 'module' || pkg === 'none' ? 'qfn' : pkg;
        component(c, { type: 'chip', at, size: h ? [r.w, r.h, h] : [r.w, r.h], package: p, label: comp.label?.replace(/\(.*?\)/g, '').trim(), color: comp.color }, top);
        break;
      }
      case 'module':
        module(c, board, comp, top);
        break;
      case 'usb':
        usb(kit, board, comp, top);
        break;
      case 'jack':
        jack(kit, board, comp, top);
        break;
      case 'crystal': {
        const big = /HC49|16 ?MHz/i.test(label) && board.family === 'avr';
        if (/32\.768/.test(label) && Math.max(r.w, r.h) > 3.5) {
          // tuning-fork crystal: a small metal cylinder lying down
          const along = r.w >= r.h ? 'x' : 'z';
          const rad = Math.min(r.w, r.h) / 2;
          kit.rod('brushed', '#d4d8dd', rad, Math.max(r.w, r.h), [r.cx, top + rad, r.cz], along, 16);
        } else component(c, { type: 'crystal', at, size: [r.w, r.h, h ?? (big ? 3.6 : 0.8)], label: big ? label.replace(/\s*MHz/i, '.000') : undefined }, top);
        break;
      }
      case 'button':
        component(c, { type: 'button', at, size: [r.w, r.h, h ?? Math.min(3.5, Math.max(1.6, Math.min(r.w, r.h) * 0.6))], color: comp.color }, top);
        break;
      case 'switch': {
        const sh = h ?? 1.8;
        kit.block('satin', comp.color ?? '#1a1d21', [r.w, sh, r.h], r.cx, top, r.cz, 0.15);
        kit.block('brushed', SHELL, [r.w, 0.2, r.h], r.cx, top + sh, r.cz);
        kit.block('satin', '#e8e8e2', [r.w * 0.25, 0.8, r.h * 0.45], r.cx - r.w / 5, top + sh + 0.2, r.cz, 0.1);
        break;
      }
      case 'connector': {
        if (/micro ?SD|SD card/i.test(label)) component(c, { type: 'socket', at, size: [r.w, r.h, h ?? 1.8] }, top);
        else if (/pads/i.test(label)) {
          const n = Number(/(\d+) pads/.exec(label)?.[1] ?? 5);
          const along = r.w >= r.h;
          for (let i = 0; i < n; i++) {
            const p = (i - (n - 1) / 2) * ((along ? r.w : r.h) / n);
            kit.cyl('metal', GOLD, Math.min(0.7, (along ? r.w : r.h) / n / 2.6), 0.05, along ? r.cx + p : r.cx, top, along ? r.cz : r.cz + p, 14);
          }
        } else if (/ICSP|SWD|jumper|header/i.test(label) || comp.type === 'connector') headerBlock(kit, r.cx, r.cz, r.w, r.h, top);
        break;
      }
      case 'antenna':
        component(c, { type: 'antenna', at, size: [Math.max(1, r.w - 0.8), Math.max(1, r.h - 1)] }, top);
        break;
      default:
        break;
    }
  }
  // small parts next to the components
  for (const p of passivesFor(board)) component(c, { type: 'smd', at: [p.x, p.z], size: [p.w, p.d], rot: p.rot }, top);
  // copper traces under the solder mask, with vias at the bends
  const copper = new THREE.Color(board.pcbColor ?? '#1F3A5F').lerp(new THREE.Color('#9fc2ea'), 0.28);
  const copperHex = '#' + copper.getHexString();
  for (const tr of tracesFor(board)) {
    tr.points.slice(1).forEach(([x1, z1], j) => {
      const [x0, z0] = tr.points[j];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) return;
      kit.box('satin', copperHex, [len + 0.3, 0.02, 0.3], [(x0 + x1) / 2, top + 0.012, (z0 + z1) / 2], [0, -Math.atan2(z1 - z0, x1 - x0), 0]);
    });
    for (const [x, z] of tr.points.slice(1, -1)) kit.add('metal', GOLD, new THREE.RingGeometry(0.18, 0.36, 12), [x, top + 0.025, z], [-Math.PI / 2, 0, 0]);
  }
  return { meshes: kit.build(), decals: c.decals };
}

const cache = new WeakMap<BoardDef, BoardModelData>();

/** The detailed board, built once per board definition. */
export function boardModel(board: BoardDef): BoardModelData {
  let m = cache.get(board);
  if (!m) {
    m = build(board, board.pcbMm.thickness / 2);
    cache.set(board, m);
  }
  return m;
}
