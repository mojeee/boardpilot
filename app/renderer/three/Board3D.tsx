// The board, generated from its JSON definition: PCB, module with shield and antenna, USB,
// buttons, small chips, header strips, and one clickable mesh per pin (see Pins).

import { useMemo } from 'react';
import * as THREE from 'three';
import type { BoardDef } from '@shared/types';
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

function Antenna({ x0, x1, z, y }: { x0: number; x1: number; z: number; y: number }) {
  // Meander trace of the PCB antenna, drawn as thin gold segments.
  const segs = useMemo(() => {
    const out: { pos: [number, number, number]; size: [number, number, number] }[] = [];
    const w = x1 - x0;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const x = x0 + (w * (i + 0.5)) / n;
      out.push({ pos: [x, y, z], size: [0.35, 0.05, 11] });
      if (i < n - 1) out.push({ pos: [x + w / n / 2, y, z + (i % 2 ? -5.5 : 5.5)], size: [w / n, 0.05, 0.35] });
    }
    return out;
  }, [x0, x1, z, y]);
  return (
    <>
      {segs.map((s, i) => (
        <Box key={i} pos={s.pos} size={s.size} color={COLORS.gold} metal={0.4} rough={0.35} />
      ))}
    </>
  );
}

export function Board3D({ board }: { board: BoardDef }) {
  const { length, width, thickness } = board.pcbMm;
  const top = thickness / 2;

  const comps = board.components.map((c, i) => {
    const r = rectToMm(board, c.rect);
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
            <Antenna x0={antX0} x1={antX1} z={r.cz} y={top + 0.82} />
          </group>
        );
      }
      case 'usb':
        return <Box key={i} pos={[r.cx, top + 1.4, r.cz]} size={[r.w, 2.8, r.h]} color={COLORS.shield} metal={0.35} rough={0.4} />;
      case 'button':
        return (
          <group key={i}>
            <Box pos={[r.cx, top + 0.7, r.cz]} size={[r.w, 1.4, r.h]} color={COLORS.shield} metal={0.3} rough={0.45} />
            <Box pos={[r.cx, top + 1.8, r.cz]} size={[r.w * 0.45, 0.9, r.h * 0.45]} color="#2b2b2b" />
          </group>
        );
      case 'led':
        return <Box key={i} pos={[r.cx, top + 0.35, r.cz]} size={[r.w, 0.7, r.h]} color={c.label === 'PWR' ? '#ff4d4d' : '#4da3ff'} emissive={c.label === 'PWR' ? '#ff2020' : undefined} />;
      default:
        return <Box key={i} pos={[r.cx, top + 0.6, r.cz]} size={[r.w, 1.2, r.h]} color={COLORS.chip} rough={0.5} />;
    }
  });

  const rowZ = board.header.rowSpacingMm / 2;
  const n = Math.max(...board.pins.map((p) => p.index)) + 1;
  const stripLen = n * board.header.pitchMm;
  const stripX = board.header.firstPinOffsetMm - ((n - 1) * board.header.pitchMm) / 2 - length / 2;

  return (
    <group>
      <mesh receiveShadow castShadow userData={{ target: 'part:board' }}>
        <boxGeometry args={[length, thickness, width]} />
        <meshStandardMaterial color={COLORS.pcb} roughness={0.6} metalness={0.05} />
      </mesh>
      {/* silkscreen outline */}
      <lineSegments position={[0, top + 0.01, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(length - 1.2, 0.001, width - 1.2)]} />
        <lineBasicMaterial color="#9fb4cc" transparent opacity={0.35} />
      </lineSegments>
      {comps}
      {/* black plastic header spacers under the board */}
      {[1, -1].map((s) => (
        <Box key={s} pos={[stripX, -top - 1.25, s * rowZ]} size={[stripLen, 2.5, 2.5]} color={COLORS.plastic} />
      ))}
      <Pins board={board} />
    </group>
  );
}
