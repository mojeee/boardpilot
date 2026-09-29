// The Code panel's editor: a plain textarea over a coloured copy of the text (no editor
// dependency). Line numbers, the code checker's findings on their lines (with a one-click fix when
// there is one), the line the simulated run is on, and a waiting code suggestion (Tab accepts, Esc
// dismisses). Typing keeps the native undo of the textarea.

import { Fragment, useEffect, useMemo, useRef } from 'react';
import { tokenize } from '@shared/highlight';
import type { CodeFinding } from '@shared/codeCheck';
import { t } from '@shared/i18n';
import { setSketch, useScene } from '../state/store';
import { acceptSuggestion, DEFAULT_SKETCH_NAME, replaceLine, useCodeUi } from '../state/code';
import { askAi } from './ai';

const LINE_H = 19;
const PAD = 8;

/** Insert text at the cursor the way typing does, so the textarea's own undo keeps working. */
function insertText(el: HTMLTextAreaElement, text: string) {
  el.focus();
  if (!document.execCommand?.('insertText', false, text)) {
    el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export function CodeEditor({ findings, runLine }: { findings: CodeFinding[]; runLine: number }) {
  const sketch = useScene((s) => s.scene.sketch);
  const text = sketch?.text ?? '';
  const name = sketch?.name ?? DEFAULT_SKETCH_NAME;
  const reveal = useCodeUi((s) => s.reveal);
  const suggestion = useCodeUi((s) => s.suggestion);
  const scrollRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const lines = useMemo(() => tokenize(text), [text]);
  const width = useMemo(() => Math.max(40, ...text.split('\n').map((l) => l.length)) + 4, [text]);

  const byLine = useMemo(() => {
    const m = new Map<number, CodeFinding[]>();
    for (const f of findings) if (f.line > 0) m.set(f.line, [...(m.get(f.line) ?? []), f]);
    return m;
  }, [findings]);

  // Show and select a line when asked (banner "Show in code", a fix, the assistant).
  useEffect(() => {
    if (!reveal.line) return;
    const sc = scrollRef.current;
    const el = areaRef.current;
    if (!sc || !el) return;
    sc.scrollTop = Math.max(0, (reveal.line - 3) * LINE_H);
    const all = el.value.split('\n');
    const start = all.slice(0, reveal.line - 1).reduce((n, l) => n + l.length + 1, 0);
    el.focus();
    el.setSelectionRange(start, start + (all[reveal.line - 1]?.length ?? 0));
  }, [reveal]);

  // Keep the running line in view.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || !runLine) return;
    const top = (runLine - 1) * LINE_H + PAD;
    if (top < sc.scrollTop + LINE_H || top > sc.scrollTop + sc.clientHeight - 2 * LINE_H) sc.scrollTop = Math.max(0, top - sc.clientHeight / 3);
  }, [runLine]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (useCodeUi.getState().suggestion) acceptSuggestion();
      else insertText(el, '  ');
    } else if (e.key === 'Escape' && useCodeUi.getState().suggestion) {
      e.preventDefault();
      useCodeUi.getState().set({ suggestion: null });
    } else if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Keep the indentation of the line, one step more after an opening brace.
      const before = el.value.slice(0, el.selectionStart);
      const cur = before.slice(before.lastIndexOf('\n') + 1);
      const indent = /^\s*/.exec(cur)?.[0] ?? '';
      e.preventDefault();
      insertText(el, `\n${indent}${/\{\s*$/.test(cur) ? '  ' : ''}`);
    }
  };

  const updateCursor = (el: HTMLTextAreaElement) => {
    const line = el.value.slice(0, el.selectionStart).split('\n').length;
    if (useCodeUi.getState().cursorLine !== line) useCodeUi.getState().set({ cursorLine: line });
  };

  const height = Math.max(lines.length, 1) * LINE_H + PAD * 2;
  return (
    <div className="ce-wrap">
      <div className="code-editor" ref={scrollRef}>
        <div className="ce-inner" style={{ height, minWidth: `calc(${width}ch + 56px)` }}>
          <div className="ce-gutter mono" aria-hidden>
            {lines.map((_, i) => {
              const fs = byLine.get(i + 1);
              const sev = fs?.some((f) => f.severity === 'error') ? 'error' : fs?.some((f) => f.severity === 'warning') ? 'warning' : fs ? 'info' : '';
              return (
                <div key={i} className={`ce-num ${i + 1 === runLine ? 'run' : ''}`} style={{ top: PAD + i * LINE_H }} title={fs?.map((f) => f.message).join('\n')}>
                  {sev && <i className={`ce-mark sev-${sev}`} />}
                  {i + 1}
                </div>
              );
            })}
          </div>
          <div className="ce-body">
            <pre className="ce-hl mono" aria-hidden>
              {lines.map((toks, i) => {
                const fs = byLine.get(i + 1);
                const sev = fs?.some((f) => f.severity === 'error') ? 'error' : fs?.some((f) => f.severity === 'warning') ? 'warning' : fs ? 'info' : '';
                return (
                  <div key={i} className={`ce-line ${i + 1 === runLine ? 'run' : ''} ${sev ? `sev-${sev}` : ''}`}>
                    {toks.length === 0
                      ? ' '
                      : toks.map((tk, j) =>
                          tk.kind === 'plain' ? (
                            <Fragment key={j}>{tk.text}</Fragment>
                          ) : (
                            <span key={j} className={`tk-${tk.kind}`}>
                              {tk.text}
                            </span>
                          ),
                        )}
                  </div>
                );
              })}
            </pre>
            <textarea
              ref={areaRef}
              className="ce-input mono"
              aria-label={t('Code of {file}', { file: name })}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              wrap="off"
              value={text}
              placeholder={t('Write your sketch here, open a file, or use “Suggest code” to start from the parts in your drawing.')}
              onChange={(e) => setSketch(name, e.target.value)}
              onKeyDown={onKeyDown}
              onKeyUp={(e) => updateCursor(e.currentTarget)}
              onClick={(e) => updateCursor(e.currentTarget)}
            />
            <div className="ce-overlay">
              {[...byLine.entries()].map(([line, fs]) => {
                const f = fs.find((x) => x.fix) ?? fs[0];
                const len = text.split('\n')[line - 1]?.length ?? 0;
                return (
                  <div key={line} className="ce-chips" style={{ top: PAD + (line - 1) * LINE_H, left: `calc(${len + 3}ch + ${PAD}px)` }}>
                    {f.fix ? (
                      <button className={`ce-fix sev-${f.severity}`} title={`${f.message} ${f.hint}`} onClick={() => replaceLine(line, f.fix!.text)}>
                        {t('Fix: {code}', { code: f.fix.text.trim() })}
                      </button>
                    ) : (
                      <button className={`ce-note sev-${f.severity}`} title={`${f.message} ${f.hint}`} onClick={() => f.targets.length && useScene.getState().focusOn(f.targets)}>
                        {f.severity === 'error' ? '✕' : '!'} {shortMessage(f.message)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {suggestion && (
        <div className="ce-suggest" role="dialog" aria-label={t('Code suggestion')}>
          <div className="ce-suggest-title">✦ {suggestion.title}</div>
          <div className="small">{suggestion.explanation}</div>
          <pre className="ce-suggest-code mono">{suggestion.text}</pre>
          {suggestion.sources.length > 0 && (
            <div className="mono small dim">
              {t('source')}: {suggestion.sources.map((s) => s.label).join(' · ')}
            </div>
          )}
          <div className="row gap wrap">
            <button className="btn small ai" onClick={acceptSuggestion}>
              {t('Accept · Tab')}
            </button>
            <button className="btn small ghost" onClick={() => void askAi(t('Explain this code suggestion in plain words: {code}', { code: suggestion.text.slice(0, 1200) }))}>
              {t('Explain')}
            </button>
            <button className="btn small ghost" onClick={() => useCodeUi.getState().set({ suggestion: null })}>
              {t('Dismiss · Esc')}
            </button>
            <span className={`conf conf-${suggestion.by === 'ai' ? 'suggestion' : 'documented'}`}>{suggestion.by === 'ai' ? t('Suggestion') : t('From the parts library')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** The message without its "Line n:" prefix, cut short for the chip next to the line. */
function shortMessage(m: string) {
  const s = m.replace(/^[^:]{0,12}\d+:\s*/, '');
  return s.length > 70 ? `${s.slice(0, 68)}…` : s;
}
