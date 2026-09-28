import { useApp } from '../state/store';
import { confirmRestore } from '../state/hw';
import { Icon } from './Icon';

export function TopBar() {
  const conn = useApp((s) => s.conn);
  const progress = useApp((s) => s.progress);
  const ai = useApp((s) => s.ai);
  const devOpen = useApp((s) => s.devOpen);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">
          <span />
        </span>
        BoardPilot
      </div>
      <div className="conn">
        <span className={`dot ${conn.chip ? 'ok' : 'off'}`} />
        {conn.chip ? (
          <>
            <span className="mono">{conn.chip.chip}</span>
            <span className="dim mono">{conn.port}</span>
            {conn.agent ? <span className="chip ok-chip">agent {conn.agent.ver}</span> : <span className="chip">your firmware</span>}
          </>
        ) : (
          <span className="dim">No board connected</span>
        )}
        {conn.mode === 'sim' && <span className="chip sim-chip">Simulator</span>}
      </div>
      {progress && (
        <div className="progress" title={progress.task}>
          <span className="small">{progress.task}</span>
          <div className="bar">
            <i style={{ width: `${progress.pct}%` }} />
          </div>
          <span className="mono small">{Math.round(progress.pct)}%</span>
        </div>
      )}
      <div className="top-actions">
        {conn.backups.length > 0 && conn.agent && (
          <button className="btn small" onClick={() => confirmRestore()}>
            <Icon name="restore" size={15} /> Restore my firmware
          </button>
        )}
        <span className={`chip ${ai.enabled ? 'ai-chip' : ''}`} title={ai.enabled ? `AI model ${ai.model}` : 'Add ANTHROPIC_API_KEY to .env.local'}>
          AI {ai.enabled ? 'on' : 'off'}
        </span>
        <button className={`btn icon ${devOpen ? 'on' : ''}`} aria-label="Developer menu" title="Developer menu (simulator)" onClick={() => useApp.getState().set({ devOpen: !devOpen })}>
          <Icon name="gear" size={17} />
        </button>
      </div>
    </header>
  );
}
