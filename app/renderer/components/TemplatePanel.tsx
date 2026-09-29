// Template projects in New project: pick one, it is built for the board (parts, wires, code), and
// "Run" plays its behaviour model: the story in plain words, the running step highlighted in the
// code, pins and parts reacting in 3D. Everything here is labelled simulated.

import { useEffect, useMemo, useRef } from 'react';
import { PARTS, getBoard } from '@shared/board';
import { TEMPLATES, stepLines, templateFits } from '@shared/templates';
import { t } from '@shared/i18n';
import { useScene } from '../state/store';
import { useTemplate } from '../state/templateRun';

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

/** The open template: what you learn, the run controls, the story and the code. */
export function TemplateView() {
  const { tpl, code, story, running, speed, now, step, state } = useTemplate();
  const lines = useMemo(() => stepLines(code), [code]);
  // The story shows steps translated; the code has them in English.
  const activeLine = [...lines].find(([k]) => t(k) === step)?.[1] ?? 0;
  const codeRef = useRef<HTMLPreElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);

  // Keep the running line and the newest story line in view.
  useEffect(() => {
    codeRef.current?.querySelector('.run-line')?.scrollIntoView({ block: 'nearest' });
  }, [activeLine]);
  useEffect(() => {
    if (storyRef.current) storyRef.current.scrollTop = storyRef.current.scrollHeight;
  }, [story.length]);

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
      <div className="row gap wrap">
        {running ? (
          <button className="btn small" onClick={() => st.pause()}>
            {t('Pause')}
          </button>
        ) : (
          <button className="btn small primary" onClick={() => st.play()}>
            {now ? t('Continue') : t('Run')}
          </button>
        )}
        <button className="btn small" onClick={() => st.stepOnce()}>
          {t('One step')}
        </button>
        <div className="seg">
          {[1, 2, 4].map((x) => (
            <button key={x} className={speed === x ? 'on' : ''} onClick={() => st.setSpeed(x)}>
              {x}×
            </button>
          ))}
        </div>
        <button className="btn small ghost" onClick={() => st.reset()}>
          {t('Restart')}
        </button>
        <span className="badge sim">{t('simulated')}</span>
        <span className="mono small dim">{mmss(now)}</span>
      </div>
      {(step || state) && (
        <div className="tpl-now small">
          {state && <span className="chip mono">{state}</span>} {step && <b>{step}</b>}
        </div>
      )}
      <div className="tpl-story" ref={storyRef}>
        {story.length === 0 && <div className="small dim">{t('Press Run: each step of the program appears here in plain words.')}</div>}
        {story.filter((s) => !s.quiet).map((s, i) => (
          <button key={i} className={`story-line k-${s.kind}`} onClick={() => s.targets.length && useScene.getState().focusOn(s.targets)}>
            <span className="mono dim">{mmss(s.t)}</span>
            <span>{s.text}</span>
          </button>
        ))}
      </div>

      <div className="label">{t('The code')}</div>
      <div className="row gap wrap">
        <button className="btn small ghost" onClick={() => window.bp.session.saveFile(`${tpl.id.replace(/-/g, '_')}.ino`, code)}>
          {t('Save .ino…')}
        </button>
        {tpl.libraries?.length ? <span className="small dim">{t('Libraries: {list}', { list: [...tpl.libraries, 'BoardPilotProbe'].join(', ') })}</span> : null}
      </div>
      <pre className="code tpl-code" ref={codeRef}>
        {code.split('\n').map((l, i) => (
          <div key={i} className={i + 1 === activeLine ? 'run-line' : ''}>
            {l || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}
