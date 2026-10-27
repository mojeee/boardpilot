// Recorded conversations with the assistant, for the website demo: real replies from Claude,
// saved by the live evaluation (tests/live/builder.live.ts) and played back in the browser demo
// without any AI call. A recording is data only; the replay shows it as recorded, labelled so.

import type { AiReply, Scene } from './types';

export type ReplayStep =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; reply: AiReply; ms: number }
  /** the user picked one of the reply's choice cards */
  | { kind: 'pick'; label: string }
  /** the user pressed "Apply to my project" on the last proposal */
  | { kind: 'apply' }
  /** the user opened the starter code of the applied proposal */
  | { kind: 'code' };

export interface ChatRecording {
  id: string;
  title: string;
  /** one line for the demo picker */
  blurb: string;
  board: string;
  lang: 'en' | 'it';
  model: string;
  recordedAt: string;
  /** the drawing when the conversation started (empty when it starts from nothing) */
  start: Scene;
  steps: ReplayStep[];
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Light shape check for a recording file (they are generated, but a bad file must not break the demo). */
export function isRecording(x: unknown): x is ChatRecording {
  if (!isObj(x) || typeof x.id !== 'string' || typeof x.board !== 'string' || !Array.isArray(x.steps)) return false;
  return x.steps.every((s) => {
    if (!isObj(s)) return false;
    if (s.kind === 'user') return typeof s.text === 'string';
    if (s.kind === 'assistant') return isObj(s.reply) && typeof (s.reply as Record<string, unknown>).message === 'string';
    if (s.kind === 'pick') return typeof s.label === 'string';
    return s.kind === 'apply' || s.kind === 'code';
  });
}
