// Plays a recorded conversation with the assistant (shared/chatReplay.ts) in the real chat panel:
// the user's messages appear, the assistant "thinks" for a moment, Claude's recorded replies arrive
// with their cards, the picked card lights up, Apply puts the parts and wires on the 3D board.
// No AI call is made. Used by the website demo (#demo=chat&chat=<id>) and "Watch an example".

import { create } from 'zustand';
import type { AiReply } from '@shared/types';
import { isRecording, type ChatRecording } from '@shared/chatReplay';
import { getLanguage } from '@shared/i18n';
import { useAi, useScene } from '../state/store';
import { applyProposal, openCode } from '../components/ProposalCard';
import { useLayout } from '../state/layout';
import { openTask } from '../components/TaskRail';

// Recordings are written by `BP_EVAL_RECORD=1 npm run eval:ai` and loaded only when played.
const FILES = import.meta.glob<() => Promise<{ default: unknown }>>('./recordings/*.json');

export interface RecordingInfo {
  id: string;
  load: () => Promise<ChatRecording | null>;
}

export const RECORDINGS: RecordingInfo[] = Object.entries(FILES)
  .map(([path, load]) => ({
    id: path.replace(/^.*\/|\.json$/g, ''),
    load: async () => {
      const m = await load();
      return isRecording(m.default) ? m.default : null;
    },
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

/** Titles for the picker, loaded once (each recording is a few tens of KB). */
export async function recordingList(): Promise<ChatRecording[]> {
  const all = await Promise.all(RECORDINGS.map((r) => r.load()));
  const lang = getLanguage();
  return all.filter((r): r is ChatRecording => !!r).sort((a, b) => Number(b.lang === lang) - Number(a.lang === lang) || a.title.localeCompare(b.title));
}

interface ReplayState {
  rec: ChatRecording | null;
  playing: boolean;
  done: boolean;
  speed: 1 | 2;
  step: number;
  run: number;
}

export const useReplay = create<ReplayState>(() => ({ rec: null, playing: false, done: false, speed: 1, step: 0, run: 0 }));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits `ms` of replay time, honouring pause and speed; false when the replay was stopped or restarted. */
async function wait(ms: number, run: number): Promise<boolean> {
  let left = ms;
  while (left > 0) {
    const st = useReplay.getState();
    if (st.run !== run) return false;
    await sleep(50);
    if (useReplay.getState().playing) left -= 50 * useReplay.getState().speed;
  }
  return useReplay.getState().run === run;
}

const lastAssistantId = () => [...useAi.getState().items].reverse().find((i) => i.role === 'assistant')?.id;

function lastProposal(): AiReply['proposal'] {
  for (const i of [...useAi.getState().items].reverse()) if (i.role === 'assistant' && i.reply.proposal) return i.reply.proposal;
  return undefined;
}

export async function playRecording(rec: ChatRecording) {
  const run = useReplay.getState().run + 1;
  useReplay.setState({ rec, playing: true, done: false, step: 0, run });
  openTask('newProject');
  // The chat is the thing to watch: the right panel open on the assistant.
  useLayout.getState().toggleRight(true);
  useLayout.getState().setRightTab('assistant');
  useAi.getState().clear();
  useAi.getState().set({ busy: false });
  useScene.getState().openScene(structuredClone(rec.start));
  if (!(await wait(900, run))) return;

  for (let i = 0; i < rec.steps.length; i++) {
    useReplay.setState({ step: i });
    const s = rec.steps[i];
    if (s.kind === 'user') {
      // A picked card already sent its label: the next user step is that same message.
      if (!(await wait(Math.min(1600, 500 + s.text.length * 18), run))) return;
      useAi.getState().push({ role: 'user', text: s.text });
    } else if (s.kind === 'assistant') {
      useAi.getState().set({ busy: true });
      // Real replies took 5-30 s; the replay keeps the pause short but visible.
      const ok = await wait(Math.min(2600, 900 + s.ms / 12), run);
      useAi.getState().set({ busy: false });
      if (!ok) return;
      useAi.getState().push({ role: 'assistant', reply: s.reply });
      // Fly the camera to what the reply talks about, without opening an info card over the view.
      if (s.reply.highlight.length) {
        useScene.getState().focusOn(s.reply.highlight);
        useScene.getState().select(null);
      }
    } else if (s.kind === 'pick') {
      if (!(await wait(2600, run))) return;
      const id = lastAssistantId();
      if (id !== undefined) useAi.getState().mark(id, { picked: s.label });
    } else if (s.kind === 'apply') {
      if (!(await wait(3200, run))) return;
      const p = lastProposal();
      const id = [...useAi.getState().items].reverse().find((x) => x.role === 'assistant' && x.reply.proposal)?.id;
      const where = p ? applyProposal(p) : 'here';
      if (id !== undefined) useAi.getState().mark(id, { applied: where });
      useScene.getState().select(null);
      useScene.getState().setHighlight([]);
      useScene.getState().preset('home');
    } else if (s.kind === 'code') {
      if (!(await wait(2200, run))) return;
      openCode();
    }
  }
  useReplay.setState({ playing: false, done: true });
}

export function stopReplay() {
  useReplay.setState((s) => ({ rec: null, playing: false, done: false, run: s.run + 1 }));
  useAi.getState().set({ busy: false });
}

/** Load a recording by id and play it; false when there is no such recording. */
export async function playById(id: string): Promise<boolean> {
  const info = RECORDINGS.find((r) => r.id === id);
  const rec = info ? await info.load() : null;
  if (!rec) return false;
  void playRecording(rec);
  return true;
}
