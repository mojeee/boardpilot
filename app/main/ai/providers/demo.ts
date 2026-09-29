// The "Free demo" provider: Gemini through BoardPilot's relay (site/functions/api/demo-ai.js).
// The relay holds a free-tier key and chooses the model, so this provider sends no key at all,
// only an X-BoardPilot-Client header. Requests are trimmed to the relay's limits (48 KB body,
// 2048 output tokens) before they are sent; photos and PDFs usually do not fit.

import { DEMO_AI_URL, DEMO_MAX_BODY_BYTES, DEMO_MAX_OUTPUT_TOKENS, type AiModelInfo, type AiProviderId } from '@shared/ai';
import { GeminiProvider } from './gemini';
import { httpJson } from './http';
import { ProviderError, type ChatMessage, type ChatRequest, type ChatResponse } from './types';

export interface DemoOptions {
  url: string;
  /** Sent as "BoardPilot/<version>". */
  clientVersion: string;
}

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** Relay settings from the environment, or null when the demo is switched off
 *  (BOARDPILOT_DEMO_AI_URL=off). Only https URLs (or http on localhost, for wrangler) are accepted. */
export function demoOptions(env: Record<string, string | undefined> = process.env): DemoOptions | null {
  const raw = env.BOARDPILOT_DEMO_AI_URL?.trim() ?? '';
  if (/^(off|false|0|no|none)$/i.test(raw)) return null;
  let url = DEMO_AI_URL;
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL_HOSTS.test(u.hostname))) url = u.toString();
    } catch {
      // keep the default relay
    }
  }
  const version = (env.BOARDPILOT_VERSION ?? env.npm_package_version ?? '').trim();
  return { url, clientVersion: /^[0-9][0-9A-Za-z.+-]{0,31}$/.test(version) ? version : '0.0.0' };
}

/** A shorter context block for the free demo: the first 60 lines of code, no app events. */
export function compactContext(text: string): string {
  let codeLines = 0;
  let cut = false;
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('Recent app events')) continue;
    if (/^\s*\d+\| /.test(line)) {
      if (++codeLines > 60) {
        if (!cut) out.push('… (the rest of the code is left out for the free demo)');
        cut = true;
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

const bytes = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;
const isContext = (text: string) => text.startsWith('<context>');

export class DemoProvider extends GeminiProvider {
  override readonly id: AiProviderId = 'demo';

  constructor(private readonly opts: DemoOptions) {
    super('');
  }

  protected override url(): string {
    return this.opts.url;
  }

  protected override headers(): Record<string, string> {
    return { 'X-BoardPilot-Client': `BoardPilot/${this.opts.clientVersion}` };
  }

  protected override maxOutput(requested: number): number {
    return Math.min(requested, DEMO_MAX_OUTPUT_TOKENS);
  }

  /** Shrink a request to the relay's body limit: first drop the context blocks of earlier
   *  questions, then the oldest turns. Throws `too_large` if even the last question does not fit. */
  fit(req: ChatRequest): ChatRequest {
    const size = (messages: ChatMessage[]) => bytes(this.body({ ...req, messages }, true, this.wantsSearch(req)));
    let messages = req.messages;
    if (size(messages) <= DEMO_MAX_BODY_BYTES) return req;
    const lastUser = messages.map((m) => m.role).lastIndexOf('user');
    messages = messages.map((m, i) =>
      m.role === 'user' && i !== lastUser ? { ...m, content: m.content.filter((p) => !(p.type === 'text' && isContext(p.text))) } : m,
    );
    // Drop whole exchanges from the front; a kept history always starts with a user question.
    while (size(messages) > DEMO_MAX_BODY_BYTES) {
      const next = messages.findIndex((m, i) => i > 0 && m.role === 'user');
      if (next < 0) break;
      messages = messages.slice(next);
    }
    // Still too big: shorten the project code and drop the app events in the last question's context
    // (the free demo gets less of the code; your own key gets all of it).
    if (size(messages) > DEMO_MAX_BODY_BYTES) {
      messages = messages.map((m, i) =>
        m.role === 'user' && i === messages.map((x) => x.role).lastIndexOf('user')
          ? { ...m, content: m.content.map((p) => (p.type === 'text' && isContext(p.text) ? { ...p, text: compactContext(p.text) } : p)) }
          : m,
      );
    }
    const final = size(messages);
    if (final > DEMO_MAX_BODY_BYTES) {
      throw new ProviderError(
        'too_large',
        this.id,
        `The request is ${Math.ceil(final / 1024)} KB; the free demo accepts up to ${DEMO_MAX_BODY_BYTES / 1024} KB.`,
        413,
      );
    }
    return { ...req, messages: messages.map((m) => (m.role === 'user' && m.content.length === 0 ? { ...m, content: [{ type: 'text', text: '…' }] } : m)) };
  }

  override async chat(req: ChatRequest): Promise<ChatResponse> {
    try {
      return await super.chat(this.fit(req));
    } catch (e) {
      throw relayError(e);
    }
  }

  /** The relay's health answer names the model it uses. */
  override async listModels(timeoutMs = 20_000): Promise<AiModelInfo[]> {
    try {
      const res = await httpJson<{ ok?: boolean; model?: unknown; configured?: unknown }>(this.id, this.opts.url, { headers: this.headers(), timeoutMs });
      if (res.configured === false) throw new ProviderError('not_configured', this.id, 'The relay has no key.', 503);
      const model = typeof res.model === 'string' && res.model ? res.model : 'gemini';
      return [{ id: model, label: `${model} (free demo)` }];
    } catch (e) {
      throw relayError(e);
    }
  }
}

/** Relay answers mapped to what they mean for the user. */
function relayError(e: unknown): unknown {
  if (!(e instanceof ProviderError) || e.kind === 'not_configured' || e.kind === 'too_large') return e;
  if (e.status === 503 || e.status === 404) return new ProviderError('not_configured', 'demo', e.message, e.status);
  if (e.status === 413) return new ProviderError('too_large', 'demo', e.message, e.status);
  return e;
}
