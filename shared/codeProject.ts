// The project's code as several files: the main sketch (scene.sketch.name/text, what every older
// project and helper uses) plus its other files (scene.sketch.files: pins.h, display.cpp, an
// ESP-IDF or Pico SDK starter's CMakeLists.txt). Pure helpers for the Code panel's file tabs, and
// checkProject: the code checker run over all source files at once, so a #define in pins.h is
// known in the .ino, with every finding mapped back to its own file and line.

import type { BoardDef, PartDef, ProjectFile, ProjectSketch, Scene } from './types';
import { checkCode, type CodeCheckOptions, type CodeFinding } from './codeCheck';
import { isSafeProjectPath } from './starter/common';

export const DEFAULT_SKETCH_NAME = 'sketch.ino';

/** C, C++ and Arduino sources the checker and the C++ highlighting apply to. */
export const isSourceFile = (name: string) => /\.(ino|pde|c|cc|cpp|cxx|h|hh|hpp|hxx)$/i.test(name);
export const isHeaderFile = (name: string) => /\.(h|hh|hpp|hxx)$/i.test(name);

/** Every file of the project, the main sketch first. */
export function projectFiles(sketch: ProjectSketch | undefined): ProjectFile[] {
  if (!sketch) return [{ name: DEFAULT_SKETCH_NAME, text: '' }];
  return [{ name: sketch.name, text: sketch.text }, ...(sketch.files ?? []).filter((f) => f.name !== sketch.name)];
}

/** The text of one file of the project (undefined when there is no such file). */
export function fileText(sketch: ProjectSketch | undefined, name: string): string | undefined {
  return projectFiles(sketch).find((f) => f.name === name)?.text;
}

/** The sketch with one file's text replaced (or the file added at the end when it is new). */
export function withFile(sketch: ProjectSketch | undefined, name: string, text: string): ProjectSketch {
  const sk = sketch ?? { name: DEFAULT_SKETCH_NAME, text: '' };
  if (name === sk.name) return { ...sk, text };
  const files = sk.files ?? [];
  const i = files.findIndex((f) => f.name === name);
  const next = i < 0 ? [...files, { name, text }] : files.map((f, j) => (j === i ? { name, text } : f));
  return { ...sk, files: next };
}

/** The sketch without one of its other files (the main sketch cannot be removed). */
export function withoutFile(sketch: ProjectSketch, name: string): ProjectSketch {
  if (name === sketch.name || !sketch.files) return sketch;
  const files = sketch.files.filter((f) => f.name !== name);
  return files.length ? { ...sketch, files } : { name: sketch.name, text: sketch.text };
}

/** The sketch with a file renamed; renaming the main sketch keeps it the main sketch. */
export function renamedFile(sketch: ProjectSketch, from: string, to: string): ProjectSketch {
  if (from === sketch.name) return { ...sketch, name: to };
  return { ...sketch, files: (sketch.files ?? []).map((f) => (f.name === from ? { ...f, name: to } : f)) };
}

export type FileNameProblem = 'empty' | 'unsafe' | 'taken';

/** Why a new file name cannot be used, or null when it can. */
export function fileNameProblem(sketch: ProjectSketch | undefined, name: string, renaming?: string): FileNameProblem | null {
  const n = name.trim();
  if (!n) return 'empty';
  if (!isSafeProjectPath(n)) return 'unsafe';
  if (n !== renaming && projectFiles(sketch).some((f) => f.name.toLowerCase() === n.toLowerCase())) return 'taken';
  return null;
}

/** A starting text for a new file: an include guard for a header, a comment otherwise. */
export function newFileText(name: string): string {
  if (isHeaderFile(name)) {
    const guard = name.replace(/^.*\//, '').replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
    return `#ifndef ${guard}\n#define ${guard}\n\n\n\n#endif\n`;
  }
  return isSourceFile(name) ? `// ${name.replace(/^.*\//, '')}\n` : '';
}

/**
 * All source files as one text for the checker, headers first (their #defines are seen by the
 * code that uses them), then the main sketch, then the other sources; with the map back.
 */
export function combineSources(files: ProjectFile[], main: string): { text: string; at: (line: number) => { file: string; line: number } } {
  const src = files.filter((f) => isSourceFile(f.name));
  const order = [...src.filter((f) => isHeaderFile(f.name)), ...src.filter((f) => f.name === main), ...src.filter((f) => !isHeaderFile(f.name) && f.name !== main)];
  const starts: { file: string; first: number }[] = [];
  const chunks: string[] = [];
  let line = 1;
  for (const f of order) {
    starts.push({ file: f.name, first: line });
    chunks.push(f.text);
    line += f.text.split('\n').length;
  }
  const at = (l: number) => {
    let hit = starts[0] ?? { file: main, first: 1 };
    for (const s of starts) if (s.first <= l) hit = s;
    return { file: hit.file, line: l - hit.first + 1 };
  };
  return { text: chunks.join('\n'), at };
}

/**
 * The code checker over the whole project. A project with only its sketch is checked exactly as
 * before (findings without `file`); with several files every finding names its file.
 */
export function checkProject(sketch: ProjectSketch | undefined, scene: Scene, board: BoardDef, parts: Record<string, PartDef>, opts: CodeCheckOptions = {}): CodeFinding[] {
  if (!sketch) return [];
  const files = projectFiles(sketch);
  const sources = files.filter((f) => isSourceFile(f.name) || f.name === sketch.name);
  if (!sources.some((f) => f.text.trim())) return [];
  if (sources.length <= 1) return checkCode(sketch.text, scene, board, parts, opts);
  const { text, at } = combineSources(sources, sketch.name);
  return checkCode(text, scene, board, parts, { ...opts, mapLine: at });
}

/** The file a finding is in: its own, or the main sketch. */
export const findingFile = (f: CodeFinding, sketch: ProjectSketch | undefined) => f.file ?? sketch?.name ?? DEFAULT_SKETCH_NAME;
