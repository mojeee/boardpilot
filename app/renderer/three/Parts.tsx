// Parts next to the board, built from simple shapes. Drag a part to move it; in wire mode click a
// board pin, then a part pin, to add a wire.

import { useRef } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { PartDef, ScenePart, TargetRef } from '@shared/types';
import { PARTS, ROLE_HEX, partRoleColor } from '@shared/board';
import { log, useScene } from '../state/store';
import { PART_BASE_Y, partFacing, partPinLocal } from './geometry';

function Body({ def }: { def: PartDef }) {
  const [w, d, h] = def.model.size;
  const c = def.model.color;
  switch (def.model.shape) {
    case 'led':
      return (
        <group>
          <mesh position={[0, 4, 0]}>
            <cylinderGeometry args={[2.5, 2.5, 5, 24]} />
            <meshStandardMaterial color={c} transparent opacity={0.85} emissive={c} emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[0, 6.5, 0]}>
            <sphereGeometry args={[2.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={c} transparent opacity={0.85} emissive={c} emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[4.5, 1, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.9, 0.9, 5, 12]} />
            <meshStandardMaterial color="#d8c39a" />
          </mesh>
        </group>
      );
    case 'button':
      return (
        <group>
          <mesh position={[0, 1.8, 0]}>
            <boxGeometry args={[w, 3.6, d]} />
            <meshStandardMaterial color="#2b2b2b" />
          </mesh>
          <mesh position={[0, 4.2, 0]}>
            <cylinderGeometry args={[1.7, 1.7, 1.4, 20]} />
            <meshStandardMaterial color="#444" />
          </mesh>
        </group>
      );
    case 'pot':
      return (
        <group>
          <mesh position={[0, 2.5, 0]}>
            <boxGeometry args={[w, 5, d]} />
            <meshStandardMaterial color={c} />
          </mesh>
          <mesh position={[0, 6, 0]}>
            <cylinderGeometry args={[3, 3, 3, 24]} />
            <meshStandardMaterial color="#e8e8e8" metalness={0.4} roughness={0.4} />
          </mesh>
        </group>
      );
    case 'dht':
      return (
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={c} />
        </mesh>
      );
    case 'oled':
      return (
        <group>
          <mesh position={[0, 0.8, 0]}>
            <boxGeometry args={[w, 1.6, d]} />
            <meshStandardMaterial color="#1c2a4a" />
          </mesh>
          <mesh position={[0, 2.2, 1]}>
            <boxGeometry args={[w - 1, 1.4, d - 8]} />
            <meshStandardMaterial color={c} roughness={0.15} metalness={0.3} />
          </mesh>
        </group>
      );
    default:
      return (
        <group>
          <mesh position={[0, h / 2, 0]} castShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color={c} roughness={0.6} />
          </mesh>
          <mesh position={[0, h + 0.5, 1]}>
            <boxGeometry args={[2.5, 1, 2.5]} />
            <meshStandardMaterial color="#b9bec4" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      );
  }
}

function PartPin({ sp, def, name, labels }: { sp: ScenePart; def: PartDef; name: string; labels: boolean }) {
  const pos = partPinLocal(def, name, partFacing(sp));
  const role = def.pins.find((p) => p.name === name)?.role ?? 'passive';
  const color = ROLE_HEX[partRoleColor(role)];
  if (!pos) return null;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const st = useScene.getState();
    if (!st.wireMode) {
      st.select(`part:${sp.id}`);
      return;
    }
    if (!st.wireFrom) {
      log('info', 'Click a board pin first, then the part pin.');
      return;
    }
    const from = st.wireFrom;
    st.updateScene((s) => ({
      ...s,
      wires: [...s.wires, { id: `w${Date.now().toString(36)}`, from: { part: 'board', pin: from }, to: { part: sp.id, pin: name }, color }],
    }));
    st.set({ wireFrom: null });
    log('action', `Wire added: ${from} → ${sp.label ?? def.name} ${name}.`, { target: `pin:${from}` });
  };
  return (
    <group position={pos}>
      <mesh position={[0, -1, 0]}>
        <boxGeometry args={[0.64, 4, 0.64]} />
        <meshStandardMaterial color="#D9B45A" metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <sphereGeometry args={[0.55, 12, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <mesh onClick={onClick} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <boxGeometry args={[2.2, 4, 2.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {labels && (
        <Html position={[0, 2.2, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="pin-label small" style={{ borderColor: color }}>
            {name}
          </div>
        </Html>
      )}
    </group>
  );
}

function PartModel({ sp }: { sp: ScenePart }) {
  const def = PARTS[sp.partId];
  const labels = useScene((s) => s.labels);
  const target: TargetRef = `part:${sp.id}`;
  const selected = useScene((s) => s.selected === target);
  const highlighted = useScene((s) => s.highlight.includes(target));
  const finding = useScene((s) => s.findings.find((f) => f.targets.includes(target)));
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  if (!def) return null;
  const facing = partFacing(sp);
  const [w, d] = def.model.size;

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (useScene.getState().wireMode) return;
    e.stopPropagation();
    useScene.getState().set({ draggingPart: sp.id });
    useScene.getState().select(target);
    if (controls) controls.enabled = false;
  };

  return (
    <group position={[sp.position[0], PART_BASE_Y, sp.position[2]]}>
      <group rotation={[0, facing === -1 ? 0 : Math.PI, 0]} onPointerDown={onDown}>
        <Body def={def} />
      </group>
      {def.pins.map((p) => (
        <PartPin key={p.name} sp={sp} def={def} name={p.name} labels={labels} />
      ))}
      {(selected || highlighted) && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(w, d) * 0.75, Math.max(w, d) * 0.75 + 0.6, 40]} />
          <meshBasicMaterial color={highlighted ? '#C9BEFF' : '#ffffff'} side={THREE.DoubleSide} />
        </mesh>
      )}
      <Html position={[0, -1, -facing * (d / 2 + 4)]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`part-label ${finding ? `sev-${finding.severity}` : ''}`}>
          {sp.label ?? def.name}
          {sp.confirmed === false && <span className="tag-suggestion">suggestion</span>}
        </div>
      </Html>
    </group>
  );
}

/** Invisible floor that receives pointer moves while a part is dragged. */
function DragPlane() {
  const dragging = useScene((s) => s.draggingPart);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const last = useRef(0);
  if (!dragging) return null;
  const end = () => {
    useScene.getState().set({ draggingPart: null });
    if (controls) controls.enabled = true;
  };
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, PART_BASE_Y, 0]}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (performance.now() - last.current < 16) return;
        last.current = performance.now();
        let x = Math.round(e.point.x * 2) / 2;
        let z = Math.round(e.point.z * 2) / 2;
        // keep parts off the board itself
        if (Math.abs(x) < 34 && Math.abs(z) < 24) z = z >= 0 ? 24 : -24;
        x = THREE.MathUtils.clamp(x, -120, 120);
        z = THREE.MathUtils.clamp(z, -90, 90);
        useScene.getState().updateScene((s) => ({ ...s, parts: s.parts.map((p) => (p.id === dragging ? { ...p, position: [x, 0, z] } : p)) }));
      }}
      onPointerUp={end}
      onPointerLeave={end}
    >
      <planeGeometry args={[600, 600]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export function Parts() {
  const parts = useScene((s) => s.scene.parts);
  return (
    <>
      {parts.map((p) => (
        <PartModel key={p.id} sp={p} />
      ))}
      <DragPlane />
    </>
  );
}
