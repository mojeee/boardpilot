// Google Gemini through generateContent with the built-in fetch (no extra dependency).
// Docs: https://ai.google.dev/api/generate-content, https://ai.google.dev/gemini-api/docs/function-calling,
//       https://ai.google.dev/gemini-api/docs/structured-output, https://ai.google.dev/api/models.
// The model's own content (including thought signatures) is replayed unchanged on the next turn.
// Web search: https://ai.google.dev/gemini-api/docs/google-search (tool `google_search`; answers carry
// groundingMetadata.groundingChunks[].web {uri, title}). Combining built-in tools with function
// calling is a Gemini 3 preview feature (https://ai.google.dev/gemini-api/docs/tool-combination),
// so search is only sent on requests without our own tools. Structured output together with search
// is supported on Gemini 3 (https://ai.google.dev/gemini-api/docs/structured-output); older models
// that refuse it are retried without JSON mode, then without search.

import type { AiModelInfo, AiProviderId } from '@shared/ai';
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
  type WebCitation,
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

export interface GeminiGrounding {
  groundingChunks?: { web?: { uri?: string; title?: string } }[];
  webSearchQueries?: string[];
}

export interface GeminiResponse {
  candidates?: { content?: GeminiContent; finishReason?: string; groundingMetadata?: GeminiGrounding }[];
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

/** Neutral messages to Gemini contents. Consecutive user-side turns are merged. Raw model turns
 *  are replayed only when they came from `provider` (the free demo is Gemini under another id). */
export function toGeminiContents(messages: ChatMessage[], provider: AiProviderId = 'gemini'): GeminiContent[] {
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
    } else if (m.raw?.provider === provider && typeof m.raw.data === 'object' && m.raw.data !== null) {
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

/** Web pages the answer was grounded on, without duplicates. Only http(s) links are kept. */
export function geminiCitations(g: GeminiGrounding | undefined): WebCitation[] {
  const out: WebCitation[] = [];
  for (const c of g?.groundingChunks ?? []) {
    const url = c.web?.uri ?? '';
    if (!/^https?:\/\//i.test(url) || out.some((x) => x.url === url)) continue;
    out.push({ url, title: (c.web?.title ?? '').trim() || new URL(url).hostname });
  }
  return out;
}

export function parseGeminiResponse(res: GeminiResponse, provider: AiProviderId = 'gemini'): ChatResponse {
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
  const citations = geminiCitations(cand?.groundingMetadata);
  return { text, toolCalls, stop, raw: { provider, data: { role: 'model', parts } satisfies GeminiContent }, ...(citations.length ? { citations } : {}) };
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
  readonly id: AiProviderId = 'gemini';
  /** "model|tools" or "model|search" combinations that rejected JSON output (older than Gemini 3). */
  private readonly noJsonWith = new Set<string>();
  /** Models that rejected the google_search tool. */
  private readonly noSearch = new Set<string>();

  constructor(private readonly apiKey: string) {}

  protected url(model: string): string {
    return `${BASE}/models/${encodeURIComponent(model)}:generateContent`;
  }

  protected headers(): Record<string, string> {
    return { 'x-goog-api-key': this.apiKey };
  }

  protected maxOutput(requested: number): number {
    return requested;
  }

  protected body(req: ChatRequest, withJson: boolean, withSearch: boolean): Record<string, unknown> {
    const generationConfig: Record<string, unknown> = { maxOutputTokens: this.maxOutput(req.maxTokens) };
    if (req.jsonSchema && withJson) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseJsonSchema = sanitizeForGemini(req.jsonSchema.schema);
    }
    const body: Record<string, unknown> = { contents: toGeminiContents(req.messages, this.id), generationConfig };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    if (req.tools?.length) body.tools = toGeminiTools(req.tools);
    else if (withSearch) body.tools = [{ google_search: {} }];
    return body;
  }

  /** True when this request would carry the google_search tool. */
  protected wantsSearch(req: ChatRequest): boolean {
    return Boolean(req.webSearch) && !req.tools?.length && !this.noSearch.has(req.model);
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const url = this.url(req.model);
    let withSearch = this.wantsSearch(req);
    let withJson = true;
    const mixKey = () => `${req.model}|${req.tools?.length ? 'tools' : 'search'}`;
    const mixed = () => Boolean(req.jsonSchema && (req.tools?.length || withSearch));
    if (mixed() && this.noJsonWith.has(mixKey())) withJson = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await httpJson<GeminiResponse>(this.id, url, { headers: this.headers(), body: this.body(req, withJson, withSearch), timeoutMs: req.timeoutMs });
        return parseGeminiResponse(res, this.id);
      } catch (e) {
        if (!(e instanceof ProviderError && e.kind === 'bad_request')) throw e;
        // Older models refuse JSON mode together with tools or search; the prompt still asks for JSON.
        if (withJson && mixed() && /mime|json|function call|tool|search|grounding/i.test(e.message)) {
          this.noJsonWith.add(mixKey());
          withJson = false;
          continue;
        }
        // A model without Search grounding: answer from the page alone.
        if (withSearch && /search|grounding|tool/i.test(e.message)) {
          this.noSearch.add(req.model);
          withSearch = false;
          withJson = true;
          continue;
        }
        throw e;
      }
    }
    throw new ProviderError('bad_request', this.id, 'The request was rejected in every form that was tried.');
  }

  complete(req: CompleteRequest): Promise<ChatResponse> {
    return this.chat(completeAsChat(req));
  }

  async listModels(timeoutMs = 20_000): Promise<AiModelInfo[]> {
    const all: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] = [];
    let pageToken = '';
    for (let i = 0; i < 5; i++) {
      const q = `pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const res = await httpJson<{ models?: typeof all; nextPageToken?: string }>(this.id, `${BASE}/models?${q}`, { headers: this.headers(), timeoutMs });
      all.push(...(res.models ?? []));
      if (!res.nextPageToken) break;
      pageToken = res.nextPageToken;
    }
    return filterGeminiModels(all);
  }
}
