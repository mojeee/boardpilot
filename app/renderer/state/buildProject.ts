// Build a project from a list of parts (Describe it, the assistant's "add these parts"): the parts
// go on the desk, the safe-pin rules wire them, and the starter code matches that wiring.

import { PARTS, getBoard } from '@shared/board';
import { assignPins } from '@shared/assign';
import { generateSketch } from '@shared/sketch';
import type { Scene } from '@shared/types';
import { freeSpot } from './sceneActions';

/** A scene with the parts added to `base`, wired by the safe-pin rules; notes say which pins were picked. */
export function sceneWithParts(base: Scene, partIds: string[]): { scene: Scene; notes: string[] } {
  const board = getBoard(base.board);
  let scene: Scene = { ...base, parts: [...base.parts] };
  for (const partId of partIds) {
    const def = PARTS[partId];
    if (!def) continue;
    const stem = partId.replace(/-.*$/, '').replace(/[^a-z0-9]/gi, '') || 'part';
    let n = 1;
    while (scene.parts.some((p) => p.id === `${stem}${n}`)) n++;
    const [x, z] = freeSpot(scene.parts);
    scene = { ...scene, parts: [...scene.parts, { id: `${stem}${n}`, partId, position: [x, 0, z], label: def.name.split(/[ (]/)[0], confirmed: true }] };
  }
  const r = assignPins(scene, board, PARTS);
  return { scene: r.scene, notes: r.notes };
}

/** A new project's scene and starter code for a board and parts. */
export function projectFromParts(boardId: string, partIds: string[], fileName: string): { scene: Scene; notes: string[] } {
  const { scene, notes } = sceneWithParts({ board: boardId, parts: [], wires: [] }, partIds);
  const text = generateSketch(scene, getBoard(boardId), PARTS);
  return { scene: { ...scene, sketch: { name: fileName, text } }, notes };
}

/** A file name for a project name: "Plant waterer" → plant_waterer.ino */
export const sketchFileName = (name: string) =>
  `${
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || 'sketch'
  }.ino`;
