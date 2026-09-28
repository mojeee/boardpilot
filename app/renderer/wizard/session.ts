// Holds the running wizard flow and connects the flow engine to the app stores.

import { create } from 'zustand';
import { FlowRunner, type FlowContext, type FlowState, type StepAnswer, type Fallback } from '@shared/flow';
import { FLOWS } from '@flows/index';
import { getBoard, PARTS } from '@shared/board';
import { flowHardware } from '../state/hw';
import { log, useScene } from '../state/store';
import { t } from '@shared/i18n';

interface WizardStore {
  runner: FlowRunner | null;
  state: FlowState | null;
  start(flowId: string): void;
  answer(a: StepAnswer): void;
  fallback(f: Fallback): void;
  cancel(): void;
}

function makeCtx(): FlowContext {
  const scene = useScene.getState();
  return {
    hw: flowHardware,
    board: getBoard(scene.scene.board),
    parts: PARTS,
    scene: () => useScene.getState().scene,
    updateScene: (fn) => useScene.getState().updateScene(fn),
    answers: {},
    data: {},
    // flow texts are English keys; show them in the current language when a translation exists
    log: (type, text, opts) => log(type, t(text), opts),
    highlight: (targets) => {
      if (targets.length) useScene.getState().focusOn(targets);
      else useScene.getState().setHighlight([]);
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

let unsub: (() => void) | null = null;

export const useWizard = create<WizardStore>((set, get) => ({
  runner: null,
  state: null,
  start: (flowId) => {
    const flow = FLOWS[flowId];
    if (!flow) return;
    get().runner?.cancel();
    unsub?.();
    const runner = new FlowRunner(flow, makeCtx());
    unsub = runner.subscribe((state) => set({ state }));
    set({ runner });
    void runner.start();
  },
  answer: (a) => void get().runner?.answer(a),
  fallback: (f) => void get().runner?.chooseFallback(f),
  cancel: () => {
    get().runner?.cancel();
    unsub?.();
    unsub = null;
    set({ runner: null, state: null });
  },
}));
