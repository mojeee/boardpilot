// Starter projects for New project: which toolchains a board offers and the files for each.
// Arduino is the existing single sketch (shared/sketch.ts); Pico SDK is a CMake project
// (shared/starter/picoSdk.ts). ESP-IDF and STM32 HAL are planned (GitHub issue #11).

import type { BoardDef, PartDef, Scene } from '../types';
import { generateSketch } from '../sketch';
import { generatePicoSdk, isRpBoard } from './picoSdk';
import type { StarterProject } from './common';

export type { StarterFile, StarterProject } from './common';
export { isSafeProjectName } from './common';
export { generatePicoSdk, isRpBoard, PICO_TARGET } from './picoSdk';

export type StarterToolchain = 'arduino' | 'pico-sdk';

/** Toolchains offered for this board, Arduino first. Pico SDK only on RP2040/RP2350 boards. */
export function starterToolchains(board: BoardDef): StarterToolchain[] {
  return isRpBoard(board) && board.toolchain.picoBoard ? ['arduino', 'pico-sdk'] : ['arduino'];
}

/** Arduino needs the sketch in a folder of the same name. */
export const ARDUINO_SKETCH = 'BoardPilotProject';

export function generateStarter(toolchain: StarterToolchain, scene: Scene, board: BoardDef, parts: Record<string, PartDef>, opts: { name?: string } = {}): StarterProject {
  if (toolchain === 'pico-sdk' && starterToolchains(board).includes('pico-sdk')) return generatePicoSdk(scene, board, parts, opts);
  return { folder: ARDUINO_SKETCH, files: [{ name: `${ARDUINO_SKETCH}.ino`, text: generateSketch(scene, board, parts) }], notes: [] };
}
