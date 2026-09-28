import { useApp } from '../state/store';
import { confirmRestore } from '../state/hw';
import { Icon } from './Icon';
import { LicenseChip } from './License';
import { LANGS, getLanguage, type Lang } from '@shared/i18n';
import { changeLanguage } from '../state/lang';
import { t } from '@shared/i18n';
import { PROVIDER_INFO } from '@shared/ai';
import { openAiSettings } from './AiSettings';

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
            {conn.agent ? <span className="chip ok-chip">{t('agent {ver}', { ver: conn.agent.ver })}</span> : <span className="chip">{t('your firmware')}</span>}
          </>
        ) : (
          <span className="dim">{t('No board connected')}</span>
        )}
        {conn.mode === 'sim' && <span className="chip sim-chip">{t('Simulator')}</span>}
      </div>
      {progress && (
        <div className="progress" title={t(progress.task)}>
          <span className="small">{t(progress.task)}</span>
          <div className="bar">
            <i style={{ width: `${progress.pct}%` }} />
          </div>
          <span className="mono small">{Math.round(progress.pct)}%</span>
        </div>
      )}
      <div className="top-actions">
        {conn.backups.length > 0 && conn.agent && (
          <button className="btn small" onClick={() => confirmRestore()}>
            <Icon name="restore" size={15} /> {t('Restore my firmware')}
          </button>
        )}
        <LicenseChip />
        <select className="select lang-select" value={getLanguage()} onChange={(e) => changeLanguage(e.target.value as Lang)} title={t('Language')}>
          {LANGS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.id.toUpperCase()}
            </option>
          ))}
        </select>
        <button
          className={`chip ai-set-chip ${ai.enabled ? 'ai-chip' : ''}`}
          onClick={openAiSettings}
          title={ai.enabled ? t('{provider}, model {model}. Click to change.', { provider: PROVIDER_INFO[ai.provider].name, model: ai.model }) : t('Set up the AI assistant')}
        >
          <Icon name="ai" size={13} /> {ai.enabled ? PROVIDER_INFO[ai.provider].short : t('AI off')}
        </button>
        <button className={`btn icon ${devOpen ? 'on' : ''}`} aria-label={t('Developer menu')} title={t('Developer menu (simulator)')} onClick={() => useApp.getState().set({ devOpen: !devOpen })}>
          <Icon name="gear" size={17} />
        </button>
      </div>
    </header>
  );
}
