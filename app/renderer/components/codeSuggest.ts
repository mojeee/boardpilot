// "Suggest code" in the Code panel. Without the AI (or with an empty sketch) the rules write the
// starter code for the parts and pins in the drawing, from the parts library. With the AI on, the
// assistant writes the next piece of code for the drawing; either way the suggestion waits in the
// editor with its source until the user accepts it (Tab) or dismisses it (Esc).

import { PARTS, getBoard } from '@shared/board';
import { generateSketch } from '@shared/sketch';
import type { CodeFinding } from '@shared/codeCheck';
import { checkProject, fileText, projectFiles, withFile } from '@shared/codeProject';
import type { AiSource } from '@shared/types';
import { t } from '@shared/i18n';
import { log, useApp, useScene } from '../state/store';
import { activeFileName, currentSketch, useCodeUi } from '../state/code';
import { aiContext } from './ai';

/** The sources of starter code: the library entry of every part in the drawing. */
function librarySources(): AiSource[] {
  const scene = useScene.getState().scene;
  const seen = new Set<string>();
  const out: AiSource[] = [];
  for (const p of scene.parts) {
    if (seen.has(p.partId)) continue;
    seen.add(p.partId);
    out.push({ kind: 'library', label: `parts library · ${p.partId}` });
  }
  return out.length ? out : [{ kind: 'library', label: 'parts library' }];
}

function starterSuggestion(replace: boolean) {
  const scene = useScene.getState().scene;
  const text = generateSketch(scene, getBoard(scene.board), PARTS);
  useCodeUi.getState().set({
    suggestion: {
      title: replace ? t('Replace with starter code for your drawing') : t('Starter code for your drawing'),
      afterLine: 0,
      replace: true,
      text,
      explanation: scene.parts.length
        ? t('Sets up every part in the drawing on the pins it is wired to, and prints its readings once a second.')
        : t('An empty sketch for this board. Add parts to the drawing to get code for them.'),
      sources: librarySources(),
      by: 'rules',
    },
  });
}

export interface SuggestOptions {
  /** Change these 1-based lines of the open file instead of adding code ("Change…", "Fix with AI"). */
  lines?: [number, number];
}

export async function suggestCode(request?: string, opts: SuggestOptions = {}) {
  const ui = useCodeUi.getState();
  const sk = currentSketch();
  const file = activeFileName();
  const text = fileText(sk, file) ?? '';
  const aiOn = useApp.getState().ai.enabled;
  if (opts.lines && !aiOn) {
    log('info', t('Changing code from a description needs the AI. Turn it on in AI settings, or edit the lines yourself.'));
    return;
  }
  if (!opts.lines && (!aiOn || (!sk.text.trim() && !request))) return starterSuggestion(!!sk.text.trim());
  const lines = text.split('\n');
  const sel = opts.lines ? { line: opts.lines[0], text: lines.slice(opts.lines[0] - 1, opts.lines[1]).join('\n') } : undefined;
  const many = projectFiles(sk).length > 1;
  ui.set({ suggesting: true });
  try {
    const r = await window.bp.ai.suggestCode(aiContext(), {
      code: text,
      cursorLine: opts.lines?.[0] ?? ui.cursorLine,
      request: request ?? '',
      ...(many ? { file, otherFiles: projectFiles(sk).filter((f) => f.name !== file) } : {}),
      ...(sel ? { selection: sel } : {}),
    });
    if (!r.ok) {
      log('failed', `${t(r.error.humanMessage)} ${t(r.error.hint)}`);
      return;
    }
    const s = r.value;
    // AI-written code goes through the same checks as the user's code before it is shown.
    const scene = useScene.getState().scene;
    const board = getBoard(scene.board);
    const merged = s.replace ? s.text : opts.lines ? replaceIn(text, opts.lines, s.text) : insertInto(text, s.afterLine, s.text);
    const key = (f: CodeFinding) => f.rule + f.message.replace(/\d+/g, '');
    const before = new Set(checkProject(sk, scene, board, PARTS).map(key));
    const added = checkProject(withFile(sk, file, merged), scene, board, PARTS).filter((f) => f.severity !== 'info' && !before.has(key(f)));
    useCodeUi.getState().set({
      suggestion: {
        title: s.title,
        afterLine: s.afterLine,
        replace: opts.lines ? false : s.replace,
        ...(opts.lines ? { lines: opts.lines } : {}),
        ...(file !== sk.name ? { file } : {}),
        text: s.text,
        explanation: added.length
          ? `${s.explanation}\n\n${t('Careful: the code checker finds a problem in this suggestion: {problem}', { problem: added[0].message })}`
          : s.explanation,
        sources: s.sources,
        by: 'ai',
      },
    });
  } finally {
    useCodeUi.getState().set({ suggesting: false });
  }
}

/** "Fix with AI" on a finding or a compiler error: a suggestion that rewrites that line. */
export function fixWithAi(line: number, problem: string) {
  return suggestCode(t('Fix this problem on line {line}: {problem}', { line, problem }), { lines: [line, line] });
}

function insertInto(text: string, afterLine: number, add: string) {
  const lines = text ? text.split('\n') : [];
  lines.splice(Math.max(0, Math.min(afterLine, lines.length)), 0, ...add.split('\n'));
  return lines.join('\n');
}

function replaceIn(text: string, [a, b]: [number, number], add: string) {
  const lines = text.split('\n');
  lines.splice(a - 1, b - a + 1, ...add.split('\n'));
  return lines.join('\n');
}
