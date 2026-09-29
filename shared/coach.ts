// Interview coach (Learn screen): the user practises a lesson's interview questions and the
// assistant grades the answer. Pure logic shared by the main process (history file, see
// app/main/session/coachStore.ts; prompt in app/main/ai/coach.ts) and the renderer (manual
// fallback). Answers stay on this computer and are pruned after 90 days.

import type { Lesson } from './lessons';

/** Saved answers older than this are deleted when the history is loaded. */
export const COACH_RETENTION_DAYS = 90;
/** Attempts kept per question (oldest dropped first). */
export const COACH_MAX_PER_QUESTION = 20;
/** Longest answer accepted, in characters. */
export const COACH_MAX_ANSWER = 4000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A part of a lesson: the text before the first heading, or one heading and what follows it. */
export interface LessonSection {
  /** Stable within a lesson: "s1", "s2"… in reading order. */
  id: string;
  /** English text (an i18n key); the intro section uses the lesson title. */
  title: string;
  /** Paragraphs, list items, tips and table rows; each line is one or more English i18n keys
   *  (a table row has one per cell). */
  lines: string[][];
}

/** The grade for one answer. Always a suggestion: nothing here was measured or checked. */
export interface CoachFeedback {
  right: string[];
  missing: string[];
  followUp: string;
  /** Lesson sections the grade relies on, as named by the model and checked against the lesson. */
  sections: { id: string; title: string }[];
  confidence: 'suggestion';
}

export interface CoachAttempt {
  id: string;
  lessonId: string;
  /** The interview question, in English (the i18n key from shared/lessons.ts). */
  question: string;
  answer: string;
  /** Epoch milliseconds. */
  at: number;
  feedback: CoachFeedback;
}

export interface CoachHistoryFile {
  format: 'boardpilot-coach@1';
  attempts: CoachAttempt[];
}

const isStr = (x: unknown): x is string => typeof x === 'string';

/* ---------------- lesson sections ---------------- */

export function lessonSections(lesson: Lesson): LessonSection[] {
  const out: LessonSection[] = [{ id: 's1', title: lesson.title, lines: [[lesson.summary]] }];
  for (const b of lesson.blocks) {
    const cur = out[out.length - 1];
    switch (b.kind) {
      case 'h':
        out.push({ id: `s${out.length + 1}`, title: b.text, lines: [] });
        break;
      case 'p':
      case 'tip':
        cur.lines.push([b.text]);
        break;
      case 'list':
        for (const item of b.items) cur.lines.push([item]);
        break;
      case 'table':
        for (const row of b.rows) cur.lines.push(row.filter((c) => c.trim()));
        break;
      default:
        break;
    }
  }
  return out.map((s) => ({ ...s, lines: s.lines.filter((l) => l.length > 0) }));
}

/** One section line as text: each part translated with `tr`, table cells joined with " | ". */
export const lineText = (line: string[], tr: (s: string) => string = (s) => s) => line.map(tr).join(' | ');

const STOP = new Set(
  'the a an and or of to in on at for is are be it its this that what why how when where which do does you your with from by as can into not no if then than there their they we'.split(' '),
);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => (w.length > 4 ? w.replace(/s$/, '') : w)),
  );

/**
 * The manual fallback when the assistant is unavailable: the lesson sections that share the most
 * words with the question (at least one section, the intro when nothing matches).
 */
export function keyPointsFor(lesson: Lesson, question: string, max = 2): LessonSection[] {
  const q = words(question);
  const scored = lessonSections(lesson).map((s, i) => {
    const w = words(`${s.title} ${s.lines.map((l) => lineText(l)).join(' ')}`);
    let score = 0;
    for (const x of q) if (w.has(x)) score++;
    // a match in the heading counts double
    for (const x of words(s.title)) if (q.has(x)) score++;
    return { s, score, i };
  });
  const hits = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, max);
  const picked = hits.length ? hits.sort((a, b) => a.i - b.i).map((x) => x.s) : [scored[0].s];
  return picked;
}

/* ---------------- history ---------------- */

function isFeedback(x: unknown): x is CoachFeedback {
  if (typeof x !== 'object' || x === null) return false;
  const f = x as Record<string, unknown>;
  return (
    Array.isArray(f.right) &&
    f.right.every(isStr) &&
    Array.isArray(f.missing) &&
    f.missing.every(isStr) &&
    isStr(f.followUp) &&
    Array.isArray(f.sections) &&
    f.sections.every((s) => typeof s === 'object' && s !== null && isStr((s as { id?: unknown }).id) && isStr((s as { title?: unknown }).title))
  );
}

export function isAttempt(x: unknown): x is CoachAttempt {
  if (typeof x !== 'object' || x === null) return false;
  const a = x as Record<string, unknown>;
  return isStr(a.id) && isStr(a.lessonId) && isStr(a.question) && isStr(a.answer) && typeof a.at === 'number' && Number.isFinite(a.at) && isFeedback(a.feedback);
}

/** Reads a history file's content; anything malformed is skipped, never thrown. */
export function parseHistory(raw: unknown): CoachAttempt[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const list = (raw as { attempts?: unknown }).attempts;
  return Array.isArray(list)
    ? list.filter(isAttempt).map((a) => ({ ...a, feedback: { ...a.feedback, confidence: 'suggestion' as const } }))
    : [];
}

/** Drops attempts older than the retention period. */
export function pruneAttempts(attempts: CoachAttempt[], now: number, days = COACH_RETENTION_DAYS): CoachAttempt[] {
  const oldest = now - days * DAY_MS;
  return attempts.filter((a) => a.at >= oldest);
}

const sameQuestion = (a: CoachAttempt, lessonId: string, question: string) => a.lessonId === lessonId && a.question === question;

/** Attempts for one question, newest first. */
export function attemptsFor(attempts: CoachAttempt[], lessonId: string, question: string): CoachAttempt[] {
  return attempts.filter((a) => sameQuestion(a, lessonId, question)).sort((a, b) => b.at - a.at);
}

/** Adds an attempt and keeps at most `max` per question (the oldest go first). */
export function addAttempt(attempts: CoachAttempt[], attempt: CoachAttempt, max = COACH_MAX_PER_QUESTION): CoachAttempt[] {
  const mine = attemptsFor([...attempts, attempt], attempt.lessonId, attempt.question);
  const keep = new Set(mine.slice(0, max).map((a) => a.id));
  return [...attempts, attempt].filter((a) => !sameQuestion(a, attempt.lessonId, attempt.question) || keep.has(a.id));
}

export function removeQuestion(attempts: CoachAttempt[], lessonId: string, question: string): CoachAttempt[] {
  return attempts.filter((a) => !sameQuestion(a, lessonId, question));
}
