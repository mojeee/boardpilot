// The Code panel's editor (CodeMirror 6): the project's files as tabs, C/C++ highlighting, undo,
// find and replace, folding, autocomplete for the board's pins and the libraries in the code,
// the code checker's findings and the compiler's errors on their exact place with their fix,
// pins that light up in 3D on hover (⌘-click focuses the camera), the line a simulated run is
// on, and AI help in place: a waiting suggestion shown where it would go (Tab accepts, Esc
// dismisses), "Explain" and "Change…" on selected code, ⌘I to ask for code at the cursor.

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { Annotation, Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import { defaultKeymap, historyKeymap, indentLess, indentMore } from '@codemirror/commands';
import { foldKeymap } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { acceptCompletion, autocompletion, closeBracketsKeymap, completionKeymap, completionStatus } from '@codemirror/autocomplete';
import { lintKeymap, openLintPanel, setDiagnostics } from '@codemirror/lint';
import type { CodeFinding } from '@shared/codeCheck';
import { fileNameProblem, findingFile, isHeaderFile, isSourceFile, newFileText, projectFiles } from '@shared/codeProject';
import { compileSummary } from '@shared/compileOutput';
import { getBoard } from '@shared/board';
import { onLanguage, t } from '@shared/i18n';
import { acceptSuggestion, addFile, openFile, removeFile, renameFile, revealLine, setFileText, useCodeUi } from '../state/code';
import { baseExtensions, languageFor, phrases } from './code/setup';
import { pinClick, pinHover, pinsPlugin, refreshPins } from './code/pins';
import { completionSources } from './code/complete';
import { compileDiagnostics, findingDiagnostics } from './code/diagnostics';
import { explainSuggestion, runLineField, selectionToolbar, setRunLine, setSuggestion, suggestionField } from './code/inline';
import { fixWithAi, suggestCode } from './codeSuggest';
import { useApp, useScene } from '../state/store';
import '../styles/editor.css';

/** Marks changes that came from outside the editor (a fix in the banner, an accepted suggestion). */
const External = Annotation.define<boolean>();

/** The smallest change that turns `a` into `b` (keeps the cursor and makes a tidy undo step). */
function diff(a: string, b: string) {
  let s = 0;
  const max = Math.min(a.length, b.length);
  while (s < max && a.charCodeAt(s) === b.charCodeAt(s)) s++;
  let e = 0;
  while (e < max - s && a.charCodeAt(a.length - 1 - e) === b.charCodeAt(b.length - 1 - e)) e++;
  return { from: s, to: a.length - e, insert: b.slice(s, b.length - e) };
}

const fileKind = (name: string) =>
  /\.(ino|pde)$/i.test(name) ? t('Arduino sketch') : isHeaderFile(name) ? t('C/C++ header') : isSourceFile(name) ? t('C/C++ source') : t('Text');

export function CodeEditor({ findings, runLine }: { findings: CodeFinding[]; runLine: number }) {
  const sketch = useScene((s) => s.scene.sketch);
  const board = useScene((s) => s.scene.board);
  const wires = useScene((s) => s.scene.wires);
  const parts = useScene((s) => s.scene.parts);
  const highlight = useScene((s) => s.highlight);
  const selected = useScene((s) => s.selected);
  const files = useMemo(() => projectFiles(sketch), [sketch]);
  const activeRaw = useCodeUi((s) => s.activeFile);
  const active = activeRaw && files.some((f) => f.name === activeRaw) ? activeRaw : files[0].name;
  const text = files.find((f) => f.name === active)?.text ?? '';
  const reveal = useCodeUi((s) => s.reveal);
  const suggestion = useCodeUi((s) => s.suggestion);
  const compile = useCodeUi((s) => s.compile);
  const generation = useCodeUi((s) => s.generation);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [ask, setAsk] = useState<{ lines?: [number, number]; text: string } | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  /** One editor state per file, so each keeps its own undo history and cursor. */
  const states = useRef(new Map<string, EditorState>());
  const shown = useRef('');
  const phrasesConf = useRef(new Compartment());

  /** Open the "ask for code" box: for the selected lines, or at the cursor. */
  const openAsk = (view: EditorView) => {
    const sel = view.state.selection.main;
    if (sel.empty) setAsk({ text: '' });
    else {
      // A selection that ends at the start of a line (triple-click) does not include that line.
      const end = view.state.doc.lineAt(sel.to);
      const last = end.from === sel.to && sel.to > sel.from ? end.number - 1 : end.number;
      setAsk({ text: '', lines: [view.state.doc.lineAt(sel.from).number, last] });
    }
    return true;
  };
  const openAskRef = useRef(openAsk);
  openAskRef.current = openAsk;

  const makeState = (name: string, doc: string): EditorState => {
    const keys: Extension = Prec.highest(
      keymap.of([
        {
          key: 'Tab',
          run: (v) => {
            if (useCodeUi.getState().suggestion) {
              acceptSuggestion();
              return true;
            }
            // With a list open, Tab accepts; right after the list opens CodeMirror waits a moment
            // before accepting, and the Tab must not move the focus out of the editor meanwhile.
            if (completionStatus(v.state) !== null) {
              if (!acceptCompletion(v)) setTimeout(() => acceptCompletion(v), 120);
              return true;
            }
            return indentMore(v);
          },
          shift: indentLess,
        },
        {
          key: 'Escape',
          run: () => {
            if (!useCodeUi.getState().suggestion) return false;
            useCodeUi.getState().set({ suggestion: null });
            return true;
          },
        },
        { key: 'Mod-i', run: (v) => openAskRef.current(v) },
      ]),
    );
    return EditorState.create({
      doc,
      extensions: [
        baseExtensions(),
        languageFor(name),
        phrasesConf.current.of(phrases()),
        keys,
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap]),
        autocompletion({ override: completionSources, icons: false, activateOnTypingDelay: 80 }),
        pinsPlugin,
        pinHover,
        pinClick,
        suggestionField,
        runLineField,
        selectionToolbar({ change: () => viewRef.current && openAskRef.current(viewRef.current) }),
        placeholder(t('Write your sketch here, open a file, or use “Suggest code” to start from the parts in your drawing.')),
        EditorView.contentAttributes.of({ 'aria-label': t('Code of {file}', { file: name }) }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !u.transactions.some((tr) => tr.annotation(External))) setFileText(name, u.state.doc.toString());
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            setCursor({ line: line.number, col: head - line.from + 1 });
            const sel = u.state.selection.main;
            const ui = useCodeUi.getState();
            if (ui.cursorLine !== line.number) ui.set({ cursorLine: line.number });
            const selection = sel.empty ? null : { text: u.state.sliceDoc(sel.from, sel.to), line: u.state.doc.lineAt(sel.from).number };
            if ((ui.selection?.text ?? '') !== (selection?.text ?? '')) ui.set({ selection });
          }
        }),
      ],
    });
  };

  // The view, once.
  useEffect(() => {
    const view = new EditorView({ state: makeState(active, text), parent: hostRef.current! });
    viewRef.current = view;
    shown.current = active;
    const off = onLanguage(() => view.dispatch({ effects: phrasesConf.current.reconfigure(phrases()) }));
    return () => {
      off();
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new program (template, demo, opened .ino): fresh undo histories.
  useEffect(() => {
    states.current.clear();
    const view = viewRef.current;
    if (view && generation) {
      view.setState(makeState(active, text));
      shown.current = active;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);

  // Switch file tabs, keeping each file's state.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || shown.current === active) return;
    states.current.set(shown.current, view.state);
    view.setState(states.current.get(active) ?? makeState(active, text));
    shown.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Changes from outside (Fix buttons, accepted suggestions, Display Studio, project tabs).
  useEffect(() => {
    const view = viewRef.current;
    if (!view || shown.current !== active) return;
    const cur = view.state.doc.toString();
    if (cur === text) return;
    view.dispatch({ changes: diff(cur, text), annotations: External.of(true) });
  }, [text, active]);
  // Files not shown that changed outside keep their history too.
  useEffect(() => {
    for (const [name, st] of states.current) {
      const f = files.find((x) => x.name === name);
      if (!f) states.current.delete(name);
      else if (st.doc.toString() !== f.text) states.current.set(name, st.update({ changes: diff(st.doc.toString(), f.text), annotations: External.of(true) }).state);
    }
  }, [files]);

  // Findings and compiler errors of this file, on their place.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() !== text) return;
    const mine = findings.filter((f) => findingFile(f, sketch) === active);
    const h = { fixWithAi: (line: number, problem: string) => void fixWithAi(line, problem) };
    const fromCompiler = compile.report && compile.files[active] === text ? compile.report.diagnostics.filter((d) => d.file === active) : [];
    view.dispatch(setDiagnostics(view.state, [...findingDiagnostics(mine, view.state.doc, h), ...compileDiagnostics(fromCompiler, view.state.doc, h)]));
  }, [findings, compile, active, text, sketch]);

  // The waiting suggestion, inside the code of the file it is for.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const s = suggestion && !suggestion.replace && (suggestion.file ?? files[0].name) === active ? suggestion : null;
    view.dispatch({ effects: setSuggestion.of(s) });
    if (s) {
      const line = Math.max(1, Math.min(s.lines?.[1] ?? s.afterLine, view.state.doc.lines));
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'nearest', yMargin: 120 }) });
    }
  }, [suggestion, active, files]);

  // The line a simulated template run is on (main sketch only), kept in view.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const line = active === files[0].name ? runLine : 0;
    view.dispatch({ effects: setRunLine.of(line) });
    if (line > 0 && line <= view.state.doc.lines) view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'nearest', yMargin: 60 }) });
  }, [runLine, active, files]);

  // Pin colours and 3D highlights follow the drawing.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: refreshPins.of(null) });
  }, [board, wires, parts, highlight, selected]);

  // Show and select a line when asked (banner "Show in code", a finding, the assistant).
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !reveal.line) return;
    const n = Math.max(1, Math.min(reveal.line, view.state.doc.lines));
    const l = view.state.doc.line(n);
    view.dispatch({ selection: { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
    view.focus();
  }, [reveal]);

  const mineCount = findings.filter((f) => findingFile(f, sketch) === active && f.line > 0).length;
  const compiled = compile.report;
  const changedSince = compiled && files.some((f) => compile.files[f.name] !== f.text);

  return (
    <div className="ce-wrap">
      <FileTabs active={active} files={files.map((f) => f.name)} />
      <div className="ce-host" ref={hostRef} />
      {ask && (
        <AskBox
          lines={ask.lines}
          onClose={() => {
            setAsk(null);
            setTimeout(() => viewRef.current?.focus(), 0);
          }}
        />
      )}
      {suggestion?.replace && (
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
            <button className="btn small ghost" onClick={() => explainSuggestion(suggestion)}>
              {t('Explain')}
            </button>
            <button className="btn small ghost" onClick={() => useCodeUi.getState().set({ suggestion: null })}>
              {t('Dismiss · Esc')}
            </button>
            <span className={`conf conf-${suggestion.by === 'ai' ? 'suggestion' : 'documented'}`}>{suggestion.by === 'ai' ? t('Suggestion') : t('From the parts library')}</span>
          </div>
        </div>
      )}
      <div className="ce-status mono">
        <span>{t('Ln {line}, Col {col}', { line: cursor.line, col: cursor.col })}</span>
        <span className="dim">{fileKind(active)}</span>
        <span className="dim" title={t('Arduino board name used to compile')}>
          {getBoard(board).toolchain.fqbn}
        </span>
        <button
          className={`ce-status-btn ${mineCount ? 'warn' : ''}`}
          onClick={() => viewRef.current && openLintPanel(viewRef.current)}
          title={t('List the problems in this file')}
        >
          {mineCount ? t('{n} to check', { n: mineCount }) : t('matches the drawing')}
        </button>
        {compile.running && <span className="ce-status-run">{t('Compiling…')}</span>}
        {!compile.running && compiled && (
          <span className={compiled.ok ? 'ok' : 'err'} title={changedSince ? t('The code changed since this check.') : ''}>
            {compiled.ok ? '✓' : '✕'} {compileSummary(compiled)}
            {changedSince ? ` · ${t('changed since')}` : ''}
          </span>
        )}
        <span className="grow" />
        <span className="dim">{t('⌘I ask AI · ⌘F find · Tab accept')}</span>
      </div>
    </div>
  );
}

/** The project's files: the main sketch first; add, rename (double-click) and remove the others. */
function FileTabs({ active, files }: { active: string; files: string[] }) {
  const sketch = useScene((s) => s.scene.sketch);
  const [edit, setEdit] = useState<{ from: string | null; value: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const problem = edit ? fileNameProblem(sketch, edit.value, edit.from ?? undefined) : null;
  const problemText =
    problem === 'unsafe'
      ? t('Use letters, digits, dot, dash and underscore (folders with /).')
      : problem === 'taken'
        ? t('A file with this name already exists.')
        : '';
  const commit = () => {
    if (!edit || problem) return;
    const name = edit.value.trim();
    if (edit.from === null) {
      addFile(name, newFileText(name));
      // Start typing inside the include guard of a new header.
      if (isHeaderFile(name)) setTimeout(() => revealLine(4, name), 0);
    }
    else if (name !== edit.from) renameFile(edit.from, name);
    setEdit(null);
  };
  return (
    <div className="ce-files" role="tablist" aria-label={t('Project files')}>
      {files.map((f, i) => (
        <div key={f} className={`ce-file ${f === active ? 'on' : ''}`}>
          {edit?.from === f ? (
            <input
              className="ce-file-in mono"
              autoFocus
              value={edit.value}
              aria-label={t('File name')}
              onChange={(e) => setEdit({ from: f, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEdit(null);
              }}
              onBlur={() => (problem ? setEdit(null) : commit())}
            />
          ) : (
            <button role="tab" aria-selected={f === active} className="mono" onClick={() => openFile(f)} onDoubleClick={() => setEdit({ from: f, value: f })} title={t('Double-click to rename')}>
              {f}
            </button>
          )}
          {i > 0 && edit?.from !== f && (
            <button className="ce-file-x" aria-label={t('Remove {file}', { file: f })} title={t('Remove {file}', { file: f })} onClick={() => setConfirmRemove(f)}>
              ×
            </button>
          )}
        </div>
      ))}
      {edit?.from === null ? (
        <input
          className="ce-file-in mono"
          autoFocus
          placeholder="pins.h"
          value={edit.value}
          aria-label={t('New file name')}
          onChange={(e) => setEdit({ from: null, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEdit(null);
          }}
          onBlur={() => (!edit.value.trim() || problem ? setEdit(null) : commit())}
        />
      ) : (
        <button className="ce-file-add" onClick={() => setEdit({ from: null, value: '' })} title={t('Add a file (.h, .cpp) to the project')} aria-label={t('Add a file (.h, .cpp) to the project')}>
          +
        </button>
      )}
      {problemText && <span className="ce-file-problem small">{problemText}</span>}
      {confirmRemove && (
        <span className="ce-file-confirm small">
          {t('Remove {file} from the project?', { file: confirmRemove })}
          <button
            className="btn small"
            onClick={() => {
              removeFile(confirmRemove);
              setConfirmRemove(null);
            }}
          >
            {t('Remove')}
          </button>
          <button className="btn small ghost" onClick={() => setConfirmRemove(null)}>
            {t('Keep')}
          </button>
        </span>
      )}
    </div>
  );
}

/** ⌘I: say what the code should do, here or instead of the selected lines. The answer is a suggestion. */
function AskBox({ lines, onClose }: { lines?: [number, number]; onClose(): void }) {
  const [value, setValue] = useState('');
  const suggesting = useCodeUi((s) => s.suggesting);
  const aiOn = useApp((s) => s.ai.enabled);
  const submit = () => {
    if (!value.trim()) return;
    void suggestCode(value.trim(), lines ? { lines } : {});
    onClose();
  };
  return (
    <div className="ce-ask" role="dialog" aria-label={t('Ask for code')}>
      <span className="ce-ask-label small">
        ✦ {lines ? (lines[0] === lines[1] ? t('Change line {n}', { n: lines[0] }) : t('Change lines {a}–{b}', { a: lines[0], b: lines[1] })) : t('Code here')}
      </span>
      <input
        className="text-in"
        autoFocus
        value={value}
        disabled={suggesting}
        placeholder={lines ? t('How should it change? e.g. “blink twice as fast”') : t('What should the code do? e.g. “print the temperature every 2 s”')}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Handled here: the key must not reach the editor that gets the focus back.
          if (e.key === 'Enter' || e.key === 'Escape') e.preventDefault();
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onClose();
        }}
      />
      <button className="btn small ai" disabled={!value.trim()} onClick={submit}>
        {t('Suggest')}
      </button>
      <button className="btn small ghost" onClick={onClose} aria-label={t('Close')}>
        ×
      </button>
      {!aiOn && <div className="ce-ask-note small">{t('The AI is off: without it you get starter code from the parts library. Turn it on in AI settings for code from your words.')}</div>}
    </div>
  );
}
