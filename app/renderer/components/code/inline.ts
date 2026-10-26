// Things drawn inside the code: a waiting code suggestion right where it would go (new lines as
// ghost text, replaced lines struck through, its source, Accept · Tab / Explain / Dismiss · Esc),
// the line a simulated template run is on, and a small toolbar over selected code ("Explain",
// "Change…"). A suggestion is never applied until the user accepts it (CLAUDE.md rule 4).

import { Decoration, EditorView, GutterMarker, WidgetType, gutterLineClass, showTooltip, type DecorationSet, type Tooltip } from '@codemirror/view';
import { RangeSet, StateEffect, StateField, type EditorState, type Range } from '@codemirror/state';
import { t } from '@shared/i18n';
import { acceptSuggestion, useCodeUi, type CodeSuggestion } from '../../state/code';
import { askAi } from '../ai';

/* ---------------- suggestion ---------------- */

export const setSuggestion = StateEffect.define<CodeSuggestion | null>();

const el = (tag: string, cls: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function explainSuggestion(s: CodeSuggestion) {
  void askAi(t('Explain this code suggestion in plain words: {code}', { code: s.text.slice(0, 1200) }));
}

class SuggestionWidget extends WidgetType {
  constructor(readonly s: CodeSuggestion) {
    super();
  }
  override eq(o: SuggestionWidget) {
    return o.s === this.s;
  }
  toDOM() {
    const s = this.s;
    const box = el('div', 'cm-sug');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', t('Code suggestion'));
    const head = el('div', 'cm-sug-head');
    head.append(el('span', 'cm-sug-title', `✦ ${s.title}`), el('span', `conf conf-${s.by === 'ai' ? 'suggestion' : 'documented'}`, s.by === 'ai' ? t('Suggestion') : t('From the parts library')));
    box.append(head);
    box.append(el('pre', 'cm-sug-code mono', s.text));
    if (s.explanation) box.append(el('div', 'cm-sug-text small', s.explanation));
    if (s.sources.length) box.append(el('div', 'cm-sug-src mono small dim', `${t('source')}: ${s.sources.map((x) => x.label).join(' · ')}`));
    const row = el('div', 'cm-sug-actions');
    const btn = (label: string, cls: string, fn: () => void) => {
      const b = el('button', cls, label) as HTMLButtonElement;
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = fn;
      row.append(b);
    };
    btn(t('Accept · Tab'), 'btn small ai', acceptSuggestion);
    btn(t('Explain'), 'btn small ghost', () => explainSuggestion(s));
    btn(t('Dismiss · Esc'), 'btn small ghost', () => useCodeUi.getState().set({ suggestion: null }));
    box.append(row);
    return box;
  }
  override ignoreEvent() {
    return true;
  }
}

const struck = Decoration.line({ class: 'cm-sug-old' });

function suggestionDecos(state: EditorState, s: CodeSuggestion | null): DecorationSet {
  if (!s || s.replace) return Decoration.none;
  const doc = state.doc;
  const out: Range<Decoration>[] = [];
  let after = Math.max(0, Math.min(s.afterLine, doc.lines));
  if (s.lines) {
    const a = Math.max(1, Math.min(s.lines[0], doc.lines));
    const b = Math.max(a, Math.min(s.lines[1], doc.lines));
    for (let n = a; n <= b; n++) out.push(struck.range(doc.line(n).from));
    after = b;
  }
  const widget = new SuggestionWidget(s);
  out.push(after === 0 ? Decoration.widget({ widget, block: true, side: -1 }).range(0) : Decoration.widget({ widget, block: true, side: 1 }).range(doc.line(after).to));
  return Decoration.set(out, true);
}

export const suggestionField = StateField.define<{ s: CodeSuggestion | null; decos: DecorationSet }>({
  create: () => ({ s: null, decos: Decoration.none }),
  update(v, tr) {
    let s = v.s;
    for (const e of tr.effects) if (e.is(setSuggestion)) s = e.value;
    if (s === v.s && !tr.docChanged) return v;
    return { s, decos: suggestionDecos(tr.state, s) };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decos),
});

/* ---------------- running line (simulated template run) ---------------- */

export const setRunLine = StateEffect.define<number>();

class RunMarker extends GutterMarker {
  override elementClass = 'ce-run-gutter';
}
const runMarker = new RunMarker();
const runLineDeco = Decoration.line({ class: 'ce-line run' });

export const runLineField = StateField.define<{ line: number; deco: DecorationSet; gutter: RangeSet<GutterMarker> }>({
  create: () => ({ line: 0, deco: Decoration.none, gutter: RangeSet.empty }),
  update(v, tr) {
    let line = v.line;
    for (const e of tr.effects) if (e.is(setRunLine)) line = e.value;
    if (line === v.line && !tr.docChanged) return v;
    if (line < 1 || line > tr.state.doc.lines) return { line, deco: Decoration.none, gutter: RangeSet.empty };
    const from = tr.state.doc.line(line).from;
    return { line, deco: Decoration.set([runLineDeco.range(from)]), gutter: RangeSet.of([runMarker.range(from)]) };
  },
  provide: (f) => [EditorView.decorations.from(f, (v) => v.deco), gutterLineClass.from(f, (v) => v.gutter)],
});

/* ---------------- selection toolbar ---------------- */

export interface SelectionActions {
  change(): void;
}

function selectionTooltip(state: EditorState, actions: SelectionActions): Tooltip | null {
  const sel = state.selection.main;
  if (sel.empty || state.selection.ranges.length > 1) return null;
  const text = state.sliceDoc(sel.from, sel.to);
  if (text.trim().length < 2) return null;
  return {
    pos: sel.from,
    above: true,
    strictSide: false,
    arrow: false,
    create: () => {
      const dom = el('div', 'cm-seltools');
      const b = (label: string, title: string, fn: () => void) => {
        const x = el('button', 'cm-seltool', label) as HTMLButtonElement;
        x.title = title;
        x.onmousedown = (e) => e.preventDefault();
        x.onclick = fn;
        dom.append(x);
      };
      const line = state.doc.lineAt(sel.from).number;
      b(t('✦ Explain'), t('Ask the assistant what this code does'), () =>
        void askAi(t('Explain this code from my sketch in plain words, line by line where it helps (it starts on line {line}):\n{code}', { line, code: text.slice(0, 3000) })),
      );
      b(t('✦ Change…'), t('Describe how this code should change (⌘I)'), actions.change);
      return { dom };
    },
  };
}

export function selectionToolbar(actions: SelectionActions) {
  return StateField.define<Tooltip | null>({
    create: (s) => selectionTooltip(s, actions),
    update(v, tr) {
      if (!tr.docChanged && !tr.selection) return v;
      return selectionTooltip(tr.state, actions);
    },
    provide: (f) => showTooltip.from(f),
  });
}
