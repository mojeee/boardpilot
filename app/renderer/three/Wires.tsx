// Wires as jumper cables: a thin colored cable with a plug housing at each end. Parallel wires
// fan out, and the others fade while one is selected. Small pulses run along a wire while the
// agent reports bus activity on it.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoardDef, Scene, SceneWire, TargetRef } from '@shared/types';
import { useLive, useScene } from '../state/store';
import { PLUG_MM, wireCurve, wireEndWorld, wireSpread } from './geometry';
import { useDetailed } from '../state/view3d';

const PULSES = 4;

function Wire({ board, scene, wire }: { board: BoardDef; scene: Scene; wire: SceneWire }) {
  const target: TargetRef = `wire:${wire.id}`;
  const highlighted = useScene((s) => s.highlight.includes(target));
  const selected = useScene((s) => s.selected === target);
  const finding = useScene((s) => s.findings.find((f) => f.targets.includes(target)));
  // Another wire is selected: this one steps back.
  const faded = useScene((s) => !!s.selected?.startsWith('wire:') && s.selected !== target);
  const ends = useMemo(() => {
    const a = wireEndWorld(board, scene, wire.from);
    const b = wireEndWorld(board, scene, wire.to);
    return a && b ? ([a, b] as const) : null;
  }, [board, scene, wire]);
  const curve = useMemo(() => (ends ? wireCurve(ends[0], ends[1], wireSpread(scene, wire)) : null), [ends, scene, wire]);
  const geo = useMemo(() => (curve ? new THREE.TubeGeometry(curve, 80, 0.32, 8, false) : null), [curve]);
  const halo = useMemo(() => (curve ? new THREE.TubeGeometry(curve, 64, 0.85, 8, false) : null), [curve]);
  useEffect(() => () => geo?.dispose(), [geo]);
  useEffect(() => () => halo?.dispose(), [halo]);
  const pulses = useRef<(THREE.Mesh | null)[]>([]);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  const cableMat = useRef<THREE.MeshStandardMaterial>(null);
  // Full detail: the cable glows in its colour, and brighter while data goes through it.
  const detailed = useDetailed();

  useFrame(({ clock }) => {
    const until = useLive.getState().activeWires[wire.id] ?? 0;
    const active = until > Date.now();
    pulses.current.forEach((m, i) => {
      if (!m || !curve) return;
      m.visible = active;
      if (active) m.position.copy(curve.getPoint(((clock.elapsedTime * 0.9 + i / PULSES) % 1 + 1) % 1));
    });
    if (haloMat.current) {
      haloMat.current.opacity = highlighted ? 0.25 + 0.2 * Math.sin(clock.elapsedTime * 5) : selected ? 0.3 : finding ? 0.28 : detailed && active ? 0.22 : 0;
      if (detailed && active && !highlighted && !selected && !finding) haloMat.current.color.set(wire.color);
    }
    if (cableMat.current) cableMat.current.emissiveIntensity = detailed ? (active ? 0.75 : 0.32) : 0.12;
  });

  if (!geo || !halo) return null;
  const haloColor = finding?.severity === 'error' ? '#FF5D52' : finding ? '#F2A93B' : highlighted ? '#C9BEFF' : '#ffffff';
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        // The wider halo around the thin cable catches clicks too.
        e.stopPropagation();
        useScene.getState().select(target);
      }}
    >
      <mesh geometry={geo}>
        <meshStandardMaterial ref={cableMat} color={wire.color} roughness={0.42} emissive={wire.color} emissiveIntensity={0.12} transparent opacity={faded ? 0.22 : 1} depthWrite={!faded} />
      </mesh>
      {/* plug housings: black Dupont shells standing on the pins */}
      {ends?.map((p, i) => (
        <mesh key={i} position={[p.x, p.y + PLUG_MM / 2 - 0.3, p.z]}>
          <boxGeometry args={[2.0, PLUG_MM, 2.0]} />
          <meshStandardMaterial color="#16191d" roughness={0.55} transparent opacity={faded ? 0.25 : 1} depthWrite={!faded} />
        </mesh>
      ))}
      <mesh geometry={halo}>
        <meshBasicMaterial ref={haloMat} color={haloColor} transparent opacity={0} depthWrite={false} />
      </mesh>
      {Array.from({ length: PULSES }, (_, i) => (
        <mesh key={i} ref={(m) => (pulses.current[i] = m)} visible={false}>
          <sphereGeometry args={[0.9, 12, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}

export function Wires({ board }: { board: BoardDef }) {
  const scene = useScene((s) => s.scene);
  return (
    <>
      {scene.wires.map((w) => (
        <Wire key={w.id} board={board} scene={scene} wire={w} />
      ))}
    </>
  );
}
