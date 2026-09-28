// Where things are in the 3D scene (millimetres). Board centre at the origin, x along the board
// (USB end is -x), z across it (front pin row is +z), y up.

import * as THREE from 'three';
import type { BoardDef, PartDef, Scene, ScenePart, TargetRef } from '@shared/types';
import { pinById, pinPositionMm, PARTS } from '@shared/board';

export const PART_BASE_Y = -3;
export const FLOOR_Y = -9;
export const PITCH = 2.54;

export function boardPinTop(board: BoardDef, pinId: string): THREE.Vector3 | null {
  const p = pinById(board, pinId);
  if (!p) return null;
  const [x, y, z] = pinPositionMm(board, p);
  return new THREE.Vector3(x, y + 0.4, z);
}

/** Parts in front of the board face it with their pin edge (-z); parts behind face +z. */
export function partFacing(sp: ScenePart): 1 | -1 {
  return sp.position[2] >= 0 ? -1 : 1;
}

export function partPinLocal(def: PartDef, pinName: string, facing: 1 | -1): THREE.Vector3 | null {
  const i = def.pins.findIndex((p) => p.name === pinName);
  if (i < 0) return null;
  const n = def.pins.length;
  const [, d, h] = def.model.size;
  const x = (i - (n - 1) / 2) * PITCH;
  const edge = def.model.shape === 'led' || def.model.shape === 'button' || def.model.shape === 'pot' ? d / 2 + 1.5 : d / 2 - 1.3;
  const y = def.model.shape === 'breakout' || def.model.shape === 'oled' ? h + 2.2 : 0.8;
  return new THREE.Vector3(facing === -1 ? x : -x, y, facing * edge);
}

export function partPinWorld(sp: ScenePart, pinName: string): THREE.Vector3 | null {
  const def = PARTS[sp.partId];
  if (!def) return null;
  const local = partPinLocal(def, pinName, partFacing(sp));
  if (!local) return null;
  return local.add(new THREE.Vector3(sp.position[0], PART_BASE_Y, sp.position[2]));
}

export function wireEndWorld(board: BoardDef, scene: Scene, end: { part: string; pin: string }): THREE.Vector3 | null {
  if (end.part === 'board') return boardPinTop(board, end.pin);
  const sp = scene.parts.find((p) => p.id === end.part);
  return sp ? partPinWorld(sp, end.pin) : null;
}

export function wireCurve(a: THREE.Vector3, b: THREE.Vector3): THREE.CatmullRomCurve3 {
  const dist = a.distanceTo(b);
  const lift = 6 + dist * 0.18;
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y = Math.max(a.y, b.y) + lift;
  return new THREE.CatmullRomCurve3(
    [a, a.clone().add(new THREE.Vector3(0, lift * 0.55, 0)), mid, b.clone().add(new THREE.Vector3(0, lift * 0.55, 0)), b],
    false,
    'centripetal',
  );
}

/** A point to look at for a target, used by the camera fly-to. */
export function targetPoint(board: BoardDef, scene: Scene, ref: TargetRef): THREE.Vector3 | null {
  const [kind, id] = ref.split(/:(.+)/) as [string, string];
  if (kind === 'pin') return boardPinTop(board, id);
  if (kind === 'part') {
    if (id === 'board') return new THREE.Vector3(0, 0, 0);
    const sp = scene.parts.find((p) => p.id === id);
    return sp ? new THREE.Vector3(sp.position[0], PART_BASE_Y + 2, sp.position[2]) : null;
  }
  const w = scene.wires.find((x) => x.id === id);
  if (!w) return null;
  const a = wireEndWorld(board, scene, w.from);
  const b = wireEndWorld(board, scene, w.to);
  if (!a || !b) return null;
  return wireCurve(a, b).getPoint(0.5);
}
