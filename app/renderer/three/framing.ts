// Camera framing: fit the board and every part on screen from the usual three-quarter angle.
// Pure maths (no React), so it is unit-tested in tests/framing.test.ts.

import * as THREE from 'three';
import type { BoardDef, PartDef, Scene } from '@shared/types';
import { FLOOR_Y, PART_BASE_Y } from './geometry';

/** The default viewing direction (from the target towards the camera): front-left, from above. */
export const HOME_DIR = new THREE.Vector3(-0.3, 0.62, 0.72).normalize();

/** Box around the board and all parts, in scene millimetres. */
export function sceneBounds(board: BoardDef, scene: Scene, parts: Record<string, PartDef>): THREE.Box3 {
  const { length, width, thickness } = board.pcbMm;
  const box = new THREE.Box3(new THREE.Vector3(-length / 2, FLOOR_Y + 3, -width / 2), new THREE.Vector3(length / 2, thickness / 2 + 6, width / 2));
  for (const sp of scene.parts) {
    const def = parts[sp.partId];
    const [w, d, h] = def?.model.size ?? [10, 10, 5];
    // Parts can be rotated: use the larger footprint side in both directions.
    const r = Math.max(w, d) / 2;
    box.expandByPoint(new THREE.Vector3(sp.position[0] - r, PART_BASE_Y, sp.position[2] - r));
    box.expandByPoint(new THREE.Vector3(sp.position[0] + r, PART_BASE_Y + h + 3, sp.position[2] + r));
  }
  return box;
}

/**
 * Camera position and target that fit a box on screen, looking along `dir`. `margin` > 1 leaves
 * room around the edges (the toolbar on top and the legend below cover part of the view).
 */
export function fitCamera(
  box: THREE.Box3,
  fovDeg: number,
  aspect: number,
  dir: THREE.Vector3 = HOME_DIR,
  margin = 1.12,
): { pos: THREE.Vector3; target: THREE.Vector3; distance: number } {
  const target = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.1, aspect));
  // Distance at which a sphere of this radius fits in the narrower field of view. A sphere is a
  // loose fit for a flat, wide scene seen from above, so shrink it: boards look small otherwise.
  const fit = (radius * 0.78) / Math.sin(Math.min(vFov, hFov) / 2);
  const distance = Math.max(40, fit * margin);
  const pos = target.clone().add(dir.clone().normalize().multiplyScalar(distance));
  return { pos, target, distance };
}
