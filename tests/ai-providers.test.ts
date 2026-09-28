// AI providers: message/tool conversion, schema adaptation, response parsing and error mapping
// per provider, plus the settings store never exposing a key. No real network calls: fetch is
// stubbed and the provider answers below follow the shapes in the providers' API docs.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOOLS } from '../app/main/ai/tools';
import { parseAnthropicResponse, toAnthropicMessages, toAnthropicTools } from '../app/main/ai/providers/anthropic';
import { filterOpenAiModels, OpenAiProvider, parseOpenAiResponse, toOpenAiFormat, toOpenAiInput, toOpenAiTools, type OpenAiResponse } from '../app/main/ai/providers/openai';
import { filterGeminiModels, GeminiProvider, parseGeminiResponse, toGeminiContents, toGeminiTools, type GeminiResponse } from '../app/main/ai/providers/gemini';
import { isStrictCompatible, sanitizeForGemini } from '../app/main/ai/providers/schema';
import { httpError, httpJson } from '../app/main/ai/providers/http';
import { ProviderError, toAiError, type ChatMessage } from '../app/main/ai/providers';
import { AiSettingsStore, keyHint, type SecretBox } from '../app/main/settings/settings';

/* ---------------- a conversation used by every provider ---------------- */

const CONVO: ChatMessage[] = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'context' },
      { type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgo=' },
      { type: 'pdf', data: 'JVBERi0=' },
    ],
  },
  { role: 'assistant', text: 'Let me scan.', toolCalls: [{ id: 'call_1', name: 'i2c_scan', input: { sda: 21, scl: 22 } }] },
  { role: 'tool', results: [{ callId: 'call_1', name: 'i2c_scan', content: '{"found":["0x76"]}', isError: false }] },
  { role: 'user', content: [{ type: 'text', text: 'and now?' }] },
];

const walk = (s: unknown, fn: (o: Record<string, unknown>) => void) => {
  if (typeof s !== 'object' || s === null) return;
  if (!Array.isArray(s)) fn(s as Record<string, unknown>);
  for (const v of Object.values(s)) walk(v, fn);
};

/* ---------------- Anthropic ---------------- */

describe('Anthropic conversion', () => {
  it('maps parts, tool calls and results, merging user-side turns', () => {
    const m = toAnthropicMessages(CONVO);
    expect(m.map((x) => x.role)).toEqual(['user', 'assistant', 'user']);
    const first = m[0].content as { type: string }[];
    expect(first.map((b) => b.type)).toEqual(['text', 'image', 'document']);
    expect(m[1].content).toEqual([
      { type: 'text', text: 'Let me scan.' },
      { type: 'tool_use', id: 'call_1', name: 'i2c_scan', input: { sda: 21, scl: 22 } },
    ]);
    const last = m[2].content as { type: string; tool_use_id?: string }[];
    expect(last[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'call_1', is_error: false });
    expect(last[1]).toEqual({ type: 'text', text: 'and now?' });
  });

  it('replays its own raw content unchanged', () => {
    const raw = [{ type: 'thinking', thinking: 'x', signature: 'sig' }, { type: 'tool_use', id: 't1', name: 'read_pins', input: {} }];
    const m = toAnthropicMessages([{ role: 'assistant', text: '', toolCalls: [], raw: { provider: 'anthropic', data: raw } }]);
    expect(m[0].content).toBe(raw);
  });

  it('keeps tool schemas as input_schema', () => {
    const tools = toAnthropicTools(TOOLS);
    expect(tools).toHaveLength(TOOLS.length);
    expect(tools[0].input_schema.type).toBe('object');
  });

  it('parses a tool_use answer and a refusal', () => {
    const r = parseAnthropicResponse({
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Checking.', citations: null },
        { type: 'tool_use', id: 'toolu_1', name: 'pullup_check', input: { pins: [21, 22] }, caller: { type: 'direct' } },
      ] as never,
    });
    expect(r.stop).toBe('tool_use');
    expect(r.toolCalls).toEqual([{ id: 'toolu_1', name: 'pullup_check', input: { pins: [21, 22] } }]);
    expect(r.text).toBe('Checking.');
    expect(parseAnthropicResponse({ stop_reason: 'refusal', content: [] }).stop).toBe('refusal');
  });
});

/* ---------------- OpenAI ---------------- */

const OPENAI_TOOL_TURN: OpenAiResponse = {
  status: 'completed',
  output: [
    { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'gAAAA...' },
    { type: 'function_call', id: 'fc_1', call_id: 'call_abc', name: 'i2c_scan', arguments: '{"sda":22,"scl":21}', status: 'completed' },
  ],
};

const OPENAI_FINAL: OpenAiResponse = {
  status: 'completed',
  output: [
    {
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: '{"message":"SDA and SCL are crossed.","confidence":"measured","sources":[],"highlight":["pin:D21"],"nextOptions":[]}', annotations: [] } as never],
    },
  ],
};

describe('OpenAI conversion', () => {
  it('maps user parts to input_text, input_image and input_file data URLs', () => {
    const input = toOpenAiInput(CONVO);
    expect(input[0]).toEqual({
      role: 'user',
      content: [
        { type: 'input_text', text: 'context' },
        { type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgo=', detail: 'auto' },
        { type: 'input_file', filename: 'datasheet.pdf', file_data: 'data:application/pdf;base64,JVBERi0=' },
      ],
    });
    expect(input[1]).toEqual({ role: 'assistant', content: 'Let me scan.' });
    expect(input[2]).toEqual({ type: 'function_call', call_id: 'call_1', name: 'i2c_scan', arguments: '{"sda":21,"scl":22}' });
    expect(input[3]).toEqual({ type: 'function_call_output', call_id: 'call_1', output: '{"found":["0x76"]}' });
  });

  it('replays reasoning items and function calls from its own raw output', () => {
    const parsed = parseOpenAiResponse(OPENAI_TOOL_TURN);
    const input = toOpenAiInput([{ role: 'assistant', text: parsed.text, toolCalls: parsed.toolCalls, raw: parsed.raw }]);
    expect(input[0]).toMatchObject({ type: 'reasoning', id: 'rs_1', encrypted_content: 'gAAAA...' });
    expect(input[1]).toEqual({ type: 'function_call', call_id: 'call_abc', name: 'i2c_scan', arguments: '{"sda":22,"scl":21}' });
  });

  it('marks error tool results', () => {
    const input = toOpenAiInput([{ role: 'tool', results: [{ callId: 'c', name: 'adc_read', content: 'agent not connected', isError: true }] }]);
    expect(input[0]).toEqual({ type: 'function_call_output', call_id: 'c', output: 'Error: agent not connected' });
  });

  it('uses strict tools only where the schema allows it', () => {
    const tools = toOpenAiTools(TOOLS);
    const strict = Object.fromEntries(tools.map((t) => [t.name, t.strict]));
    expect(strict.i2c_scan).toBe(true);
    expect(strict.get_log).toBe(false); // limit is optional
    expect(tools.every((t) => t.type === 'function')).toBe(true);
    expect(toOpenAiFormat({ name: 'x', schema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false } }).format).toMatchObject({
      type: 'json_schema',
      name: 'x',
      strict: true,
    });
  });

  it('parses tool calls, final text, refusals and truncation', () => {
    const t = parseOpenAiResponse(OPENAI_TOOL_TURN);
    expect(t.stop).toBe('tool_use');
    expect(t.toolCalls).toEqual([{ id: 'call_abc', name: 'i2c_scan', input: { sda: 22, scl: 21 } }]);
    const f = parseOpenAiResponse(OPENAI_FINAL);
    expect(f.stop).toBe('end');
    expect(JSON.parse(f.text).confidence).toBe('measured');
    expect(parseOpenAiResponse({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }).stop).toBe('refusal');
    expect(parseOpenAiResponse({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }).stop).toBe('max_tokens');
  });

  it('lists chat models only', () => {
    const models = filterOpenAiModels([
      { id: 'gpt-6-sol', created: 3 },
      { id: 'text-embedding-3-large', created: 2 },
      { id: 'gpt-6-luna', created: 4 },
      { id: 'gpt-realtime', created: 5 },
      { id: 'whisper-1', created: 1 },
    ]);
    expect(models.map((m) => m.id)).toEqual(['gpt-6-luna', 'gpt-6-sol']);
  });
});

/* ---------------- Gemini ---------------- */

const GEMINI_TOOL_TURN: GeminiResponse = {
  candidates: [
    {
      content: {
        role: 'model',
        parts: [
          { text: 'thinking about the bus', thought: true },
          { functionCall: { id: 'fc-9', name: 'pullup_check', args: { pins: [21, 22] } }, thoughtSignature: 'SIG==' },
        ],
      },
      finishReason: 'STOP',
    },
  ],
};

describe('Gemini schema sanitizing', () => {
  it('removes keywords Gemini rejects from every tool', () => {
    const decl = toGeminiTools(TOOLS)[0].functionDeclarations;
    expect(decl).toHaveLength(TOOLS.length);
    for (const d of decl) {
      walk(d.parametersJsonSchema, (o) => {
        expect(o).not.toHaveProperty('additionalProperties');
        if (Array.isArray(o.enum)) expect(o.enum.every((e) => typeof e === 'string')).toBe(true);
      });
    }
  });

  it('turns number enums into a range with a note and keeps string enums', () => {
    const s = sanitizeForGemini({
      type: 'object',
      properties: { level: { type: 'integer', enum: [0, 1], description: 'pin level' }, mode: { type: 'string', enum: ['a', 'b'] } },
      required: ['level'],
      additionalProperties: false,
      $schema: 'x',
    });
    expect(s).toEqual({
      type: 'object',
      properties: {
        level: { type: 'integer', minimum: 0, maximum: 1, description: 'pin level One of: 0, 1.' },
        mode: { type: 'string', enum: ['a', 'b'] },
      },
      required: ['level'],
    });
  });

  it('gives empty objects a properties map and drops empty required lists', () => {
    expect(sanitizeForGemini({ type: 'object', properties: {}, required: [], additionalProperties: false })).toEqual({ type: 'object', properties: {} });
  });
});

describe('Gemini conversion', () => {
  it('maps parts to inlineData and tool results to functionResponse', () => {
    const c = toGeminiContents(CONVO);
    expect(c.map((x) => x.role)).toEqual(['user', 'model', 'user']);
    expect(c[0].parts[1]).toEqual({ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } });
    expect(c[0].parts[2]).toEqual({ inlineData: { mimeType: 'application/pdf', data: 'JVBERi0=' } });
    expect(c[1].parts[1]).toEqual({ functionCall: { id: 'call_1', name: 'i2c_scan', args: { sda: 21, scl: 22 } } });
    expect(c[2].parts[0]).toEqual({ functionResponse: { id: 'call_1', name: 'i2c_scan', response: { output: { found: ['0x76'] } } } });
    expect(c[2].parts[1]).toEqual({ text: 'and now?' });
  });

  it('replays thought signatures unchanged and never sends made-up ids', () => {
    const parsed = parseGeminiResponse(GEMINI_TOOL_TURN);
    const c = toGeminiContents([{ role: 'assistant', text: parsed.text, toolCalls: parsed.toolCalls, raw: parsed.raw }]);
    expect(c[0].parts[1]).toEqual({ functionCall: { id: 'fc-9', name: 'pullup_check', args: { pins: [21, 22] } }, thoughtSignature: 'SIG==' });

    const noId = parseGeminiResponse({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'read_pins', args: {} } }] }, finishReason: 'STOP' }] });
    const callId = noId.toolCalls[0].id;
    const back = toGeminiContents([{ role: 'tool', results: [{ callId, name: 'read_pins', content: 'boom', isError: true }] }]);
    expect(back[0].parts[0]).toEqual({ functionResponse: { name: 'read_pins', response: { error: 'boom' } } });
  });

  it('parses tool calls, hides thoughts, and maps finish reasons', () => {
    const r = parseGeminiResponse(GEMINI_TOOL_TURN);
    expect(r.stop).toBe('tool_use');
    expect(r.text).toBe('');
    expect(r.toolCalls).toEqual([{ id: 'fc-9', name: 'pullup_check', input: { pins: [21, 22] } }]);
    expect(parseGeminiResponse({ candidates: [{ content: { role: 'model', parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }] })).toMatchObject({ stop: 'end', text: '{"a":1}' });
    expect(parseGeminiResponse({ candidates: [{ content: { role: 'model', parts: [{ text: '{"a"' }] }, finishReason: 'MAX_TOKENS' }] }).stop).toBe('max_tokens');
    expect(parseGeminiResponse({ candidates: [{ finishReason: 'SAFETY' }] }).stop).toBe('refusal');
    expect(parseGeminiResponse({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }).stop).toBe('refusal');
  });

  it('lists text models only', () => {
    const models = filterGeminiModels([
      { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: ['generateContent', 'countTokens'] },
      { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
    ]);
    expect(models.map((m) => m.id)).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  });
});

describe('OpenAI strict schema check', () => {
  it('needs every property required and additionalProperties false', () => {
    expect(isStrictCompatible({ type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false })).toBe(true);
    expect(isStrictCompatible({ type: 'object', properties: { a: { type: 'string' } }, required: [], additionalProperties: false })).toBe(false);
    expect(isStrictCompatible({ type: 'object', properties: { a: { type: 'object', properties: {} } }, required: ['a'], additionalProperties: false })).toBe(false);
  });
});

/* ---------------- errors ---------------- */

describe('provider errors', () => {
  it('maps recorded error bodies to kinds', () => {
    expect(httpError('openai', 401, { error: { message: 'Incorrect API key provided: sk-abc***', type: 'invalid_request_error', code: 'invalid_api_key' } }).kind).toBe('auth');
    expect(httpError('openai', 429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.', code: 'insufficient_quota' } }).kind).toBe('quota');
    expect(httpError('openai', 429, { error: { message: 'Rate limit reached for requests', code: 'rate_limit_exceeded' } }).kind).toBe('rate');
    expect(httpError('openai', 404, { error: { message: 'The model `gpt-9` does not exist', code: 'model_not_found' } }).kind).toBe('model');
    expect(
      httpError('gemini', 400, {
        error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] },
      }).kind,
    ).toBe('auth');
    expect(httpError('gemini', 404, { error: { code: 404, message: 'models/gemini-0 is not found for API version v1beta', status: 'NOT_FOUND' } }).kind).toBe('model');
    expect(httpError('gemini', 429, { error: { code: 429, message: 'Resource has been exhausted', status: 'RESOURCE_EXHAUSTED' } }).kind).toBe('rate');
    expect(httpError('gemini', 503, { error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } }).kind).toBe('server');
    expect(httpError('openai', 400, { error: { message: "Invalid schema for function 'x'" } }).kind).toBe('bad_request');
  });

  it('turns provider errors into plain-language app errors', () => {
    const auth = toAiError(new ProviderError('auth', 'openai', 'bad'), 'openai', 'gpt-6-sol');
    expect(auth.code).toBe('ai_auth');
    expect(auth.humanMessage).toContain('GPT (OpenAI)');
    expect(toAiError(new ProviderError('model', 'gemini', 'x', 404), 'gemini', 'gemini-0').humanMessage).toContain('gemini-0');
    expect(toAiError(new ProviderError('offline', 'anthropic', 'x'), 'anthropic', 'm').code).toBe('ai_offline');
    expect(toAiError(new Error('boom'), 'anthropic', 'm').code).toBe('ai_error');
  });
});

/* ---------------- HTTP calls with a stubbed fetch ---------------- */

type FetchArgs = [string, RequestInit];

function stubFetch(answers: (() => Response | Promise<Response>)[]) {
  const calls: FetchArgs[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push([url, init]);
    const next = answers.shift();
    if (!next) throw new Error('unexpected fetch');
    return Promise.resolve(next());
  });
  return calls;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('HTTP providers', () => {
  it('OpenAI sends the key as a bearer header and asks for strict JSON output', async () => {
    const calls = stubFetch([() => json(200, OPENAI_FINAL)]);
    const p = new OpenAiProvider('sk-test-000000000000');
    const r = await p.chat({ model: 'gpt-6-sol', system: 'sys', messages: CONVO, tools: TOOLS, jsonSchema: { name: 'reply', schema: { type: 'object', properties: {}, required: [], additionalProperties: false } }, maxTokens: 100 });
    expect(r.stop).toBe('end');
    const [url, init] = calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test-000000000000');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'gpt-6-sol', instructions: 'sys', store: false, max_output_tokens: 100, text: { format: { type: 'json_schema', name: 'reply', strict: true } } });
  });

  it('Gemini sends the key in a header, not the URL, and retries without JSON mode when a model refuses it with tools', async () => {
    const calls = stubFetch([
      () => json(400, { error: { code: 400, message: 'Function calling with a response mime type: application/json is unsupported', status: 'INVALID_ARGUMENT' } }),
      () => json(200, GEMINI_TOOL_TURN),
    ]);
    const p = new GeminiProvider('AIza-test-000000000000');
    const r = await p.chat({ model: 'gemini-2.5-flash', system: 'sys', messages: CONVO, tools: TOOLS, jsonSchema: { name: 'reply', schema: { type: 'object', properties: {} } }, maxTokens: 100 });
    expect(r.stop).toBe('tool_use');
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(calls[0][0]).not.toContain('AIza');
    expect((calls[0][1].headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test-000000000000');
    const first = JSON.parse(String(calls[0][1].body)) as { generationConfig: Record<string, unknown>; systemInstruction: unknown };
    const second = JSON.parse(String(calls[1][1].body)) as { generationConfig: Record<string, unknown> };
    expect(first.generationConfig.responseMimeType).toBe('application/json');
    expect(first.systemInstruction).toEqual({ parts: [{ text: 'sys' }] });
    expect(second.generationConfig.responseMimeType).toBeUndefined();
  });

  it('maps a network failure to offline and a slow answer to timeout', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')));
    await expect(httpJson('openai', 'https://x.test', { headers: {} })).rejects.toMatchObject({ kind: 'offline' });
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    await expect(httpJson('gemini', 'https://x.test', { headers: {}, timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout' });
  });
});

/* ---------------- settings ---------------- */

const fakeBox = (available = true): SecretBox => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from(`enc:${[...s].reverse().join('')}`),
  decryptString: (b) => [...b.toString().replace(/^enc:/, '')].reverse().join(''),
});

describe('AI settings store', () => {
  const KEY = 'sk-proj-SECRET-1234567890abcd';
  const tmp = () => join(mkdtempSync(join(tmpdir(), 'bp-ai-')), 'settings.json');

  it('stores keys encrypted and never exposes them in the view', () => {
    const file = tmp();
    const s = new AiSettingsStore(file, fakeBox(), {});
    const r = s.save({ provider: 'openai', model: 'gpt-6-luna', apiKey: KEY });
    expect(r.ok).toBe(true);
    const onDisk = readFileSync(file, 'utf8');
    expect(onDisk).not.toContain(KEY);
    const view = s.view();
    expect(JSON.stringify(view)).not.toContain(KEY);
    expect(JSON.stringify(r)).not.toContain(KEY);
    expect(view.provider).toBe('openai');
    expect(view.model).toBe('gpt-6-luna');
    expect(view.providers.openai).toEqual({ hasKey: true, keyHint: '…abcd', keySource: 'saved', model: 'gpt-6-luna' });
    expect(view.providers.gemini.hasKey).toBe(false);
    // a fresh store reads the encrypted key back (main process only)
    expect(new AiSettingsStore(file, fakeBox(), {}).getKey('openai')).toBe(KEY);
  });

  it('falls back to .env.local keys and prefers the provider that has one', () => {
    const s = new AiSettingsStore(tmp(), fakeBox(), { GEMINI_API_KEY: 'test-gemini-env-key-wxyz' });
    expect(s.provider).toBe('gemini');
    expect(s.getKey('gemini')).toBe('test-gemini-env-key-wxyz');
    expect(s.view().providers.gemini).toMatchObject({ hasKey: true, keySource: 'env', keyHint: '…wxyz' });
    expect(JSON.stringify(s.view())).not.toContain('AIzaSyEnvKey');
    expect(s.model()).toBe('gemini-3.8-flash');
  });

  it('refuses to save a key when encryption is unavailable', () => {
    const file = tmp();
    const s = new AiSettingsStore(file, fakeBox(false), {});
    const r = s.save({ provider: 'anthropic', model: '', apiKey: KEY });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('no_encryption');
    expect(existsSync(file)).toBe(false);
    expect(s.getKey('anthropic')).toBeNull();
  });

  it('rejects malformed keys and clears saved keys', () => {
    const s = new AiSettingsStore(tmp(), fakeBox(), {});
    const bad = s.save({ provider: 'anthropic', model: '', apiKey: 'sk-ant short' });
    expect(bad.ok).toBe(false);
    expect(s.save({ provider: 'anthropic', model: '', apiKey: KEY }).ok).toBe(true);
    expect(s.model()).toBe('claude-sonnet-5');
    const cleared = s.clearKey('anthropic');
    expect(cleared.ok && cleared.value.providers.anthropic.hasKey).toBe(false);
    expect(s.getKey('anthropic')).toBeNull();
    expect(keyHint('short')).toBe('…');
  });
});
