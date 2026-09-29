// Learn: visual lessons on embedded systems. Lessons are data (shared/lessons.ts); widgets live in
// LearnWidgets.tsx. Progress is remembered on this computer. The assistant on the right can explain
// a lesson again or quiz the user.

import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { LESSONS, TRACKS, type Lesson, type LessonBlock } from '@shared/lessons';
import { t } from '@shared/i18n';
import { useApp } from '../state/store';
import { askAi } from '../components/ai';
import { Icon } from '../components/Icon';
import { LessonWidget } from './LearnWidgets';

const KEY = 'bp.learn';

function load(): { current: string; done: string[] } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { current?: unknown; done?: unknown };
    const ids = new Set(LESSONS.map((l) => l.id));
    // #screen=learn&lesson=gpio opens a lesson directly (links, screenshots)
    const fromHash = /[#&]lesson=([\w-]+)/.exec(location.hash)?.[1];
    const current = fromHash && ids.has(fromHash) ? fromHash : typeof v.current === 'string' && ids.has(v.current) ? v.current : LESSONS[0].id;
    const done = Array.isArray(v.done) ? v.done.filter((x): x is string => typeof x === 'string' && ids.has(x)) : [];
    return { current, done };
  } catch {
    return { current: LESSONS[0].id, done: [] };
  }
}

interface LearnStore {
  current: string;
  done: string[];
  open(id: string): void;
  toggleDone(id: string): void;
}

function save(s: { current: string; done: string[] }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: progress lasts for this session only */
  }
}

export const useLearn = create<LearnStore>((set, get) => ({
  ...load(),
  open: (current) => {
    set({ current });
    save({ current, done: get().done });
  },
  toggleDone: (id) => {
    const done = get().done.includes(id) ? get().done.filter((x) => x !== id) : [...get().done, id];
    set({ done });
    save({ current: get().current, done });
  },
}));

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the code is still selectable */
    }
  };
  return (
    <div className="learn-code">
      <button className="btn icon small" onClick={copy} aria-label={t('Copy code')} title={copied ? t('Copied') : t('Copy code')}>
        <Icon name={copied ? 'check' : 'copy'} size={14} />
      </button>
      <pre className="mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Block({ b }: { b: LessonBlock }) {
  switch (b.kind) {
    case 'p':
      return <p>{t(b.text)}</p>;
    case 'h':
      return <h3>{t(b.text)}</h3>;
    case 'list': {
      const items = b.items.map((x) => <li key={x}>{t(x)}</li>);
      return b.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case 'code':
      return <CodeBlock code={b.code} />;
    case 'table':
      return (
        <div className="learn-table-wrap">
          <table className="learn-table">
            <thead>
              <tr>{b.head.map((h, i) => <th key={i}>{h ? t(h) : ''}</th>)}</tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (b.monoCols?.includes(j) ? <td key={j} className="mono">{c}</td> : <td key={j}>{t(c)}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'widget':
      return <LessonWidget id={b.id} />;
    case 'tip':
      return (
        <div className="learn-tip">
          <b>{t('In real products')}</b>
          <p>{t(b.text)}</p>
        </div>
      );
  }
}

function LessonList({ lesson }: { lesson: Lesson }) {
  const done = useLearn((s) => s.done);
  const pct = Math.round((done.length / LESSONS.length) * 100);
  return (
    <nav className="learn-list" aria-label={t('Lessons')}>
      <div className="learn-progress">
        <span className="small dim">{t('{done} of {total} lessons done', { done: done.length, total: LESSONS.length })}</span>
        <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      {TRACKS.map((track) => (
        <div key={track.id}>
          <div className="rail-sep" title={t(track.hint)}>{t(track.label)}</div>
          {LESSONS.filter((l) => l.track === track.id).map((l) => {
            const n = LESSONS.indexOf(l) + 1;
            const isDone = done.includes(l.id);
            return (
              <button key={l.id} className={`learn-item ${l.id === lesson.id ? 'on' : ''}`} onClick={() => useLearn.getState().open(l.id)}>
                <span className={`learn-num mono ${isDone ? 'done' : ''}`}>{isDone ? <Icon name="check" size={12} /> : n}</span>
                <span className="learn-item-text">
                  <b>{t(l.title)}</b>
                  <span>{t(l.summary)}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Learn() {
  const current = useLearn((s) => s.current);
  const done = useLearn((s) => s.done);
  const aiOn = useApp((s) => s.ai.enabled);
  const lesson = LESSONS.find((l) => l.id === current) ?? LESSONS[0];
  const idx = LESSONS.indexOf(lesson);
  const next = LESSONS[idx + 1];
  const prev = LESSONS[idx - 1];
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => scroller.current?.scrollTo({ top: 0 }), [lesson.id]);
  const isDone = done.includes(lesson.id);
  const title = t(lesson.title);

  const finish = () => {
    if (!isDone) useLearn.getState().toggleDone(lesson.id);
    if (next) useLearn.getState().open(next.id);
  };

  return (
    <div className="learn">
      <LessonList lesson={lesson} />
      <div className="learn-scroll" ref={scroller}>
        <article className="learn-article">
          <div className="small dim">
            {t('Lesson {n} of {total}', { n: idx + 1, total: LESSONS.length })}, {t('about {m} min', { m: lesson.minutes })}
          </div>
          <h1>{title}</h1>
          <p className="lead">{t(lesson.summary)}</p>
          {lesson.blocks.map((b, i) => (
            <Block key={`${lesson.id}-${i}`} b={b} />
          ))}

          {lesson.interview.length > 0 && (
            <section className="learn-interview">
              <h3>{t('Interview practice')}</h3>
              <p className="dim">{t('Answer out loud before you look anything up. Senior interviews ask why, not what.')}</p>
              <ol>
                {lesson.interview.map((q) => (
                  <li key={q}>{t(q)}</li>
                ))}
              </ol>
            </section>
          )}

          <div className="learn-ai">
            <button
              className="btn ai"
              disabled={!aiOn}
              onClick={() => void askAi(t('Explain the lesson “{title}” again in simpler words, with one everyday example.', { title }))}
            >
              <Icon name="ai" size={15} /> {t('Explain it more simply')}
            </button>
            <button
              className="btn ai"
              disabled={!aiOn}
              onClick={() => void askAi(t('Ask me 3 short questions to check that I understood the lesson “{title}”. Wait for my answers before you give the solutions.', { title }))}
            >
              <Icon name="ai" size={15} /> {t('Quiz me')}
            </button>
            {!aiOn && <span className="small dim">{t('The assistant is off. Add a key in AI settings to use it.')}</span>}
          </div>

          <div className="learn-nav">
            <button className="btn ghost" disabled={!prev} onClick={() => prev && useLearn.getState().open(prev.id)}>
              {t('Previous')}
            </button>
            {isDone && !next ? (
              <button className="btn ghost" onClick={() => useLearn.getState().toggleDone(lesson.id)}>
                {t('Mark as not done')}
              </button>
            ) : (
              <button className="btn primary" onClick={finish}>
                {next ? t('Done, next lesson') : t('Mark as done')}
              </button>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
