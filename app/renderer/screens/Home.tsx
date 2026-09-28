import { useState } from 'react';
import { DEBUG_SYMPTOMS } from '@flows/index';
import { useApp, useLog, useScene, log } from '../state/store';
import { TASKS, openTask } from '../components/TaskRail';
import { Icon } from '../components/Icon';
import { useWizard } from '../wizard/session';

/** "Describe it in your own words" on Home: the fast model picks a task or debug flow. */
function DescribeBox() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const aiOn = useApp((s) => s.ai.enabled);
  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    const options = [
      ...TASKS.filter((x) => x.screen !== 'debug').map((x) => ({ id: `task:${x.screen}`, label: `${x.label}: ${x.hint}` })),
      ...DEBUG_SYMPTOMS.map((d) => ({ id: `flow:${d.id}`, label: `Debug: ${d.label} (${d.hint})` })),
    ];
    const r = await window.bp.ai.classify(t, options);
    setBusy(false);
    if (!r.ok) return setNote(`${r.error.humanMessage} ${r.error.hint}`);
    if (!r.value.optionId) return setNote(`${r.value.reason} Pick a task on the left, or ask the assistant.`);
    log('action', `You wrote: “${t}”. Suggested: ${options.find((o) => o.id === r.value.optionId)?.label}.`, { source: 'assistant classification (suggestion)' });
    const [kind, id] = r.value.optionId.split(/:(.+)/);
    if (kind === 'flow') {
      useApp.getState().setScreen('debug');
      useWizard.getState().start(id);
    } else openTask(id as Parameters<typeof openTask>[0]);
  };
  return (
    <div className="describe">
      <div className="label">Not sure where to start? Describe it in your own words</div>
      <div className="ask-box big">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={aiOn ? 'e.g. “my temperature sensor only shows zeros”' : 'The assistant is off (no API key). Pick a task instead.'}
          disabled={!aiOn}
        />
        <button className="btn icon ai" onClick={submit} disabled={busy || !text.trim()} aria-label="Go">
          <Icon name="send" size={16} />
        </button>
      </div>
      {note && <p className="small dim">{note}</p>}
    </div>
  );
}

export function Home() {
  const conn = useApp((s) => s.conn);
  const findings = useScene((s) => s.findings);
  const scene = useScene((s) => s.scene);
  const entries = useLog((s) => s.entries);
  return (
    <div className="home">
      <div className="home-inner">
        <h1>What do you want to do?</h1>
        <p className="lead">Pick a task. The app checks what it can by itself and asks you only for what it cannot see.</p>
        <div className="task-grid">
          {TASKS.map((t, i) => (
            <button key={t.screen} className="task-card" onClick={() => openTask(t.screen)}>
              <span className="task-icon">
                <Icon name={t.icon} size={22} />
              </span>
              <span className="task-num mono">{i + 1}</span>
              <b>{t.label}</b>
              <span>{t.hint}</span>
            </button>
          ))}
        </div>
        <DescribeBox />
        <div className="home-status">
          <div className="status-card">
            <div className="label">Board</div>
            {conn.chip ? (
              <>
                <b className="mono">{conn.chip.chip}</b>
                <span className="dim mono small">
                  {conn.port} · {conn.chip.flashSize} · {conn.chip.mac}
                </span>
              </>
            ) : (
              <>
                <b>Not connected</b>
                <button className="link small" onClick={() => openTask('connect')}>
                  Connect and identify →
                </button>
              </>
            )}
          </div>
          <div className="status-card">
            <div className="label">Project</div>
            <b>
              {scene.parts.length} part{scene.parts.length === 1 ? '' : 's'}, {scene.wires.length} wire{scene.wires.length === 1 ? '' : 's'}
            </b>
            <span className={`small ${findings.length ? 'warn-text' : 'dim'}`}>
              {findings.length ? `${findings.length} wiring finding${findings.length > 1 ? 's' : ''}` : 'No wiring problems found'}
            </span>
          </div>
          <div className="status-card">
            <div className="label">Mode</div>
            <b>{conn.mode === 'sim' ? 'Simulator' : 'Real board'}</b>
            <span className="small dim">{conn.mode === 'sim' ? 'No hardware needed. Change it in the ⚙ menu.' : 'Talks to the board on USB.'}</span>
          </div>
          <div className="status-card">
            <div className="label">This session</div>
            <b>{entries.length} log entries</b>
            <span className="small dim">{conn.backups.length ? `${conn.backups.length} flash backup(s) for this board` : 'No backups yet'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
