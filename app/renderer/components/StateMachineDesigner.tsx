// State machine designer (issue #12), a tool in New project: states, events and transitions,
// drawn as a diagram in the style of the lesson figures, checked in plain words, turned into C
// (enum + switch + table, hook stubs), a host unit test and an Arduino sketch.
//
// The machine lives in the project scene (scene.stateMachine), so it is saved and opened with the
// project and undo works as for parts and wires. Honest: a design tool, nothing talks to the board.

import { useId, useMemo, useState } from 'react';
import {
  SM_LIMITS,
  checkMachine,
  cPrefix,
  emptyMachine,
  generateCode,
  layoutMachine,
  nextId,
  parseStateMachine,
  smExamples,
  type SmDiagram,
  type SmFile,
  type SmFinding,
  type SmState,
  type SmTransition,
  type StateMachine,
} from '@shared/statemachine';
import type { Scene } from '@shared/types';
import { t } from '@shared/i18n';
import { log, useScene } from '../state/store';
import { Icon } from './Icon';
import '../styles/statemachine.css';

const LINE_H = 14;

/** Replaces (or removes) the project's machine. Transient changes (typing) skip the undo history. */
function setMachine(next: StateMachine | null, transient = false) {
  useScene.getState().updateScene(
    (s) => {
      const out: Scene = { ...s };
      if (next) out.stateMachine = next;
      else delete out.stateMachine;
      return out;
    },
    { transient },
  );
}

/** Sets an optional text field; an empty text removes it. */
function withText<T extends object>(o: T, key: string, v: string): T {
  const out = { ...o } as Record<string, unknown>;
  if (v) out[key] = v;
  else delete out[key];
  return out as unknown as T;
}

/** Typing: one undo step per field, taken when the field gets the focus. */
const checkpoint = () => useScene.getState().checkpoint();

export function StateMachineDesigner() {
  const raw = useScene((s) => s.scene.stateMachine);
  const m = useMemo(() => (raw === undefined ? null : parseStateMachine(raw)), [raw]);
  const [hi, setHi] = useState<string[]>([]);
  const [tab, setTab] = useState<SmFile['kind']>('source');
  const [fit, setFit] = useState(true);
  const findings = useMemo(() => (m ? checkMachine(m) : []), [m]);
  const files = useMemo(() => (m ? generateCode(m) : null), [m]);
  const diagram = useMemo(() => (m ? layoutMachine(m) : null), [m]);
  const examples = smExamples();

  const load = (id: string) => {
    const ex = examples.find((e) => e.id === id);
    if (!ex) return;
    setMachine(ex.build());
    setHi([]);
    log('action', m ? t('Loaded the example “{name}”. Undo brings your machine back.', { name: ex.title }) : t('Loaded the example “{name}”.', { name: ex.title }));
  };

  if (!m)
    return (
      <div className="sm">
        <p className="small dim">
          {t('Draw how your device behaves: its states, the events that move it from one state to another, and what happens on the way. The app checks the design and writes C code with a unit test.')}
        </p>
        {raw !== undefined && (
          <div className="small warn-text">{t('The state machine in this project could not be read. Start again from an example or an empty machine.')}</div>
        )}
        <div className="sm-examples">
          {examples.map((ex) => (
            <button key={ex.id} className="lib-item" onClick={() => load(ex.id)}>
              <b>{ex.title}</b>
              <span className="small dim">{ex.summary}</span>
            </button>
          ))}
        </div>
        <div className="row gap wrap">
          <button className="btn small" onClick={() => setMachine(emptyMachine())}>
            <Icon name="plus" size={12} /> {t('Start with an empty machine')}
          </button>
        </div>
      </div>
    );

  const upState = (id: string, patch: (s: SmState) => SmState, transient = false) =>
    setMachine({ ...m, states: m.states.map((s) => (s.id === id ? patch(s) : s)) }, transient);
  const upTr = (id: string, patch: (x: SmTransition) => SmTransition, transient = false) =>
    setMachine({ ...m, transitions: m.transitions.map((x) => (x.id === id ? patch(x) : x)) }, transient);

  const addState = () => {
    const id = nextId('s', m);
    let n = m.states.length + 1;
    while (m.states.some((s) => s.name === `STATE_${n}`)) n++;
    setMachine({ ...m, states: [...m.states, { id, name: `STATE_${n}` }], initial: m.states.length ? m.initial : id });
    setHi([id]);
  };
  const removeState = (id: string) => {
    const states = m.states.filter((s) => s.id !== id);
    setMachine({
      ...m,
      states,
      initial: m.initial === id ? (states[0]?.id ?? '') : m.initial,
      transitions: m.transitions.filter((x) => x.from !== id && x.to !== id),
    });
  };
  const addEvent = () => {
    const id = nextId('e', m);
    let n = m.events.length + 1;
    while (m.events.some((e) => e.name === `EVENT_${n}`)) n++;
    setMachine({ ...m, events: [...m.events, { id, name: `EVENT_${n}` }] });
  };
  const removeEvent = (id: string) => setMachine({ ...m, events: m.events.filter((e) => e.id !== id), transitions: m.transitions.filter((x) => x.event !== id) });
  const addTransition = () => {
    const from = m.states.find((s) => hi.includes(s.id))?.id ?? m.states[0].id;
    const to = m.states.find((s) => s.id !== from)?.id ?? from;
    const id = nextId('t', m);
    setMachine({ ...m, transitions: [...m.transitions, { id, from, event: m.events[0].id, to }] });
    setHi([id]);
  };

  const errors = findings.filter((f) => f.severity === 'error').length;
  const problems = findings.filter((f) => f.severity !== 'info');
  const ignored = findings.filter((f) => f.severity === 'info');
  const file = files?.find((f) => f.kind === tab) ?? files?.[0];
  const p = cPrefix(m.name);
  const tabs: { kind: SmFile['kind']; label: string }[] = [
    { kind: 'header', label: '.h' },
    { kind: 'source', label: '.c' },
    { kind: 'hooks', label: t('Hooks') },
    { kind: 'test', label: t('Test') },
    { kind: 'sketch', label: 'Arduino' },
  ];
  const tabHint: Record<SmFile['kind'], string> = {
    header: t('Generated: change the design here and save again, instead of editing the file.'),
    source: t('Generated: change the design here and save again, instead of editing the file.'),
    hooks: t('Your code goes here: what each state does, the conditions and the actions.'),
    test: t('Runs on your computer, not on the board. Save it next to the .h and .c files, then run:'),
    sketch: t('Everything in one sketch. Put the .ino file in a folder with the same name, then open it in the Arduino IDE.'),
  };
  const save = async (f: SmFile) => {
    const r = await window.bp.session.saveFile(f.name, f.content);
    if (r.ok) log('action', t('Saved {file}.', { file: r.value }));
    else if (r.error.code !== 'cancelled') log('failed', t(r.error.humanMessage));
  };

  return (
    <div className="sm">
      <div className="sm-head">
        <label className="sm-field">
          <span className="small dim">{t('Machine name (used in the C names)')}</span>
          <input className="text-in mono" value={m.name} maxLength={40} onFocus={checkpoint} onChange={(e) => setMachine({ ...m, name: e.target.value }, true)} />
        </label>
        <select className="select" value="" onChange={(e) => load(e.target.value)} aria-label={t('Load an example')}>
          <option value="">{t('Load an example…')}</option>
          {examples.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.title}
            </option>
          ))}
        </select>
        <button
          className="btn small ghost"
          title={t('Remove the state machine from this project')}
          onClick={() => {
            setMachine(null);
            log('action', t('Removed the state machine from the project. Undo brings it back.'));
          }}
        >
          <Icon name="trash" size={12} />
        </button>
      </div>

      {diagram && <SmDiagramView d={diagram} hi={hi} onPick={setHi} fit={fit} />}
      <div className="sm-legend small dim">
        <span className="tone-start">{t('start')}</span>
        <span className="tone-dead">{t('no way out')}</span>
        <span className="tone-unreachable">{t('never reached')}</span>
        <span className="sm-spacer" />
        <button className="btn small ghost" onClick={() => setFit(!fit)}>
          {fit ? t('Actual size') : t('Fit to the panel')}
        </button>
      </div>
      <div className="small dim">{t('Click a state or an arrow to find it below.')}</div>

      {problems.length > 0 && (
        <div className="findings">
          {problems.map((f) => (
            <FindingButton key={f.id} f={f} onPick={setHi} />
          ))}
        </div>
      )}
      {ignored.length > 0 && (
        <details className="sm-ignored">
          <summary className="small dim">{t('Events some states ignore ({n})', { n: ignored.length })}</summary>
          <div className="findings">
            {ignored.map((f) => (
              <FindingButton key={f.id} f={f} onPick={setHi} />
            ))}
          </div>
        </details>
      )}

      <div className="sm-section">
        <div className="label">{t('States')}</div>
        <div className="small dim">{t('The dot marks the starting state: the device is in it right after power-on.')}</div>
        {m.states.map((s) => (
          <div key={s.id} className={`sm-row sm-state ${hi.includes(s.id) ? 'hot' : ''}`}>
            <input type="radio" name={`sm-start-${p}`} checked={m.initial === s.id} onChange={() => setMachine({ ...m, initial: s.id })} title={t('Start here')} aria-label={t('Start here')} />
            <input className="text-in mono" value={s.name} aria-label={t('State name')} onFocus={checkpoint} onChange={(e) => upState(s.id, (x) => ({ ...x, name: e.target.value }), true)} />
            <input
              className="text-in"
              value={s.note ?? ''}
              placeholder={t('What it does (optional)')}
              aria-label={t('What it does (optional)')}
              onFocus={checkpoint}
              onChange={(e) => upState(s.id, (x) => withText(x, 'note', e.target.value), true)}
            />
            <button className="btn icon" title={t('Delete this state and its transitions')} onClick={() => removeState(s.id)}>
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}
        <button className="btn small" disabled={m.states.length >= SM_LIMITS.states} onClick={addState}>
          <Icon name="plus" size={12} /> {t('Add a state')}
        </button>
      </div>

      <div className="sm-section">
        <div className="label">{t('Events')}</div>
        <div className="small dim">{t('Things that happen: a button press, a timer running out, a reading crossing a limit.')}</div>
        {m.events.map((e) => (
          <div key={e.id} className={`sm-row sm-event ${hi.includes(e.id) ? 'hot' : ''}`}>
            <input className="text-in mono" value={e.name} aria-label={t('Event name')} onFocus={checkpoint} onChange={(ev) => setMachine({ ...m, events: m.events.map((x) => (x.id === e.id ? { ...x, name: ev.target.value } : x)) }, true)} />
            <input
              className="text-in"
              value={e.note ?? ''}
              placeholder={t('Where it comes from (optional)')}
              aria-label={t('Where it comes from (optional)')}
              onFocus={checkpoint}
              onChange={(ev) => setMachine({ ...m, events: m.events.map((x) => (x.id === e.id ? withText(x, 'note', ev.target.value) : x)) }, true)}
            />
            <button className="btn icon" title={t('Delete this event and its transitions')} onClick={() => removeEvent(e.id)}>
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}
        <button className="btn small" disabled={m.events.length >= SM_LIMITS.events} onClick={addEvent}>
          <Icon name="plus" size={12} /> {t('Add an event')}
        </button>
      </div>

      <div className="sm-section">
        <div className="label">{t('Transitions')}</div>
        <div className="small dim">{t('In a state, when an event happens and the condition is true: do the action and go to the next state.')}</div>
        {m.transitions.map((x) => (
          <div key={x.id} className={`sm-tr ${hi.includes(x.id) ? 'hot' : ''}`}>
            <select className="select mono" value={x.from} aria-label={t('From state')} onChange={(e) => upTr(x.id, (v) => ({ ...v, from: e.target.value }))}>
              {m.states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || '?'}
                </option>
              ))}
            </select>
            <select className="select mono" value={x.event} aria-label={t('Event')} onChange={(e) => upTr(x.id, (v) => ({ ...v, event: e.target.value }))}>
              {m.events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name || '?'}
                </option>
              ))}
            </select>
            <span className="dim">→</span>
            <select className="select mono" value={x.to} aria-label={t('To state')} onChange={(e) => upTr(x.id, (v) => ({ ...v, to: e.target.value }))}>
              {m.states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || '?'}
                </option>
              ))}
            </select>
            <button className="btn icon" title={t('Delete this transition')} onClick={() => setMachine({ ...m, transitions: m.transitions.filter((v) => v.id !== x.id) })}>
              <Icon name="x" size={12} />
            </button>
            <input
              className="text-in sm-guard"
              value={x.guard ?? ''}
              placeholder={t('Only if… (condition, optional)')}
              aria-label={t('Only if… (condition, optional)')}
              onFocus={checkpoint}
              onChange={(e) => upTr(x.id, (v) => withText(v, 'guard', e.target.value), true)}
            />
            <input
              className="text-in sm-action"
              value={x.action ?? ''}
              placeholder={t('Then do… (action, optional)')}
              aria-label={t('Then do… (action, optional)')}
              onFocus={checkpoint}
              onChange={(e) => upTr(x.id, (v) => withText(v, 'action', e.target.value), true)}
            />
          </div>
        ))}
        <button className="btn small" disabled={!m.states.length || !m.events.length || m.transitions.length >= SM_LIMITS.transitions} onClick={addTransition}>
          <Icon name="plus" size={12} /> {t('Add a transition')}
        </button>
        {!m.events.length && <div className="small dim">{t('Add an event first: every transition starts with one.')}</div>}
      </div>

      <div className="sm-section">
        <div className="label">{t('C code and tests')}</div>
        {!files || !file ? (
          <div className="small warn-text">{t('Fix the {n} problems marked in red to get the code.', { n: errors })}</div>
        ) : (
          <>
            <div className="row gap wrap">
              <div className="seg">
                {tabs.map((x) => (
                  <button key={x.kind} className={file.kind === x.kind ? 'on' : ''} onClick={() => setTab(x.kind)}>
                    {x.label}
                  </button>
                ))}
              </div>
              <button className="btn small ghost" onClick={() => void save(file)}>
                <Icon name="save" size={12} /> {t('Save {file}…', { file: file.name })}
              </button>
            </div>
            <div className="small dim">{tabHint[file.kind]}</div>
            {file.kind === 'test' && <code className="sm-cmd mono small">{`cc -std=c99 -Wall -Werror ${p}.c test_${p}.c -o test_${p} && ./test_${p}`}</code>}
            <pre className="code">{file.content}</pre>
          </>
        )}
        <div className="small dim">
          {t('A design tool: nothing here talks to the board, and the generated test runs on your computer. The machine is saved with the project.')}
        </div>
      </div>
    </div>
  );
}

function FindingButton({ f, onPick }: { f: SmFinding; onPick(ids: string[]): void }) {
  return (
    <button className={`finding sev-${f.severity}`} onClick={() => onPick(f.targets)}>
      <b>{f.message}</b>
      <span>{f.hint}</span>
    </button>
  );
}

/** The diagram in the style of the lesson figures: tinted boxes, thin arrows, muted labels. */
function SmDiagramView({ d, hi, onPick, fit }: { d: SmDiagram; hi: string[]; onPick(ids: string[]): void; fit: boolean }) {
  const marker = `smm${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const hot = (ids: string[]) => ids.some((id) => hi.includes(id));
  return (
    <div className={`sm-diagram ${fit ? 'fit' : ''}`}>
      <svg
        viewBox={`0 0 ${d.width} ${d.height}`}
        width={d.width}
        height={d.height}
        style={fit ? { maxWidth: d.width } : undefined}
        role="img"
        aria-label={t('State machine diagram')}
      >
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        {d.start && (
          <g className="sm-start">
            <circle cx={d.start.cx} cy={d.start.cy} r={5} />
            <path d={`M${d.start.cx + 5} ${d.start.cy} L${d.start.x2} ${d.start.y2}`} markerEnd={`url(#${marker})`} />
          </g>
        )}
        {d.edges.map((e) => (
          <path key={e.id} className={`sm-edge ${hot(e.transitions) ? 'hot' : ''}`} d={e.d} markerEnd={`url(#${marker})`} onClick={() => onPick(e.transitions)} />
        ))}
        {d.boxes.map((b) => (
          <g key={b.id} className={`sm-box tone-${b.tone} ${hot([b.id]) ? 'hot' : ''}`} onClick={() => onPick([b.id])}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={8} />
            <text x={b.x + b.w / 2} y={b.sub ? b.y + b.h / 2 - 8 : b.y + b.h / 2} className="sm-title" textAnchor="middle" dominantBaseline="central">
              {b.title}
            </text>
            {b.sub && (
              <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 10} className="sm-sub" textAnchor="middle" dominantBaseline="central">
                {b.sub}
              </text>
            )}
          </g>
        ))}
        {d.edges.map((e) => (
          <g key={`l${e.id}`} className={`sm-label ${hot(e.transitions) ? 'hot' : ''}`} onClick={() => onPick(e.transitions)}>
            <rect x={e.label.x} y={e.label.y} width={e.label.w} height={e.label.h} rx={4} />
            {e.label.lines.map((l, i) => (
              <text key={i} x={e.label.x + 6} y={e.label.y + 3 + LINE_H * i + LINE_H / 2} dominantBaseline="central">
                {l}
              </text>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
