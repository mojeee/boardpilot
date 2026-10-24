// The "Full" detail of the board (3D toolbar → Detail), generated from the board file: chips with
// legs by package and their part number printed on top, the small resistors and capacitors around
// them, a few copper traces, the power LED lit while the board is on USB, the board LED lit while
// its pin is HIGH, and (Detail → Labels) a tag on each main part.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { BoardComponent, BoardDef } from '@shared/types';
import { rectToMm } from '@shared/board';
import { chipPackage, isPowerLed, passivesFor, tracesFor } from '@shared/boardDetail';
import { t } from '@shared/i18n';
import { useApp, useLive } from '../state/store';
import { useTemplate } from '../state/templateRun';
import { glowTexture, markingTexture } from './textures';

const LEG = '#c7ccd2';
const BODY = '#17191c';

function Leg({ pos, size }: { pos: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh position={pos}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={LEG} metalness={0.85} roughness={0.3} />
    </mesh>
  );
}

/** The part number on top of a chip. */
function Marking({ text, w, d, y }: { text: string; w: number; d: number; y: number }) {
  const lines = useMemo(() => {
    const words = text.replace(/\(.*?\)/g, '').trim().split(/\s+/);
    return words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [text.replace(/\(.*?\)/g, '').trim()];
  }, [text]);
  const tex = useMemo(() => markingTexture(lines, w / d), [lines, w, d]);
  return (
    <mesh position={[0, y, 0]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[w * 0.86, d * 0.86]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

/** A chip with the legs of its package, standing on the PCB top at y = 0 (group coordinates). */
export function PackagedChip({ c, board }: { c: BoardComponent; board: BoardDef }) {
  const r = rectToMm(board, c.rect);
  const pkg = chipPackage(c, board);
  const w = r.w;
  const d = r.h;
  const h = c.heightMm ?? (pkg === 'dip' ? 3.4 : pkg === 'sot223' ? 1.6 : pkg === 'lqfp' ? 1.4 : pkg === 'soic' ? 1.5 : 0.9);
  const legs: { pos: [number, number, number]; size: [number, number, number] }[] = [];
  const along = (n: number, len: number) => Array.from({ length: n }, (_, i) => -len / 2 + (len * (i + 0.5)) / n);
  let body: [number, number] = [w, d];
  if (pkg === 'lqfp') {
    body = [w - 1.4, d - 1.4];
    const n = Math.max(6, Math.round(body[0] / 0.8));
    for (const x of along(n, body[0] - 0.8)) for (const s of [-1, 1]) legs.push({ pos: [x, 0.25, s * (body[1] / 2 + 0.45)], size: [0.22, 0.25, 0.9] });
    for (const z of along(n, body[1] - 0.8)) for (const s of [-1, 1]) legs.push({ pos: [s * (body[0] / 2 + 0.45), 0.25, z], size: [0.9, 0.25, 0.22] });
  } else if (pkg === 'soic' || pkg === 'dip') {
    const long = w >= d;
    body = long ? [w, d - (pkg === 'dip' ? 1.2 : 1.6)] : [w - (pkg === 'dip' ? 1.2 : 1.6), d];
    const pitch = pkg === 'dip' ? 2.54 : 1.27;
    const n = Math.max(2, Math.floor((long ? body[0] : body[1]) / pitch));
    for (const p of along(n, n * pitch - pitch * 0.4)) {
      for (const s of [-1, 1]) {
        if (long) legs.push({ pos: [p, pkg === 'dip' ? -0.4 : 0.35, s * (body[1] / 2 + 0.5)], size: [pkg === 'dip' ? 0.5 : 0.4, pkg === 'dip' ? 2.2 : 0.3, 1] });
        else legs.push({ pos: [s * (body[0] / 2 + 0.5), pkg === 'dip' ? -0.4 : 0.35, p], size: [1, pkg === 'dip' ? 2.2 : 0.3, pkg === 'dip' ? 0.5 : 0.4] });
      }
    }
  } else if (pkg === 'sot223') {
    // Three legs on one side, the wide tab on the other (the regulator's output).
    const long = w >= d;
    body = long ? [w, d * 0.55] : [w * 0.55, d];
    const n = 3;
    const span = (long ? w : d) * 0.66;
    for (const p of along(n, span)) legs.push(long ? { pos: [p, 0.3, body[1] / 2 + (d - body[1]) / 2 - 0.2], size: [0.7, 0.25, (d - body[1]) * 0.9] } : { pos: [body[0] / 2 + (w - body[0]) / 2 - 0.2, 0.3, p], size: [(w - body[0]) * 0.9, 0.25, 0.7] });
    legs.push(long ? { pos: [0, 0.3, -body[1] / 2 - (d - body[1]) / 2 + 0.3], size: [w * 0.8, 0.25, (d - body[1]) * 0.8] } : { pos: [-body[0] / 2 - (w - body[0]) / 2 + 0.3, 0.3, 0], size: [(w - body[0]) * 0.8, 0.25, d * 0.8] });
  } else if (pkg === 'sot23') {
    body = [w * 0.8, d * 0.6];
    for (const x of [-w * 0.3, 0, w * 0.3]) legs.push({ pos: [x, 0.2, -body[1] / 2 - 0.3], size: [0.35, 0.2, 0.6] });
    for (const x of [-w * 0.3, w * 0.3]) legs.push({ pos: [x, 0.2, body[1] / 2 + 0.3], size: [0.35, 0.2, 0.6] });
  } else {
    // QFN: flat body, tiny pads peeking out on every side.
    const n = Math.max(4, Math.round(w / 0.9));
    for (const x of along(n, w - 1)) for (const s of [-1, 1]) legs.push({ pos: [x, 0.05, s * (d / 2 + 0.08)], size: [0.3, 0.1, 0.25] });
    for (const z of along(n, d - 1)) for (const s of [-1, 1]) legs.push({ pos: [s * (w / 2 + 0.08), 0.05, z], size: [0.25, 0.1, 0.3] });
  }
  const bodyY = pkg === 'dip' ? 0.7 + h / 2 : h / 2;
  return (
    <group position={[r.cx, 0, r.cz]}>
      <mesh position={[0, bodyY, 0]} castShadow>
        <boxGeometry args={[body[0], h, body[1]]} />
        <meshStandardMaterial color={c.color ?? BODY} roughness={0.55} metalness={0.05} />
      </mesh>
      {legs.map((l, i) => (
        <Leg key={i} {...l} />
      ))}
      {/* pin-1 dot */}
      <mesh position={[-body[0] / 2 + Math.min(0.9, body[0] / 5), bodyY + h / 2 + 0.01, -body[1] / 2 + Math.min(0.9, body[1] / 5)]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[Math.min(0.35, body[0] / 10), 16]} />
        <meshStandardMaterial color="#3d434b" />
      </mesh>
      {c.label && Math.min(body[0], body[1]) > 1.8 && <Marking text={c.label} w={body[0]} d={body[1]} y={bodyY + h / 2 + 0.02} />}
    </group>
  );
}

function Passives({ board, top }: { board: BoardDef; top: number }) {
  const list = useMemo(() => passivesFor(board), [board]);
  return (
    <>
      {list.map((p, i) => {
        const [w, d] = p.rot ? [p.d, p.w] : [p.w, p.d];
        const capW = p.rot ? w : w * 0.22;
        const capD = p.rot ? d * 0.22 : d;
        return (
          <group key={i} position={[p.x, top, p.z]}>
            <mesh position={[0, 0.25, 0]}>
              <boxGeometry args={[w, 0.5, d]} />
              <meshStandardMaterial color={p.kind === 'res' ? '#1e1f22' : '#b8996a'} roughness={0.6} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={p.rot ? [0, 0.26, (s * (d - capD)) / 2] : [(s * (w - capW)) / 2, 0.26, 0]}>
                <boxGeometry args={[capW + 0.02, 0.52, capD + 0.02]} />
                <meshStandardMaterial color="#d6dbe0" metalness={0.8} roughness={0.3} />
              </mesh>
            ))}
          </group>
        );
      })}
    </>
  );
}

function Traces({ board, top }: { board: BoardDef; top: number }) {
  const traces = useMemo(() => tracesFor(board), [board]);
  const color = useMemo(() => {
    // Copper under the solder mask: a lighter shade of the PCB colour.
    const c = new THREE.Color(board.pcbColor ?? '#1F3A5F');
    return c.lerp(new THREE.Color('#9fc2ea'), 0.28).getStyle();
  }, [board.pcbColor]);
  return (
    <>
      {traces.flatMap((tr, i) =>
        tr.points.slice(1).map(([x1, z1], j) => {
          const [x0, z0] = tr.points[j];
          const len = Math.hypot(x1 - x0, z1 - z0);
          if (len < 0.05) return null;
          return (
            <mesh key={`${i}.${j}`} position={[(x0 + x1) / 2, top + 0.012, (z0 + z1) / 2]} rotation-y={-Math.atan2(z1 - z0, x1 - x0)}>
              <boxGeometry args={[len + 0.3, 0.02, 0.3]} />
              <meshStandardMaterial color={color} roughness={0.55} transparent opacity={0.85} />
            </mesh>
          );
        }),
      )}
      {traces.flatMap((tr, i) =>
        tr.points.slice(1, -1).map(([x, z], j) => (
          <mesh key={`v${i}.${j}`} position={[x, top + 0.015, z]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.18, 0.36, 16]} />
            <meshStandardMaterial color="#d9b45a" metalness={0.85} roughness={0.3} />
          </mesh>
        )),
      )}
    </>
  );
}

/** A board LED: the power LED is lit while the board is on USB, the others while their pin is HIGH. */
function BoardLed({ c, board, top }: { c: BoardComponent; board: BoardDef; top: number }) {
  const r = rectToMm(board, c.rect);
  const col = c.color ?? (isPowerLed(c) ? '#ff4d4d' : /TX|RX|COM/i.test(c.label ?? '') ? '#ffb347' : '#4da3ff');
  const powered = useApp((s) => !!s.conn.port);
  const onboard = useMemo(() => board.pins.find((p) => p.flags.includes('onboard_led')), [board]);
  // The LED that shows the board's LED pin (not power, not serial activity).
  const followsPin = !isPowerLed(c) && !/TX|RX|COM/i.test(c.label ?? '') && onboard?.gpio != null;
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const glow = useRef<THREE.Sprite>(null);
  useFrame(() => {
    let on = isPowerLed(c) ? powered : false;
    if (followsPin && onboard?.gpio != null) {
      const live = useLive.getState();
      const measured = Date.now() - live.frameAt < 2000 ? live.frame?.pins[String(onboard.gpio)]?.level : undefined;
      on = (measured ?? useTemplate.getState().simPins[onboard.gpio]) === 1;
    }
    if (mat.current) mat.current.emissiveIntensity = on ? 2.2 : 0.05;
    if (glow.current) glow.current.visible = on;
  });
  const tex = glowTexture();
  return (
    <group position={[r.cx, top, r.cz]}>
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[r.w, 0.7, r.h]} />
        <meshStandardMaterial ref={mat} color={col} emissive={col} emissiveIntensity={0.05} roughness={0.35} />
      </mesh>
      <sprite ref={glow} position={[0, 1.1, 0]} scale={[Math.max(r.w, r.h) * 4.5, Math.max(r.w, r.h) * 4.5, 1]} visible={false}>
        <spriteMaterial map={tex} color={col} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.9} />
      </sprite>
    </group>
  );
}

/** Detail → Labels: a tag on each main part of the board. */
function Tags({ board, top }: { board: BoardDef; top: number }) {
  const powered = useApp((s) => !!s.conn.port);
  const tags = board.components
    .filter((c) => ['mcu', 'module', 'bridge', 'regulator'].includes(c.type) || isPowerLed(c))
    .map((c) => {
      const r = rectToMm(board, c.rect);
      const text = isPowerLed(c)
        ? powered
          ? t('Power LED on')
          : t('Power LED off')
        : c.type === 'regulator'
          ? t('Voltage regulator {label}', { label: c.label ?? '' })
          : c.type === 'bridge'
            ? t('USB-serial chip {label}', { label: c.label ?? '' })
            : (c.label ?? '');
      return { text, pos: [r.cx, top + (c.heightMm ?? 2) + 3, r.cz] as [number, number, number] };
    });
  return (
    <>
      {tags.map((tg, i) => (
        <Html key={i} position={tg.pos} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
          <div className="chip-tag">{tg.text}</div>
        </Html>
      ))}
    </>
  );
}

export function BoardDetail({ board, top, labels }: { board: BoardDef; top: number; labels: boolean }) {
  return (
    <>
      <Traces board={board} top={top} />
      <Passives board={board} top={top} />
      {board.components
        .filter((c) => c.type === 'led')
        .map((c, i) => (
          <BoardLed key={i} c={c} board={board} top={top} />
        ))}
      {labels && <Tags board={board} top={top} />}
    </>
  );
}

/** Components drawn by the detailed layer instead of the simple boxes. */
export const DETAILED_TYPES: BoardComponent['type'][] = ['mcu', 'chip', 'bridge', 'regulator', 'led'];
