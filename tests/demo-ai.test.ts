// The free demo AI: the Cloudflare Pages relay (site/functions/api/demo-ai.js) and the app's
// 'demo' provider that talks to it. No real network: fetch, the Cache API and KV are stubbed.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEMO_AI_URL, DEMO_MAX_BODY_BYTES } from '@shared/ai';
import { TOOLS } from '../app/main/ai/tools';
import { DemoProvider, demoOptions } from '../app/main/ai/providers/demo';
import { createProvider, ProviderError, toAiError, type ChatMessage } from '../app/main/ai/providers';
import { AiSettingsStore, type SecretBox } from '../app/main/settings/settings';
import { Assistant, checkPartSources } from '../app/main/ai/assistant';
import type { HardwareHub } from '../app/main/hardware/hub';

/* ---------------- the relay module (plain JS, loaded without type declarations) ---------------- */

interface PagesContext {
  request: Request;
  env: Record<string, unknown>;
}
interface RelayModule {
  onRequestPost(ctx: PagesContext): Promise<Response>;
  onRequestGet(ctx: PagesContext): Promise<Response>;
  onRequestOptions(): Promise<Response>;
  DEFAULT_MODEL: string;
  MAX_BODY_BYTES: number;
  MAX_OUTPUT_TOKENS: number;
}
const RELAY_PATH = '../site/functions/api/demo-ai.js';
const loadRelay = () => import(/* @vite-ignore */ RELAY_PATH) as Promise<RelayModule>;

const SECRET = 'AIzaSy-OWNER-SECRET-KEY-000000000000';
const GOOGLE = 'https://generativelanguage.googleapis.com/v1beta/models/';

/** A Cache API stand-in (caches.default) keyed by URL. */
function fakeCaches() {
  const store = new Map<string, string>();
  const cache = {
    match: async (req: Request) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
    put: async (req: Request, res: Response) => {
      store.set(req.url, await res.text());
    },
  };
  vi.stubGlobal('caches', { default: cache });
  return store;
}

type Upstream = { url: string; headers: Headers; body: Record<string, unknown> };

/** Stub fetch for Google's API; returns what the relay sent upstream. */
function fakeGoogle(answer: () => Response) {
  const calls: Upstream[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (!String(url).startsWith(GOOGLE)) throw new Error(`unexpected fetch ${url}`);
    calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) as Record<string, unknown> });
    return answer();
  });
  return calls;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const GOOD_ANSWER = { candidates: [{ content: { role: 'model', parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }] };

function post(body: unknown, headers: Record<string, string> = {}, ip = '203.0.113.7') {
  return new Request('https://boardpilot.test/api/demo-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-BoardPilot-Client': 'BoardPilot/0.3.0', 'CF-Connecting-IP': ip, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const minimal = (extra: Record<string, unknown> = {}) => ({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }], ...extra });
const env = (extra: Record<string, unknown> = {}) => ({ GEMINI_API_KEY: SECRET, ...extra });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('demo relay: health and configuration', () => {
  it('reports model, limits and whether a key is configured, never the key', async () => {
    const relay = await loadRelay();
    const r = await relay.onRequestGet({ request: new Request('https://x.test/api/demo-ai'), env: env() });
    const text = await r.text();
    expect(text).not.toContain(SECRET);
    const body = JSON.parse(text) as { ok: boolean; model: string; configured: boolean; limits: Record<string, number> };
    expect(body).toMatchObject({ ok: true, model: 'gemini-3.1-flash-lite', configured: true });
    expect(body.limits).toMatchObject({ perMinute: 10, perDay: 150, maxBodyBytes: 48 * 1024, maxOutputTokens: 2048 });
    const off = await relay.onRequestGet({ request: new Request('https://x.test/api/demo-ai'), env: { DEMO_MODEL: 'gemini-3.5-flash-lite' } });
    expect(await off.json()).toMatchObject({ configured: false, model: 'gemini-3.5-flash-lite' });
  });

  it('answers 503 "demo not configured" without a key', async () => {
    const relay = await loadRelay();
    const r = await relay.onRequestPost({ request: post(minimal()), env: {} });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: { code: 'demo_not_configured' } });
  });

  it('requires the X-BoardPilot-Client header', async () => {
    const relay = await loadRelay();
    fakeCaches();
    const calls = fakeGoogle(() => json(200, GOOD_ANSWER));
    const r = await relay.onRequestPost({ request: post(minimal(), { 'X-BoardPilot-Client': '' }), env: env() });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: { code: 'client_required' } });
    expect(calls).toHaveLength(0);
  });

  it('sends no CORS permission on preflight', async () => {
    const relay = await loadRelay();
    const r = await relay.onRequestOptions();
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('demo relay: hardening', () => {
  it('rejects bodies over 48 KB', async () => {
    const relay = await loadRelay();
    fakeCaches();
    const calls = fakeGoogle(() => json(200, GOOD_ANSWER));
    const big = minimal({ contents: [{ role: 'user', parts: [{ text: 'x'.repeat(relay.MAX_BODY_BYTES) }] }] });
    const r = await relay.onRequestPost({ request: post(big), env: env() });
    expect(r.status).toBe(413);
    expect(await r.json()).toMatchObject({ error: { code: 'too_large' } });
    const declared = await relay.onRequestPost({ request: post(minimal(), { 'Content-Length': String(100_000) }), env: env() });
    expect(declared.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it('clamps output tokens, strips model, key, URL and unknown fields, and uses its own model and key', async () => {
    const relay = await loadRelay();
    fakeCaches();
    const calls = fakeGoogle(() => json(200, GOOD_ANSWER));
    const body = {
      model: 'gemini-9-ultra',
      key: 'stolen',
      apiKey: 'stolen',
      url: 'https://evil.test',
      cachedContent: 'cachedContents/owner-cache',
      safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }],
      contents: [
        { role: 'user', parts: [{ text: 'hi' }, { fileData: { fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/x' } }] },
      ],
      systemInstruction: { parts: [{ text: 'sys' }] },
      generationConfig: { maxOutputTokens: 16000, responseMimeType: 'application/json', responseJsonSchema: { type: 'object' }, thinkingConfig: { thinkingBudget: 24000 } },
      tools: [{ functionDeclarations: [{ name: 'read_pins', description: 'd', parametersJsonSchema: { type: 'object', properties: {} } }] }],
    };
    const r = await relay.onRequestPost({ request: post(body), env: env({ DEMO_MODEL: 'gemini-3.5-flash-lite' }) });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(GOOD_ANSWER);
    expect(calls).toHaveLength(1);
    const up = calls[0];
    expect(up.url).toBe(`${GOOGLE}gemini-3.5-flash-lite:generateContent`);
    expect(up.headers.get('x-goog-api-key')).toBe(SECRET);
    expect(Object.keys(up.body).sort()).toEqual(['contents', 'generationConfig', 'systemInstruction', 'tools']);
    const gen = up.body.generationConfig as Record<string, unknown>;
    expect(gen.maxOutputTokens).toBe(2048);
    expect(gen.thinkingConfig).toEqual({ thinkingLevel: 'low' });
    expect(gen.responseMimeType).toBe('application/json');
    expect(JSON.stringify(up.body)).not.toMatch(/stolen|evil\.test|gemini-9|fileUri|owner-cache|BLOCK_NONE/);
    expect(up.body.contents).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }]);
  });

  it('keeps small token requests and adds the cap when none is given', async () => {
    const relay = await loadRelay();
    fakeCaches();
    const calls = fakeGoogle(() => json(200, GOOD_ANSWER));
    await relay.onRequestPost({ request: post(minimal({ generationConfig: { maxOutputTokens: 32 } })), env: env() });
    await relay.onRequestPost({ request: post(minimal()), env: env() });
    expect((calls[0].body.generationConfig as Record<string, unknown>).maxOutputTokens).toBe(32);
    expect((calls[1].body.generationConfig as Record<string, unknown>).maxOutputTokens).toBe(2048);
  });

  it('allows only function declarations and Google Search', async () => {
    const relay = await loadRelay();
    fakeCaches();
    const calls = fakeGoogle(() => json(200, GOOD_ANSWER));
    const ok = await relay.onRequestPost({ request: post(minimal({ tools: [{ google_search: {} }] })), env: env() });
    expect(ok.status).toBe(200);
    expect(calls[0].body.tools).toEqual([{ google_search: {} }]);
    for (const tool of [{ codeExecution: {} }, { urlContext: {} }, { googleSearchRetrieval: {} }, { google_search: {}, codeExecution: {} }]) {
      const r = await relay.onRequestPost({ request: post(minimal({ tools: [tool] })), env: env() });
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ error: { code: 'tool_not_allowed' } });
    }
    expect(calls).toHaveLength(1);
  });

  it('rejects malformed JSON and turns without a role', async () => {
    const relay = await loadRelay();
    fakeCaches();
    fakeGoogle(() => json(200, GOOD_ANSWER));
    expect((await relay.onRequestPost({ request: post('{not json'), env: env() })).status).toBe(400);
    expect((await relay.onRequestPost({ request: post({ contents: [{ parts: [] }] }), env: env() })).status).toBe(400);
    expect((await relay.onRequestPost({ request: post({ contents: [] }), env: env() })).status).toBe(400);
  });

  it('never leaks the key, even if the upstream answer or error echoes it', async () => {
    const relay = await loadRelay();
    fakeCaches();
    fakeGoogle(() => json(200, { candidates: [{ content: { role: 'model', parts: [{ text: `key ${SECRET}` }] } }] }));
    const ok = await relay.onRequestPost({ request: post(minimal()), env: env() });
    expect(await ok.text()).not.toContain(SECRET);
    fakeGoogle(() => json(400, { error: { code: 400, message: `API key ${SECRET} bad request`, status: 'INVALID_ARGUMENT' } }));
    const bad = await relay.onRequestPost({ request: post(minimal()), env: env() });
    expect(bad.status).toBe(400);
    expect(await bad.text()).not.toContain(SECRET);
  });

  it('maps upstream errors: 429 busy, refused key 503, outage 502', async () => {
    const relay = await loadRelay();
    fakeCaches();
    fakeGoogle(() => json(429, { error: { code: 429, message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' } }));
    const busy = await relay.onRequestPost({ request: post(minimal()), env: env() });
    expect(busy.status).toBe(429);
    expect(busy.headers.get('Retry-After')).toBeTruthy();
    fakeGoogle(() => json(403, { error: { code: 403, message: 'API key not valid', status: 'PERMISSION_DENIED' } }));
    expect((await relay.onRequestPost({ request: post(minimal()), env: env() })).status).toBe(503);
    fakeGoogle(() => json(500, { error: { code: 500, message: 'internal' } }));
    expect((await relay.onRequestPost({ request: post(minimal()), env: env() })).status).toBe(502);
  });
});

describe('demo relay: per-IP rate limit', () => {
  it('allows 10 requests per minute per IP with the Cache API, then answers 429', async () => {
    const relay = await loadRelay();
    const store = fakeCaches();
    const calls = fakeGoogle(() => json(200, GOOD_ANSWER));
    for (let i = 0; i < 10; i++) expect((await relay.onRequestPost({ request: post(minimal()), env: env() })).status).toBe(200);
    const limited = await relay.onRequestPost({ request: post(minimal()), env: env() });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: 'rate_limited' } });
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(calls).toHaveLength(10);
    // another IP is not affected; the IP itself is never stored in clear
    expect((await relay.onRequestPost({ request: post(minimal(), {}, '198.51.100.1'), env: env() })).status).toBe(200);
    expect([...store.keys()].join(' ')).not.toContain('203.0.113.7');
  });

  it('enforces the daily limit, using KV when DEMO_KV is bound', async () => {
    const relay = await loadRelay();
    vi.stubGlobal('caches', undefined);
    const kv = new Map<string, string>();
    const DEMO_KV = { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v) };
    fakeGoogle(() => json(200, GOOD_ANSWER));
    const e = env({ DEMO_KV, DEMO_RATE_PER_DAY: '3', DEMO_RATE_PER_MIN: '100' });
    for (let i = 0; i < 3; i++) expect((await relay.onRequestPost({ request: post(minimal()), env: e })).status).toBe(200);
    expect((await relay.onRequestPost({ request: post(minimal()), env: e })).status).toBe(429);
    expect(kv.size).toBeGreaterThan(0);
  });
});

/* ---------------- the app side: 'demo' provider ---------------- */

type FetchArgs = [string, RequestInit];
function stubFetch(answers: (() => Response)[]) {
  const calls: FetchArgs[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push([url, init]);
    const next = answers.shift();
    if (!next) throw new Error('unexpected fetch');
    return Promise.resolve(next());
  });
  return calls;
}

describe('demo provider', () => {
  it('reads the relay URL and version from the environment and can be switched off', () => {
    expect(demoOptions({})).toEqual({ url: DEMO_AI_URL, clientVersion: '0.0.0' });
    expect(demoOptions({ BOARDPILOT_DEMO_AI_URL: 'https://relay.test/api/demo-ai', BOARDPILOT_VERSION: '1.2.3' })).toEqual({ url: 'https://relay.test/api/demo-ai', clientVersion: '1.2.3' });
    expect(demoOptions({ BOARDPILOT_DEMO_AI_URL: 'http://localhost:8788/api/demo-ai' })?.url).toBe('http://localhost:8788/api/demo-ai');
    expect(demoOptions({ BOARDPILOT_DEMO_AI_URL: 'http://plain.test/x' })?.url).toBe(DEMO_AI_URL);
    expect(demoOptions({ BOARDPILOT_DEMO_AI_URL: 'off' })).toBeNull();
    expect(() => createProvider('demo', '', { BOARDPILOT_DEMO_AI_URL: 'off' })).toThrow(ProviderError);
  });

  it('posts to the relay with the client header, no key, and capped output tokens', async () => {
    const calls = stubFetch([() => json(200, GOOD_ANSWER)]);
    const p = createProvider('demo', 'ignored-key-000000000000', { BOARDPILOT_DEMO_AI_URL: 'https://relay.test/api/demo-ai', BOARDPILOT_VERSION: '0.3.0' });
    expect(p.id).toBe('demo');
    const r = await p.chat({ model: 'gemini-3.1-flash-lite', system: 'sys', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], tools: TOOLS, maxTokens: 16000 });
    expect(r.text).toBe('{"ok":true}');
    expect(r.raw.provider).toBe('demo');
    const [url, init] = calls[0];
    expect(url).toBe('https://relay.test/api/demo-ai');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-BoardPilot-Client']).toBe('BoardPilot/0.3.0');
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('x-goog-api-key');
    expect(String(init.body)).not.toContain('ignored-key');
    const body = JSON.parse(String(init.body)) as { generationConfig: { maxOutputTokens: number }; tools: unknown[] };
    expect(body.generationConfig.maxOutputTokens).toBe(2048);
    expect(JSON.stringify(body.tools)).not.toContain('google_search');
  });

  it('adds Google Search for web-search requests without tools, with JSON output, and reads the citations', async () => {
    const grounded = {
      candidates: [
        {
          content: { role: 'model', parts: [{ text: '{"name":"HC-SR04"}' }] },
          finishReason: 'STOP',
          groundingMetadata: {
            webSearchQueries: ['HC-SR04 pinout'],
            groundingChunks: [{ web: { uri: 'https://example.test/hc-sr04', title: 'example.test' } }, { web: { uri: 'https://example.test/hc-sr04', title: 'dup' } }],
          },
        },
      ],
    };
    const calls = stubFetch([() => json(200, grounded)]);
    const p = new DemoProvider({ url: DEMO_AI_URL, clientVersion: '0.3.0' });
    const r = await p.complete({ model: 'm', maxTokens: 8000, webSearch: true, parts: [{ type: 'text', text: 'page' }], jsonSchema: { name: 'part', schema: { type: 'object', properties: {} } } });
    const body = JSON.parse(String(calls[0][1].body)) as { tools: unknown; generationConfig: Record<string, unknown> };
    expect(body.tools).toEqual([{ google_search: {} }]);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(r.citations).toEqual([{ url: 'https://example.test/hc-sr04', title: 'example.test' }]);
  });

  it('retries without JSON mode, then without search, when a model refuses them', async () => {
    const calls = stubFetch([
      () => json(400, { error: { code: 400, message: 'Search grounding with response mime type application/json is unsupported' } }),
      () => json(400, { error: { code: 400, message: 'Search Grounding is not supported.' } }),
      () => json(200, GOOD_ANSWER),
    ]);
    const p = new DemoProvider({ url: DEMO_AI_URL, clientVersion: '0.3.0' });
    const r = await p.complete({ model: 'm', maxTokens: 100, webSearch: true, parts: [{ type: 'text', text: 'x' }], jsonSchema: { name: 'p', schema: { type: 'object', properties: {} } } });
    expect(r.text).toBe('{"ok":true}');
    const bodies = calls.map((c) => JSON.parse(String(c[1].body)) as { tools?: unknown; generationConfig: Record<string, unknown> });
    expect(bodies[0].tools).toEqual([{ google_search: {} }]);
    expect(bodies[1].generationConfig.responseMimeType).toBeUndefined();
    expect(bodies[2].tools).toBeUndefined();
    expect(bodies[2].generationConfig.responseMimeType).toBe('application/json');
  });

  it('trims old context blocks and turns to fit 48 KB, and refuses what cannot fit', () => {
    const p = new DemoProvider({ url: DEMO_AI_URL, clientVersion: '0.3.0' });
    const ctx = `<context>\n${'c'.repeat(15_000)}\n</context>`;
    const turn = (q: string): ChatMessage[] => [
      { role: 'user', content: [{ type: 'text', text: ctx }, { type: 'text', text: q }] },
      { role: 'assistant', text: `answer to ${q}`, toolCalls: [] },
    ];
    const messages: ChatMessage[] = [...turn('q1'), ...turn('q2'), ...turn('q3'), { role: 'user', content: [{ type: 'text', text: ctx }, { type: 'text', text: 'q4' }] }];
    const fitted = p.fit({ model: 'm', messages, maxTokens: 100, tools: TOOLS });
    expect(new TextEncoder().encode(JSON.stringify(fitted.messages)).length).toBeLessThan(DEMO_MAX_BODY_BYTES);
    const texts = fitted.messages.flatMap((m) => (m.role === 'user' ? m.content.map((c) => (c.type === 'text' ? c.text : '')) : []));
    expect(texts.filter((x) => x.startsWith('<context>'))).toHaveLength(1);
    expect(texts).toContain('q1');
    expect(texts[texts.length - 1]).toBe('q4');
    const photo: ChatMessage = { role: 'user', content: [{ type: 'image', mediaType: 'image/jpeg', data: 'A'.repeat(200_000) }] };
    expect(() => p.fit({ model: 'm', messages: [photo], maxTokens: 100 })).toThrow(expect.objectContaining({ kind: 'too_large' }) as Error);
  });

  it('turns relay answers into plain-language errors', async () => {
    const p = new DemoProvider({ url: DEMO_AI_URL, clientVersion: '0.3.0' });
    const req = { model: 'm', maxTokens: 10, messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'x' }] }] };
    stubFetch([() => json(429, { error: { code: 'rate_limited', message: 'The free demo is busy' } })]);
    const busy = await p.chat(req).catch((e: unknown) => e);
    expect(toAiError(busy, 'demo', 'm')).toMatchObject({ code: 'ai_demo_busy', humanMessage: 'The free demo is busy or you reached its limit. Try again in a minute, or add your own key.' });
    stubFetch([() => json(503, { error: { code: 'demo_not_configured', message: 'demo not configured' } })]);
    const off = await p.chat(req).catch((e: unknown) => e);
    expect(toAiError(off, 'demo', 'm')).toMatchObject({ code: 'ai_demo_off', humanMessage: 'The free demo is not set up yet.' });
    stubFetch([() => new Response('<html>Not found</html>', { status: 404 })]);
    expect(toAiError(await p.chat(req).catch((e: unknown) => e), 'demo', 'm').code).toBe('ai_demo_off');
    expect(toAiError(new ProviderError('too_large', 'demo', 'x'), 'demo', 'm').code).toBe('ai_too_large');
  });

  it('works end to end through the relay function', async () => {
    const relay = await loadRelay();
    fakeCaches();
    const upstream: Upstream[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      if (String(url).startsWith(GOOGLE)) {
        upstream.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) as Record<string, unknown> });
        return json(200, GOOD_ANSWER);
      }
      // the app's request, served by the Pages Function
      return relay.onRequestPost({ request: new Request(url, { ...init, headers: { ...(init.headers as Record<string, string>), 'CF-Connecting-IP': '192.0.2.9' } }), env: env() });
    });
    const p = createProvider('demo', '', { BOARDPILOT_DEMO_AI_URL: 'https://relay.test/api/demo-ai', BOARDPILOT_VERSION: '0.3.0' });
    const r = await p.chat({ model: 'x', system: 'sys', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], tools: TOOLS, maxTokens: 16000 });
    expect(r.text).toBe('{"ok":true}');
    expect(upstream[0].headers.get('x-goog-api-key')).toBe(SECRET);
    expect(upstream[0].url).toContain('gemini-3.1-flash-lite');
  });
});

/* ---------------- settings and assistant ---------------- */

const fakeBox = (): SecretBox => ({
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(`enc:${[...s].reverse().join('')}`),
  decryptString: (b) => [...b.toString().replace(/^enc:/, '')].reverse().join(''),
});
const tmp = () => join(mkdtempSync(join(tmpdir(), 'bp-demo-')), 'settings.json');

describe('free demo as the default', () => {
  it('is used on first launch and whenever the picked provider has no key', () => {
    const s = new AiSettingsStore(tmp(), fakeBox(), {});
    expect(s.provider).toBe('demo');
    expect(s.active()).toBe('demo');
    expect(s.usable).toBe(true);
    expect(s.view()).toMatchObject({ provider: 'demo', active: 'demo', demoEnabled: true });
    expect(s.save({ provider: 'anthropic', model: '' }).ok).toBe(true);
    expect(s.active()).toBe('demo');
    const KEY = 'sk-ant-SECRET-1234567890abcd';
    const saved = s.save({ provider: 'anthropic', model: '', apiKey: KEY });
    expect(saved.ok && saved.value.active).toBe('anthropic');
    expect(JSON.stringify(s.view())).not.toContain(KEY);
    // the demo never stores a key or a model
    expect(s.save({ provider: 'demo', model: 'gemini-9', apiKey: 'some-key-1234567890abcdef' }).ok).toBe(true);
    expect(s.getKey('demo')).toBeNull();
    expect(s.model('demo')).toBe('gemini-3.1-flash-lite');
  });

  it('can be switched off, and then AI is off without a key', () => {
    const s = new AiSettingsStore(tmp(), fakeBox(), { BOARDPILOT_DEMO_AI_URL: 'off' });
    expect(s.provider).toBe('anthropic');
    expect(s.active()).toBe('anthropic');
    expect(s.usable).toBe(false);
    const a = new Assistant({} as HardwareHub, s, { BOARDPILOT_DEMO_AI_URL: 'off' });
    expect(a.status().enabled).toBe(false);
  });

  it('drafts a part with web search through the demo and keeps only sources it can check', async () => {
    const env0 = { BOARDPILOT_DEMO_AI_URL: 'https://relay.test/api/demo-ai', BOARDPILOT_VERSION: '0.3.0' };
    const a = new Assistant({} as HardwareHub, new AiSettingsStore(tmp(), fakeBox(), env0), env0);
    expect(a.status()).toMatchObject({ enabled: true, provider: 'demo' });
    const part = {
      name: 'HC-SR04',
      notes: ['pin order guessed'],
      sources: [
        { title: 'Product page', section: 'https://shop.test/hc-sr04' },
        { title: 'Maker datasheet', section: 'https://made-up.test/datasheet.pdf' },
        { title: 'Datasheet', section: 'Pin table' },
      ],
    };
    const calls = stubFetch([
      () =>
        json(200, {
          candidates: [
            {
              content: { role: 'model', parts: [{ text: JSON.stringify(part) }] },
              finishReason: 'STOP',
              groundingMetadata: { groundingChunks: [{ web: { uri: 'https://found.test/hc-sr04-pinout', title: 'found.test' } }] },
            },
          ],
        }),
    ]);
    const r = await a.extractPart({ url: 'https://shop.test/hc-sr04', title: 'HC-SR04', text: 'x'.repeat(60_000), pdfBase64: undefined });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const body = JSON.parse(String(calls[0][1].body)) as { tools: unknown };
    expect(body.tools).toEqual([{ google_search: {} }]);
    expect(String(calls[0][1].body).length).toBeLessThan(DEMO_MAX_BODY_BYTES);
    const sources = r.value.part.sources as { title: string; section: string }[];
    expect(sources.map((s) => s.section)).toEqual(['https://shop.test/hc-sr04', 'Pin table', 'https://found.test/hc-sr04-pinout']);
    expect(r.value.notes.join('\n')).toContain('https://found.test/hc-sr04-pinout');
    expect(r.value.notes.some((n) => n.includes('removed'))).toBe(true);
  });

  it('does not send PDFs to the demo; it searches for the datasheet instead', async () => {
    const env0 = { BOARDPILOT_DEMO_AI_URL: 'https://relay.test/api/demo-ai' };
    const a = new Assistant({} as HardwareHub, new AiSettingsStore(tmp(), fakeBox(), env0), env0);
    const calls = stubFetch([() => json(200, { candidates: [{ content: { role: 'model', parts: [{ text: '{"name":"X","notes":[]}' }] }, finishReason: 'STOP' }] })]);
    const r = await a.extractPart({ url: 'https://maker.test/ds.pdf', title: 'ds', text: '', pdfBase64: 'JVBERi0'.repeat(20_000) });
    expect(r.ok).toBe(true);
    expect(String(calls[0][1].body)).not.toContain('application/pdf');
    if (r.ok) expect(r.value.notes[0]).toContain('cannot read PDF');
  });

  it('checkPartSources keeps the page and search results only', () => {
    const r = checkPartSources({ sources: [{ title: 'x', section: 'https://page.test/a/' }, { title: 'y https://other.test', section: '' }] }, 'https://page.test/a', []);
    expect(r.part.sources).toEqual([{ title: 'x', section: 'https://page.test/a/' }]);
    expect(r.notes).toHaveLength(1);
  });
});
