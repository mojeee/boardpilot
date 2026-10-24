// Autocomplete for the Code panel: in a pin argument, the board's pins (the drawing's first, with
// what is wired and any caution); after "obj.", the members of the library object; elsewhere the
// Arduino calls a beginner meets first, the code's own pin constants and the words in the file.
// Every entry says where it comes from (board file, drawing, library).

import { completeAnyWord, snippetCompletion, type Completion, type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { PARTS, getBoard } from '@shared/board';
import { arduinoApi, completionContext, memberOptions, pinConstantOptions, pinOptions } from '@shared/codeComplete';
import { pinTitle } from '@shared/codeRefs';
import { t } from '@shared/i18n';
import { useScene } from '../../state/store';
import { currentFiles } from '../../state/code';

/** All project sources as one text, so constants in pins.h are offered in the sketch. */
const projectText = (doc: string) => [doc, ...currentFiles().map((f) => f.text)].join('\n');

const withSource = (info: string, source: string) => () => {
  const d = document.createElement('div');
  if (info) d.append(info);
  const s = document.createElement('div');
  s.className = 'cm-completion-src';
  s.textContent = t('source: {what}', { what: source });
  d.append(s);
  return d;
};

export const boardCompletions: CompletionSource = (ctx: CompletionContext): CompletionResult | null => {
  const { scene } = useScene.getState();
  const board = getBoard(scene.board);
  const before = ctx.state.sliceDoc(Math.max(0, ctx.pos - 400), ctx.pos);
  const c = completionContext(before, board);
  const word = ctx.matchBefore(/\w*/);
  const from = word ? word.from : ctx.pos;

  if (c.kind === 'pin') {
    const doc = ctx.state.doc.toString();
    const opts = pinOptions(c.fn, c.arg, board, scene, PARTS);
    const rank = new Map(opts.map((o) => [o.pinId, o.boost]));
    const consts: Completion[] = pinConstantOptions(projectText(doc), board).map((k) => ({
      label: k.name,
      detail: pinTitle(board, k.pin),
      type: 'constant',
      // As good as the pin it stands for, a little ahead of the plain number.
      boost: Math.max(-99, Math.min(99, (rank.get(k.pin.id) ?? -60) + 5)),
      info: withSource(t('A pin constant of your code.'), t('your code')),
    }));
    const pins: Completion[] = opts.map((o) => ({
      label: o.label,
      detail: o.detail,
      type: 'variable',
      boost: Math.max(-99, Math.min(99, o.boost)),
      info: withSource(o.info, t('board file ({board}) and the drawing', { board: board.name })),
    }));
    return { from, options: [...consts, ...pins], validFor: /^\w*$/ };
  }

  if (c.kind === 'member') {
    const doc = projectText(ctx.state.doc.toString());
    const m = memberOptions(c.object, doc);
    if (!m) return null;
    return {
      from: ctx.pos - c.prefix.length,
      options: m.lib.members.map((x) => snippetCompletion(x.snippet, { label: x.name, type: 'method', detail: m.cls, info: withSource(x.info, `${m.lib.library} (${m.lib.header})`) })),
      validFor: /^\w*$/,
    };
  }

  if (!word || (word.from === word.to && !ctx.explicit) || /^\d/.test(word.text)) return null;
  const api = arduinoApi()
    .filter((a) => !a.families || a.families.includes(board.family))
    .map((a) => snippetCompletion(a.snippet, { label: a.label, type: 'function', info: withSource(a.info, a.source) }));
  const consts = pinConstantOptions(projectText(ctx.state.doc.toString()), board).map((k) => ({ label: k.name, detail: pinTitle(board, k.pin), type: 'constant' }));
  const parts = scene.parts.map((p) => ({ label: p.id, detail: PARTS[p.partId]?.name ?? p.partId, type: 'variable', boost: -5 }));
  return { from, options: [...api, ...consts, ...parts], validFor: /^\w*$/ };
};

/** Words already in the file, but not numbers (typing 34 should not open a list). */
const anyWord: CompletionSource = (ctx) => {
  const w = ctx.matchBefore(/\w+/);
  return w && /^\d/.test(w.text) ? null : completeAnyWord(ctx);
};

export const completionSources: CompletionSource[] = [boardCompletions, anyWord];
