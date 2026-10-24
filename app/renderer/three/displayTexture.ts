// Live pixels on the 3D displays: the 3D side of Display Studio's frame store
// (app/renderer/state/displays.ts). Whatever draws a display puts a canvas there, keyed by scene
// part id; the display model in Parts.tsx shows it on the part's active area.
//
//   useDisplayFrames.setState((s) => ({ frames: { ...s.frames, oled1: { canvas, widthPx: 128, heightPx: 64, version: 1 } } }));
//   … draw on the canvas, then bump `version` (no React re-render: the screen checks it every frame) …
//   remove the entry and the screen goes dark again.
//
// Rules:
// - The canvas is the panel's pixels in display colours, mapped 1:1 onto the active area (part JSON
//   `display.activeMm`) with NearestFilter, no colour change.
// - Canvas pixel (0, 0) is the active area's corner at -x on the pin-header side (-z in the part's
//   own frame): columns run along the pin row, rows away from it, so the image reads upright with
//   the header at the top, as on most OLED and TFT modules. `display.widthPx × heightPx` is the
//   panel as it sits on the module (st7735-tft-096: 160 × 80, its controller is portrait).
// - Without a frame the screen shows the panel switched off (dark glass, blank paper for e-paper,
//   unlit LEDs, faint character cells). The models never invent screen content.
// - Shown at every Detail setting (Simple too): it is what the part does, not decoration.

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PartDef, PartDisplay } from '@shared/types';
import { displayLayout } from '@shared/partModel';
import { useDisplayFrames } from '../state/displays';

/**
 * The texture for scene part `partId`'s frame, or null with no frame. Re-renders only when the
 * canvas itself changes; a new `version` re-uploads the same texture on the next frame.
 */
export function useDisplayTexture(partId: string | undefined): THREE.Texture | null {
  const canvas = useDisplayFrames((s) => (partId ? s.frames[partId]?.canvas ?? null : null));
  const tex = useMemo(() => {
    if (!canvas) return null;
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.userData.version = -1;
    return t;
  }, [canvas]);
  useEffect(() => () => tex?.dispose(), [tex]);
  useFrame(() => {
    if (!tex || !partId) return;
    const v = useDisplayFrames.getState().frames[partId]?.version;
    if (v !== undefined && v !== tex.userData.version) {
      tex.userData.version = v;
      tex.needsUpdate = true;
    }
  });
  return tex;
}

/**
 * Where the pixels are on a display part, in the part's own frame (mm; x along the pin row, z away
 * from the pins, centre of the part at 0, 0), from its `display` field. Null for parts that are not
 * pixel displays.
 */
export function displayArea(def: PartDef): (PartDisplay & { centerMm: [number, number] }) | null {
  const d = def.display;
  const lay = displayLayout(def);
  if (!d || !lay) return null;
  return { ...d, centerMm: [lay.active.x, lay.active.z] };
}
