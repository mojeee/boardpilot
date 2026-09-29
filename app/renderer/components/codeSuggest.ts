// "Suggest code" in the Code panel. Without the AI (or with an empty sketch) the rules write the
// starter code for the parts and pins in the drawing, from the parts library. With the AI on, the
// assistant writes the next piece of code for the drawing; either way the suggestion waits in the
// editor with its source until the user accepts it (Tab) or dismisses it (Esc).

import { PARTS, getBoard } from '@shared/board';
import { generateSketch } from '@shared/sketch';
import { checkCode } from '@shared/codeCheck';
import type { AiSource } from '@shared/types';
import { t } from '@shared/i18n';
import { log, useApp, useScene } from '../state/store';
import { currentSketch, useCodeUi } from '../state/code';
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

export async function suggestCode(request?: string) {
  const ui = useCodeUi.getState();
  const sk = currentSketch();
  const aiOn = useApp.getState().ai.enabled;
  if (!aiOn || (!sk.text.trim() && !request)) return starterSuggestion(!!sk.text.trim());
  ui.set({ suggesting: true });
  try {
    const r = await window.bp.ai.suggestCode(aiContext(), { code: sk.text, cursorLine: ui.cursorLine, request: request ?? '' });
    if (!r.ok) {
      log('failed', `${t(r.error.humanMessage)} ${t(r.error.hint)}`);
      return;
    }
    const s = r.value;
    // AI-written code goes through the same checks as the user's code before it is shown.
    const scene = useScene.getState().scene;
    const merged = s.replace ? s.text : insertInto(sk.text, s.afterLine, s.text);
    const before = new Set(checkCode(sk.text, scene, getBoard(scene.board), PARTS).map((f) => f.rule + f.message.replace(/\d+/g, '')));
    const added = checkCode(merged, scene, getBoard(scene.board), PARTS).filter((f) => f.severity !== 'info' && !before.has(f.rule + f.message.replace(/\d+/g, '')));
    useCodeUi.getState().set({
      suggestion: {
        title: s.title,
        afterLine: s.afterLine,
        replace: s.replace,
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

function insertInto(text: string, afterLine: number, add: string) {
  const lines = text ? text.split('\n') : [];
  lines.splice(Math.max(0, Math.min(afterLine, lines.length)), 0, ...add.split('\n'));
  return lines.join('\n');
}
