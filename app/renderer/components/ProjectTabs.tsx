// The project tabs above the workspace: one tab per open project, a dot for its wiring and code
// checks, double-click to rename, × to close, + for a new project (Blank, Read from port, Template).

import { useEffect, useState } from 'react';
import { t } from '@shared/i18n';
import { useScene } from '../state/store';
import { handleProjectKey, openNewProject, tabName, useProjects, type ProjectTab } from '../state/projects';
import { useCodeFindings } from '../state/code';

/** The worst open finding of the active project (wiring and code): the colour of its dot. */
function useActiveSeverity(): 'error' | 'warning' | null {
  const findings = useScene((s) => s.findings);
  const code = useCodeFindings();
  const all = [...findings, ...code];
  if (all.some((f) => f.severity === 'error')) return 'error';
  if (all.some((f) => f.severity === 'warning')) return 'warning';
  return null;
}

function Tab({ tab, active, sev }: { tab: ProjectTab; active: boolean; sev: 'error' | 'warning' | null }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tab.name);
  const p = useProjects.getState();
  const done = () => {
    p.rename(tab.id, name);
    setEditing(false);
  };
  return (
    <div
      className={`ptab ${active ? 'on' : ''}`}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      onClick={() => p.switchTo(tab.id)}
      onKeyDown={(e) => e.key === 'Enter' && !editing && p.switchTo(tab.id)}
      onDoubleClick={() => {
        setName(tabName(tab));
        setEditing(true);
      }}
      title={active ? t('Double-click to rename') : tabName(tab)}
    >
      {active && sev && <span className={`ptab-dot sev-${sev}`} title={sev === 'error' ? t('The checks found problems') : t('The checks found things to look at')} />}
      {editing ? (
        <input
          className="ptab-name-in"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={done}
          onKeyDown={(e) => {
            if (e.key === 'Enter') done();
            if (e.key === 'Escape') setEditing(false);
            e.stopPropagation();
          }}
          aria-label={t('Project name')}
        />
      ) : (
        <span className="ptab-name">{tabName(tab)}</span>
      )}
      <button
        className="ptab-close"
        aria-label={t('Close {name}', { name: tabName(tab) })}
        title={t('Close')}
        onClick={(e) => {
          e.stopPropagation();
          p.close(tab.id);
        }}
      >
        ×
      </button>
    </div>
  );
}

export function ProjectTabs() {
  const tabs = useProjects((s) => s.tabs);
  const active = useProjects((s) => s.active);
  const sev = useActiveSeverity();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (handleProjectKey(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="project-tabs" role="tablist" aria-label={t('Open projects')}>
      {tabs.map((tab) => (
        <Tab key={tab.id} tab={tab} active={tab.id === active} sev={sev} />
      ))}
      <button className="ptab-new" onClick={() => openNewProject()} title={t('New project')} aria-label={t('New project')} data-where="tabs:new">
        +
      </button>
    </div>
  );
}
