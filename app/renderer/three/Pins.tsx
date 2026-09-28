// One clickable object per board pin, generated from the board file. Colors come from the role of
// whatever is wired to the pin; live levels, PWM and ADC readings animate it.

import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { BoardDef, PinDef, TargetRef } from '@shared/types';
import { ROLE_HEX, pinPositionMm, pinRoleInScene } from '@shared/board';
import { useLive, useScene } from '../state/store';

const GOLD = '#D9B45A';

function PinMesh({ board, pin }: { board: BoardDef; pin: PinDef }) {
  const [x, y, z] = pinPositionMm(board, pin);
  const scene = useScene((s) => s.scene);
  const findings = useScene((s) => s.findings);
  const labels = useScene((s) => s.labels);
  const target: TargetRef = `pin:${pin.id}`;
  const isSelected = useScene((s) => s.selected === target);
  const isHighlighted = useScene((s) => s.highlight.includes(target));
  const wireMode = useScene((s) => s.wireMode);
  const wireFrom = useScene((s) => s.wireFrom);

  const role = useMemo(() => pinRoleInScene(board, scene, pin.id), [board, scene, pin.id]);
  const color = ROLE_HEX[role];
  const inUse = useMemo(
    () => scene.wires.some((w) => (w.from.part === 'board' && w.from.pin === pin.id) || (w.to.part === 'board' && w.to.pin === pin.id)),
    [scene, pin.id],
  );
  const finding = findings.find((f) => f.targets.includes(target));

  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  const bar = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const live = useLive.getState();
    const st = pin.gpio !== null && Date.now() - live.frameAt < 2000 ? live.frame?.pins[String(pin.gpio)] : undefined;
    let glow = inUse ? 0.25 : 0.05;
    if (st?.mode === 'pwm') glow = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 8)) * ((st.duty ?? 50) / 100);
    else if (st?.level === 1) glow = 0.9;
    if (isHighlighted) glow = Math.max(glow, 0.6 + 0.4 * Math.sin(clock.elapsedTime * 5));
    if (ringMat.current) ringMat.current.emissiveIntensity = glow;
    if (ring.current) {
      const s = isHighlighted || isSelected ? 1.35 : 1;
      ring.current.scale.setScalar(THREE.MathUtils.lerp(ring.current.scale.x, s, 0.2));
    }
    if (bar.current) {
      const mv = st?.mv;
      bar.current.visible = mv !== undefined;
      if (mv !== undefined) {
        const h = Math.max(0.2, (mv / 3300) * 10);
        bar.current.scale.y = h;
        bar.current.position.y = 1.2 + h / 2;
      }
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const st = useScene.getState();
    if (st.wireMode) {
      st.set({ wireFrom: pin.id });
      return;
    }
    st.select(target);
  };

  const labelOffset = pin.row === 'front' ? 3.4 : -3.4;
  const dimmed = wireMode && pin.kind === 'enable';

  return (
    <group position={[x, y, z]}>
      {/* solder pad */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.85, 0.85, 0.12, 20]} />
        <meshStandardMaterial color={GOLD} metalness={0.4} roughness={0.35} />
      </mesh>
      {/* header pin going down */}
      <mesh position={[0, -5.2, 0]}>
        <boxGeometry args={[0.64, 10, 0.64]} />
        <meshStandardMaterial color={GOLD} metalness={0.4} roughness={0.35} />
      </mesh>
      {/* role ring */}
      <mesh ref={ring} position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.05, 0.2, 10, 28]} />
        <meshStandardMaterial ref={ringMat} color={color} emissive={color} emissiveIntensity={0.2} roughness={0.4} transparent opacity={dimmed ? 0.3 : 1} />
      </mesh>
      {isSelected && (
        <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.55, 1.8, 32]} />
          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
        </mesh>
      )}
      {wireFrom === pin.id && (
        <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.55, 1.9, 32]} />
          <meshBasicMaterial color="#C9BEFF" side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* ADC level bar */}
      <mesh ref={bar} position={[0, 1.2, labelOffset * 0.2]} visible={false}>
        <boxGeometry args={[0.7, 1, 0.7]} />
        <meshStandardMaterial color={ROLE_HEX.adc} emissive={ROLE_HEX.adc} emissiveIntensity={0.6} />
      </mesh>
      {/* warning marker */}
      {finding && (
        <mesh position={[0, 3.2, 0]}>
          <octahedronGeometry args={[0.8]} />
          <meshStandardMaterial
            color={finding.severity === 'error' ? '#FF5D52' : finding.severity === 'warning' ? '#F2A93B' : '#7D8997'}
            emissive={finding.severity === 'error' ? '#FF5D52' : '#F2A93B'}
            emissiveIntensity={0.7}
          />
        </mesh>
      )}
      {/* generous invisible hit area so pins are easy to click */}
      <mesh
        position={[0, 0.5, 0]}
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
        userData={{ target }}
      >
        <boxGeometry args={[2.3, 3, 2.3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {labels && (
        <Html position={[0, 0.3, labelOffset]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`pin-label ${isHighlighted || isSelected ? 'hot' : ''}`} style={{ borderColor: color }}>
            {pin.label}
          </div>
        </Html>
      )}
    </group>
  );
}

export function Pins({ board }: { board: BoardDef }) {
  return (
    <>
      {board.pins.map((p) => (
        <PinMesh key={p.id} board={board} pin={p} />
      ))}
    </>
  );
}
