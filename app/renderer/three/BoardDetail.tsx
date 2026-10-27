// The "Full" detail of the board (3D toolbar → Detail), generated from the board file: chips,
// connectors, the small resistors and capacitors and a few copper traces as one merged model
// (boardModel.ts), the power LED lit while the board is on USB, the board LED lit while
// its pin is HIGH, and (Detail → Labels) a tag on each main part.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { BoardComponent, BoardDef } from '@shared/types';
import { rectToMm } from '@shared/board';
import { isPowerLed } from '@shared/boardDetail';
import { boardModel } from './boardModel';
import { finishMaterial } from './kit';
import { t } from '@shared/i18n';
import { useApp, useLive } from '../state/store';
import { useTemplate } from '../state/templateRun';
import { glowTexture } from './textures';

/** Chips, connectors, passives and traces: one merged model per board (boardModel.ts). */
function BoardParts({ board }: { board: BoardDef }) {
  const model = boardModel(board);
  return (
    <>
      {model.meshes.map((m) => (
        <mesh key={m.finish} geometry={m.geometry} material={finishMaterial(m.finish)} />
      ))}
      {model.decals.map((dc, i) => (
        <mesh key={i} position={dc.pos} rotation={[-Math.PI / 2, 0, 0]} renderOrder={dc.order ?? 1}>
          <planeGeometry args={dc.size} />
          <meshBasicMaterial map={dc.texture} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
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
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[r.w, 0.4, r.h]} />
        <meshStandardMaterial color="#efeee8" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[r.w * 0.72, 0.25, r.h * 0.8]} />
        <meshStandardMaterial ref={mat} color={col} emissive={col} emissiveIntensity={0.05} roughness={0.2} />
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
      <BoardParts board={board} />
      {board.components
        .filter((c) => c.type === 'led')
        .map((c, i) => (
          <BoardLed key={i} c={c} board={board} top={top} />
        ))}
      {labels && <Tags board={board} top={top} />}
    </>
  );
}

