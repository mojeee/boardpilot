// Lighting, floor and background of the 3D view. Two styles: "desk" (a workbench with an
// anti-static mat and shelves of parts in the background) and "plain" (a quiet grid, the default
// on slow computers). Everything is built from simple shapes and canvas textures: nothing is
// downloaded, so it works offline.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ContactShadows, Environment, Grid, Lightformer } from '@react-three/drei';
import { DESK_Y, FLOOR_Y } from './geometry';
import { useScene } from '../state/store';
import { drawerTexture, labelTexture, matTexture, woodTexture } from './textures';
import type { Light } from '../state/view3d';

const BG = '#12171D';
const BG_DESK = '#0f1318';

/**
 * The three light setups (3D toolbar → Light):
 * - Studio: soft boxes around the scene give metals something to reflect (the default).
 * - Bench: a warm desk lamp from the left, darker surroundings, like a real workbench at night.
 * - High contrast: flat, bright and neutral, strong outlines of every part (easier to read).
 */
function Lights({ light }: { light: Light }) {
  if (light === 'bench') {
    return (
      <>
        <Environment resolution={64} frames={1} environmentIntensity={0.6}>
          <color attach="background" args={['#1d1a17']} />
          <Lightformer form="rect" color="#ffd9a8" intensity={2.6} position={[-4, 6, 2]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
          <Lightformer form="rect" intensity={0.5} position={[0, 3, -7]} scale={[14, 5, 1]} />
        </Environment>
        <hemisphereLight args={['#f3dcc0', '#120f0c', 0.6]} />
        <spotLight position={[-70, 120, 50]} angle={0.6} penumbra={0.8} intensity={32000} decay={2} color="#ffd8a6" />
        <directionalLight position={[60, 40, -60]} intensity={0.25} color="#9fb8ff" />
      </>
    );
  }
  if (light === 'contrast') {
    return (
      <>
        <Environment resolution={64} frames={1} environmentIntensity={0.35}>
          <color attach="background" args={['#ffffff']} />
          <Lightformer form="rect" intensity={1.5} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[14, 10, 1]} />
        </Environment>
        <ambientLight intensity={0.9} />
        <directionalLight position={[0, 120, 60]} intensity={2.2} />
        <directionalLight position={[-80, 30, -80]} intensity={0.8} />
      </>
    );
  }
  return (
    <>
      <Environment resolution={128} frames={1} environmentIntensity={1}>
        <color attach="background" args={['#2a313b']} />
        {/* big soft box overhead and one behind the board: what shields and pins reflect when
            seen from the usual angle, above and in front */}
        <Lightformer form="rect" intensity={2.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 8, 1]} />
        <Lightformer form="rect" intensity={1.8} position={[0, 3, -7]} scale={[14, 5, 1]} />
        <Lightformer form="rect" intensity={1.0} position={[-7, 2, 3]} rotation-y={Math.PI / 2.5} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={0.7} position={[7, 2, -2]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="ring" color="#bcd4ff" intensity={0.6} position={[0, 3, 8]} scale={3} />
      </Environment>
      <hemisphereLight args={['#dfe8f5', '#1a2028', 0.35]} />
      <directionalLight position={[40, 90, 60]} intensity={1.15} />
      <directionalLight position={[-60, 40, -40]} intensity={0.3} color="#bcd0ff" />
    </>
  );
}

/** A texture that is disposed when the component goes away. */
function useTexture<T extends THREE.Texture>(make: () => T, deps: unknown[] = []): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tex = useMemo(make, deps);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function radialShade(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(6,9,12,0.55)');
    g.addColorStop(0.6, 'rgba(6,9,12,0.25)');
    g.addColorStop(1, 'rgba(6,9,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(c);
}

/**
 * Soft contact shadow under the board and parts. It is redrawn only when the scene changes (and
 * every frame while a part is dragged), not 60 times a second.
 */
function Shadows({ y, opacity }: { y: number; opacity: number }) {
  useScene((s) => s.scene);
  const dragging = useScene((s) => !!s.draggingPart);
  return <ContactShadows position={[0, y, 0]} scale={600} resolution={1024} blur={2.2} far={20} opacity={opacity} frames={dragging ? Infinity : 6} />;
}

function PlainFloor() {
  const shade = useTexture(radialShade);
  return (
    <>
      <color attach="background" args={[BG]} />
      {/* darker floor under the board that fades out, so there is no visible edge */}
      <mesh position={[0, FLOOR_Y - 0.05, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[700, 700]} />
        <meshBasicMaterial map={shade} transparent depthWrite={false} />
      </mesh>
      <Grid
        position={[0, FLOOR_Y, 0]}
        args={[400, 400]}
        cellSize={2.54}
        sectionSize={25.4}
        cellColor="#171e26"
        sectionColor="#212a34"
        cellThickness={0.6}
        sectionThickness={0.9}
        fadeDistance={220}
        fadeStrength={1.5}
        infiniteGrid
      />
      <Shadows y={FLOOR_Y + 0.02} opacity={0.6} />
    </>
  );
}

/* ---------------- the workbench ---------------- */

const DESK_TOP = DESK_Y - 2; // the mat is 2 mm thick
const SHELF_Z = -340;
const SHELF_W = 1300;
const SHELF_D = 200;
const SHELF_LEVELS = [170, 350, 530];

function Box({
  pos,
  size,
  color,
  rough = 0.75,
  metal = 0,
  rot,
  map,
  emissive,
}: {
  pos: [number, number, number];
  size: [number, number, number];
  color: string;
  rough?: number;
  metal?: number;
  rot?: [number, number, number];
  map?: THREE.Texture;
  emissive?: string;
}) {
  return (
    <mesh position={pos} rotation={rot}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} map={map} emissive={emissive ?? '#000'} emissiveIntensity={emissive ? 0.9 : 0} />
    </mesh>
  );
}

/** A labelled open parts bin, the kind that hangs on a louvred panel or stands on a shelf. */
function Bin({ x, y, z, color, label }: { x: number; y: number; z: number; color: string; label: string }) {
  const tex = useTexture(() => labelTexture(label), [label]);
  const w = 118;
  const h = 72;
  const d = 170;
  return (
    <group position={[x, y, z]}>
      <Box pos={[0, h / 2, 0]} size={[w, h, d]} color={color} rough={0.55} />
      {/* dark opening on top */}
      <Box pos={[0, h + 0.2, -6]} size={[w - 10, 0.5, d - 22]} color="#0b0d10" />
      <mesh position={[0, h * 0.55, d / 2 + 0.3]}>
        <planeGeometry args={[70, 26]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Reel({ x, y, z, color }: { x: number; y: number; z: number; color: string }) {
  return (
    <group position={[x, y + 90, z]} rotation={[0, 0.15, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[88, 88, 12, 40]} />
        <meshStandardMaterial color={color} roughness={0.35} transparent opacity={0.85} />
      </mesh>
      {/* the wound tape */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[62, 62, 12.4, 40]} />
        <meshStandardMaterial color="#d8d2c2" roughness={0.8} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[18, 18, 13, 20]} />
        <meshStandardMaterial color="#20252c" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Spool({ x, y, z, color }: { x: number; y: number; z: number; color: string }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[38, 38, 6, 32]} />
        <meshStandardMaterial color="#1f242b" roughness={0.6} />
      </mesh>
      <mesh position={[0, 30, 0]}>
        <cylinderGeometry args={[30, 30, 48, 32]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh position={[0, 57, 0]}>
        <cylinderGeometry args={[38, 38, 6, 32]} />
        <meshStandardMaterial color="#1f242b" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** A spare development board lying or leaning on a shelf. */
function SpareBoard({ pos, rot, color, len, wid }: { pos: [number, number, number]; rot: [number, number, number]; color: string; len: number; wid: number }) {
  return (
    <group position={pos} rotation={rot}>
      <Box pos={[0, 0.8, 0]} size={[len, 1.6, wid]} color={color} rough={0.6} />
      <Box pos={[len * 0.15, 3, 0]} size={[len * 0.3, 3, wid * 0.55]} color="#c9ced4" metal={0.8} rough={0.3} />
      <Box pos={[-len * 0.25, 2.2, 0]} size={[8, 1.4, 8]} color="#15181c" />
      <Box pos={[0, 2.8, wid / 2 - 1.5]} size={[len * 0.9, 2.5, 2.5]} color="#1a1d21" />
      <Box pos={[0, 2.8, -wid / 2 + 1.5]} size={[len * 0.9, 2.5, 2.5]} color="#1a1d21" />
    </group>
  );
}

/** A soldering station with its iron in the stand, a brass tip cleaner and a solder reel. */
function SolderingStation({ x, z }: { x: number; z: number }) {
  const display = useTexture(() => labelTexture('350°C', '#1b0d0b', '#ff5d52'), []);
  const y = DESK_TOP;
  return (
    <group position={[x, y, z]} rotation={[0, -0.35, 0]}>
      <Box pos={[0, 55, 0]} size={[130, 110, 150]} color="#2b3038" rough={0.5} />
      <mesh position={[0, 78, 75.3]}>
        <planeGeometry args={[80, 30]} />
        <meshStandardMaterial map={display} emissive="#ff5d52" emissiveMap={display} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[-30, 30, 76]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[12, 12, 6, 24]} />
        <meshStandardMaterial color="#12151a" roughness={0.4} />
      </mesh>
      {/* stand: base, coil and iron */}
      <group position={[140, 0, 20]}>
        <Box pos={[0, 8, 0]} size={[90, 16, 120]} color="#1d2127" rough={0.5} />
        <mesh position={[0, 50, -10]} rotation={[0.9, 0, 0]}>
          <cylinderGeometry args={[18, 18, 90, 20, 1, true]} />
          <meshStandardMaterial color="#b8bec6" metalness={0.85} roughness={0.3} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 62, -20]} rotation={[0.9, 0, 0]}>
          <cylinderGeometry args={[9, 7, 120, 16]} />
          <meshStandardMaterial color="#2a5fa8" roughness={0.5} />
        </mesh>
        <mesh position={[26, 22, 38]}>
          <sphereGeometry args={[18, 16, 12]} />
          <meshStandardMaterial color="#c9a45a" metalness={0.8} roughness={0.55} />
        </mesh>
      </group>
      <Spool x={-120} y={0} z={30} color="#b9bfc6" />
    </group>
  );
}

function Shelves() {
  const drawers = useTexture(() => drawerTexture(6, 4, ['10k', '220Ω', '1k', '4k7', '100nF', '10µF', 'LED', '1N4148', 'BC547', 'M3', 'JST', 'USB']), []);
  const y0 = DESK_TOP;
  const wood = '#3a3f47';
  return (
    <group position={[0, y0, SHELF_Z]}>
      {/* back panel and uprights */}
      <Box pos={[0, 310, -SHELF_D / 2 - 4]} size={[SHELF_W, 620, 8]} color="#1a1f26" rough={0.9} />
      {[-1, 1].map((s) => (
        <Box key={s} pos={[(s * SHELF_W) / 2, 310, 0]} size={[16, 620, SHELF_D]} color={wood} />
      ))}
      {SHELF_LEVELS.map((h) => (
        <Box key={h} pos={[0, h - 8, 0]} size={[SHELF_W, 16, SHELF_D]} color={wood} />
      ))}

      {/* level 1: parts bins */}
      {['R', 'C', 'LED', 'IC', 'SW', 'POT', 'WIRE', 'HDR'].map((l, i) => (
        <Bin key={l} x={-525 + i * 150} y={SHELF_LEVELS[0]} z={0} color={['#2f6fb5', '#c0473a', '#d9a531'][i % 3]} label={l} />
      ))}

      {/* level 2: drawer cabinet, component reels, hook-up wire */}
      <group position={[-380, SHELF_LEVELS[1], 0]}>
        <Box pos={[0, 75, 0]} size={[420, 150, 170]} color="#2a3038" rough={0.6} />
        <mesh position={[0, 75, 85.3]}>
          <planeGeometry args={[410, 142]} />
          <meshStandardMaterial map={drawers} roughness={0.7} />
        </mesh>
      </group>
      <Reel x={40} y={SHELF_LEVELS[1]} z={10} color="#3b7dd8" />
      <Reel x={70} y={SHELF_LEVELS[1]} z={-20} color="#2c2f34" />
      <Reel x={100} y={SHELF_LEVELS[1]} z={30} color="#c9ced4" />
      {['#FF6B5E', '#3FB6E8', '#5CCB8F', '#F2A93B', '#1b1f24'].map((c, i) => (
        <Spool key={c} x={250 + i * 80} y={SHELF_LEVELS[1]} z={0} color={c} />
      ))}

      {/* level 3: spare boards */}
      <SpareBoard pos={[-480, SHELF_LEVELS[2] + 2, 10]} rot={[0, 0.2, 0]} color="#1F3A5F" len={52} wid={28} />
      <SpareBoard pos={[-400, SHELF_LEVELS[2] + 2, -20]} rot={[0, -0.3, 0]} color="#0e5c3a" len={51} wid={21} />
      <SpareBoard pos={[-300, SHELF_LEVELS[2] + 30, -60]} rot={[1.25, 0, 0.05]} color="#00707a" len={69} wid={53} />
      <SpareBoard pos={[-180, SHELF_LEVELS[2] + 2, 0]} rot={[0, 0.5, 0]} color="#101418" len={61} wid={18} />
      <SpareBoard pos={[-80, SHELF_LEVELS[2] + 2, 20]} rot={[0, -0.1, 0]} color="#1F3A5F" len={63} wid={25} />
      {/* anti-static bags */}
      {[0, 1, 2].map((i) => (
        <Box key={i} pos={[120 + i * 26, SHELF_LEVELS[2] + 55, -40 + i * 6]} size={[4, 110, 150]} rot={[0, 0.05 * i, -0.08]} color="#8e959e" metal={0.6} rough={0.35} />
      ))}
      <Box pos={[420, SHELF_LEVELS[2] + 40, 0]} size={[200, 80, 150]} color="#5b4a37" rough={0.9} />
    </group>
  );
}

function DeskFloor() {
  const wood = useTexture(woodTexture, []);
  const mat = useTexture(() => matTexture(600, 400, '#1d5a4c', '#9fe0c9'), []);
  return (
    <>
      <color attach="background" args={[BG_DESK]} />
      <fog attach="fog" args={[BG_DESK, 520, 1500]} />
      {/* desk top */}
      <mesh position={[0, DESK_TOP - 15, -180]}>
        <boxGeometry args={[1800, 30, 1000]} />
        <meshStandardMaterial map={wood} roughness={0.7} />
      </mesh>
      {/* anti-static mat, where the board sits */}
      <mesh position={[0, DESK_Y - 1, 0]}>
        <boxGeometry args={[600, 2, 400]} />
        <meshStandardMaterial map={mat} roughness={0.95} />
      </mesh>
      <Shadows y={DESK_Y + 0.05} opacity={0.65} />
      <Shelves />
      <SolderingStation x={430} z={-150} />
    </>
  );
}

export function Stage({ style, light = 'studio' }: { style: 'desk' | 'plain'; light?: Light }) {
  return (
    <>
      <Lights light={light} />
      {style === 'desk' ? <DeskFloor /> : <PlainFloor />}
      {light === 'contrast' && <color attach="background" args={['#07090c']} />}
      {light === 'bench' && style === 'plain' && <color attach="background" args={['#0d0b09']} />}
    </>
  );
}
