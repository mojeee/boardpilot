// Anthropic Claude through the official SDK. Keeps prompt caching on the system prompt and
// structured output through output_config.format (json_schema).

import Anthropic from '@anthropic-ai/sdk';
import type { AiModelInfo } from '@shared/ai';
import {
  completeAsChat,
  DEFAULT_TIMEOUT_MS,
  parseArgs,
  ProviderError,
  type AiProvider,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type CompleteRequest,
  type InputPart,
  type StopReason,
  type ToolSpec,
} from './types';

function toBlocks(parts: InputPart[]): Anthropic.ContentBlockParam[] {
  return parts.map((p): Anthropic.ContentBlockParam => {
    if (p.type === 'text') return { type: 'text', text: p.text };
    if (p.type === 'image') return { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } };
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.data } };
  });
}

/** Neutral messages to Anthropic messages. Consecutive user-side turns are merged. */
export function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  const pushUser = (blocks: Anthropic.ContentBlockParam[]) => {
    const last = out[out.length - 1];
    if (last && last.role === 'user' && Array.isArray(last.content)) last.content.push(...blocks);
    else out.push({ role: 'user', content: blocks });
  };
  for (const m of messages) {
    if (m.role === 'user') pushUser(toBlocks(m.content));
    else if (m.role === 'tool') {
      pushUser(m.results.map((r): Anthropic.ToolResultBlockParam => ({ type: 'tool_result', tool_use_id: r.callId, content: r.content, is_error: r.isError })));
    } else if (m.raw?.provider === 'anthropic' && Array.isArray(m.raw.data)) {
      out.push({ role: 'assistant', content: m.raw.data as Anthropic.ContentBlockParam[] });
    } else {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.text) blocks.push({ type: 'text', text: m.text });
      for (const c of m.toolCalls) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input });
      out.push({ role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: '…' }] });
    }
  }
  return out;
}

export function toAnthropicTools(tools: ToolSpec[]): Anthropic.Tool[] {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema }));
}

/** The parts of an Anthropic Message the app needs. */
export interface AnthropicLikeMessage {
  content: Anthropic.ContentBlock[];
  stop_reason: Anthropic.StopReason | null;
}

export function parseAnthropicResponse(msg: AnthropicLikeMessage): ChatResponse {
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const toolCalls = msg.content.flatMap((b) => (b.type === 'tool_use' ? [{ id: b.id, name: b.name, input: parseArgs(b.input) }] : []));
  const stop: StopReason =
    msg.stop_reason === 'refusal' ? 'refusal' : msg.stop_reason === 'tool_use' ? 'tool_use' : msg.stop_reason === 'max_tokens' ? 'max_tokens' : 'end';
  return { text, toolCalls, stop, raw: { provider: 'anthropic', data: msg.content } };
}

function mapError(e: unknown): unknown {
  if (e instanceof ProviderError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new ProviderError('auth', 'anthropic', msg, e.status);
  if (e instanceof Anthropic.RateLimitError) return new ProviderError('rate', 'anthropic', msg, 429);
  if (e instanceof Anthropic.NotFoundError) return new ProviderError('model', 'anthropic', msg, 404);
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError('timeout', 'anthropic', msg);
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError('offline', 'anthropic', msg);
  if (e instanceof Anthropic.APIError) {
    const status = e.status ?? 0;
    if (/credit balance|billing/i.test(msg)) return new ProviderError('quota', 'anthropic', msg, status);
    if (/model/i.test(msg) && /not found|invalid|does not exist/i.test(msg)) return new ProviderError('model', 'anthropic', msg, status);
    return new ProviderError(status >= 500 || status === 0 ? 'server' : 'bad_request', 'anthropic', msg, status);
  }
  return e;
}

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic' as const;
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: req.model,
      max_tokens: req.maxTokens,
      messages: toAnthropicMessages(req.messages),
    };
    if (req.system) params.system = [{ type: 'text', text: req.system, ...(req.cacheSystem ? { cache_control: { type: 'ephemeral' as const } } : {}) }];
    if (req.tools?.length) params.tools = toAnthropicTools(req.tools);
    if (req.jsonSchema) params.output_config = { format: { type: 'json_schema', schema: req.jsonSchema.schema } };
    try {
      const msg = await this.client.messages.create(params, { timeout: req.timeoutMs ?? DEFAULT_TIMEOUT_MS });
      return parseAnthropicResponse(msg);
    } catch (e) {
      throw mapError(e);
    }
  }

  complete(req: CompleteRequest): Promise<ChatResponse> {
    return this.chat(completeAsChat(req));
  }

  async listModels(timeoutMs = 20_000): Promise<AiModelInfo[]> {
    try {
      const out: AiModelInfo[] = [];
      for await (const m of this.client.models.list({ limit: 100 }, { timeout: timeoutMs })) out.push({ id: m.id, label: m.display_name || m.id });
      return out;
    } catch (e) {
      throw mapError(e);
    }
  }
}
