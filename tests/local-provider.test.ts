// The offline model provider, with a scripted engine (no model needed), plus checks that run against
// the real engine binding when it is available: every tool and reply schema must become a grammar.
// An optional test runs a real model: BP_LOCAL_MODEL=/path/to/model.gguf npm test -- local-provider

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AiSettingsStore, type SecretBox } from '../app/main/settings/settings';
import { CLASSIFY_SCHEMA, CODE_SCHEMA, DESCRIBE_SCHEMA, EXTRACT_SCHEMA, RECOGNIZE_SCHEMA, REPLY_SCHEMA } from '../app/main/ai/assistant';
import { COACH_REPLY_SCHEMA } from '../app/main/ai/coach';
import { TOOLS } from '../app/main/ai/tools';
import { LlamaEngine, toGbnfSchema, type EngineRequest, type EngineResult, type LocalEngine } from '../app/main/ai/local/engine';
import { LocalProvider, stripThinking, toEngineItems } from '../app/main/ai/providers/local';
import { ProviderError, toAiError, type ChatMessage } from '../app/main/ai/providers';

/** An engine that answers from a script and remembers what it was asked. */
class FakeEngine implements LocalEngine {
  requests: EngineRequest[] = [];
  loaded: string[] = [];
  answers: (EngineResult | ((r: EngineRequest) => Promise<EngineResult>))[] = [];
  ctx = 8192;
  failLoad = false;
  async load(path: string) {
    if (this.failLoad) throw new Error('not enough memory');
    this.loaded.push(path);
  }
  contextTokens() {
    return this.ctx;
  }
  countTokens(text: string) {
    return Math.ceil(text.length / 4);
  }
  async generate(req: EngineRequest): Promise<EngineResult> {
    this.requests.push(req);
    const next = this.answers.shift() ?? { text: 'OK', calls: [], stop: 'end' as const };
    return typeof next === 'function' ? next(req) : next;
  }
  async dispose() {}
}

const installed = new Set(['qwen3-8b']);
const make = (engine = new FakeEngine()) => ({ engine, provider: new LocalProvider({ engine, pathOf: (id) => (installed.has(id) ? `/models/${id}.gguf` : null) }) });
const user = (text: string): ChatMessage => ({ role: 'user', content: [{ type: 'text', text }] });

describe('the offline provider', () => {
  it('answers a plain question and hides Qwen thinking', async () => {
    const { engine, provider } = make();
    engine.answers.push({ text: '<think>let me see</think>The sensor is at 0x76.', calls: [], stop: 'end' });
    const r = await provider.chat({ model: 'qwen3-8b', system: 'You help with boards.', messages: [user('Where is it?')], maxTokens: 500 });
    expect(r.text).toBe('The sensor is at 0x76.');
    expect(r.stop).toBe('end');
    expect(r.raw.provider).toBe('local');
    expect(engine.loaded).toEqual(['/models/qwen3-8b.gguf']);
    expect(engine.requests[0].items[0]).toEqual({ type: 'system', text: 'You help with boards.' });
    expect(engine.requests[0].tools).toBeUndefined();
  });

  it('returns tool calls for the assistant loop to run, and sends their results back', async () => {
    const { engine, provider } = make();
    engine.answers.push({ text: '', calls: [{ name: 'i2c_scan', params: { sda: 21, scl: 22 } }], stop: 'tool_use' });
    const first = await provider.chat({ model: 'qwen3-8b', messages: [user('scan')], tools: TOOLS, maxTokens: 500 });
    expect(first.stop).toBe('tool_use');
    expect(first.toolCalls).toHaveLength(1);
    expect(first.toolCalls[0]).toMatchObject({ name: 'i2c_scan', input: { sda: 21, scl: 22 } });
    expect(engine.requests[0].tools?.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));

    const call = first.toolCalls[0];
    const messages: ChatMessage[] = [
      user('scan'),
      { role: 'assistant', text: '', toolCalls: first.toolCalls, raw: first.raw },
      { role: 'tool', results: [{ callId: call.id, name: call.name, content: '{"found":["0x76"]}', isError: false }] },
    ];
    await provider.chat({ model: 'qwen3-8b', messages, tools: TOOLS, maxTokens: 500 });
    const items = engine.requests[1].items;
    expect(items.at(-1)).toEqual({ type: 'model', text: '', calls: [{ name: 'i2c_scan', params: { sda: 21, scl: 22 }, result: '{"found":["0x76"]}' }] });
    // Two calls never get the same id.
    expect(new Set([call.id, (await provider.chat({ model: 'qwen3-8b', messages: [user('x')], maxTokens: 50 })).toolCalls.length]).size).toBe(2);
  });

  it('with tools and a JSON schema: tools first, then a second pass that makes the answer JSON', async () => {
    const { engine, provider } = make();
    engine.answers.push({ text: 'It is at 0x76.', calls: [], stop: 'end' }, { text: '{"message":"It is at 0x76."}', calls: [], stop: 'end' });
    const r = await provider.chat({ model: 'qwen3-8b', messages: [user('where')], tools: TOOLS, jsonSchema: { name: 'assistant_reply', schema: REPLY_SCHEMA }, maxTokens: 500 });
    expect(r.text).toBe('{"message":"It is at 0x76."}');
    expect(engine.requests).toHaveLength(2);
    expect(engine.requests[0].tools).toBeDefined();
    expect(engine.requests[0].jsonSchema).toBeUndefined();
    expect(engine.requests[1].tools).toBeUndefined();
    expect(engine.requests[1].jsonSchema).toEqual(REPLY_SCHEMA);
    expect(engine.requests[1].items.at(-2)).toEqual({ type: 'model', text: 'It is at 0x76.', calls: [] });
  });

  it('with tools and a schema, a tool call needs no second pass', async () => {
    const { engine, provider } = make();
    engine.answers.push({ text: '', calls: [{ name: 'read_pins', params: {} }], stop: 'tool_use' });
    const r = await provider.chat({ model: 'qwen3-8b', messages: [user('pins')], tools: TOOLS, jsonSchema: { name: 'assistant_reply', schema: REPLY_SCHEMA }, maxTokens: 500 });
    expect(r.stop).toBe('tool_use');
    expect(engine.requests).toHaveLength(1);
  });

  it('a schema alone becomes a grammar request', async () => {
    const { engine, provider } = make();
    engine.answers.push({ text: '{"optionId":"a","reason":"x"}', calls: [], stop: 'end' });
    await provider.complete({ model: 'qwen3-8b', parts: [{ type: 'text', text: 'pick' }], jsonSchema: { name: 'option_choice', schema: CLASSIFY_SCHEMA }, maxTokens: 100 });
    expect(engine.requests[0].jsonSchema).toEqual(CLASSIFY_SCHEMA);
    expect(engine.requests[0].temperature).toBeLessThan(0.3);
  });

  it('refuses photos and PDFs in plain words', async () => {
    const { provider } = make();
    const photo: ChatMessage = { role: 'user', content: [{ type: 'text', text: 'what is this?' }, { type: 'image', mediaType: 'image/png', data: 'AAAA' }] };
    const err = await provider.chat({ model: 'qwen3-8b', messages: [photo], maxTokens: 100 }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('bad_request');
    expect(toAiError(err, 'local', 'qwen3-8b').humanMessage).toMatch(/text only/);
  });

  it('says so when no model is installed or the model is unknown', async () => {
    const { provider } = make();
    for (const model of ['qwen3-14b', 'gpt-6-sol']) {
      const err = await provider.chat({ model, messages: [user('hi')], maxTokens: 100 }).catch((e) => e);
      expect(err.kind).toBe('not_configured');
      expect(toAiError(err, 'local', model).code).toBe('ai_local_none');
    }
  });

  it('reports an engine that cannot load the model', async () => {
    const engine = new FakeEngine();
    engine.failLoad = true;
    const { provider } = make(engine);
    const err = await provider.chat({ model: 'qwen3-8b', messages: [user('hi')], maxTokens: 100 }).catch((e) => e);
    expect(err.kind).toBe('server');
    expect(toAiError(err, 'local', 'qwen3-8b')).toMatchObject({ code: 'ai_local_error' });
    expect(toAiError(err, 'local', 'qwen3-8b').humanMessage).toContain('not enough memory');
  });

  it('times out an answer that never comes', async () => {
    const engine = new FakeEngine();
    engine.answers.push((r) => new Promise((_res, rej) => r.signal?.addEventListener('abort', () => rej(new Error('aborted')))));
    const { provider } = make(engine);
    const err = await provider.chat({ model: 'qwen3-8b', messages: [user('hi')], maxTokens: 100, timeoutMs: 30 }).catch((e) => e);
    expect(err.kind).toBe('timeout');
    expect(toAiError(err, 'local', 'qwen3-8b').code).toBe('ai_local_slow');
  });

  it('lists only the installed models', async () => {
    expect(await make().provider.listModels()).toEqual([{ id: 'qwen3-8b', label: 'Qwen 3 8B' }]);
  });
});

describe('fitting a request into a small context', () => {
  const bigContext = (n: number) => `<context>\nRecent app events\nevent\n${Array.from({ length: n }, (_, i) => `${i + 1}| line of code number ${i}`).join('\n')}\n</context>`;

  it('compacts the context blocks before dropping anything', async () => {
    const engine = new FakeEngine();
    engine.ctx = 3000;
    const { provider } = make(engine);
    await provider.chat({ model: 'qwen3-8b', messages: [user(bigContext(400)), user('and now?')], maxTokens: 300 });
    const text = engine.requests[0].items.map((i) => i.text).join('\n');
    expect(text).toContain('the rest of the code is left out');
    expect(text).not.toContain('Recent app events');
  });

  it('drops the oldest turns and keeps the last question', async () => {
    const engine = new FakeEngine();
    engine.ctx = 2600;
    const { provider } = make(engine);
    const long = 'word '.repeat(700);
    const messages: ChatMessage[] = [user('first ' + long), { role: 'assistant', text: 'a1 ' + long, toolCalls: [] }, user('second ' + long), { role: 'assistant', text: 'a2 ' + long, toolCalls: [] }, user('last question')];
    await provider.chat({ model: 'qwen3-8b', system: 'sys', messages, maxTokens: 200 });
    const items = engine.requests[0].items;
    expect(items[0]).toEqual({ type: 'system', text: 'sys' });
    expect(items.at(-1)).toEqual({ type: 'user', text: 'last question' });
    expect(items.some((i) => i.text.startsWith('first'))).toBe(false);
  });

  it('says the request is too big when the last question alone does not fit', async () => {
    const engine = new FakeEngine();
    engine.ctx = 1200;
    const { provider } = make(engine);
    const err = await provider.chat({ model: 'qwen3-8b', messages: [user('x '.repeat(5000))], maxTokens: 200 }).catch((e) => e);
    expect(err.kind).toBe('too_large');
    expect(toAiError(err, 'local', 'qwen3-8b').code).toBe('ai_local_too_large');
  });

  it('keeps thinking text out of the replayed history', () => {
    const items = toEngineItems(undefined, [user('hi'), { role: 'assistant', text: '<think>hmm</think>hello', toolCalls: [] }], false);
    expect(items[1]).toEqual({ type: 'model', text: 'hello', calls: [] });
    expect(stripThinking('<think>a</think>b<think>c')).toBe('b');
  });
});

describe('choosing the offline model in settings', () => {
  const box: SecretBox = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() };
  const store = (ids: string[], env: Record<string, string | undefined> = {}) => {
    const s = new AiSettingsStore(join(mkdtempSync(join(tmpdir(), 'bp-settings-')), 'settings.json'), box, env);
    s.localInstalled = () => ids;
    return s;
  };
  const off = { BOARDPILOT_DEMO_AI_URL: 'off' };

  it('with no key, an installed offline model answers before the free demo', () => {
    const s = store(['qwen3-4b']);
    expect(s.provider).toBe('demo');
    expect(s.active()).toBe('demo');
    s.save({ provider: 'anthropic', model: '' });
    expect(s.active()).toBe('local');
    expect(s.usable).toBe(true);
  });

  it('a key beats the offline model; the demo stays the demo when picked', () => {
    const s = store(['qwen3-4b'], { ANTHROPIC_API_KEY: 'sk-ant-' + 'x'.repeat(30) });
    expect(s.active()).toBe('anthropic');
    s.save({ provider: 'demo', model: '' });
    expect(s.active()).toBe('demo');
  });

  it('picked offline but nothing downloaded: falls back to the demo, or is off without it', () => {
    const s = store([]);
    s.save({ provider: 'local', model: 'qwen3-8b' });
    expect(s.active()).toBe('demo');
    const noDemo = store([], off);
    noDemo.save({ provider: 'local', model: '' });
    expect(noDemo.active()).toBe('local');
    expect(noDemo.usable).toBe(false);
  });

  it('uses the model the user picked when it is installed, else the largest installed', () => {
    const s = store(['qwen3-4b', 'qwen3-8b']);
    s.save({ provider: 'local', model: 'qwen3-4b' });
    expect(s.model('local')).toBe('qwen3-4b');
    expect(s.view().localReady).toBe(true);
    s.save({ provider: 'local', model: 'not-a-model' });
    expect(s.model('local')).toBe('qwen3-4b');
    s.localInstalled = () => ['qwen3-8b'];
    expect(s.model('local')).toBe('qwen3-8b');
    s.localInstalled = () => [];
    expect(s.model('local')).toBe('qwen3-4b');
  });
});

describe('the real engine binding', async () => {
  // Grammar creation needs the native library but no model.
  const engine = new LlamaEngine();
  const gpu = await engine.gpu().then(() => true).catch(() => false);
  const llama = gpu ? await import('node-llama-cpp').then((m) => m.getLlama({ build: 'never', skipDownload: true })).catch(() => null) : null;

  it.skipIf(!llama)('turns every tool and reply schema into a grammar', async () => {
    const schemas: Record<string, unknown> = {
      REPLY_SCHEMA,
      CODE_SCHEMA,
      DESCRIBE_SCHEMA,
      CLASSIFY_SCHEMA,
      RECOGNIZE_SCHEMA,
      EXTRACT_SCHEMA,
      COACH_REPLY_SCHEMA,
      ...Object.fromEntries(TOOLS.map((t) => [`tool:${t.name}`, t.parameters])),
    };
    for (const [name, schema] of Object.entries(schemas)) {
      await expect(llama!.createGrammarForJsonSchema(toGbnfSchema(schema) as never), name).resolves.toBeDefined();
    }
  });

  it('keeps only the schema keywords a grammar understands', () => {
    expect(toGbnfSchema({ type: 'object', title: 'x', properties: { a: { anyOf: [{ type: 'string' }, { type: 'null' }], default: 1 } }, required: ['a'], additionalProperties: false })).toEqual({
      type: 'object',
      properties: { a: { oneOf: [{ type: 'string' }, { type: 'null' }] } },
      required: ['a'],
      additionalProperties: false,
    });
  });
});

// Optional: run a real model. Skipped unless BP_LOCAL_MODEL points at a .gguf file.
describe.skipIf(!process.env.BP_LOCAL_MODEL)('a real model (BP_LOCAL_MODEL)', () => {
  it('answers, calls a tool and returns JSON', async () => {
    const engine = new LlamaEngine();
    const path = process.env.BP_LOCAL_MODEL!;
    const provider = new LocalProvider({ engine, pathOf: () => path });
    // qwen3-4b is only the catalog slot used to pick the context size.
    const model = 'qwen3-4b';
    const hello = await provider.chat({ model, system: 'Answer in one short sentence.', messages: [user('What does I2C stand for?')], maxTokens: 120 });
    expect(hello.text.length).toBeGreaterThan(5);
    const tool = await provider.chat({ model, system: 'Use a tool when you need a measurement.', messages: [user('Scan the I2C bus on SDA 21 and SCL 22.')], tools: TOOLS, maxTokens: 200 });
    expect(tool.toolCalls.map((c) => c.name)).toContain('i2c_scan');
    const json = await provider.complete({ model, parts: [{ type: 'text', text: 'Pick option a or b for "the first one".' }], jsonSchema: { name: 'option_choice', schema: CLASSIFY_SCHEMA }, maxTokens: 100 });
    expect(() => JSON.parse(json.text)).not.toThrow();
    writeFileSync(join(tmpdir(), 'bp-local-model-check.txt'), JSON.stringify({ hello: hello.text, tool: tool.toolCalls, json: json.text }, null, 2));
    await engine.dispose();
  }, 600_000);
});
