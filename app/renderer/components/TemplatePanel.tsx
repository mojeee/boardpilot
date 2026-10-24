// Template projects: pick one, it is built for the board (parts, wires, code), and "Run" plays its
// behaviour model: the story in plain words (Log panel), the running step highlighted in the code
// (Code panel), pins and parts reacting in 3D. Everything here is labelled simulated.

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { PARTS, getBoard } from '@shared/board';
import { TEMPLATES, templateFits } from '@shared/templates';
import { t } from '@shared/i18n';
import { useScene } from '../state/store';
import { useTemplate } from '../state/templateRun';
import { useLayout } from '../state/layout';

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const LEVEL: Record<string, string> = { 'first steps': 'First steps', easy: 'Easy', medium: 'Medium' };

/** The list of templates, for the board of the open project. */
export function TemplatePicker() {
  const boardId = useScene((s) => s.scene.board);
  const board = getBoard(boardId);
  return (
    <div className="tpl-list">
      {TEMPLATES.map((tpl) => {
        const why = templateFits(tpl, board);
        return (
          <button key={tpl.id} className="tpl-card" disabled={!!why} onClick={() => useTemplate.getState().open(tpl.id)} title={why ?? ''}>
            <b>{t(tpl.name)}</b>
            <span className="small dim">{t(tpl.summary)}</span>
            <span className="tpl-meta mono small">
              {t(LEVEL[tpl.difficulty])} · {t('{n} min', { n: tpl.minutes })} · {tpl.parts.map((p) => PARTS[p.partId]?.name.split(/[ (]/)[0]).join(' + ')}
            </span>
            {why && <span className="small warn-text">{why}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** The open template: what you learn and the run controls. The code and the story are in the bottom panel. */
export function TemplateView() {
  const { tpl, running, speed, now, step, state } = useTemplate();
  if (!tpl) return null;
  const st = useTemplate.getState();
  return (
    <div className="tpl-view">
      <div className="row between">
        <div>
          <div className="panel-title">{t(tpl.name)}</div>
          <div className="small dim">{t(tpl.summary)}</div>
        </div>
        <button className="btn small ghost" onClick={() => st.close()}>
          {t('Close')}
        </button>
      </div>
      <div className="label">{t('What you learn')}</div>
      <ul className="small tpl-learn">
        {tpl.learn.map((l) => (
          <li key={l}>{t(l)}</li>
        ))}
      </ul>
      {tpl.notes?.map((n) => (
        <p key={n} className="card-note gotcha small">
          {t(n)}
        </p>
      ))}

      <div className="label">{t('Run it in the simulator')}</div>
      <RunControls />
      {(step || state) && (
        <div className="tpl-now small">
          {state && <span className="chip mono">{state}</span>} {step && <b>{step}</b>}
        </div>
      )}
      <p className="small dim">
        {t('The code is in the Code panel below, with the running line highlighted. The story of the run is in the Log panel.')}{' '}
        <button className="link small" onClick={() => useLayout.getState().showBottom('code')}>
          {t('Show the code')}
        </button>
      </p>
      <div className="row gap wrap">
        {tpl.libraries?.length ? <span className="small dim">{t('Libraries: {list}', { list: [...tpl.libraries, 'BoardPilotProbe'].join(', ') })}</span> : null}
      </div>
      <span className="mono small dim">{mmss(now)}</span>
      {speed !== 1 && running && <span className="mono small dim"> · {speed}×</span>}
    </div>
  );
}

/** Run, one step, speed, restart: the simulated run of the open template. */
export function RunControls({ compact }: { compact?: boolean }) {
  const { running, speed, now } = useTemplate();
  const st = useTemplate.getState();
  return (
    <div className="row gap wrap run-controls">
      {running ? (
        <button className="btn small" onClick={() => st.pause()}>
          {t('Pause')}
        </button>
      ) : (
        <button
          className="btn small primary"
          data-where="code:run"
          onClick={() => {
            st.play();
            // Running the code shows what happens: the Log panel with the story.
            useLayout.getState().showBottom('log');
            useRunView.getState().set('story');
          }}
        >
          ▶ {now ? t('Continue') : t('Run in simulator')}
        </button>
      )}
      <button className="btn small" onClick={() => st.stepOnce()} title={t('Run until the next thing happens, then pause')}>
        {t('Step')}
      </button>
      {!compact && (
        <div className="seg">
          {[1, 2, 4].map((x) => (
            <button key={x} className={speed === x ? 'on' : ''} onClick={() => st.setSpeed(x)}>
              {x}×
            </button>
          ))}
        </div>
      )}
      {!compact && (
        <button className="btn small ghost" onClick={() => st.reset()}>
          {t('Restart')}
        </button>
      )}
      <span className="badge sim">{t('simulated')}</span>
    </div>
  );
}

/** The story of the run in plain words; each line focuses its pin, wire or part. */
export function RunStory() {
  const story = useTemplate((s) => s.story);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [story.length]);
  return (
    <div className="tpl-story run-story" ref={ref}>
      {story.length === 0 && <div className="small dim">{t('Press Run: each step of the program appears here in plain words.')}</div>}
      {story.filter((s) => !s.quiet).map((s, i) => (
        <button key={i} className={`story-line k-${s.kind}`} onClick={() => s.targets.length && useScene.getState().focusOn(s.targets)}>
          <span className="mono dim">{mmss(s.t)}</span>
          <span>{s.text}</span>
        </button>
      ))}
    </div>
  );
}

/** Which view the Log tab shows while a template is open: the session log or the run story. */
export const useRunView = create<{ view: 'session' | 'story'; set(v: 'session' | 'story'): void }>((set) => ({ view: 'session', set: (view) => set({ view }) }));
