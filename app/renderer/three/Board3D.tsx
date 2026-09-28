// The board, generated from its JSON definition: PCB, module with shield and antenna, USB,
// buttons, small chips, header strips, and one clickable mesh per pin (see Pins).

import { useMemo } from 'react';
import * as THREE from 'three';
import type { BoardComponent, BoardDef } from '@shared/types';
import { rectToMm } from '@shared/board';
import { Pins } from './Pins';

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
        <Box key={i} pos={s.pos} size={s.size} color={COLORS.gold} metal={0.4} rough={0.35} />
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

export function Board3D({ board }: { board: BoardDef }) {
  const { length, width, thickness } = board.pcbMm;
  const top = thickness / 2;

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
            <Box pos={[shieldX, top + 0.8 + 1.2, r.cz]} size={[shieldLen, 2.4, r.h - 1]} color={COLORS.shield} metal={0.35} rough={0.35} />
            <Antenna x0={antX0} x1={antX1} z={r.cz} y={top + 0.82} depth={Math.min(11, r.h - 3)} />
          </group>
        );
      }
      case 'antenna':
        return <Antenna key={i} x0={r.cx - r.w / 2 + 0.4} x1={r.cx + r.w / 2 - 0.4} z={r.cz} y={top + 0.03} depth={Math.max(1, r.h - 1)} />;
      case 'usb':
        return <Box key={i} pos={[r.cx, top + h / 2, r.cz]} size={[r.w, h, r.h]} color={c.color ?? COLORS.shield} metal={0.35} rough={0.4} />;
      case 'jack':
      case 'connector':
        return <Box key={i} pos={[r.cx, top + h / 2, r.cz]} size={[r.w, h, r.h]} color={c.color ?? COLORS.plastic} rough={0.8} />;
      case 'crystal':
        return <Box key={i} pos={[r.cx, top + h / 2, r.cz]} size={[r.w, h, r.h]} color={c.color ?? COLORS.shield} metal={0.35} rough={0.35} />;
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
            <Box pos={[r.cx, top + 0.7, r.cz]} size={[r.w, 1.4, r.h]} color={COLORS.shield} metal={0.3} rough={0.45} />
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
      <mesh receiveShadow castShadow userData={{ target: 'part:board' }}>
        <boxGeometry args={[length, thickness, width]} />
        <meshStandardMaterial color={board.pcbColor ?? COLORS.pcb} roughness={0.6} metalness={0.05} />
      </mesh>
      {/* silkscreen outline */}
      <lineSegments position={[0, top + 0.01, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(length - 1.2, 0.001, width - 1.2)]} />
        <lineBasicMaterial color={isLight(board.pcbColor) ? '#5b6570' : '#9fb4cc'} transparent opacity={0.35} />
      </lineSegments>
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
