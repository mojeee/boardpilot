import { useState } from 'react';
import { DEBUG_SYMPTOMS } from '@flows/index';
import { useApp, useLog, useScene, log } from '../state/store';
import { TASKS, openTask } from '../components/TaskRail';
import { Icon } from '../components/Icon';
import { useWizard } from '../wizard/session';
import { t } from '@shared/i18n';

/** "Describe it in your own words" on Home: the fast model picks a task or debug flow. */
function DescribeBox() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const aiOn = useApp((s) => s.ai.enabled);
  const submit = async () => {
    const said = text.trim();
    if (!said) return;
    setBusy(true);
    const options = [
      ...TASKS.filter((x) => x.screen !== 'debug').map((x) => ({ id: `task:${x.screen}`, label: `${t(x.label)}: ${t(x.hint)}` })),
      ...DEBUG_SYMPTOMS.map((d) => ({ id: `flow:${d.id}`, label: t('Debug: {label} ({hint})', { label: t(d.label), hint: t(d.hint) }) })),
    ];
    const r = await window.bp.ai.classify(said, options);
    setBusy(false);
    if (!r.ok) return setNote(`${r.error.humanMessage} ${r.error.hint}`);
    if (!r.value.optionId) return setNote(t('{reason} Pick a task above, or ask the assistant.', { reason: r.value.reason }));
    log('action', t('You wrote: “{text}”. Suggested: {option}.', { text: said, option: options.find((o) => o.id === r.value.optionId)?.label ?? '' }), {
      source: 'assistant classification (suggestion)',
    });
    const [kind, id] = r.value.optionId.split(/:(.+)/);
    if (kind === 'flow') {
      useApp.getState().setScreen('debug');
      useWizard.getState().start(id);
    } else openTask(id as Parameters<typeof openTask>[0]);
  };
  return (
    <div className="describe">
      <div className="label">{t('Not sure where to start? Describe it in your own words')}</div>
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
          placeholder={aiOn ? t('e.g. “my temperature sensor only shows zeros”') : t('The assistant is off (no API key). Pick a task instead.')}
          disabled={!aiOn}
        />
        <button className="btn icon ai" onClick={submit} disabled={busy || !text.trim()} aria-label={t('Go')}>
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
        <h1>{t('What do you want to do?')}</h1>
        <p className="lead">{t('Pick a task. The app checks what it can by itself and asks you only for what it cannot see.')}</p>
        <div className="task-grid">
          {TASKS.map((task, i) => (
            <button key={task.screen} className="task-card" onClick={() => openTask(task.screen)}>
              <span className="task-icon">
                <Icon name={task.icon} size={22} />
              </span>
              <span className="task-num mono">{i + 1}</span>
              <b>{t(task.label)}</b>
              <span>{t(task.hint)}</span>
            </button>
          ))}
        </div>
        <DescribeBox />
        <button className="learn-banner" onClick={() => useApp.getState().setScreen('learn')}>
          <span className="task-icon">
            <Icon name="learn" size={22} />
          </span>
          <span>
            <b>{t('New to embedded systems?')}</b>
            <span>{t('Short visual lessons: microcontrollers, pins, timers, buses, RTOS, and the road to senior.')}</span>
          </span>
        </button>
        <div className="home-status">
          <div className="status-card">
            <div className="label">{t('Board')}</div>
            {conn.chip ? (
              <>
                <b className="mono">{conn.chip.chip}</b>
                <span className="dim mono small">
                  {conn.port} · {conn.chip.flashSize} · {conn.chip.mac}
                </span>
              </>
            ) : (
              <>
                <b>{t('Not connected')}</b>
                <button className="link small" onClick={() => openTask('connect')}>
                  {t('Connect and identify →')}
                </button>
              </>
            )}
          </div>
          <div className="status-card">
            <div className="label">{t('Project')}</div>
            <b>
              {scene.parts.length === 1 ? t('1 part') : t('{n} parts', { n: scene.parts.length })},{' '}
              {scene.wires.length === 1 ? t('1 wire') : t('{n} wires', { n: scene.wires.length })}
            </b>
            <span className={`small ${findings.length ? 'warn-text' : 'dim'}`}>
              {findings.length === 1
                ? t('1 wiring finding')
                : findings.length
                  ? t('{n} wiring findings', { n: findings.length })
                  : t('No wiring problems found')}
            </span>
          </div>
          <div className="status-card">
            <div className="label">{t('Mode')}</div>
            <b>{conn.mode === 'sim' ? t('Simulator') : t('Real board')}</b>
            <span className="small dim">{conn.mode === 'sim' ? t('No hardware needed. Change it in the ⚙ menu.') : t('Talks to the board on USB.')}</span>
          </div>
          <div className="status-card">
            <div className="label">{t('This session')}</div>
            <b>{entries.length === 1 ? t('1 log entry') : t('{n} log entries', { n: entries.length })}</b>
            <span className="small dim">
              {conn.backups.length === 1
                ? t('1 flash backup for this board')
                : conn.backups.length
                  ? t('{n} flash backups for this board', { n: conn.backups.length })
                  : t('No backups yet')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
