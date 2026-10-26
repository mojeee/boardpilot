// The code checker's findings (shared/codeCheck, a check of the code against the drawing) and the
// compiler's errors (arduino-cli), as CodeMirror diagnostics: wavy underlines on the exact call,
// a marker in the gutter, and a card on hover with the fix. Each says its source.

import type { Action, Diagnostic } from '@codemirror/lint';
import type { Text } from '@codemirror/state';
import type { CodeFinding } from '@shared/codeCheck';
import type { CompileDiagnostic } from '@shared/compileOutput';
import { t } from '@shared/i18n';
import { useApp, useScene } from '../../state/store';
import { askAi } from '../ai';

export interface DiagnosticHandlers {
  /** "Fix with AI": a suggestion for these lines. */
  fixWithAi(line: number, problem: string): void;
}

/** "Line 3 (pins.h): text" → "text": the editor already shows where. */
const withoutLine = (m: string) => m.replace(/^[^:]{0,12}\d+(?: \([^)]+\))?:\s*/, '');

function lineRange(doc: Text, line: number, col?: number, len?: number) {
  const l = doc.line(Math.max(1, Math.min(line, doc.lines)));
  if (col === undefined) {
    const lead = /^\s*/.exec(l.text)?.[0].length ?? 0;
    return { from: l.from + Math.min(lead, l.length), to: l.to };
  }
  const from = l.from + Math.min(Math.max(0, col), l.length);
  return { from, to: Math.max(from, Math.min(l.to, from + (len ?? l.length))) };
}

export function findingDiagnostics(findings: CodeFinding[], doc: Text, h: DiagnosticHandlers): Diagnostic[] {
  const out: Diagnostic[] = [];
  const ai = useApp.getState().ai.enabled;
  for (const f of findings) {
    if (f.line < 1 || f.line > doc.lines) continue;
    const r = lineRange(doc, f.line, f.span?.col, f.span?.len);
    const actions: Action[] = [];
    if (f.fix) {
      const fix = f.fix.text;
      actions.push({
        name: t('Fix: {code}', { code: fix.trim().slice(0, 48) }),
        apply: (view) => {
          const l = view.state.doc.line(f.line);
          view.dispatch({ changes: { from: l.from, to: l.to, insert: fix }, userEvent: 'input.fix' });
        },
      });
    }
    if (f.targets.length) actions.push({ name: t('Show on the board'), apply: () => useScene.getState().focusOn(f.targets) });
    if (ai) actions.push({ name: t('✦ Fix with AI'), apply: () => h.fixWithAi(f.line, `${withoutLine(f.message)} ${f.hint}`) });
    out.push({
      from: r.from,
      to: r.to,
      severity: f.severity,
      source: t('drawing check (not a measurement)'),
      message: `${withoutLine(f.message)}\n${f.hint}`,
      actions,
    });
  }
  return out;
}

export function compileDiagnostics(diags: CompileDiagnostic[], doc: Text, h: DiagnosticHandlers): Diagnostic[] {
  const ai = useApp.getState().ai.enabled;
  return diags
    .filter((d) => d.line >= 1 && d.line <= doc.lines)
    .map((d) => {
      const l = doc.line(d.line);
      const word = /^[\w.]+/.exec(l.text.slice(Math.max(0, d.col - 1)))?.[0].length ?? 0;
      const r = lineRange(doc, d.line, d.col - 1, word || l.length);
      const actions: Action[] = [];
      if (ai) {
        actions.push({ name: t('✦ Fix with AI'), apply: () => h.fixWithAi(d.line, `${t('The compiler says:')} ${d.message}`) });
        actions.push({
          name: t('✦ Explain'),
          apply: () => void askAi(t('Explain this compiler message in plain words and how to fix it. Line {line}: {code}\nCompiler: {message}', { line: d.line, code: l.text.trim(), message: d.message })),
        });
      }
      return { from: r.from, to: r.to, severity: d.severity, source: t('compiler (arduino-cli)'), message: d.hint ? `${d.message}\n${d.hint}` : d.message, actions };
    });
}
