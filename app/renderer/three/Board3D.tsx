// The board, generated from its JSON definition: PCB, module with shield and antenna, USB,
// buttons, small chips, header strips, and one clickable mesh per pin (see Pins).

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { BoardComponent, BoardDef } from '@shared/types';
import { rectToMm } from '@shared/board';
import { Pins } from './Pins';
import { Silkscreen } from './Silkscreen';

const COLORS = {
  pcb: '#1F3A5F',
  shield: '#C9CED4',
  gold: '#D9B45A',
  chip: '#15181c',
  module: '#0f1a12',
  plastic: '#1a1d21',
};

function Box({ pos, size, color, metal = 0.1, rough = 0.7, emissive }: { pos: [number, number, number]; size: [number, number, number]; color: string; metal?: number; rough?: number; emissive?: string }) {
  return (
    <mesh position={pos} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={metal} roughness={rough} emissive={emissive ?? '#000'} emissiveIntensity={emissive ? 0.8 : 0} />
    </mesh>
  );
}

function Antenna({ x0, x1, z, y, depth = 11 }: { x0: number; x1: number; z: number; y: number; depth?: number }) {
  // Meander trace of the PCB antenna, drawn as thin gold segments.
  const segs = useMemo(() => {
    const out: { pos: [number, number, number]; size: [number, number, number] }[] = [];
    const w = x1 - x0;
    const n = Math.max(3, Math.round(w / 2.2));
    const half = depth / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + (w * (i + 0.5)) / n;
      out.push({ pos: [x, y, z], size: [0.35, 0.05, depth] });
      if (i < n - 1) out.push({ pos: [x + w / n / 2, y, z + (i % 2 ? -half : half)], size: [w / n, 0.05, 0.35] });
    }
    return out;
  }, [x0, x1, z, y, depth]);
  return (
    <>
      {segs.map((s, i) => (
        <Box key={i} pos={s.pos} size={s.size} color={COLORS.gold} metal={0.85} rough={0.3} />
      ))}
    </>
  );
}

/** Default height above the PCB for each component type, in mm. */
function defaultHeight(type: BoardComponent['type'], label?: string): number {
  switch (type) {
    case 'usb':
      return /USB-B|type-b/i.test(label ?? '') ? 10.9 : /mini/i.test(label ?? '') ? 3.9 : /USB-C/i.test(label ?? '') ? 3.2 : 2.8;
    case 'jack':
      return 10.8;
    case 'mcu':
      return 1.2;
    case 'crystal':
      return /HC49|16 ?MHz/i.test(label ?? '') ? 3.6 : 1.1;
    case 'connector':
      return 3.5;
    case 'switch':
      return 1.8;
    default:
      return 1.2;
  }
}

/**
 * The PCB outline with rounded corners and the mounting holes cut out, lying flat and centred like
 * the old box (top face at +thickness/2).
 */
function pcbGeometry(board: BoardDef): THREE.ExtrudeGeometry {
  const { length: L, width: W, thickness: T } = board.pcbMm;
  const r = Math.min(board.cornerRadiusMm ?? 0.8, L / 4, W / 4);
  // Shape in the x/y plane with y = -z, so it lands the right way round after rotating it flat.
  const shape = new THREE.Shape();
  const x0 = -L / 2;
  const x1 = L / 2;
  const y0 = -W / 2;
  const y1 = W / 2;
  shape.moveTo(x0 + r, y0);
  shape.lineTo(x1 - r, y0);
  shape.quadraticCurveTo(x1, y0, x1, y0 + r);
  shape.lineTo(x1, y1 - r);
  shape.quadraticCurveTo(x1, y1, x1 - r, y1);
  shape.lineTo(x0 + r, y1);
  shape.quadraticCurveTo(x0, y1, x0, y1 - r);
  shape.lineTo(x0, y0 + r);
  shape.quadraticCurveTo(x0, y0, x0 + r, y0);
  for (const [hx, hy, d] of board.holesMm ?? []) {
    const hole = new THREE.Path();
    hole.absarc(hx - L / 2, -(hy - W / 2), d / 2, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 16 });
  // Extruded along +z from 0 to T; rotate so the extrusion points up and centre it on y = 0.
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -T / 2, 0);
  return geo;
}

/** Plated ring around each mounting hole. */
function Holes({ board }: { board: BoardDef }) {
  const { length: L, width: W, thickness: T } = board.pcbMm;
  return (
    <>
      {(board.holesMm ?? []).map(([hx, hy, d], i) => (
        <mesh key={i} position={[hx - L / 2, T / 2 + 0.02, hy - W / 2]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[d / 2, d / 2 + 0.9, 32]} />
          <meshStandardMaterial color={COLORS.gold} metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
    </>
  );
}

export function Board3D({ board }: { board: BoardDef }) {
  const { length, width, thickness } = board.pcbMm;
  const top = thickness / 2;
  const pcb = useMemo(() => pcbGeometry(board), [board]);
  useEffect(() => () => pcb.dispose(), [pcb]);

  const comps = board.components.map((c, i) => {
    const r = rectToMm(board, c.rect);
    const h = c.heightMm ?? defaultHeight(c.type, c.label);
    switch (c.type) {
      case 'module': {
        const shieldLen = Math.min(18, r.w * 0.7);
        const shieldX = r.cx - r.w / 2 + shieldLen / 2;
        const antX0 = r.cx - r.w / 2 + shieldLen + 0.6;
        const antX1 = r.cx + r.w / 2 - 0.6;
        return (
          <group key={i}>
            <Box pos={[r.cx, top + 0.4, r.cz]} size={[r.w, 0.8, r.h]} color={COLORS.module} />
            <Box pos={[shieldX, top + 0.8 + 1.2, r.cz]} size={[shieldLen, 2.4, r.h - 1]} color={COLORS.shield} metal={0.9} rough={0.28} />
            <Antenna x0={antX0} x1={antX1} z={r.cz} y={top + 0.82} depth={Math.min(11, r.h - 3)} />
          </group>
        );
      }
      case 'antenna':
        return <Antenna key={i} x0={r.cx - r.w / 2 + 0.4} x1={r.cx + r.w / 2 - 0.4} z={r.cz} y={top + 0.03} depth={Math.max(1, r.h - 1)} />;
      case 'usb':
        return <Box key={i} pos={[r.cx, top + h / 2, r.cz]} size={[r.w, h, r.h]} color={c.color ?? COLORS.shield} metal={c.color ? 0.35 : 0.9} rough={c.color ? 0.4 : 0.25} />;
      case 'jack':
      case 'connector':
        return <Box key={i} pos={[r.cx, top + h / 2, r.cz]} size={[r.w, h, r.h]} color={c.color ?? COLORS.plastic} rough={0.8} />;
      case 'crystal':
        return <Box key={i} pos={[r.cx, top + h / 2, r.cz]} size={[r.w, h, r.h]} color={c.color ?? COLORS.shield} metal={0.85} rough={0.3} />;
      case 'mcu':
        return (
          <group key={i}>
            <Box pos={[r.cx, top + h / 2, r.cz]} size={[r.w, h, r.h]} color={c.color ?? COLORS.chip} rough={0.55} />
            {/* pin-1 dot */}
            <Box pos={[r.cx - r.w / 2 + Math.min(1.2, r.w / 6), top + h + 0.01, r.cz - r.h / 2 + Math.min(1.2, r.h / 6)]} size={[0.6, 0.02, 0.6]} color="#3a3f46" />
          </group>
        );
      case 'button':
        return (
          <group key={i}>
            <Box pos={[r.cx, top + 0.7, r.cz]} size={[r.w, 1.4, r.h]} color={COLORS.shield} metal={0.8} rough={0.35} />
            <Box pos={[r.cx, top + 1.8, r.cz]} size={[r.w * 0.45, 0.9, r.h * 0.45]} color={c.color ?? '#2b2b2b'} />
          </group>
        );
      case 'switch':
        return (
          <group key={i}>
            <Box pos={[r.cx, top + h / 2, r.cz]} size={[r.w, h, r.h]} color={c.color ?? COLORS.plastic} />
            <Box pos={[r.cx - r.w / 5, top + h + 0.3, r.cz]} size={[r.w / 3, 0.6, r.h * 0.4]} color="#e8e8e8" />
          </group>
        );
      case 'led': {
        const col = c.color ?? (c.label === 'PWR' ? '#ff4d4d' : '#4da3ff');
        return <Box key={i} pos={[r.cx, top + 0.35, r.cz]} size={[r.w, 0.7, r.h]} color={col} emissive={c.label === 'PWR' ? col : undefined} />;
      }
      default:
        return <Box key={i} pos={[r.cx, top + h / 2, r.cz]} size={[r.w, h, r.h]} color={c.color ?? COLORS.chip} rough={0.5} />;
    }
  });

  return (
    <group>
      <mesh geometry={pcb} receiveShadow castShadow userData={{ target: 'part:board' }}>
        <meshStandardMaterial color={board.pcbColor ?? COLORS.pcb} roughness={0.6} metalness={0.05} />
      </mesh>
      {/* silkscreen outline */}
      <lineSegments position={[0, top + 0.01, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(length - 1.2, 0.001, width - 1.2)]} />
        <lineBasicMaterial color={isLight(board.pcbColor) ? '#5b6570' : '#9fb4cc'} transparent opacity={0.35} />
      </lineSegments>
      <Silkscreen board={board} />
      <Holes board={board} />
      {comps}
      <Pins board={board} />
    </group>
  );
}

function isLight(hex?: string): boolean {
  if (!hex) return false;
  const n = parseInt(hex.replace('#', ''), 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 > 150;
}
