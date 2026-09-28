// Wires as colored cables. Small pulses run along a wire while the agent reports bus activity on it.

import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoardDef, Scene, SceneWire, TargetRef } from '@shared/types';
import { useLive, useScene } from '../state/store';
import { wireCurve, wireEndWorld } from './geometry';

const PULSES = 4;

function Wire({ board, scene, wire }: { board: BoardDef; scene: Scene; wire: SceneWire }) {
  const target: TargetRef = `wire:${wire.id}`;
  const highlighted = useScene((s) => s.highlight.includes(target));
  const selected = useScene((s) => s.selected === target);
  const finding = useScene((s) => s.findings.find((f) => f.targets.includes(target)));
  const curve = useMemo(() => {
    const a = wireEndWorld(board, scene, wire.from);
    const b = wireEndWorld(board, scene, wire.to);
    return a && b ? wireCurve(a, b) : null;
  }, [board, scene, wire]);
  const geo = useMemo(() => (curve ? new THREE.TubeGeometry(curve, 64, 0.45, 8, false) : null), [curve]);
  const halo = useMemo(() => (curve ? new THREE.TubeGeometry(curve, 64, 0.95, 8, false) : null), [curve]);
  const pulses = useRef<(THREE.Mesh | null)[]>([]);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const until = useLive.getState().activeWires[wire.id] ?? 0;
    const active = until > Date.now();
    pulses.current.forEach((m, i) => {
      if (!m || !curve) return;
      m.visible = active;
      if (active) m.position.copy(curve.getPoint(((clock.elapsedTime * 0.9 + i / PULSES) % 1 + 1) % 1));
    });
    if (haloMat.current) haloMat.current.opacity = highlighted ? 0.25 + 0.2 * Math.sin(clock.elapsedTime * 5) : selected ? 0.3 : finding ? 0.28 : 0;
  });

  if (!geo || !halo) return null;
  const haloColor = finding?.severity === 'error' ? '#FF5D52' : finding ? '#F2A93B' : highlighted ? '#C9BEFF' : '#ffffff';
  return (
    <group>
      <mesh
        geometry={geo}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          useScene.getState().select(target);
        }}
      >
        <meshStandardMaterial color={wire.color} roughness={0.45} emissive={wire.color} emissiveIntensity={0.12} />
      </mesh>
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
