// Textures drawn in code on a canvas: wood grain, the anti-static mat grid, drawer labels and the
// PCB silkscreen. Nothing is downloaded, so the 3D view works offline.

import * as THREE from 'three';

/** Small deterministic random generator, so the desk looks the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas not available');
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
  }
  return tex;
}

/** Warm oak desk top: long grain lines with a few darker streaks and knots. */
export function woodTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 512);
  const r = rng(7);
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 260; i++) {
    const y = r() * c.height;
    const light = r() > 0.5;
    ctx.strokeStyle = light ? `rgba(160,118,78,${0.08 + r() * 0.12})` : `rgba(48,30,18,${0.1 + r() * 0.18})`;
    ctx.lineWidth = 0.6 + r() * 2.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    const amp = 2 + r() * 6;
    const freq = 0.004 + r() * 0.01;
    const phase = r() * 6.28;
    for (let x = 0; x <= c.width; x += 16) ctx.lineTo(x, y + Math.sin(x * freq + phase) * amp);
    ctx.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const x = r() * c.width;
    const y = r() * c.height;
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(40,24,14,${0.25 - i * 0.03})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, 10 + i * 7, 3 + i * 2.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return toTexture(c, [2, 1]);
}

/** Anti-static mat: a coloured rubber surface with a 10 mm grid and a corner marking. */
export function matTexture(widthMm: number, depthMm: number, base: string, line: string): THREE.CanvasTexture {
  const pxPerMm = 2;
  const [c, ctx] = canvas(Math.round(widthMm * pxPerMm), Math.round(depthMm * pxPerMm));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, c.width, c.height);
  // Rubber speckle.
  const r = rng(3);
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
    ctx.fillRect(r() * c.width, r() * c.height, 1.5, 1.5);
  }
  for (let mm = 0; mm <= Math.max(widthMm, depthMm); mm += 10) {
    const major = mm % 50 === 0;
    ctx.strokeStyle = line;
    ctx.globalAlpha = major ? 0.3 : 0.12;
    ctx.lineWidth = major ? 1.6 : 0.8;
    ctx.beginPath();
    ctx.moveTo(mm * pxPerMm, 0);
    ctx.lineTo(mm * pxPerMm, c.height);
    ctx.moveTo(0, mm * pxPerMm);
    ctx.lineTo(c.width, mm * pxPerMm);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  // The usual ESD symbol in one corner: a circle with a hand-like arc.
  const cx = c.width - 44;
  const cy = c.height - 44;
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + 6, 12, Math.PI, 0);
  ctx.stroke();
  ctx.globalAlpha = 1;
  return toTexture(c);
}

/** Front of a small-parts cabinet: a grid of drawers with printed labels. */
export function drawerTexture(cols: number, rows: number, labels: string[]): THREE.CanvasTexture {
  const cw = 96;
  const ch = 56;
  const [c, ctx] = canvas(cols * cw, rows * ch);
  ctx.fillStyle = '#2a3038';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const px = x * cw;
      const py = y * ch;
      ctx.fillStyle = '#9fb3c4';
      ctx.globalAlpha = 0.28;
      ctx.fillRect(px + 4, py + 4, cw - 8, ch - 8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e9e4d6';
      ctx.fillRect(px + 16, py + 10, cw - 32, 18);
      ctx.fillStyle = '#23272d';
      ctx.font = 'bold 13px "IBM Plex Mono", Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[i % labels.length], px + cw / 2, py + 19.5);
      ctx.fillStyle = '#1a1e24';
      ctx.fillRect(px + cw / 2 - 12, py + ch - 18, 24, 5);
    }
  return toTexture(c);
}

/** A printed label for a parts bin. */
export function labelTexture(text: string, bg = '#f1ede2', fg = '#23272d'): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 48);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = fg;
  ctx.font = 'bold 26px "IBM Plex Mono", Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 1);
  return toTexture(c);
}
