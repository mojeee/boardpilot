// "You made something like this before": a card under the chat (and in Describe it) when a past
// project in the archive overlaps with what is being planned. It says why, only from facts read
// from that project's files, and offers to look at it. A suggestion: nothing changes on its own.

import { useEffect } from 'react';
import { t } from '@shared/i18n';
import { Icon } from './Icon';
import { ensureArchive, reasonLabel, startFromArchive, useArchive, useSimilarProjects } from '../state/archive';
import { useApp } from '../state/store';

/** `onPick` runs after a button is used (Describe it closes its dialog). */
export function SimilarProjects({ text = '', max = 1, onPick }: { text?: string; max?: number; onPick?: () => void }) {
  useEffect(ensureArchive, []);
  const matches = useSimilarProjects(text).slice(0, max);
  const projects = useArchive((s) => s.projects);
  if (!matches.length) return null;
  return (
    <div className="similar-list">
      {matches.map((m) => {
        const e = projects.find((p) => p.id === m.id);
        if (!e) return null;
        return (
          <div key={m.id} className="similar-card" data-where="archive:similar">
            <div className="row between">
              <span className="similar-title">
                <Icon name="folder" size={14} /> {t('Similar past project')}
              </span>
              <button className="link dim small" onClick={() => useArchive.getState().dismiss(m.id)} title={t('Hide this suggestion')} aria-label={t('Hide this suggestion')}>
                <Icon name="x" size={12} />
              </button>
            </div>
            <b>{e.name}</b>
            <div className="similar-why small">
              {t('In common:')} {m.reasons.map(reasonLabel).join(' · ')}
            </div>
            {e.summary && <div className="small dim similar-summary">{e.summary.value}</div>}
            <div className="row gap wrap">
              <button
                className="btn small"
                onClick={() => {
                  useArchive.getState().select(e.id);
                  useApp.getState().setScreen('archive');
                  onPick?.();
                }}
              >
                {t('View properties')}
              </button>
              {!window.bp.web && (
                <button className="btn small ghost" onClick={() => void window.bp.archive.reveal(e.id)}>
                  {t('Open folder')}
                </button>
              )}
              <button className="btn small ghost" onClick={() => void startFromArchive(e).then(() => onPick?.())}>
                {t('Use as start')}
              </button>
            </div>
            <div className="mono small dim">
              {t('source')}: archive · {e.name} · {t('suggestion')}
            </div>
          </div>
        );
      })}
    </div>
  );
}
