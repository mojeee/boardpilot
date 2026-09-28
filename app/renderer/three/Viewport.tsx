// The center viewport: 3D board (or the flat pinout), with view controls and the info card.

import { useEffect } from 'react';
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
import { PartsLibrary } from '../components/PartsLibrary';
import { Icon } from '../components/Icon';
import { handleSceneKey } from '../state/sceneActions';
import { log } from '../state/store';
import { t } from '@shared/i18n';

async function openProject() {
  const r = await window.bp.project.open();
  if (r.ok) {
    useScene.getState().setScene(r.value, true);
    log('info', t('Project opened.'));
  } else if (r.error.code !== 'cancelled') log('failed', t(r.error.humanMessage));
}

async function saveProject() {
  const r = await window.bp.project.save(useScene.getState().scene);
  if (r.ok) log('info', t('Project saved to {path}.', { path: r.value }));
}

function Legend() {
  const items: [string, string][] = [
    ['--pin-power', t('Power')],
    ['--pin-ground', t('Ground')],
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
      {conn.mode === 'sim' && <span className="badge sim">{t('Simulated board')}</span>}
      {liveOn && <span className="badge live">● {t('Live')}</span>}
      {errors > 0 && (
        <button className="badge err" onClick={() => useScene.getState().focusOn(findings.filter((f) => f.severity === 'error').flatMap((f) => f.targets))}>
          {errors > 1 ? t('{n} wiring errors', { n: errors }) : t('1 wiring error')}
        </button>
      )}
      {warns > 0 && (
        <button className="badge warn" onClick={() => useScene.getState().focusOn(findings.filter((f) => f.severity === 'warning').flatMap((f) => f.targets))}>
          {warns > 1 ? t('{n} warnings', { n: warns }) : t('1 warning')}
        </button>
      )}
    </div>
  );
}

export function Viewport({ compact }: { compact?: boolean } = {}) {
  const libOpen = useScene((s) => s.libOpen);
  const setLibOpen = (v: boolean) => useScene.getState().set({ libOpen: v });
  const canUndo = useScene((s) => s.past.length > 0);
  const canRedo = useScene((s) => s.future.length > 0);
  useEffect(() => {
    if (compact) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-back')) return;
      if (handleSceneKey(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact]);
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
            {t('2D pinout')}
          </button>
        </div>
        {view === '3d' && (
          <div className="seg">
            <button onClick={() => useScene.getState().preset('home')}>{t('Overview')}</button>
            <button onClick={() => useScene.getState().preset('top')}>{t('Top')}</button>
            <button onClick={() => useScene.getState().preset('side')}>{t('Pin side')}</button>
            <button onClick={() => useScene.getState().preset('module')}>{t('Module')}</button>
          </div>
        )}
        <button className={`tb ${labels ? 'on' : ''}`} onClick={() => useScene.getState().set({ labels: !labels })}>
          {t('Labels')}
        </button>
        {view === '3d' && (
          <button className={`tb ${wireMode ? 'on ai' : ''}`} title="W" onClick={() => useScene.getState().set({ wireMode: !wireMode, wireFrom: null })}>
            {t('Draw wire')}
          </button>
        )}
        {!compact && (
          <>
            <button className={`tb ${libOpen ? 'on' : ''}`} onClick={() => setLibOpen(!libOpen)}>
              <Icon name="box" size={14} /> {t('Parts')}
            </button>
            <div className="seg">
              <button title={t('Undo (⌘Z)')} disabled={!canUndo} onClick={() => useScene.getState().undo()}>
                <Icon name="undo" size={14} />
              </button>
              <button title={t('Redo (⇧⌘Z)')} disabled={!canRedo} onClick={() => useScene.getState().redo()}>
                <Icon name="redo" size={14} />
              </button>
            </div>
            <div className="seg">
              <button title={t('Open project…')} onClick={openProject}>
                <Icon name="folder" size={14} />
              </button>
              <button title={t('Save project…')} onClick={saveProject}>
                <Icon name="save" size={14} />
              </button>
            </div>
          </>
        )}
      </div>
      {libOpen && !compact && (
        <div className="lib-overlay">
          <PartsLibrary onClose={() => setLibOpen(false)} />
        </div>
      )}

      <StatusBadges />
      {wireMode && (
        <div className="wire-hint">{wireFrom ? t('From {pin}: now click a pin on a part.', { pin: wireFrom }) : t('Click a board pin, then a pin on a part.')}</div>
      )}
      <PinInfoCard board={board} />
      {!compact && <Legend />}
      {!compact && view === '3d' && <div className="kbd-hint">{t('Drag parts to move · R rotate · Delete remove · ⌘Z undo · W wire mode')}</div>}
    </div>
  );
}
