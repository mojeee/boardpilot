// Provider-neutral shapes for chat with tool use, one-shot completions and model lists.
// Each provider (anthropic.ts, openai.ts, gemini.ts) converts these to and from its own API.

import type { AiModelInfo, AiProviderId } from '@shared/ai';

export type JsonSchema = Record<string, unknown>;

/** A function the model may call. `parameters` is a JSON Schema for an object. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export type InputPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: ImageMediaType; data: string }
  | { type: 'pdf'; data: string; filename?: string };

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  name: string;
  content: string;
  isError: boolean;
}

/** The provider's own record of an assistant turn, replayed unchanged to the same provider
 *  (keeps Gemini thought signatures and OpenAI reasoning items intact). */
export interface RawTurn {
  provider: AiProviderId;
  data: unknown;
  /** Model that produced it; raw turns are replayed only to the same provider and model. */
  model?: string;
}

export type ChatMessage =
  | { role: 'user'; content: InputPart[] }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[]; raw?: RawTurn }
  | { role: 'tool'; results: ToolResult[] };

export interface StructuredOutput {
  name: string;
  schema: JsonSchema;
}

export interface ChatRequest {
  model: string;
  system?: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  jsonSchema?: StructuredOutput;
  maxTokens: number;
  /** Mark the system prompt for caching where the provider needs it explicitly (Anthropic). */
  cacheSystem?: boolean;
  timeoutMs?: number;
}

export type StopReason = 'end' | 'tool_use' | 'max_tokens' | 'refusal';

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  stop: StopReason;
  raw: RawTurn;
}

export interface CompleteRequest {
  model: string;
  parts: InputPart[];
  jsonSchema?: StructuredOutput;
  maxTokens: number;
  timeoutMs?: number;
}

export interface AiProvider {
  readonly id: AiProviderId;
  chat(req: ChatRequest): Promise<ChatResponse>;
  complete(req: CompleteRequest): Promise<ChatResponse>;
  listModels(timeoutMs?: number): Promise<AiModelInfo[]>;
}

export type ProviderErrorKind = 'auth' | 'quota' | 'rate' | 'offline' | 'timeout' | 'model' | 'bad_request' | 'server' | 'refused';

/** Typed error thrown by providers; mapped to plain language in errors.ts. */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly provider: AiProviderId,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export const DEFAULT_TIMEOUT_MS = 120_000;

/** Shared by all providers: a one-shot request is a chat with one user message. */
export function completeAsChat(req: CompleteRequest): ChatRequest {
  return {
    model: req.model,
    messages: [{ role: 'user', content: req.parts }],
    jsonSchema: req.jsonSchema,
    maxTokens: req.maxTokens,
    timeoutMs: req.timeoutMs,
  };
}

/** Parse tool arguments that arrive as a JSON string; anything that is not an object becomes {}. */
export function parseArgs(raw: unknown): Record<string, unknown> {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
