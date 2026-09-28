// Where things are in the 3D scene (millimetres). Board centre at the origin, x along the board
// (USB end is -x), z across it (front pin row is +z), y up.

import * as THREE from 'three';
import type { BoardDef, PartDef, PinMount, Scene, ScenePart, TargetRef } from '@shared/types';
import { pinById, pinMount, pinPositionMm, PARTS } from '@shared/board';

export const PART_BASE_Y = -3;
export const FLOOR_Y = -9;
export const PITCH = 2.54;

/** Height of the wire end above the PCB: top of a socket (Arduino style), tip of an upward pin, or the pad. */
export function pinLiftMm(mount: PinMount): number {
  return mount === 'female-up' ? 8.5 : mount === 'male-up' ? 6 : 0;
}

export function boardPinTop(board: BoardDef, pinId: string): THREE.Vector3 | null {
  const p = pinById(board, pinId);
  if (!p) return null;
  const [x, y, z] = pinPositionMm(board, p);
  return new THREE.Vector3(x, y + pinLiftMm(pinMount(board, p)) + 0.4, z);
}

/** Rotation of a part around the vertical axis, degrees. By default the pin edge faces the board. */
export function partRotationDeg(sp: ScenePart): number {
  return sp.rotation ?? (sp.position[2] >= 0 ? 0 : 180);
}

const SMALL_SHAPES = new Set(['led', 'button', 'pot', 'motor', 'relay']);

/** Pin position in the part's own frame: pins in one row along the -z edge. */
export function partPinLocal(def: PartDef, pinName: string): THREE.Vector3 | null {
  const i = def.pins.findIndex((p) => p.name === pinName);
  if (i < 0) return null;
  const n = def.pins.length;
  const [, d, h] = def.model.size;
  const x = (i - (n - 1) / 2) * PITCH;
  const edge = SMALL_SHAPES.has(def.model.shape) ? d / 2 + 1.5 : d / 2 - 1.3;
  const y = def.model.shape === 'breakout' || def.model.shape === 'oled' || def.model.shape === 'module' ? h + 2.2 : 0.8;
  return new THREE.Vector3(x, y, -edge);
}

/** Pin offset from the part origin, rotated with the part. */
export function partPinOffset(sp: ScenePart, def: PartDef, pinName: string): THREE.Vector3 | null {
  const local = partPinLocal(def, pinName);
  return local ? local.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(partRotationDeg(sp))) : null;
}

export function partPinWorld(sp: ScenePart, pinName: string): THREE.Vector3 | null {
  const def = PARTS[sp.partId];
  if (!def) return null;
  const off = partPinOffset(sp, def, pinName);
  return off ? off.add(new THREE.Vector3(sp.position[0], PART_BASE_Y, sp.position[2])) : null;
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
