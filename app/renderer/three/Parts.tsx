// Parts next to the board, generated from their definition (shape, size, color, pins).
// Click to select, drag to move, R to rotate, Delete to remove. In wire mode click a board pin,
// then a part pin, to add a wire.

import { useRef } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { PartDef, ScenePart, TargetRef } from '@shared/types';
import { PARTS, ROLE_HEX, partRoleColor } from '@shared/board';
import { t } from '@shared/i18n';
import { log, useScene } from '../state/store';
import { PART_BASE_Y, partPinLocal, partRotationDeg } from './geometry';

const Std = ({ color, ...rest }: { color: string; transparent?: boolean; opacity?: number; emissive?: string; emissiveIntensity?: number; metalness?: number; roughness?: number }) => (
  <meshStandardMaterial color={color} roughness={rest.roughness ?? 0.6} metalness={rest.metalness ?? 0.05} {...rest} />
);

/** The body of a part in its own frame (pin edge along -z). Also used by the part editor preview. */
export function PartBody({ def }: { def: PartDef }) {
  const [w, d, h] = def.model.size;
  const c = def.model.color;
  switch (def.model.shape) {
    case 'led':
      return (
        <group>
          <mesh position={[0, 4, 0]}>
            <cylinderGeometry args={[2.5, 2.5, 5, 24]} />
            <Std color={c} transparent opacity={0.85} emissive={c} emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[0, 6.5, 0]}>
            <sphereGeometry args={[2.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <Std color={c} transparent opacity={0.85} emissive={c} emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[4.5, 1, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.9, 0.9, 5, 12]} />
            <Std color="#d8c39a" />
          </mesh>
        </group>
      );
    case 'button':
      return (
        <group>
          <mesh position={[0, 1.8, 0]}>
            <boxGeometry args={[w, 3.6, d]} />
            <Std color="#2b2b2b" />
          </mesh>
          <mesh position={[0, 4.2, 0]}>
            <cylinderGeometry args={[1.7, 1.7, 1.4, 20]} />
            <Std color="#444" />
          </mesh>
        </group>
      );
    case 'pot':
      return (
        <group>
          <mesh position={[0, 2.5, 0]}>
            <boxGeometry args={[w, 5, d]} />
            <Std color={c} />
          </mesh>
          <mesh position={[0, 6, 0]}>
            <cylinderGeometry args={[3, 3, 3, 24]} />
            <Std color="#e8e8e8" metalness={0.3} roughness={0.4} />
          </mesh>
        </group>
      );
    case 'dht':
      return (
        <group>
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h, d]} />
            <Std color={c} />
          </mesh>
          {Array.from({ length: 4 }, (_, i) => (
            <mesh key={i} position={[0, h + 0.01, -d / 4 + (i * d) / 8]}>
              <boxGeometry args={[w * 0.7, 0.05, 0.8]} />
              <Std color="#bbbbbb" />
            </mesh>
          ))}
        </group>
      );
    case 'oled':
      return (
        <group>
          <mesh position={[0, 0.8, 0]}>
            <boxGeometry args={[w, 1.6, d]} />
            <Std color="#1c2a4a" />
          </mesh>
          <mesh position={[0, 2.2, 1]}>
            <boxGeometry args={[w - 1, 1.4, d - 8]} />
            <Std color={c} roughness={0.15} metalness={0.3} />
          </mesh>
        </group>
      );
    case 'chip': {
      const legs = Math.max(2, Math.round(w / 2.54));
      return (
        <group>
          <mesh position={[0, 1.8 + h / 2, 0]}>
            <boxGeometry args={[w, h, d]} />
            <Std color={c} roughness={0.5} />
          </mesh>
          {Array.from({ length: legs }, (_, i) =>
            [1, -1].map((s) => (
              <mesh key={`${i}${s}`} position={[(i - (legs - 1) / 2) * 2.54, 1, s * (d / 2 + 0.3)]}>
                <boxGeometry args={[0.5, 2, 0.6]} />
                <Std color="#c0c4c8" metalness={0.4} />
              </mesh>
            )),
          )}
        </group>
      );
    }
    case 'module':
      return (
        <group>
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h, d]} />
            <Std color={c} />
          </mesh>
          <mesh position={[0, h + 1.2, d * 0.1]}>
            <boxGeometry args={[w * 0.6, 2.4, d * 0.5]} />
            <Std color="#c9ced4" metalness={0.35} roughness={0.35} />
          </mesh>
        </group>
      );
    case 'motor':
      return (
        <group>
          <mesh position={[0, d / 2, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[d / 2, d / 2, w, 28]} />
            <Std color={c} metalness={0.35} roughness={0.35} />
          </mesh>
          <mesh position={[w / 2 + 2, d / 2, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[1, 1, 4, 12]} />
            <Std color="#d0d0d0" metalness={0.5} />
          </mesh>
        </group>
      );
    case 'relay':
      return (
        <group>
          <mesh position={[0, 0.8, 0]}>
            <boxGeometry args={[w, 1.6, d]} />
            <Std color="#1f4fa8" />
          </mesh>
          <mesh position={[0, 1.6 + 7.5, 1]}>
            <boxGeometry args={[w * 0.6, 15, d * 0.6]} />
            <Std color={c} />
          </mesh>
        </group>
      );
    default:
      return (
        <group>
          <mesh position={[0, h / 2, 0]} castShadow>
            <boxGeometry args={[w, h, d]} />
            <Std color={c} />
          </mesh>
          <mesh position={[0, h + 0.5, 1]}>
            <boxGeometry args={[Math.min(4, w * 0.3), 1, Math.min(4, d * 0.3)]} />
            <Std color="#b9bec4" metalness={0.3} roughness={0.35} />
          </mesh>
        </group>
      );
  }
}

/** Pins in the part frame (unrotated): gold header pin plus a role-colored tip. */
export function PartPins({ def, onPinClick, labels }: { def: PartDef; onPinClick?: (name: string, e: ThreeEvent<MouseEvent>) => void; labels: boolean }) {
  return (
    <>
      {def.pins.map((p) => {
        const pos = partPinLocal(def, p.name);
        if (!pos) return null;
        const color = ROLE_HEX[partRoleColor(p.role)];
        return (
          <group key={p.name} position={pos}>
            <mesh position={[0, -1, 0]}>
              <boxGeometry args={[0.64, 4, 0.64]} />
              <meshStandardMaterial color="#D9B45A" metalness={0.4} roughness={0.35} />
            </mesh>
            <mesh position={[0, 1.1, 0]}>
              <sphereGeometry args={[0.55, 12, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
            </mesh>
            {onPinClick && (
              <mesh
                onClick={(e) => onPinClick(p.name, e)}
                onPointerOver={() => (document.body.style.cursor = 'pointer')}
                onPointerOut={() => (document.body.style.cursor = '')}
              >
                <boxGeometry args={[2.2, 4, 2.2]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
            {labels && (
              <Html position={[0, 2.2, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
                <div className="pin-label small" style={{ borderColor: color }}>
                  {p.name}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
}

function PartModel({ sp }: { sp: ScenePart }) {
  const def = PARTS[sp.partId];
  const labels = useScene((s) => s.labels);
  const target: TargetRef = `part:${sp.id}`;
  const selected = useScene((s) => s.selected === target);
  const highlighted = useScene((s) => s.highlight.includes(target));
  const dragging = useScene((s) => s.draggingPart === sp.id);
  const finding = useScene((s) => s.findings.find((f) => f.targets.includes(target)));
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  if (!def) {
    return (
      <Html position={[sp.position[0], PART_BASE_Y, sp.position[2]]} center>
        <div className="part-label sev-warning">{t('Unknown part “{id}”', { id: sp.partId })}</div>
      </Html>
    );
  }
  const rot = THREE.MathUtils.degToRad(partRotationDeg(sp));
  const [w, d] = def.model.size;

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (useScene.getState().wireMode) return;
    e.stopPropagation();
    const st = useScene.getState();
    st.checkpoint();
    st.set({ draggingPart: sp.id });
    st.select(target);
    if (controls) controls.enabled = false;
  };

  const onPinClick = (name: string, e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const st = useScene.getState();
    if (!st.wireMode) {
      st.select(target);
      return;
    }
    if (!st.wireFrom) {
      log('info', t('Click a board pin first, then the part pin.'));
      return;
    }
    const from = st.wireFrom;
    const role = def.pins.find((p) => p.name === name)?.role ?? 'passive';
    st.updateScene((s) => ({
      ...s,
      wires: [...s.wires, { id: `w${Date.now().toString(36)}`, from: { part: 'board', pin: from }, to: { part: sp.id, pin: name }, color: ROLE_HEX[partRoleColor(role)] }],
    }));
    st.set({ wireFrom: null });
    log('action', t('Wire added: {from} → {part} {pin}.', { from, part: sp.label ?? def.name, pin: name }), { target: `pin:${from}` });
  };

  return (
    <group position={[sp.position[0], PART_BASE_Y + (dragging ? 1.5 : 0), sp.position[2]]}>
      <group rotation={[0, rot, 0]}>
        <group
          onPointerDown={onDown}
          onPointerOver={() => !useScene.getState().wireMode && (document.body.style.cursor = 'grab')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <PartBody def={def} />
        </group>
        <PartPins def={def} labels={labels} onPinClick={onPinClick} />
      </group>
      {(selected || highlighted || dragging) && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(w, d) * 0.75, Math.max(w, d) * 0.75 + 0.6, 40]} />
          <meshBasicMaterial color={highlighted ? '#C9BEFF' : '#ffffff'} side={THREE.DoubleSide} />
        </mesh>
      )}
      <Html position={[0, -1, Math.max(w, d) / 2 + 4]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`part-label ${finding ? `sev-${finding.severity}` : ''}`}>
          {sp.label ?? def.name}
          {sp.confirmed === false && <span className="tag-suggestion">{t('suggestion')}</span>}
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
    document.body.style.cursor = '';
  };
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, PART_BASE_Y, 0]}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (performance.now() - last.current < 16) return;
        last.current = performance.now();
        const x = THREE.MathUtils.clamp(Math.round(e.point.x * 2) / 2, -150, 150);
        let z = THREE.MathUtils.clamp(Math.round(e.point.z * 2) / 2, -110, 110);
        // keep parts off the board itself
        if (Math.abs(x) < 34 && Math.abs(z) < 22) z = z >= 0 ? 22 : -22;
        useScene.getState().updateScene((s) => ({ ...s, parts: s.parts.map((p) => (p.id === dragging ? { ...p, position: [x, 0, z] } : p)) }), { transient: true });
      }}
      onPointerUp={end}
      onPointerLeave={end}
    >
      <planeGeometry args={[800, 800]} />
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
