// Starter projects for New project: which toolchains a board offers and the files for each.
// Arduino is the existing single sketch (shared/sketch.ts); the vendor SDK projects are
// Pico SDK (shared/starter/picoSdk.ts), ESP-IDF (espIdf.ts) and STM32 HAL (stm32Hal.ts).

import type { BoardDef, PartDef, Scene } from '../types';
import { generateSketch } from '../sketch';
import { generatePicoSdk, isRpBoard } from './picoSdk';
import { generateEspIdf, isIdfBoard } from './espIdf';
import { generateStm32Hal, isStm32HalBoard } from './stm32Hal';
import type { StarterProject } from './common';

export type { StarterFile, StarterProject } from './common';
export { isSafeProjectName, isSafeProjectPath } from './common';
export { generatePicoSdk, isRpBoard, PICO_TARGET } from './picoSdk';
export { generateEspIdf, isIdfBoard, IDF_MIN_VERSION, IDF_PROJECT } from './espIdf';
export { generateStm32Hal, isStm32HalBoard, STM32_TARGET, STM32_REPOS } from './stm32Hal';

export type StarterToolchain = 'arduino' | 'pico-sdk' | 'esp-idf' | 'stm32-hal';

/** Name of each toolchain as the UI shows it (product names, the same in every language). */
export const TOOLCHAIN_NAME: Record<StarterToolchain, string> = {
  arduino: 'Arduino',
  'pico-sdk': 'Pico SDK',
  'esp-idf': 'ESP-IDF',
  'stm32-hal': 'STM32 HAL',
};

/**
 * Toolchains offered for this board, Arduino first: Pico SDK on RP2040/RP2350 boards, ESP-IDF on
 * ESP32 family boards, STM32 HAL on STM32 boards. Each needs its board-file field (picoBoard,
 * idfTarget, stm32Hal).
 */
export function starterToolchains(board: BoardDef): StarterToolchain[] {
  if (isRpBoard(board) && board.toolchain.picoBoard) return ['arduino', 'pico-sdk'];
  if (isIdfBoard(board)) return ['arduino', 'esp-idf'];
  if (isStm32HalBoard(board)) return ['arduino', 'stm32-hal'];
  return ['arduino'];
}

/** Arduino needs the sketch in a folder of the same name. */
export const ARDUINO_SKETCH = 'BoardPilotProject';

export function generateStarter(toolchain: StarterToolchain, scene: Scene, board: BoardDef, parts: Record<string, PartDef>, opts: { name?: string } = {}): StarterProject {
  const offered = starterToolchains(board).includes(toolchain);
  if (offered && toolchain === 'pico-sdk') return generatePicoSdk(scene, board, parts, opts);
  if (offered && toolchain === 'esp-idf') return generateEspIdf(scene, board, parts, opts);
  if (offered && toolchain === 'stm32-hal') return generateStm32Hal(scene, board, parts, opts);
  return { folder: ARDUINO_SKETCH, files: [{ name: `${ARDUINO_SKETCH}.ino`, text: generateSketch(scene, board, parts) }], notes: [] };
}
