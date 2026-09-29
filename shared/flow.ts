// Wizard flow engine. A flow is an ordered list of steps; the engine walks them, pauses for the
// user where a step needs an answer, and records every event in the session log.
// No DOM or Node imports: the renderer drives it and Vitest tests it with the simulator.

import type {
  AgentReplyMap,
  AgentRequest,
  BoardDef,
  ChipInfo,
  Confidence,
  ConnectionState,
  HelloReply,
  LogType,
  PartDef,
  PortInfo,
  Result,
  Scene,
  TargetRef,
  WriteRequest,
} from './types';
import { t } from './i18n';
import type { PreflightReport } from './preflight';

export type SimControl = 'turnKnob' | 'pressButton';

export type StepType = 'auto' | 'question' | 'input' | 'confirm' | 'action' | 'result';
export type StepStatus = 'pending' | 'running' | 'waiting' | 'ok' | 'warning' | 'failed' | 'skipped';
export type InputKind = 'model' | 'library' | 'photo' | 'datasheet' | 'port' | 'firmware';

export interface StepOption {
  id: string;
  label: string;
  hint?: string;
}

export interface Evidence {
  text: string;
  source: string;
  target?: TargetRef;
  confidence: Confidence;
}

export interface ResultData {
  title: string;
  cause: string;
  confidence: Confidence;
  evidence: Evidence[];
  sources: string[];
  nextSteps: string[];
  highlight: TargetRef[];
  /** Labs: whether the lab's check passed (a passed lab marks its lesson done). */
  passed?: boolean;
}

export interface StepOutcome {
  status: 'ok' | 'warning' | 'failed' | 'skipped';
  summary: string;
  result?: ResultData;
  /** Jump to another step id instead of the next one. */
  goto?: string;
}

export interface Fallback {
  id: string;
  label: string;
  kind: 'retry' | 'skip' | 'goto' | 'input';
  goto?: string;
  input?: InputKind;
}

/** What the user answered on a question / input / confirm / action step. */
export type StepAnswer =
  | { kind: 'option'; optionId: string; label: string }
  | { kind: 'text'; text: string; mappedOptionId?: string }
  | { kind: 'input'; input: InputKind; value: string; partId?: string; confirmed?: boolean }
  | { kind: 'confirm'; confirmed: boolean; token?: string }
  | { kind: 'done' };

export interface StepDef {
  id: string;
  type: StepType;
  title: string;
  body?: string | ((ctx: FlowContext) => string);
  options?: StepOption[] | ((ctx: FlowContext) => StepOption[]);
  /** question steps: show "describe it in your words" */
  allowFreeText?: boolean;
  inputs?: InputKind[];
  confirm?: { write: WriteRequest['kind']; details: string[]; uses?: number };
  /** action steps in simulator mode: a button that does the physical part on the simulated bench */
  simControl?: SimControl;
  /** Skip the step when this returns false (look before asking). */
  when?: (ctx: FlowContext) => boolean;
  run?: (ctx: FlowContext, answer?: StepAnswer) => Promise<StepOutcome>;
  /** Prompt for the AI when the step fails or the user asks for help. */
  aiHelp?: (ctx: FlowContext, outcome?: StepOutcome) => string;
  fallbacks?: Fallback[];
  highlight?: (ctx: FlowContext) => TargetRef[];
}

export interface FlowDef {
  id: string;
  title: string;
  description: string;
  steps: StepDef[];
}

/** Hardware access as seen by a flow. The renderer implements it over IPC; tests over the simulator. */
export interface FlowHardware {
  listPorts(): Promise<Result<PortInfo[]>>;
  identify(port: string): Promise<Result<ChipInfo>>;
  state(): ConnectionState;
  agentReady(): boolean;
  /** Backs up the flash if needed, flashes the agent and says hello. Needs a token from a confirm step. */
  installAgent(token: string): Promise<Result<HelloReply>>;
  /** gpio_write / pwm with a token from a confirm step */
  agentWrite<K extends AgentRequest['cmd']>(req: Extract<AgentRequest, { cmd: K }>, token: string): Promise<Result<AgentReplyMap[K]>>;
  agent<K extends AgentRequest['cmd']>(req: Extract<AgentRequest, { cmd: K }>): Promise<Result<AgentReplyMap[K]>>;
  captureSerial(baud: number, ms: number): Promise<Result<string[]>>;
  flashUser(token: string, filePath: string): Promise<Result<{ bytes: number }>>;
  preflight(filePath: string): Promise<Result<PreflightReport>>;
}

export interface FlowContext {
  hw: FlowHardware;
  board: BoardDef;
  parts: Record<string, PartDef>;
  scene(): Scene;
  updateScene(fn: (s: Scene) => Scene): void;
  answers: Record<string, StepAnswer>;
  /** Scratch space shared between steps of one run. */
  data: Record<string, unknown>;
  log(type: LogType, text: string, opts?: { target?: TargetRef; source?: string }): void;
  highlight(targets: TargetRef[]): void;
  sleep(ms: number): Promise<void>;
}

export interface StepState {
  id: string;
  status: StepStatus;
  summary?: string;
}

export interface FlowState {
  flowId: string;
  title: string;
  steps: StepState[];
  current: number;
  status: 'running' | 'waiting' | 'failed' | 'done' | 'cancelled';
  result?: ResultData;
  lastOutcome?: StepOutcome;
}

export class FlowRunner {
  private state: FlowState;
  private listeners = new Set<(s: FlowState) => void>();
  private cancelled = false;
  private busy = false;

  constructor(
    readonly flow: FlowDef,
    readonly ctx: FlowContext,
  ) {
    this.state = {
      flowId: flow.id,
      title: flow.title,
      steps: flow.steps.map((s) => ({ id: s.id, status: 'pending' })),
      current: 0,
      status: 'running',
    };
  }

  get snapshot(): FlowState {
    return this.state;
  }

  get currentStep(): StepDef | undefined {
    return this.flow.steps[this.state.current];
  }

  subscribe(fn: (s: FlowState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<FlowState>, stepPatch?: Partial<StepState>) {
    const steps = stepPatch
      ? this.state.steps.map((s, i) => (i === this.state.current ? { ...s, ...stepPatch } : s))
      : this.state.steps;
    this.state = { ...this.state, ...patch, steps };
    for (const l of this.listeners) l(this.state);
  }

  async start(): Promise<void> {
    this.ctx.log('info', t('Started: {title}', { title: t(this.flow.title) }));
    await this.advance();
  }

  cancel(): void {
    this.cancelled = true;
    this.set({ status: 'cancelled' });
  }

  /** Answer the step that is waiting (question, input, confirm, action). */
  async answer(answer: StepAnswer): Promise<void> {
    const step = this.currentStep;
    if (!step || this.state.status !== 'waiting' || this.busy) return;
    this.ctx.answers[step.id] = answer;
    if (answer.kind === 'option') this.ctx.log('action', t('You chose: {label}', { label: t(answer.label) }));
    if (answer.kind === 'text') this.ctx.log('action', t('You wrote: “{text}”', { text: answer.text }));
    if (answer.kind === 'confirm') this.ctx.log('action', answer.confirmed ? t('You confirmed.') : t('You cancelled.'));
    if (answer.kind === 'input') this.ctx.log('action', t('You entered: {value}', { value: answer.value }));
    if (answer.kind === 'done') this.ctx.log('action', t('You said it is done. Checking…'));
    await this.runStep(step, answer);
  }

  async chooseFallback(fb: Fallback): Promise<void> {
    if (this.busy) return;
    const step = this.currentStep;
    if (!step) return;
    this.ctx.log('action', t('Fallback: {label}', { label: t(fb.label) }));
    if (fb.kind === 'retry') {
      await this.enterStep();
    } else if (fb.kind === 'skip') {
      this.set({}, { status: 'skipped', summary: 'Skipped' });
      await this.next();
    } else if (fb.kind === 'goto' && fb.goto) {
      this.jump(fb.goto);
      await this.enterStep();
    } else if (fb.kind === 'input') {
      // The step becomes a manual input; the UI shows the input picker for fb.input.
      this.set({ status: 'waiting' }, { status: 'waiting', summary: fb.label });
    }
  }

  private jump(id: string) {
    const idx = this.flow.steps.findIndex((s) => s.id === id);
    if (idx >= 0) this.set({ current: idx });
  }

  private async next(goto?: string): Promise<void> {
    if (goto) {
      // An explicit jump bypasses the target's `when` check: steps hidden by default are reached this way.
      this.jump(goto);
      await this.enterStep();
      return;
    }
    this.set({ current: this.state.current + 1 });
    await this.advance();
  }

  private async advance(): Promise<void> {
    while (!this.cancelled) {
      const step = this.currentStep;
      if (!step) {
        this.set({ status: 'done' });
        return;
      }
      if (step.when && !step.when(this.ctx)) {
        this.set({}, { status: 'skipped', summary: 'Not needed' });
        this.set({ current: this.state.current + 1 });
        continue;
      }
      await this.enterStep();
      return;
    }
  }

  private async enterStep(): Promise<void> {
    const step = this.currentStep;
    if (!step) return;
    if (step.highlight) this.ctx.highlight(step.highlight(this.ctx));
    if (step.type === 'auto' || step.type === 'result') {
      await this.runStep(step);
    } else {
      this.set({ status: 'waiting', lastOutcome: undefined }, { status: 'waiting', summary: undefined });
    }
  }

  private async runStep(step: StepDef, answer?: StepAnswer): Promise<void> {
    this.busy = true;
    this.set({ status: 'running' }, { status: 'running' });
    let outcome: StepOutcome;
    try {
      outcome = step.run
        ? await step.run(this.ctx, answer)
        : { status: 'ok', summary: answer?.kind === 'option' ? answer.label : 'Done' };
    } catch (e) {
      outcome = {
        status: 'failed',
        summary: t('Something went wrong in this step: {error}', { error: e instanceof Error ? e.message : String(e) }),
      };
    }
    this.busy = false;
    if (this.cancelled) return;

    const logType: LogType =
      outcome.status === 'failed' ? 'failed' : outcome.status === 'warning' ? 'warning' : 'check';
    if (step.type !== 'result') this.ctx.log(logType, t('{step}: {summary}', { step: t(step.title), summary: t(outcome.summary) }));

    this.set({ lastOutcome: outcome }, { status: outcome.status, summary: outcome.summary });

    if (outcome.result) {
      this.set({ result: outcome.result, status: 'done' });
      this.ctx.highlight(outcome.result.highlight);
      return;
    }
    if (outcome.status === 'failed') {
      this.set({ status: 'failed' });
      return;
    }
    await this.next(outcome.goto);
  }
}

/** Resolve a step's dynamic text/options. */
export function stepBody(step: StepDef, ctx: FlowContext): string | undefined {
  return typeof step.body === 'function' ? step.body(ctx) : step.body;
}
export function stepOptions(step: StepDef, ctx: FlowContext): StepOption[] {
  return typeof step.options === 'function' ? step.options(ctx) : step.options ?? [];
}
