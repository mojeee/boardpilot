// Developer menu: hardware mode and simulator scenarios.

import { useApp, useScene, log } from '../state/store';

export function DevMenu() {
  const open = useApp((s) => s.devOpen);
  const conn = useApp((s) => s.conn);
  const scenarios = useApp((s) => s.scenarios);
  if (!open) return null;
  const load = async (id: string) => {
    const r = await window.bp.sim.load(id);
    if (r.ok) useScene.getState().setScene(await window.bp.sim.scene());
  };
  return (
    <div className="devmenu">
      <div className="dev-head">
        <b>Developer</b>
        <button className="close" onClick={() => useApp.getState().set({ devOpen: false })}>
          ×
        </button>
      </div>
      <div className="label">Hardware</div>
      <div className="seg">
        <button className={conn.mode === 'sim' ? 'on' : ''} onClick={() => window.bp.hw.setMode('sim')}>
          Simulator
        </button>
        <button className={conn.mode === 'real' ? 'on' : ''} onClick={() => window.bp.hw.setMode('real')}>
          Real board
        </button>
      </div>
      {conn.mode === 'sim' && (
        <>
          <div className="label">Scenario</div>
          <div className="scenarios">
            {scenarios.map((s) => (
              <button key={s.id} className={`scenario ${conn.scenario === s.id ? 'on' : ''}`} onClick={() => load(s.id)}>
                <b>{s.name}</b>
                <span>{s.description}</span>
              </button>
            ))}
          </div>
          <div className="label">Bench actions</div>
          <div className="row gap wrap">
            <button className="btn small" onClick={() => window.bp.sim.control('fixWiring')}>
              Fix the wiring
            </button>
            <button className="btn small" onClick={() => window.bp.sim.control('turnKnob')}>
              Turn the knob
            </button>
          </div>
        </>
      )}
      {conn.mode === 'real' && (
        <p className="small dim">
          Real mode uses esptool (pip3 install esptool) and the prebuilt agent in resources/agent (npm run build:agent).
        </p>
      )}
      <div className="label">Project</div>
      <div className="row gap wrap">
        <button
          className="btn small"
          onClick={() => {
            useScene.getState().setScene({ board: 'esp32-devkitc-30', parts: [], wires: [] });
            log('info', 'Started an empty project.');
          }}
        >
          Empty project
        </button>
      </div>
    </div>
  );
}
