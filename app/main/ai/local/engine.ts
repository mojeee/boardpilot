// The offline engine: llama.cpp through node-llama-cpp, behind a small interface so the provider
// (providers/local.ts) can be tested with a fake one. node-llama-cpp is loaded on first use with a
// dynamic import: if the engine cannot start on a computer, the rest of the app is not affected.
//
// Tool calls: LlamaChat.generateResponse() stops and returns the calls without running them, which
// is what the assistant loop needs (it runs the tools and sends the results back).
// Qwen 3 "thinking" is switched off (thoughts: 'discourage', thought budget 0): the answers are short
// and the thinking text would only slow them down.

import { statfs } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import type { GpuKind, HardwareInfo } from '@shared/localModels';

/** One item of the conversation, in the engine's own plain shape. */
export type EngineItem =
  | { type: 'system'; text: string }
  | { type: 'user'; text: string }
  | { type: 'model'; text: string; calls: { name: string; params: Record<string, unknown>; result: string }[] };

export interface EngineTool {
  name: string;
  description: string;
  /** JSON Schema of the arguments (an object). */
  parameters: Record<string, unknown>;
}

export interface EngineRequest {
  items: EngineItem[];
  tools?: EngineTool[];
  /** Make the answer valid JSON for this schema. */
  jsonSchema?: Record<string, unknown>;
  maxTokens: number;
  temperature: number;
  signal?: AbortSignal;
}

export interface EngineResult {
  text: string;
  calls: { name: string; params: Record<string, unknown> }[];
  stop: 'end' | 'tool_use' | 'max_tokens';
}

export interface LocalEngine {
  /** Load a model file (reuses the loaded one when the path is the same). */
  load(modelPath: string, contextSize: number): Promise<void>;
  /** Tokens the loaded model can hold in one conversation. */
  contextTokens(): number;
  countTokens(text: string): number;
  generate(req: EngineRequest): Promise<EngineResult>;
  dispose(): Promise<void>;
}

// --- JSON Schema -> the subset llama.cpp grammars support -----------------------------------

const KEEP = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'enum', 'const', 'oneOf', 'description', 'minLength', 'maxLength', '$defs', '$ref']);

/** Keep only the JSON Schema keywords the grammar generator understands (anyOf becomes oneOf). */
export function toGbnfSchema(schema: unknown): Record<string, unknown> {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return {};
  const src = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    const key = k === 'anyOf' ? 'oneOf' : k;
    if (!KEEP.has(key)) continue;
    if (key === 'properties' || key === '$defs') {
      out[key] = Object.fromEntries(Object.entries((v ?? {}) as Record<string, unknown>).map(([n, s]) => [n, toGbnfSchema(s)]));
    } else if (key === 'items' || key === 'additionalProperties') {
      out[key] = typeof v === 'object' && v !== null ? toGbnfSchema(v) : v;
    } else if (key === 'oneOf') {
      out[key] = (Array.isArray(v) ? v : []).map(toGbnfSchema);
    } else {
      out[key] = v;
    }
  }
  return out;
}

// --- Hardware -----------------------------------------------------------------------------

const GB = 1024 ** 3;

/** Memory, disk and GPU of this computer. Never throws: what cannot be read is reported as 0 / none. */
export async function detectHardware(modelsDir: string, engine?: { gpu(): Promise<{ gpu: GpuKind; vramGb: number }> }): Promise<HardwareInfo> {
  let freeDiskGb = 0;
  try {
    const s = await statfs(modelsDir);
    freeDiskGb = (s.bavail * s.bsize) / GB;
  } catch {
    // the folder may not exist yet: ask its parent
    try {
      const s = await statfs(modelsDir.replace(/[\\/][^\\/]*$/, '') || '.');
      freeDiskGb = (s.bavail * s.bsize) / GB;
    } catch {
      freeDiskGb = 0;
    }
  }
  let gpu: GpuKind = null;
  let vramGb = 0;
  try {
    const g = await engine?.gpu();
    if (g) ({ gpu, vramGb } = g);
  } catch {
    // no usable engine: processor only
  }
  return { platform: process.platform, arch: process.arch, ramGb: totalmem() / GB, freeDiskGb, gpu, vramGb };
}

export const cpuCount = () => cpus().length;

// --- The real engine ------------------------------------------------------------------------

type Llama = import('node-llama-cpp').Llama;
type LlamaModel = import('node-llama-cpp').LlamaModel;
type LlamaContext = import('node-llama-cpp').LlamaContext;

export class LlamaEngine implements LocalEngine {
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private loaded: { path: string; contextSize: number } | null = null;
  /** One generation at a time: the model has one conversation slot. */
  private queue: Promise<unknown> = Promise.resolve();

  private async engine(): Promise<Llama> {
    if (this.llama) return this.llama;
    const { getLlama, LlamaLogLevel } = await import('node-llama-cpp');
    // Prebuilt binaries only: never try to compile on the user's computer.
    this.llama = await getLlama({ build: 'never', skipDownload: true, progressLogs: false, logLevel: LlamaLogLevel.error });
    return this.llama;
  }

  /** GPU type and video memory as the engine sees them (for the recommendation). */
  async gpu(): Promise<{ gpu: GpuKind; vramGb: number }> {
    const llama = await this.engine();
    const kind = llama.gpu === 'metal' || llama.gpu === 'cuda' || llama.gpu === 'vulkan' ? llama.gpu : null;
    if (!kind) return { gpu: null, vramGb: 0 };
    if (kind === 'metal') return { gpu: 'metal', vramGb: 0 };
    const v = await llama.getVramState();
    return { gpu: kind, vramGb: v.total / GB };
  }

  async load(modelPath: string, contextSize: number): Promise<void> {
    if (this.loaded?.path === modelPath && this.loaded.contextSize === contextSize && this.context) return;
    await this.unload();
    const llama = await this.engine();
    this.model = await llama.loadModel({ modelPath, gpuLayers: 'auto' });
    // Fit the context to the memory left: not below 4096 tokens, not above what was asked for.
    this.context = await this.model.createContext({ contextSize: { min: Math.min(4096, contextSize), max: contextSize } });
    this.loaded = { path: modelPath, contextSize };
  }

  contextTokens(): number {
    return this.context?.contextSize ?? 0;
  }

  countTokens(text: string): number {
    return this.model ? this.model.tokenize(text).length : Math.ceil(text.length / 3);
  }

  generate(req: EngineRequest): Promise<EngineResult> {
    const run = this.queue.then(() => this.run(req));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async run(req: EngineRequest): Promise<EngineResult> {
    const { LlamaChat, QwenChatWrapper } = await import('node-llama-cpp');
    if (!this.llama || !this.model || !this.context) throw new Error('The offline model is not loaded.');
    const sequence = this.context.getSequence();
    const chat = new LlamaChat({ contextSequence: sequence, chatWrapper: new QwenChatWrapper({ thoughts: 'discourage' }) });
    try {
      const history = req.items.map((i) =>
        i.type === 'model'
          ? { type: 'model' as const, response: [...(i.text ? [i.text] : []), ...i.calls.map((c) => ({ type: 'functionCall' as const, name: c.name, params: c.params, result: c.result }))] }
          : i,
      );
      const base = { maxTokens: req.maxTokens, temperature: req.temperature, signal: req.signal, budgets: { thoughtTokens: 0 } };
      let res;
      if (req.tools?.length) {
        const functions = Object.fromEntries(req.tools.map((t) => [t.name, { description: t.description, params: toGbnfSchema(t.parameters) }]));
        res = await chat.generateResponse(history, { ...base, functions: functions as never });
      } else if (req.jsonSchema) {
        const grammar = await this.llama.createGrammarForJsonSchema(toGbnfSchema(req.jsonSchema) as never);
        res = await chat.generateResponse(history, { ...base, grammar });
      } else {
        res = await chat.generateResponse(history, base);
      }
      const found = (res as { functionCalls?: { functionName: string; params: unknown }[] }).functionCalls ?? [];
      const calls = found.map((c) => ({ name: c.functionName, params: (typeof c.params === 'object' && c.params !== null ? c.params : {}) as Record<string, unknown> }));
      const stop = calls.length ? 'tool_use' : res.metadata.stopReason === 'maxTokens' ? 'max_tokens' : 'end';
      return { text: res.response, calls, stop };
    } finally {
      chat.dispose({ disposeSequence: true });
    }
  }

  private async unload() {
    await this.context?.dispose();
    await this.model?.dispose();
    this.context = null;
    this.model = null;
    this.loaded = null;
  }

  async dispose(): Promise<void> {
    await this.unload();
    await this.llama?.dispose();
    this.llama = null;
  }
}
