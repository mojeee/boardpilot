// OpenAI through the Responses API with the built-in fetch (no extra dependency).
// Docs: https://developers.openai.com/api/docs/guides/function-calling,
//       https://developers.openai.com/api/docs/guides/structured-outputs,
//       https://developers.openai.com/api/docs/guides/reasoning (pass back reasoning items).
// We send store:false, so every turn carries the full input; reasoning items come back with
// encrypted_content and are replayed unchanged, as the reasoning guide asks.

import type { AiModelInfo } from '@shared/ai';
import { httpJson } from './http';
import { isStrictCompatible } from './schema';
import {
  completeAsChat,
  parseArgs,
  ProviderError,
  type AiProvider,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type CompleteRequest,
  type InputPart,
  type StructuredOutput,
  type ToolCall,
  type ToolSpec,
} from './types';

const BASE = 'https://api.openai.com/v1';

type OpenAiContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' }
  | { type: 'input_file'; filename: string; file_data: string };

export type OpenAiInputItem =
  | { role: 'user' | 'assistant'; content: string | OpenAiContent[] }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }
  | { type: 'reasoning'; [k: string]: unknown };

/** Output items as the API returns them (only the fields we read). */
export interface OpenAiOutputItem {
  type: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: { type: string; text?: string; refusal?: string }[];
  [k: string]: unknown;
}

export interface OpenAiResponse {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: OpenAiOutputItem[];
}

function toContent(parts: InputPart[]): OpenAiContent[] {
  return parts.map((p): OpenAiContent => {
    if (p.type === 'text') return { type: 'input_text', text: p.text };
    if (p.type === 'image') return { type: 'input_image', image_url: `data:${p.mediaType};base64,${p.data}`, detail: 'auto' };
    return { type: 'input_file', filename: p.filename ?? 'datasheet.pdf', file_data: `data:application/pdf;base64,${p.data}` };
  });
}

/** Replay our own earlier output items: reasoning unchanged, messages as plain assistant text,
 *  function calls without their server item id (not stored, since store:false). */
function replayOutput(items: OpenAiOutputItem[]): OpenAiInputItem[] {
  const out: OpenAiInputItem[] = [];
  for (const it of items) {
    if (it.type === 'reasoning') out.push({ ...it, type: 'reasoning' });
    else if (it.type === 'function_call' && it.call_id && it.name) out.push({ type: 'function_call', call_id: it.call_id, name: it.name, arguments: it.arguments ?? '{}' });
    else if (it.type === 'message') {
      const text = (it.content ?? []).map((c) => (c.type === 'output_text' ? (c.text ?? '') : '')).join('');
      if (text) out.push({ role: 'assistant', content: text });
    }
  }
  return out;
}

export function toOpenAiInput(messages: ChatMessage[]): OpenAiInputItem[] {
  const out: OpenAiInputItem[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: toContent(m.content) });
    else if (m.role === 'tool') {
      for (const r of m.results) out.push({ type: 'function_call_output', call_id: r.callId, output: r.isError ? `Error: ${r.content}` : r.content });
    } else if (m.raw?.provider === 'openai' && Array.isArray(m.raw.data)) {
      out.push(...replayOutput(m.raw.data as OpenAiOutputItem[]));
    } else {
      if (m.text) out.push({ role: 'assistant', content: m.text });
      for (const c of m.toolCalls) out.push({ type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.input) });
    }
  }
  return out;
}

export function toOpenAiTools(tools: ToolSpec[]) {
  // strict needs every property required; some tools have optional inputs, so strict only when valid.
  return tools.map((t) => ({ type: 'function' as const, name: t.name, description: t.description, parameters: t.parameters, strict: isStrictCompatible(t.parameters) }));
}

export function toOpenAiFormat(s: StructuredOutput) {
  return { format: { type: 'json_schema' as const, name: s.name, schema: s.schema, strict: isStrictCompatible(s.schema) } };
}

export function parseOpenAiResponse(res: OpenAiResponse): ChatResponse {
  const output = res.output ?? [];
  let text = '';
  let refused = false;
  const toolCalls: ToolCall[] = [];
  for (const it of output) {
    if (it.type === 'message') {
      for (const c of it.content ?? []) {
        if (c.type === 'output_text') text += c.text ?? '';
        else if (c.type === 'refusal') refused = true;
      }
    } else if (it.type === 'function_call' && it.name) {
      toolCalls.push({ id: it.call_id ?? it.id ?? `call_${toolCalls.length}`, name: it.name, input: parseArgs(it.arguments) });
    }
  }
  const stop = refused && !text
    ? 'refusal'
    : toolCalls.length
      ? 'tool_use'
      : res.status === 'incomplete' && res.incomplete_details?.reason === 'max_output_tokens'
        ? 'max_tokens'
        : res.status === 'incomplete' && res.incomplete_details?.reason === 'content_filter'
          ? 'refusal'
          : 'end';
  return { text, toolCalls, stop, raw: { provider: 'openai', data: output } };
}

/** Chat models only: drops embeddings, audio, image, moderation and similar models. */
export function filterOpenAiModels(data: { id: string; created?: number }[]): AiModelInfo[] {
  return data
    .filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !/(audio|realtime|tts|transcribe|image|embedding|search|moderation|instruct|dall-e|whisper)/.test(m.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id))
    .map((m) => ({ id: m.id, label: m.id }));
}

export class OpenAiProvider implements AiProvider {
  readonly id = 'openai' as const;
  constructor(private readonly apiKey: string) {}

  private headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: req.model,
      input: toOpenAiInput(req.messages),
      max_output_tokens: req.maxTokens,
      // store:false returns reasoning items with encrypted_content by default (reasoning guide).
      store: false,
    };
    if (req.system) body.instructions = req.system;
    if (req.tools?.length) body.tools = toOpenAiTools(req.tools);
    if (req.jsonSchema) body.text = toOpenAiFormat(req.jsonSchema);
    const res = await httpJson<OpenAiResponse>('openai', `${BASE}/responses`, { headers: this.headers(), body, timeoutMs: req.timeoutMs });
    if (res.status === 'failed') throw new ProviderError('server', 'openai', 'The response failed');
    return parseOpenAiResponse(res);
  }

  complete(req: CompleteRequest): Promise<ChatResponse> {
    return this.chat(completeAsChat(req));
  }

  async listModels(timeoutMs = 20_000): Promise<AiModelInfo[]> {
    const res = await httpJson<{ data?: { id: string; created?: number }[] }>('openai', `${BASE}/models`, { headers: this.headers(), timeoutMs });
    return filterOpenAiModels(res.data ?? []);
  }
}
