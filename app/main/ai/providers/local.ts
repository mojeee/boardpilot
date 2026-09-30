// The "Offline model" provider: a small model that runs on this computer (llama.cpp, see ../local).
// No key, no internet. It speaks the same interface as the cloud providers, with these limits:
// - text only: photos and PDFs are refused with a plain message;
// - a small context (about 8k tokens): the request is trimmed to fit (shorter context block first,
//   then the oldest turns);
// - a grammar can make the answer valid JSON, but not at the same time as tool calls: with both, the
//   model first answers with tools, and the final answer gets a second, JSON-only pass.

import { LOCAL_MODELS, getLocalModel, type LocalModelInfo } from '@shared/localModels';
import type { AiModelInfo, AiProviderId } from '@shared/ai';
import { t } from '@shared/i18n';
import type { EngineItem, EngineTool, LocalEngine } from '../local/engine';
import { compactContext } from './demo';
import { ProviderError, type AiProvider, type ChatMessage, type ChatRequest, type ChatResponse, type CompleteRequest, completeAsChat } from './types';

/** How long one answer may take on a slow computer. */
const LOCAL_TIMEOUT_MS = 300_000;
/** Tokens kept free for the answer when the request has to be trimmed. */
const MIN_ANSWER_TOKENS = 384;

export interface LocalDeps {
  engine: LocalEngine;
  /** The file of an installed model, or null. */
  pathOf(id: string): string | null;
}

/** Qwen 3 may still write its reasoning between <think> tags; the user never sees it. */
export function stripThinking(text: string): string {
  // Finished blocks, then one that never ended (the model ran out of tokens while thinking), then stray tags.
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '').replace(/<\/think>/g, '').trim();
}

function partsText(parts: ChatMessage & { role: 'user' }): string {
  return parts.content
    .map((p) => {
      if (p.type === 'text') return p.text;
      throw new ProviderError('bad_request', 'local', 'The offline model reads text only.');
    })
    .join('\n\n');
}

/** The conversation in the engine's plain shape: tool results are attached to the call that asked. */
export function toEngineItems(system: string | undefined, messages: ChatMessage[], compact: boolean): EngineItem[] {
  const items: EngineItem[] = [];
  if (system) items.push({ type: 'system', text: system });
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'user') {
      const text = partsText(m);
      items.push({ type: 'user', text: compact ? compactContext(text) : text });
    } else if (m.role === 'assistant') {
      const next = messages[i + 1];
      const results = next?.role === 'tool' ? next.results : [];
      items.push({
        type: 'model',
        text: stripThinking(m.text),
        calls: m.toolCalls.map((c) => ({ name: c.name, params: c.input, result: results.find((r) => r.callId === c.id)?.content ?? '' })),
      });
    }
    // 'tool' messages are folded into the assistant item before them.
  }
  return items;
}

const jsonLine = (schema: Record<string, unknown>) => `Reply only with JSON that follows this schema, and keep the meaning of your answer:\n${JSON.stringify(schema)}`;

export class LocalProvider implements AiProvider {
  readonly id: AiProviderId = 'local';
  private calls = 0;

  constructor(private readonly deps: LocalDeps) {}

  async listModels(): Promise<AiModelInfo[]> {
    return LOCAL_MODELS.filter((m) => this.deps.pathOf(m.id)).map((m) => ({ id: m.id, label: m.name }));
  }

  complete(req: CompleteRequest): Promise<ChatResponse> {
    return this.chat(completeAsChat(req));
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const info = getLocalModel(req.model);
    const path = info ? this.deps.pathOf(info.id) : null;
    if (!info || !path) throw new ProviderError('not_configured', 'local', 'No offline model is installed.');
    try {
      await this.deps.engine.load(path, info.contextSize);
    } catch (e) {
      throw new ProviderError('server', 'local', e instanceof Error ? e.message : String(e));
    }

    const tools: EngineTool[] | undefined = req.tools?.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
    const items = this.fit(req, info, tools);
    const maxTokens = Math.max(MIN_ANSWER_TOKENS, Math.min(req.maxTokens, this.budget(items, tools) ));

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), req.timeoutMs ?? LOCAL_TIMEOUT_MS);
    try {
      const gen = (itemsIn: EngineItem[], opts: { tools?: EngineTool[]; jsonSchema?: Record<string, unknown> }) =>
        this.deps.engine.generate({ items: itemsIn, tools: opts.tools, jsonSchema: opts.jsonSchema, maxTokens, temperature: opts.jsonSchema ? 0.1 : 0.3, signal: ctrl.signal });
      const schema = req.jsonSchema?.schema;
      let res = await gen(items, tools?.length ? { tools } : schema ? { jsonSchema: schema } : {});
      let text = stripThinking(res.text);
      if (!res.calls.length && tools?.length && schema) {
        // Tools and JSON cannot share one pass: turn the final answer into JSON with a second one.
        const second = await gen([...items, { type: 'model', text, calls: [] }, { type: 'user', text: jsonLine(schema) }], { jsonSchema: schema });
        res = second;
        text = stripThinking(second.text);
      }
      const toolCalls = res.calls.map((c) => ({ id: `local_${++this.calls}`, name: c.name, input: c.params }));
      const stop = toolCalls.length ? 'tool_use' : res.stop === 'max_tokens' ? 'max_tokens' : 'end';
      return { text, toolCalls, stop, raw: { provider: 'local', data: null, model: req.model } };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (ctrl.signal.aborted) throw new ProviderError('timeout', 'local', 'The offline model took too long to answer.');
      throw new ProviderError('server', 'local', e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
    }
  }

  /** Tokens the request takes: every item, plus the tool descriptions, with a margin for the chat template. */
  private used(items: EngineItem[], tools?: EngineTool[]): number {
    const text = items.map((i) => i.text + (i.type === 'model' ? i.calls.map((c) => JSON.stringify(c)).join('') : '')).join('\n') + (tools ? JSON.stringify(tools) : '');
    return Math.ceil(this.deps.engine.countTokens(text) * 1.15) + 64;
  }

  private budget(items: EngineItem[], tools?: EngineTool[]): number {
    return this.deps.engine.contextTokens() - this.used(items, tools);
  }

  /** Make the request fit: compact the context blocks, then drop the oldest turns. */
  private fit(req: ChatRequest, _info: LocalModelInfo, tools?: EngineTool[]): EngineItem[] {
    const limit = this.deps.engine.contextTokens() - MIN_ANSWER_TOKENS;
    let messages = req.messages;
    let items = toEngineItems(req.system, messages, false);
    if (this.used(items, tools) <= limit) return items;
    items = toEngineItems(req.system, messages, true);
    // Drop whole turns from the start (a user message and what followed it) until it fits.
    while (this.used(items, tools) > limit) {
      const firstUser = messages.findIndex((m, i) => i > 0 && m.role === 'user');
      if (firstUser === -1) break;
      messages = messages.slice(firstUser);
      items = toEngineItems(req.system, messages, true);
    }
    if (this.used(items, tools) > limit) {
      throw new ProviderError('too_large', 'local', t('The question and the project are too big for the offline model.'));
    }
    return items;
  }
}
