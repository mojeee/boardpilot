// Pin names and the board name printed on the PCB like real silkscreen, drawn on a canvas from
// the board file. A label that fits on no side of its pin (packed double headers) is left out;
// the floating tags and the 2D pinout still name those pins.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { BoardDef } from '@shared/types';
import { silkscreenLayout, type Label } from './silkscreenLayout';

const FONT = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

function isLight(hex?: string): boolean {
  if (!hex) return false;
  const n = parseInt(hex.replace('#', ''), 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 > 150;
}

function draw(board: BoardDef, labels: Label[]): HTMLCanvasElement {
  const { length, width } = board.pcbMm;
  const px = Math.min(28, 2048 / Math.max(length, width));
  const c = document.createElement('canvas');
  c.width = Math.round(length * px);
  c.height = Math.round(width * px);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.fillStyle = isLight(board.pcbColor) ? '#2a2f36' : '#eef1f4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const l of labels) {
    ctx.save();
    ctx.translate(l.x * px, l.y * px);
    if (l.vertical) ctx.rotate(-Math.PI / 2);
    ctx.font = `600 ${Math.round(l.size * px)}px ${FONT}`;
    ctx.fillText(l.text, 0, l.size * px * 0.06);
    ctx.restore();
  }
  return c;
}

export function Silkscreen({ board }: { board: BoardDef }) {
  const labels = useMemo(() => silkscreenLayout(board), [board]);
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(draw(board, labels));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [board, labels]);
  useEffect(() => {
    // Redraw once the UI font has loaded, so the print uses IBM Plex Mono when it is available.
    let alive = true;
    document.fonts?.ready.then(() => {
      if (!alive) return;
      tex.image = draw(board, labels);
      tex.needsUpdate = true;
    });
    return () => {
      alive = false;
      tex.dispose();
    };
  }, [tex, board, labels]);
  const { length, width, thickness } = board.pcbMm;
  return (
    <mesh position={[0, thickness / 2 + 0.015, 0]} rotation-x={-Math.PI / 2} renderOrder={1}>
      <planeGeometry args={[length, width]} />
      <meshStandardMaterial map={tex} transparent depthWrite={false} roughness={0.8} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  );
}
