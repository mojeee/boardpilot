// Camera presets and smooth fly-to when a pin, wire or part is focused.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoardDef } from '@shared/types';
import { useScene } from '../state/store';
import { targetPoint } from './geometry';

interface Controls {
  target: THREE.Vector3;
  update(): void;
}

const PRESETS: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  home: { pos: [-38, 72, 96], target: [0, -2, 0] },
  top: { pos: [0, 125, 0.01], target: [0, 0, 0] },
  side: { pos: [0, 22, 82], target: [0, 0, 6] },
  module: { pos: [26, 34, 30], target: [14, 0, 0] },
};

export function CameraRig({ board }: { board: BoardDef }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const focus = useScene((s) => s.focus);
  const preset = useScene((s) => s.cameraPreset);
  const anim = useRef<{ fromPos: THREE.Vector3; toPos: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number } | null>(null);

  const flyTo = (pos: THREE.Vector3, target: THREE.Vector3) => {
    if (!controls) return;
    anim.current = { fromPos: camera.position.clone(), toPos: pos, fromT: controls.target.clone(), toT: target, t: 0 };
  };

  useEffect(() => {
    const p = PRESETS[preset.name];
    if (p) flyTo(new THREE.Vector3(...p.pos), new THREE.Vector3(...p.target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset.nonce, controls]);

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
