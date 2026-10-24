// Live pixels on the 3D displays: the one hook between whatever draws a display's content (the
// Display Studio simulation) and the display models in Parts.tsx.
//
//   import { setDisplayTexture, displayArea } from '../three/displayTexture';
//
//   const area = displayArea(PARTS['ssd1306-i2c']);   // { widthPx: 128, heightPx: 64, … } or null
//   const canvas = document.createElement('canvas');   // area.widthPx × area.heightPx
//   const tex = new THREE.CanvasTexture(canvas);
//   setDisplayTexture('oled1', tex);                    // scene part id, not the part definition id
//   … draw on the canvas, then tex.needsUpdate = true (every frame you change it) …
//   setDisplayTexture('oled1', null);                   // screen goes dark again
//
// Rules:
// - Keyed by scene part id (ScenePart.id). Any THREE.Texture works; CanvasTexture is the usual one.
// - The texture covers exactly the active area (part JSON `display.activeMm`). Canvas pixel (0, 0)
//   is the active area's corner at -x on the pin-header side (-z in the part's own frame), so the
//   image reads upright when the header is at the top, as on most OLED and TFT modules. Columns
//   run along +x (the pin row), rows away from the header (+z).
// - Use NearestFilter for crisp pixels; the display model sets nothing on your texture except
//   showing it. Colour space is up to the producer (set SRGBColorSpace for normal canvas colours).
// - The producer owns the texture: it updates it, and disposes it after setting null.
// - Without a texture the screen shows the panel switched off (dark glass, or blank paper for
//   e-paper). The models never invent screen content.
// - The texture shows at every Detail setting (Simple too): it is what the part does, not decoration.

import { create } from 'zustand';
import type * as THREE from 'three';
import type { PartDef, PartDisplay } from '@shared/types';

interface DisplayTextures {
  byPart: Record<string, THREE.Texture>;
}

const useDisplayTextures = create<DisplayTextures>(() => ({ byPart: {} }));

/** Show a texture on the display of scene part `partId` (null: back to a dark screen). */
export function setDisplayTexture(partId: string, tex: THREE.Texture | null): void {
  useDisplayTextures.setState((s) => {
    const byPart = { ...s.byPart };
    if (tex) byPart[partId] = tex;
    else delete byPart[partId];
    return { byPart };
  });
}

/** The texture shown on scene part `partId` right now, if any (not reactive). */
export function displayTexture(partId: string): THREE.Texture | null {
  return useDisplayTextures.getState().byPart[partId] ?? null;
}

/** React hook used by the display model: re-renders when the part's texture is set or cleared. */
export function useDisplayTexture(partId: string | undefined): THREE.Texture | null {
  return useDisplayTextures((s) => (partId ? s.byPart[partId] ?? null : null));
}

/**
 * Where the pixels are on a display part, in the part's own frame (mm; x along the pin row, z away
 * from the pins, centre of the part at 0, 0), from its `display` field. Null for parts that are not
 * pixel displays.
 */
export function displayArea(def: PartDef): (PartDisplay & { centerMm: [number, number] }) | null {
  const d = def.display;
  if (!d) return null;
  return { ...d, centerMm: d.centerMm ?? [0, 0] };
}
