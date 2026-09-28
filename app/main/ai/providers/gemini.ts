// Google Gemini through generateContent with the built-in fetch (no extra dependency).
// Docs: https://ai.google.dev/api/generate-content, https://ai.google.dev/gemini-api/docs/function-calling,
//       https://ai.google.dev/gemini-api/docs/structured-output, https://ai.google.dev/api/models.
// The model's own content (including thought signatures) is replayed unchanged on the next turn.

import type { AiModelInfo } from '@shared/ai';
import { httpJson } from './http';
import { sanitizeForGemini } from './schema';
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
  type StopReason,
  type ToolCall,
  type ToolSpec,
} from './types';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Prefix for call ids we made up because the model sent none; never sent back to Gemini. */
const LOCAL_ID = 'local-';

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiResponse {
  candidates?: { content?: GeminiContent; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

function toParts(parts: InputPart[]): GeminiPart[] {
  return parts.map((p): GeminiPart => {
    if (p.type === 'text') return { text: p.text };
    if (p.type === 'image') return { inlineData: { mimeType: p.mediaType, data: p.data } };
    return { inlineData: { mimeType: 'application/pdf', data: p.data } };
  });
}

function toolResponse(content: string, isError: boolean): Record<string, unknown> {
  let value: unknown = content;
  try {
    value = JSON.parse(content);
  } catch {
    // plain text result
  }
  return isError ? { error: value } : { output: value };
}

/** Neutral messages to Gemini contents. Consecutive user-side turns are merged. */
export function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  const pushUser = (parts: GeminiPart[]) => {
    const last = out[out.length - 1];
    if (last && last.role === 'user') last.parts.push(...parts);
    else out.push({ role: 'user', parts });
  };
  for (const m of messages) {
    if (m.role === 'user') pushUser(toParts(m.content));
    else if (m.role === 'tool') {
      pushUser(
        m.results.map((r) => ({
          functionResponse: { ...(r.callId.startsWith(LOCAL_ID) ? {} : { id: r.callId }), name: r.name, response: toolResponse(r.content, r.isError) },
        })),
      );
    } else if (m.raw?.provider === 'gemini' && typeof m.raw.data === 'object' && m.raw.data !== null) {
      const c = m.raw.data as GeminiContent;
      out.push({ role: 'model', parts: c.parts ?? [] });
    } else {
      const parts: GeminiPart[] = [];
      if (m.text) parts.push({ text: m.text });
      for (const c of m.toolCalls) parts.push({ functionCall: { ...(c.id.startsWith(LOCAL_ID) ? {} : { id: c.id }), name: c.name, args: c.input } });
      out.push({ role: 'model', parts: parts.length ? parts : [{ text: '…' }] });
    }
  }
  return out;
}

export function toGeminiTools(tools: ToolSpec[]) {
  return [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: sanitizeForGemini(t.parameters) })) }];
}

const BLOCKED = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY']);

export function parseGeminiResponse(res: GeminiResponse): ChatResponse {
  const cand = res.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  let text = '';
  const toolCalls: ToolCall[] = [];
  for (const p of parts) {
    if (p.functionCall?.name) {
      toolCalls.push({ id: p.functionCall.id || `${LOCAL_ID}${toolCalls.length}`, name: p.functionCall.name, input: parseArgs(p.functionCall.args ?? {}) });
    } else if (typeof p.text === 'string' && !p.thought) text += p.text;
  }
  const reason = cand?.finishReason ?? '';
  let stop: StopReason = 'end';
  if (toolCalls.length) stop = 'tool_use';
  else if (res.promptFeedback?.blockReason || !cand || BLOCKED.has(reason)) stop = 'refusal';
  else if (reason === 'MAX_TOKENS') stop = 'max_tokens';
  return { text, toolCalls, stop, raw: { provider: 'gemini', data: { role: 'model', parts } satisfies GeminiContent } };
}

/** Models that can generate text (generateContent), newest names first. */
export function filterGeminiModels(models: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]): AiModelInfo[] {
  return models
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }))
    .filter((m) => /^gemini-/.test(m.id) && !/(tts|embedding|image|audio|live|transcribe)/.test(m.id))
    .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}

export class GeminiProvider implements AiProvider {
  readonly id = 'gemini' as const;
  /** Models that rejected JSON output together with function calling (older than Gemini 3). */
  private readonly noJsonWithTools = new Set<string>();

  constructor(private readonly apiKey: string) {}

  private headers() {
    return { 'x-goog-api-key': this.apiKey };
  }

  private body(req: ChatRequest, withJson: boolean) {
    const generationConfig: Record<string, unknown> = { maxOutputTokens: req.maxTokens };
    if (req.jsonSchema && withJson) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseJsonSchema = sanitizeForGemini(req.jsonSchema.schema);
    }
    const body: Record<string, unknown> = { contents: toGeminiContents(req.messages), generationConfig };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    if (req.tools?.length) body.tools = toGeminiTools(req.tools);
    return body;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const url = `${BASE}/models/${encodeURIComponent(req.model)}:generateContent`;
    const both = Boolean(req.jsonSchema && req.tools?.length);
    const withJson = !(both && this.noJsonWithTools.has(req.model));
    try {
      return parseGeminiResponse(await httpJson<GeminiResponse>('gemini', url, { headers: this.headers(), body: this.body(req, withJson), timeoutMs: req.timeoutMs }));
    } catch (e) {
      // Older models refuse JSON mode together with tools; the system prompt still asks for JSON.
      if (both && withJson && e instanceof ProviderError && e.kind === 'bad_request' && /mime|json|function call|tool/i.test(e.message)) {
        this.noJsonWithTools.add(req.model);
        return parseGeminiResponse(await httpJson<GeminiResponse>('gemini', url, { headers: this.headers(), body: this.body(req, false), timeoutMs: req.timeoutMs }));
      }
      throw e;
    }
  }

  complete(req: CompleteRequest): Promise<ChatResponse> {
    return this.chat(completeAsChat(req));
  }

  async listModels(timeoutMs = 20_000): Promise<AiModelInfo[]> {
    const all: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] = [];
    let pageToken = '';
    for (let i = 0; i < 5; i++) {
      const q = `pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const res = await httpJson<{ models?: typeof all; nextPageToken?: string }>('gemini', `${BASE}/models?${q}`, { headers: this.headers(), timeoutMs });
      all.push(...(res.models ?? []));
      if (!res.nextPageToken) break;
      pageToken = res.nextPageToken;
    }
    return filterGeminiModels(all);
  }
}
