// The project's code as the Code panel sees it: the sketch (kept in the scene, so it is saved with
// the project and follows the project tabs), its findings against the drawing, and the editor's
// helpers (jump to a line, replace a line, insert text) used by the banner, the assistant and the
// code suggestions.

import { useMemo } from 'react';
import { create } from 'zustand';
import { PARTS, getBoard } from '@shared/board';
import { checkCode, type CodeFinding } from '@shared/codeCheck';
import type { AiSource } from '@shared/types';
import { setSketch, useLive, useScene } from './store';

export const DEFAULT_SKETCH_NAME = 'sketch.ino';

/** The findings of the code checker for the open project's sketch (empty without code). */
export function useCodeFindings(): CodeFinding[] {
  const scene = useScene((s) => s.scene);
  const baud = useLive((s) => s.baud);
  return useMemo(() => {
    const text = scene.sketch?.text ?? '';
    return text.trim() ? checkCode(text, scene, getBoard(scene.board), PARTS, { monitorBaud: baud }) : [];
  }, [scene, baud]);
}

/** A code suggestion waiting in the editor: accept (Tab), explain, or dismiss (Esc). */
export interface CodeSuggestion {
  title: string;
  /** Text inserted after this 1-based line (0: at the top). With replace, the whole file is replaced. */
  afterLine: number;
  text: string;
  replace?: boolean;
  explanation: string;
  sources: AiSource[];
  /** who made it: the rules (starter code from the parts library) or the AI */
  by: 'rules' | 'ai';
}

interface CodeUi {
  /** 1-based line the editor should show and select (bumped by nonce). */
  reveal: { line: number; nonce: number };
  suggestion: CodeSuggestion | null;
  suggesting: boolean;
  cursorLine: number;
  set(p: Partial<Pick<CodeUi, 'suggestion' | 'suggesting' | 'cursorLine'>>): void;
}

export const useCodeUi = create<CodeUi>((set) => ({
  reveal: { line: 0, nonce: 0 },
  suggestion: null,
  suggesting: false,
  cursorLine: 1,
  set: (p) => set(p),
}));

export function revealLine(line: number) {
  useCodeUi.setState((s) => ({ reveal: { line, nonce: s.reveal.nonce + 1 } }));
}

/** The current sketch, or an empty one. */
export function currentSketch() {
  const s = useScene.getState().scene.sketch;
  return s ?? { name: DEFAULT_SKETCH_NAME, text: '' };
}

/** Replace one 1-based line of the sketch. */
export function replaceLine(line: number, text: string) {
  const sk = currentSketch();
  const lines = sk.text.split('\n');
  if (line < 1 || line > lines.length) return;
  lines[line - 1] = text;
  setSketch(sk.name, lines.join('\n'));
  revealLine(line);
}

/** Insert lines after a 1-based line (0: at the top). */
export function insertAfter(line: number, text: string) {
  const sk = currentSketch();
  const lines = sk.text ? sk.text.split('\n') : [];
  const at = Math.max(0, Math.min(line, lines.length));
  lines.splice(at, 0, ...text.replace(/\n$/, '').split('\n'));
  setSketch(sk.name, lines.join('\n'));
  revealLine(at + 1);
}

export function acceptSuggestion() {
  const s = useCodeUi.getState().suggestion;
  if (!s) return;
  if (s.replace) setSketch(currentSketch().name, s.text);
  else insertAfter(s.afterLine, s.text);
  useCodeUi.setState({ suggestion: null });
}
