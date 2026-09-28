// The AI assistant. Runs only in the main process; the renderer never sees the API key.
// Honesty rules are in the system prompt and enforced again in code (see enforceHonesty).

import Anthropic from '@anthropic-ai/sdk';
import type {
  AiContext,
  AiReply,
  AiSource,
  Confidence,
  PhotoRecognition,
  Result,
  TargetRef,
} from '@shared/types';
import { PARTS, getBoard } from '@shared/board';
import type { HardwareHub } from '../hardware/hub';
import { MEASUREMENT_TOOLS, TOOLS, runTool, type ToolTurnState } from './tools';
import { buildContextBlock, SYSTEM_PROMPT } from './prompt';

export const MAIN_MODEL = 'claude-sonnet-5';
export const FAST_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOOL_ROUNDS = 8;

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    confidence: { type: 'string', enum: ['measured', 'documented', 'suggestion'] },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['measurement', 'datasheet', 'library', 'user'] },
          label: { type: 'string' },
        },
        required: ['kind', 'label'],
        additionalProperties: false,
      },
    },
    highlight: { type: 'array', items: { type: 'string' } },
    nextOptions: { type: 'array', items: { type: 'string' } },
  },
  required: ['message', 'confidence', 'sources', 'highlight', 'nextOptions'],
  additionalProperties: false,
};

function aiOff<T>(): Result<T> {
  return {
    ok: false,
    error: {
      code: 'ai_off',
      humanMessage: 'The AI assistant is off because no API key is set.',
      hint: 'Add ANTHROPIC_API_KEY=... to a file named .env.local in the project folder, then restart the app. Everything else works without it.',
    },
  };
}

function apiError<T>(e: unknown): Result<T> {
  if (e instanceof Anthropic.AuthenticationError) {
    return { ok: false, error: { code: 'ai_auth', humanMessage: 'The API key was not accepted.', hint: 'Check ANTHROPIC_API_KEY in .env.local and restart the app.' } };
  }
  if (e instanceof Anthropic.RateLimitError) {
    return { ok: false, error: { code: 'ai_rate', humanMessage: 'The AI service is busy right now.', hint: 'Wait a minute and ask again.' } };
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return { ok: false, error: { code: 'ai_offline', humanMessage: 'The app could not reach the AI service.', hint: 'Check your internet connection. Measurements and checks still work offline.' } };
  }
  if (e instanceof Anthropic.APIError) {
    return { ok: false, error: { code: 'ai_error', humanMessage: `The AI service returned an error (${e.status ?? '?'}).`, hint: 'Try again in a moment.' } };
  }
  return { ok: false, error: { code: 'ai_error', humanMessage: `The assistant failed: ${e instanceof Error ? e.message : String(e)}`, hint: 'Try again.' } };
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

/** A claim is "measured" only if a measurement happened this turn or is in the session log. */
export function enforceHonesty(reply: AiReply, measuredThisTurn: boolean, logHasMeasurements: boolean): AiReply {
  let confidence: Confidence = reply.confidence;
  let sources: AiSource[] = reply.sources;
  if (!measuredThisTurn && !logHasMeasurements) {
    if (confidence === 'measured') confidence = 'suggestion';
    sources = sources.filter((s) => s.kind !== 'measurement');
  }
  if (confidence === 'documented' && !sources.some((s) => s.kind === 'datasheet' || s.kind === 'library')) {
    confidence = 'suggestion';
  }
  return { ...reply, confidence, sources };
}

export class Assistant {
  private client: Anthropic | null;
  /** Conversation per session, append-only. */
  private history: Anthropic.MessageParam[] = [];

  constructor(
    private readonly hub: HardwareHub,
    apiKey: string | undefined,
  ) {
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  get enabled() {
    return this.client !== null;
  }

  reset() {
    this.history = [];
  }

  async ask(question: string, ctx: AiContext): Promise<Result<AiReply>> {
    const client = this.client;
    if (!client) return aiOff();
    const turn: ToolTurnState = { highlight: [], calls: [] };
    const board = getBoard(ctx.scene.board);
    const userContent: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: buildContextBlock(board, ctx) },
      { type: 'text', text: question },
    ];
    const messages: Anthropic.MessageParam[] = [...this.history, { role: 'user', content: userContent }];

    try {
      let final: Anthropic.Message | null = null;
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await client.messages.create({
          model: MAIN_MODEL,
          max_tokens: 16000,
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          tools: TOOLS,
          messages,
          output_config: { format: { type: 'json_schema', schema: REPLY_SCHEMA } },
        });
        if (response.stop_reason === 'refusal') {
          return { ok: false, error: { code: 'ai_refused', humanMessage: 'The assistant could not answer that request.', hint: 'Rephrase the question about your board or wiring.' } };
        }
        messages.push({ role: 'assistant', content: response.content });
        if (response.stop_reason !== 'tool_use') {
          final = response;
          break;
        }
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          const r = await runTool(block.name, block.input, this.hub, ctx.log, turn);
          turn.calls.push({ name: block.name, input: block.input, ok: !r.isError });
          results.push({ type: 'tool_result', tool_use_id: block.id, content: r.content, is_error: r.isError });
        }
        messages.push({ role: 'user', content: results });
        if (turn.ask || turn.pendingWrite) {
          // The UI takes over; ask for the final structured reply without more tool calls.
          continue;
        }
      }
      if (!final) {
        return { ok: false, error: { code: 'ai_loop', humanMessage: 'The assistant needed too many steps.', hint: 'Ask a more specific question.' } };
      }
      const text = final.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      const parsed = parseJson<AiReply>(text);
      this.history = messages;
      if (!parsed || typeof parsed.message !== 'string') {
        return {
          ok: true,
          value: { message: text || 'No answer.', confidence: 'suggestion', sources: [], highlight: turn.highlight, nextOptions: [], toolCalls: turn.calls },
        };
      }
      const measuredThisTurn = turn.calls.some((c) => c.ok && MEASUREMENT_TOOLS.has(c.name));
      const logHasMeasurements = ctx.log.some((e) => e.source?.startsWith('measured'));
      const highlight = [...new Set([...turn.highlight, ...parsed.highlight])].filter((t): t is TargetRef =>
        /^(pin|wire|part):.+/.test(t),
      );
      const reply = enforceHonesty(
        {
          ...parsed,
          highlight,
          nextOptions: turn.ask ? turn.ask.options : parsed.nextOptions,
          message: turn.ask && !parsed.message.includes(turn.ask.question) ? `${parsed.message}\n\n${turn.ask.question}` : parsed.message,
          toolCalls: turn.calls,
          pendingWrite: turn.pendingWrite,
        },
        measuredThisTurn,
        logHasMeasurements,
      );
      return { ok: true, value: reply };
    } catch (e) {
      return apiError(e);
    }
  }

  /** Recognize a part from a photo. The result is always a suggestion the user must confirm. */
  async recognizePart(imageBase64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<Result<PhotoRecognition>> {
    const client = this.client;
    if (!client) return aiOff();
    const library = Object.values(PARTS).map((p) => ({ id: p.id, name: p.name, keywords: p.keywords }));
    const schema = {
      type: 'object',
      properties: {
        partId: { type: ['string', 'null'], description: 'id from the library, or null if none match' },
        name: { type: 'string' },
        reasoning: { type: 'string', description: 'what in the photo supports this, e.g. printed text or pin labels' },
        alternatives: { type: 'array', items: { type: 'string' } },
      },
      required: ['partId', 'name', 'reasoning', 'alternatives'],
      additionalProperties: false,
    };
    try {
      const response = await client.messages.create({
        model: MAIN_MODEL,
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
              {
                type: 'text',
                text:
                  'Identify the electronics part or breakout board in this photo. Match it to one entry of this library if possible:\n' +
                  JSON.stringify(library) +
                  '\nBase the answer on visible evidence only (silkscreen text, chip markings, pin labels, shape). If a BME280 and BMP280 cannot be told apart from the photo, say so in reasoning and list the other as an alternative.',
              },
            ],
          },
        ],
        output_config: { format: { type: 'json_schema', schema } },
      });
      const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      const parsed = parseJson<Omit<PhotoRecognition, 'confidence'>>(text);
      if (!parsed) return { ok: false, error: { code: 'ai_parse', humanMessage: 'The assistant could not read the photo.', hint: 'Try a sharper photo with the printed text visible, or pick the part from the list.' } };
      const partId = parsed.partId && PARTS[parsed.partId] ? parsed.partId : null;
      return { ok: true, value: { ...parsed, partId, confidence: 'suggestion' } };
    } catch (e) {
      return apiError(e);
    }
  }

  /** Map free text to one of the given options (flows on Home, answers in question steps). Fast model. */
  async classify(text: string, options: { id: string; label: string }[]): Promise<Result<{ optionId: string | null; reason: string }>> {
    const client = this.client;
    if (!client) return aiOff();
    const schema = {
      type: 'object',
      properties: {
        optionId: { type: ['string', 'null'] },
        reason: { type: 'string', description: 'one short sentence for the user' },
      },
      required: ['optionId', 'reason'],
      additionalProperties: false,
    };
    try {
      const response = await client.messages.create({
        model: FAST_MODEL,
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content:
              `A beginner working with an ESP32 board wrote: "${text}"\n` +
              `Pick the option that best matches what they need, or null if none fits:\n${JSON.stringify(options)}`,
          },
        ],
        output_config: { format: { type: 'json_schema', schema } },
      });
      const out = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      const parsed = parseJson<{ optionId: string | null; reason: string }>(out);
      if (!parsed) return { ok: true, value: { optionId: null, reason: 'I could not match that to an option.' } };
      if (parsed.optionId && !options.some((o) => o.id === parsed.optionId)) parsed.optionId = null;
      return { ok: true, value: parsed };
    } catch (e) {
      return apiError(e);
    }
  }
}
