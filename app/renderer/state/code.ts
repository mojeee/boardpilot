// The project's code as the Code panel sees it: the sketch and its other files (kept in the scene,
// so they are saved with the project and follow the project tabs), their findings against the
// drawing, the compiler's last report, and the editor's helpers (jump to a line, replace a line,
// insert text) used by the banner, the assistant, the code suggestions and Display Studio.

import { useMemo } from 'react';
import { create } from 'zustand';
import { PARTS, getBoard } from '@shared/board';
import type { CodeFinding } from '@shared/codeCheck';
import { checkProject, DEFAULT_SKETCH_NAME, fileText, projectFiles, renamedFile, withFile, withoutFile } from '@shared/codeProject';
import type { CompileReport } from '@shared/compileOutput';
import type { AiSource, ProjectFile } from '@shared/types';
import { setSketch, useLive, useScene } from './store';

export { DEFAULT_SKETCH_NAME };

/** The findings of the code checker for the open project's code (empty without code). */
export function useCodeFindings(): CodeFinding[] {
  const scene = useScene((s) => s.scene);
  const baud = useLive((s) => s.baud);
  return useMemo(() => checkProject(scene.sketch, scene, getBoard(scene.board), PARTS, { monitorBaud: baud }), [scene, baud]);
}

/** A code suggestion waiting in the editor: accept (Tab), explain, or dismiss (Esc). */
export interface CodeSuggestion {
  title: string;
  /** Text inserted after this 1-based line (0: at the top). With replace, the whole file is replaced. */
  afterLine: number;
  text: string;
  replace?: boolean;
  /** Replace these 1-based lines (first, last) instead of inserting ("Change this", "Fix with AI"). */
  lines?: [number, number];
  /** The file it is for (default: the main sketch). */
  file?: string;
  explanation: string;
  sources: AiSource[];
  /** who made it: the rules (starter code from the parts library) or the AI */
  by: 'rules' | 'ai';
}

interface CodeUi {
  /** 1-based line the editor should show and select (bumped by nonce), in `file` (default: the main sketch). */
  reveal: { line: number; nonce: number; file?: string };
  suggestion: CodeSuggestion | null;
  suggesting: boolean;
  cursorLine: number;
  /** The file tab shown in the editor; null: the main sketch. */
  activeFile: string | null;
  /** Text selected in the editor (for "Explain this" / "Change this"), with its first line. */
  selection: { text: string; line: number } | null;
  /** The last "Check with compiler" run, and the text of each file it compiled (its lines are shown only while a file is unchanged). */
  compile: { running: boolean; report: CompileReport | null; files: Record<string, string> };
  /** Bumped when a whole new program replaces the code: the editor starts a fresh undo history. */
  generation: number;
  set(p: Partial<Pick<CodeUi, 'suggestion' | 'suggesting' | 'cursorLine' | 'activeFile' | 'selection' | 'compile'>>): void;
}

export const useCodeUi = create<CodeUi>((set) => ({
  reveal: { line: 0, nonce: 0 },
  suggestion: null,
  suggesting: false,
  cursorLine: 1,
  activeFile: null,
  selection: null,
  compile: { running: false, report: null, files: {} },
  generation: 0,
  set: (p) => set(p),
}));

/** The current sketch, or an empty one. */
export function currentSketch() {
  const s = useScene.getState().scene.sketch;
  return s ?? { name: DEFAULT_SKETCH_NAME, text: '' };
}

/** All files of the project, the main sketch first. */
export const currentFiles = (): ProjectFile[] => projectFiles(useScene.getState().scene.sketch);

/** The file shown in the editor (the main sketch when the chosen tab no longer exists). */
export function activeFileName(): string {
  const sk = currentSketch();
  const a = useCodeUi.getState().activeFile;
  return a && fileText(sk, a) !== undefined ? a : sk.name;
}

export function openFile(name: string) {
  useCodeUi.setState({ activeFile: name === currentSketch().name ? null : name, selection: null });
}

/** Show and select a line, switching to its file. */
export function revealLine(line: number, file?: string) {
  if (file) openFile(file);
  else useCodeUi.setState({ activeFile: null });
  useCodeUi.setState((s) => ({ reveal: { line, nonce: s.reveal.nonce + 1, ...(file ? { file } : {}) } }));
}

/** Replace the text of one file (the main sketch or another). Not an undo step of the drawing. */
export function setFileText(name: string, text: string) {
  const sk = currentSketch();
  if (name === sk.name) return setSketch(name, text);
  useScene.getState().updateScene((s) => (fileText(s.sketch, name) === text ? s : { ...s, sketch: withFile(s.sketch, name, text) }), { transient: true });
}

/** Put a whole new program in the project: a main sketch and its other files (replacing all code). */
export function replaceProjectCode(name: string, text: string, files: ProjectFile[] = []) {
  const others = files.filter((f) => f.name !== name);
  useScene.getState().updateScene((s) => ({ ...s, sketch: others.length ? { name, text, files: others } : { name, text } }), { transient: true });
  useCodeUi.setState((s) => ({ activeFile: null, suggestion: null, selection: null, compile: { running: false, report: null, files: {} }, generation: s.generation + 1 }));
}

export function addFile(name: string, text: string) {
  setFileText(name, text);
  openFile(name);
}

export function removeFile(name: string) {
  const sk = useScene.getState().scene.sketch;
  if (!sk) return;
  useScene.getState().updateScene((s) => (s.sketch ? { ...s, sketch: withoutFile(s.sketch, name) } : s), { transient: true });
  if (useCodeUi.getState().activeFile === name) useCodeUi.setState({ activeFile: null });
}

export function renameFile(from: string, to: string) {
  useScene.getState().updateScene((s) => (s.sketch ? { ...s, sketch: renamedFile(s.sketch, from, to) } : s), { transient: true });
  const a = useCodeUi.getState().activeFile;
  if (a === from) useCodeUi.setState({ activeFile: to === currentSketch().name ? null : to });
}

const textOf = (file?: string) => (file ? fileText(useScene.getState().scene.sketch, file) : undefined) ?? currentSketch().text;
const nameOf = (file?: string) => (file && fileText(useScene.getState().scene.sketch, file) !== undefined ? file : currentSketch().name);

/** Replace one 1-based line of a file (default: the main sketch). */
export function replaceLine(line: number, text: string, file?: string) {
  const name = nameOf(file);
  const lines = textOf(name).split('\n');
  if (line < 1 || line > lines.length) return;
  lines[line - 1] = text;
  setFileText(name, lines.join('\n'));
  revealLine(line, name === currentSketch().name ? undefined : name);
}

/** Insert lines after a 1-based line (0: at the top) of a file (default: the main sketch). */
export function insertAfter(line: number, text: string, file?: string) {
  const name = nameOf(file);
  const cur = textOf(name);
  const lines = cur ? cur.split('\n') : [];
  const at = Math.max(0, Math.min(line, lines.length));
  lines.splice(at, 0, ...text.replace(/\n$/, '').split('\n'));
  setFileText(name, lines.join('\n'));
  revealLine(at + 1, name === currentSketch().name ? undefined : name);
}

/** Replace 1-based lines first..last of a file with text. */
export function replaceLines(first: number, last: number, text: string, file?: string) {
  const name = nameOf(file);
  const lines = textOf(name).split('\n');
  const a = Math.max(1, Math.min(first, lines.length));
  const b = Math.max(a, Math.min(last, lines.length));
  lines.splice(a - 1, b - a + 1, ...text.replace(/\n$/, '').split('\n'));
  setFileText(name, lines.join('\n'));
  revealLine(a, name === currentSketch().name ? undefined : name);
}

export function acceptSuggestion() {
  const s = useCodeUi.getState().suggestion;
  if (!s) return;
  if (s.replace) setFileText(nameOf(s.file), s.text);
  else if (s.lines) replaceLines(s.lines[0], s.lines[1], s.text, s.file);
  else insertAfter(s.afterLine, s.text, s.file);
  useCodeUi.setState({ suggestion: null });
}
