// Session log. Entries with a target focus the 3D view when clicked.

import { useEffect, useRef } from 'react';
import type { LogType } from '@shared/types';
import { targetLabel, getBoard } from '@shared/board';
import { currentBoard, useLog, useScene } from '../state/store';
import { t } from '@shared/i18n';

const FILTERS: (LogType | 'all')[] = ['all', 'check', 'found', 'warning', 'failed', 'action', 'info'];
const LABEL: Record<LogType | 'all', string> = { all: 'All', check: 'Checks', found: 'Found', warning: 'Warnings', failed: 'Failed', action: 'Actions', info: 'Info' };
/** The short type chip on each log row. */
const TYPE_CHIP: Record<LogType, string> = { info: 'info', check: 'check', warning: 'warning', failed: 'failed', found: 'found', action: 'action' };

export function LogPanel() {
  const entries = useLog((s) => s.entries);
  const filter = useLog((s) => s.filter);
  const scene = useScene((s) => s.scene);
  const listRef = useRef<HTMLDivElement>(null);
  const shown = filter === 'all' ? entries : entries.filter((e) => e.type === filter);

  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  return (
    <section className="log-panel">
      <header>
        <span className="panel-title">{t('Session log')}</span>
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => useLog.getState().setFilter(f)}>
              {t(LABEL[f])}
            </button>
          ))}
        </div>
        <button className="link small" onClick={() => useLog.getState().clear()}>
          {t('Clear')}
        </button>
      </header>
      <div className="log-list" ref={listRef}>
        {shown.length === 0 && <div className="empty">{t('Everything the app checks, finds and does appears here.')}</div>}
        {shown.map((e) => (
          <div
            key={e.id}
            className={`log-row ${e.target ? 'clickable' : ''}`}
            onClick={() => e.target && useScene.getState().focusOn([e.target])}
            title={e.target ? t('Show in 3D') : undefined}
          >
            <span className="log-time mono">{new Date(e.t).toLocaleTimeString([], { hour12: false })}</span>
            <span className={`log-type t-${e.type}`}>{t(TYPE_CHIP[e.type] ?? e.type)}</span>
            <span className="log-text">{e.text}</span>
            {e.target && <span className="log-target mono">{targetLabel(currentBoard(), scene, e.target)}</span>}
            {e.source && <span className={`log-src ${e.source.startsWith('measured') ? 'measured' : ''}`}>{e.source}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
