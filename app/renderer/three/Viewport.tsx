// The center viewport: 3D board (or the flat pinout), with view controls and the info card.

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { getBoard } from '@shared/board';
import { useApp, useLive, useScene } from '../state/store';
import { Board3D } from './Board3D';
import { Parts } from './Parts';
import { Wires } from './Wires';
import { CameraRig } from './CameraRig';
import { PinoutView2D } from './PinoutView2D';
import { PinInfoCard } from './PinInfoCard';
import { FLOOR_Y } from './geometry';

function Legend() {
  const items: [string, string][] = [
    ['--pin-power', 'Power'],
    ['--pin-ground', 'Ground'],
    ['--pin-sda', 'SDA'],
    ['--pin-scl', 'SCL'],
    ['--pin-gpio', 'GPIO'],
    ['--pin-adc', 'ADC'],
    ['--pin-uart', 'UART'],
    ['--pin-spi', 'SPI'],
  ];
  return (
    <div className="legend">
      {items.map(([v, l]) => (
        <span key={v}>
          <i style={{ background: `var(${v})` }} />
          {l}
        </span>
      ))}
    </div>
  );
}

function StatusBadges() {
  const findings = useScene((s) => s.findings);
  const conn = useApp((s) => s.conn);
  const frameAt = useLive((s) => s.frameAt);
  const liveOn = Date.now() - frameAt < 2000;
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warns = findings.filter((f) => f.severity === 'warning').length;
  return (
    <div className="badges">
      {conn.mode === 'sim' && <span className="badge sim">Simulated board</span>}
      {liveOn && <span className="badge live">● Live</span>}
      {errors > 0 && (
        <button className="badge err" onClick={() => useScene.getState().focusOn(findings.filter((f) => f.severity === 'error').flatMap((f) => f.targets))}>
          {errors} wiring error{errors > 1 ? 's' : ''}
        </button>
      )}
      {warns > 0 && (
        <button className="badge warn" onClick={() => useScene.getState().focusOn(findings.filter((f) => f.severity === 'warning').flatMap((f) => f.targets))}>
          {warns} warning{warns > 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}

export function Viewport() {
  const view = useScene((s) => s.view);
  const labels = useScene((s) => s.labels);
  const wireMode = useScene((s) => s.wireMode);
  const wireFrom = useScene((s) => s.wireFrom);
  const board = getBoard(useScene((s) => s.scene.board));

  return (
    <div className="viewport">
      {view === '3d' ? (
        <Canvas
          camera={{ position: [-38, 72, 96], fov: 35, near: 1, far: 2000 }}
          dpr={[1, 2]}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          onPointerMissed={() => !useScene.getState().wireMode && useScene.getState().select(null)}
        >
          <color attach="background" args={['#12171D']} />
          <hemisphereLight args={['#dfe8f5', '#1a2028', 0.9]} />
          <directionalLight position={[40, 90, 60]} intensity={1.4} />
          <directionalLight position={[-60, 40, -40]} intensity={0.4} />
          <Grid
            position={[0, FLOOR_Y, 0]}
            args={[400, 400]}
            cellSize={2.54}
            sectionSize={25.4}
            cellColor="#1d252e"
            sectionColor="#27313c"
            fadeDistance={260}
            infiniteGrid
          />
          <Board3D board={board} />
          <Parts />
          <Wires board={board} />
          <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={15} maxDistance={400} maxPolarAngle={Math.PI * 0.49} />
          <CameraRig board={board} />
        </Canvas>
      ) : (
        <div className="pinout-wrap">
          <PinoutView2D board={board} />
        </div>
      )}

      <div className="vp-toolbar">
        <div className="seg">
          <button className={view === '3d' ? 'on' : ''} onClick={() => useScene.getState().set({ view: '3d' })}>
            3D
          </button>
          <button className={view === '2d' ? 'on' : ''} onClick={() => useScene.getState().set({ view: '2d' })}>
            2D pinout
          </button>
        </div>
        {view === '3d' && (
          <div className="seg">
            <button onClick={() => useScene.getState().preset('home')}>Overview</button>
            <button onClick={() => useScene.getState().preset('top')}>Top</button>
            <button onClick={() => useScene.getState().preset('side')}>Pin side</button>
            <button onClick={() => useScene.getState().preset('module')}>Module</button>
          </div>
        )}
        <button className={`tb ${labels ? 'on' : ''}`} onClick={() => useScene.getState().set({ labels: !labels })}>
          Labels
        </button>
        {view === '3d' && (
          <button className={`tb ${wireMode ? 'on ai' : ''}`} onClick={() => useScene.getState().set({ wireMode: !wireMode, wireFrom: null })}>
            Draw wire
          </button>
        )}
      </div>

      <StatusBadges />
      {wireMode && (
        <div className="wire-hint">{wireFrom ? `From ${wireFrom}: now click a pin on a part.` : 'Click a board pin, then a pin on a part.'}</div>
      )}
      <PinInfoCard board={board} />
      <Legend />
    </div>
  );
}
