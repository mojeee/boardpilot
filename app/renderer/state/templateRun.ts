// The open template project and its simulated run: a ticker drives TemplateRun (shared/templates)
// in simulated time, keeps the story, and feeds the 3D view (pin levels, text on displays, bus
// activity on wires). Kept apart from the measured live data so nothing simulated is ever shown as
// measured.

import { useMemo } from 'react';
import { create } from 'zustand';
import { PARTS, getBoard } from '@shared/board';
import { TEMPLATES, TemplateRun, stepLines, templateCode, templateScene, type StoryItem, type TemplateDef } from '@shared/templates';
import { t } from '@shared/i18n';
import { log, useLive, useScene } from './store';

interface TemplateState {
  tpl: TemplateDef | null;
  code: string;
  story: StoryItem[];
  running: boolean;
  speed: number;
  /** simulated ms */
  now: number;
  step: string;
  state: string;
  /** Simulated pin levels by GPIO, for the 3D pins. */
  simPins: Record<number, 0 | 1>;
  /** Text shown on a part (OLED, 7-segment) or its latest value, by part id. */
  partText: Record<string, string>;
  open(id: string): void;
  close(): void;
  play(): void;
  pause(): void;
  stepOnce(): void;
  setSpeed(x: number): void;
  reset(): void;
}

let run: TemplateRun | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let realStart = 0;
let simStart = 0;

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function apply(items: StoryItem[]) {
  if (!run || !items.length) return;
  const st = useTemplate.getState();
  const partText = { ...st.partText };
  let step = st.step;
  let state = st.state;
  const scene = useScene.getState().scene;
  const activeWires: string[] = [];
  for (const it of items) {
    if (it.kind === 'step') step = it.text;
    if (it.kind === 'state') state = it.text;
    if (it.kind === 'show' && it.part && it.name) partText[it.part] = it.name;
    if (it.kind === 'value') {
      const part = it.targets.find((x) => x.startsWith('part:'))?.slice(5) ?? st.tpl?.parts.find((p) => PARTS[p.partId]?.bus === 'i2c')?.id;
      if (part && it.value !== undefined) partText[part] = it.text;
      // Data from a bus part: its wires pulse, like real bus activity.
      if (part) for (const w of scene.wires) if (w.from.part === part || w.to.part === part) activeWires.push(w.id);
    }
  }
  useTemplate.setState({ story: [...st.story, ...items.filter((x) => !x.quiet || x.kind !== 'value')].slice(-400), step, state, partText, simPins: run.pinLevels(), now: run.t });
  if (activeWires.length) {
    const until = Date.now() + 600;
    const aw = { ...useLive.getState().activeWires };
    for (const id of activeWires) aw[id] = until;
    useLive.setState({ activeWires: aw });
  }
}

export const useTemplate = create<TemplateState>((set, get) => ({
  tpl: null,
  code: '',
  story: [],
  running: false,
  speed: 1,
  now: 0,
  step: '',
  state: '',
  simPins: {},
  partText: {},
  open: (id) => {
    const tpl = TEMPLATES.find((x) => x.id === id);
    if (!tpl) return;
    stopTimer();
    const board = getBoard(useScene.getState().scene.board);
    const built = templateScene(tpl, board, PARTS);
    const code = templateCode(tpl, board, built);
    // The code goes into the project, so the Code panel shows it and it is saved with the project.
    const scene = { ...built, sketch: { name: templateFileName(tpl), text: code } };
    useScene.getState().openScene(scene, true);
    run = new TemplateRun(tpl, board, scene);
    set({ tpl, code, story: [], running: false, now: 0, step: '', state: '', simPins: {}, partText: {} });
    log('action', t('Template “{name}” built for {board}: parts, wires and code.', { name: t(tpl.name), board: board.name }), { source: `template: ${tpl.id}` });
  },
  close: () => {
    stopTimer();
    run = null;
    set({ tpl: null, code: '', story: [], running: false, simPins: {}, partText: {} });
  },
  play: () => {
    if (!run) get().reset();
    if (!run) return;
    stopTimer();
    realStart = Date.now();
    simStart = run.t;
    set({ running: true });
    timer = setInterval(() => {
      if (!run) return stopTimer();
      const target = simStart + (Date.now() - realStart) * get().speed;
      const items: StoryItem[] = [];
      let guard = 0;
      while (run.t < target && guard++ < 200) items.push(...run.next());
      apply(items);
    }, 100);
  },
  pause: () => {
    stopTimer();
    set({ running: false });
  },
  stepOnce: () => {
    if (!run) get().reset();
    if (!run) return;
    get().pause();
    let items: StoryItem[] = [];
    // One visible thing at a time: skip empty rounds.
    for (let i = 0; i < 50 && !items.length; i++) items = run.next();
    apply(items);
  },
  setSpeed: (x) => {
    if (run && get().running) {
      simStart = run.t;
      realStart = Date.now();
    }
    set({ speed: x });
  },
  reset: () => {
    const tpl = get().tpl;
    if (!tpl) return;
    stopTimer();
    const board = getBoard(useScene.getState().scene.board);
    run = new TemplateRun(tpl, board, useScene.getState().scene);
    set({ story: [], running: false, now: 0, step: '', state: '', simPins: {}, partText: {} });
  },
}));

export const templateFileName = (tpl: TemplateDef) => `${tpl.id.replace(/-/g, '_')}.ino`;

/**
 * Re-attach a template to a project that was built from it (switching project tabs): the run
 * starts again from the beginning on the project's scene, nothing in the scene is rebuilt.
 */
export function attachTemplate(id: string | null) {
  const st = useTemplate.getState();
  if (!id) {
    if (st.tpl) st.close();
    return;
  }
  if (st.tpl?.id === id) return;
  const tpl = TEMPLATES.find((x) => x.id === id);
  if (!tpl) return;
  st.pause();
  const scene = useScene.getState().scene;
  run = new TemplateRun(tpl, getBoard(scene.board), scene);
  useTemplate.setState({ tpl, code: scene.sketch?.text ?? '', story: [], running: false, now: 0, step: '', state: '', simPins: {}, partText: {} });
}

/** The 1-based line of the project's code that the simulated run is on (0: none), from the probe.step markers. */
export function useRunLine(): number {
  const text = useScene((s) => s.scene.sketch?.text ?? '');
  const step = useTemplate((s) => s.step);
  const lines = useMemo(() => stepLines(text), [text]);
  if (!step) return 0;
  // The story shows steps translated; the code has them in English.
  return [...lines].find(([k]) => t(k) === step)?.[1] ?? 0;
}
