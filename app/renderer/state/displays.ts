// Live pixels of simulated displays (Display Studio), keyed by scene part id (e.g. "oled1").
// The 3D display mesh shows `canvas` as a texture on the active area and re-uploads it when
// `version` changes. No entry: the screen is off (dark glass).
import { create } from 'zustand';
export interface DisplayFrame { canvas: HTMLCanvasElement; widthPx: number; heightPx: number; version: number }
export const useDisplayFrames = create<{ frames: Record<string, DisplayFrame> }>(() => ({ frames: {} }));
