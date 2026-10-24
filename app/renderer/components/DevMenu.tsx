// Developer menu: hardware mode and simulator scenarios.

import { useApp, useScene, log } from '../state/store';
import { t } from '@shared/i18n';

export function DevMenu() {
  const open = useApp((s) => s.devOpen);
  const conn = useApp((s) => s.conn);
  const scenarios = useApp((s) => s.scenarios);
  if (!open) return null;
  const load = async (id: string) => {
    const r = await window.bp.sim.load(id);
    if (r.ok) useScene.getState().openScene(await window.bp.sim.scene());
  };
  return (
    <div className="devmenu">
      <div className="dev-head">
        <b>{t('Developer')}</b>
        <button className="close" onClick={() => useApp.getState().set({ devOpen: false })} aria-label={t('Close')}>
          ×
        </button>
      </div>
      <div className="label">{t('Hardware')}</div>
      <div className="seg">
        <button className={conn.mode === 'sim' ? 'on' : ''} onClick={() => window.bp.hw.setMode('sim')}>
          {t('Simulator')}
        </button>
        <button className={conn.mode === 'real' ? 'on' : ''} onClick={() => window.bp.hw.setMode('real')}>
          {t('Real board')}
        </button>
      </div>
      {conn.mode === 'sim' && (
        <>
          <div className="label">{t('Scenario')}</div>
          <div className="scenarios">
            {scenarios.map((s) => (
              <button key={s.id} className={`scenario ${conn.scenario === s.id ? 'on' : ''}`} data-id={s.id} onClick={() => load(s.id)}>
                <b>{t(s.name)}</b>
                <span>{t(s.description)}</span>
              </button>
            ))}
          </div>
          <div className="label">{t('Bench actions')}</div>
          <div className="row gap wrap">
            <button className="btn small" onClick={() => window.bp.sim.control('fixWiring')}>
              {t('Fix the wiring')}
            </button>
            <button className="btn small" onClick={() => window.bp.sim.control('turnKnob')}>
              {t('Turn the knob')}
            </button>
          </div>
        </>
      )}
      {conn.mode === 'real' && (
        <p className="small dim">
          {t('Real mode uses esptool (pip3 install esptool) and the prebuilt agent in resources/agent (npm run build:agent).')}
        </p>
      )}
      <div className="label">{t('Project')}</div>
      <div className="row gap wrap">
        <button
          className="btn small"
          onClick={() => {
            useScene.getState().openScene({ board: 'esp32-devkitc-30', parts: [], wires: [] });
            log('info', t('Started an empty project.'));
          }}
        >
          {t('Empty project')}
        </button>
      </div>
    </div>
  );
}
