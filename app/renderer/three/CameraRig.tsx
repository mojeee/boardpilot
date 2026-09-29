// Camera presets and smooth fly-to when a pin, wire or part is focused.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoardDef } from '@shared/types';
import { useScene } from '../state/store';
import { targetPoint } from './geometry';
import { PARTS, rectToMm } from '@shared/board';
import { fitCamera, sceneBounds } from './framing';

interface Controls {
  target: THREE.Vector3;
  update(): void;
}

type Preset = { pos: [number, number, number]; target: [number, number, number] };

/**
 * Camera presets, tuned for the 51.5 × 28.5 mm ESP32 DevKit and scaled for bigger boards (the
 * parts sit around the board, so the width counts with a margin). "Module" looks at the main chip.
 */
export function presetsFor(board: BoardDef): Record<string, Preset> {
  const { length, width } = board.pcbMm;
  const k = Math.max(1, length / 51.5, (width + 60) / (28.5 + 60));
  const main =
    board.components.find((c) => c.type === 'module') ??
    [...board.components].filter((c) => c.type === 'mcu').sort((a, b) => b.rect[2] * b.rect[3] - a.rect[2] * a.rect[3])[0];
  const m = main ? rectToMm(board, main.rect) : { cx: 14, cz: 0 };
  return {
    home: { pos: [-38 * k, 72 * k, 96 * k], target: [0, -2, 0] },
    top: { pos: [0, 125 * k, 0.01], target: [0, 0, 0] },
    side: { pos: [0, 22 * k, 82 * k], target: [0, 0, 6] },
    module: { pos: [m.cx + 12, 34, m.cz + 30], target: [m.cx, 0, m.cz] },
  };
}

export function CameraRig({ board }: { board: BoardDef }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const focus = useScene((s) => s.focus);
  const preset = useScene((s) => s.cameraPreset);
  const loadNonce = useScene((s) => s.loadNonce);
  const size = useThree((s) => s.size);
  const anim = useRef<{ fromPos: THREE.Vector3; toPos: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number } | null>(null);

  const flyTo = (pos: THREE.Vector3, target: THREE.Vector3) => {
    if (!controls) return;
    anim.current = { fromPos: camera.position.clone(), toPos: pos, fromT: controls.target.clone(), toT: target, t: 0 };
  };

  /** Overview: the board and every part, as large as the view allows. */
  const frameAll = (instant: boolean) => {
    if (!controls) return;
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 35;
    const f = fitCamera(sceneBounds(board, useScene.getState().scene, PARTS), fov, size.width / Math.max(1, size.height));
    if (instant) {
      anim.current = null;
      camera.position.copy(f.pos);
      controls.target.copy(f.target);
      controls.update();
    } else flyTo(f.pos, f.target);
  };

  // A scene was opened or the board changed: frame everything (instantly the first time).
  const framedOnce = useRef(false);
  useEffect(() => {
    if (!controls) return;
    frameAll(!framedOnce.current);
    framedOnce.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, board.id, loadNonce]);

  useEffect(() => {
    if (!preset.nonce) return;
    if (preset.name === 'home') return frameAll(false);
    const p = presetsFor(board)[preset.name];
    if (p) flyTo(new THREE.Vector3(...p.pos), new THREE.Vector3(...p.target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset.nonce]);

  useEffect(() => {
    if (!focus.nonce || !controls) return;
    const scene = useScene.getState().scene;
    const pts = focus.targets.map((t) => targetPoint(board, scene, t)).filter((p): p is THREE.Vector3 => !!p);
    if (!pts.length) return;
    const center = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const spread = Math.max(12, ...pts.map((p) => p.distanceTo(center) * 2.2));
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.y < 0.35) dir.y = 0.35;
    dir.normalize();
    flyTo(center.clone().add(dir.multiplyScalar(spread * 2.2 + 45)), center);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.nonce]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt / 0.7);
    const e = 1 - Math.pow(1 - a.t, 3);
    camera.position.lerpVectors(a.fromPos, a.toPos, e);
    controls.target.lerpVectors(a.fromT, a.toT, e);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });

  return null;
}
