import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BOARDS, PARTS, getBoard } from '@shared/board';
import { HOME_DIR, fitCamera, sceneBounds } from '../app/renderer/three/framing';

/** Every corner of the box projects inside the screen (normalised device coordinates within ±1). */
function allCornersVisible(box: THREE.Box3, pos: THREE.Vector3, target: THREE.Vector3, fov: number, aspect: number) {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 1, 5000);
  cam.position.copy(pos);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const { min, max } = box;
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y])
      for (const z of [min.z, max.z]) {
        const p = new THREE.Vector3(x, y, z).project(cam);
        if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return false;
      }
  return true;
}

describe('camera framing', () => {
  it('fits every board on screen, and the board fills a good part of it', () => {
    for (const board of Object.values(BOARDS)) {
      const box = sceneBounds(board, { board: board.id, parts: [], wires: [] }, PARTS);
      const { pos, target } = fitCamera(box, 35, 16 / 9);
      expect(allCornersVisible(box, pos, target, 35, 16 / 9), board.id).toBe(true);
      // Not too far out: the board's length covers at least a third of the screen width.
      const cam = new THREE.PerspectiveCamera(35, 16 / 9, 1, 5000);
      cam.position.copy(pos);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      const a = new THREE.Vector3(-board.pcbMm.length / 2, 0, 0).project(cam);
      const b = new THREE.Vector3(board.pcbMm.length / 2, 0, 0).project(cam);
      expect(Math.abs(b.x - a.x) / 2, board.id).toBeGreaterThan(0.33);
    }
  });

  it('includes the parts around the board', () => {
    const board = getBoard();
    const partId = Object.keys(PARTS)[0];
    const scene = { board: board.id, parts: [{ id: 'p1', partId, position: [-140, 0, 90] as [number, number, number] }], wires: [] };
    const box = sceneBounds(board, scene, PARTS);
    expect(box.min.x).toBeLessThan(-140);
    expect(box.max.z).toBeGreaterThan(90);
    const { pos, target } = fitCamera(box, 35, 4 / 3);
    expect(allCornersVisible(box, pos, target, 35, 4 / 3)).toBe(true);
  });

  it('looks from the front-left, from above', () => {
    expect(HOME_DIR.y).toBeGreaterThan(0.5);
    expect(HOME_DIR.z).toBeGreaterThan(0);
  });
});
