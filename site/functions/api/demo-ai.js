// BoardPilot "Free demo" AI relay (Cloudflare Pages Function, route /api/demo-ai).
//
// The desktop app's "Free demo" provider posts a Gemini generateContent request body here. This
// function holds the owner's free-tier Gemini key as an encrypted secret (GEMINI_API_KEY), checks
// and trims the request, applies per-IP limits and forwards it to Google. The key never leaves
// this function: it is not in the app, not in the repo and never in a response.
//
// Environment (Cloudflare dashboard -> Workers & Pages -> boardpilot -> Settings -> Variables and Secrets):
//   GEMINI_API_KEY      secret, required. Free-tier key from a Google Cloud project WITHOUT billing.
//   DEMO_MODEL          optional, default below. Any Gemini model the key can use.
//   DEMO_RATE_PER_MIN   optional, default 10 requests per minute per IP.
//   DEMO_RATE_PER_DAY   optional, default 150 requests per day per IP.
//   DEMO_KV             optional KV namespace binding for the rate counters (global). Without it the
//                       counters live in the Cache API of each Cloudflare data center (best effort).
//
// Default model: gemini-3.1-flash-lite, the older stable Flash-Lite with a free tier, function
// calling, structured outputs and Search grounding.
// Sources (checked September 2026): https://ai.google.dev/gemini-api/docs/models ("gemini-3.1-flash-lite",
// stable), https://ai.google.dev/gemini-api/docs/pricing (free tier; Grounding with Google Search
// free up to 5,000 prompts per month, shared), https://ai.google.dev/api/generate-content (Tool:
// functionDeclarations, googleSearch; GenerationConfig: maxOutputTokens, thinkingConfig).
//
// Nothing here logs request or response bodies.

export const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
export const MAX_BODY_BYTES = 48 * 1024;
export const MAX_OUTPUT_TOKENS = 2048;
const DEFAULT_PER_MIN = 10;
const DEFAULT_PER_DAY = 150;
const UPSTREAM = 'https://generativelanguage.googleapis.com/v1beta/models/';
const UPSTREAM_TIMEOUT_MS = 90_000;
/** "<app>/<version>", e.g. "BoardPilot/0.3.0". */
const CLIENT_RE = /^[A-Za-z][A-Za-z0-9._-]{0,39}\/[0-9][0-9A-Za-z.+-]{0,31}$/;
const MODEL_RE = /^[a-z0-9][a-z0-9.-]{1,80}$/;
const INLINE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const CALLING_MODES = new Set(['AUTO', 'ANY', 'NONE', 'VALIDATED']);

const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

class BadRequest extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

const fail = (status, code, message, headers) => json(status, { error: { code, message } }, headers);

function config(env) {
  const num = (v, d) => {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  const model = typeof env.DEMO_MODEL === 'string' && MODEL_RE.test(env.DEMO_MODEL.trim()) ? env.DEMO_MODEL.trim() : DEFAULT_MODEL;
  return {
    model,
    perMinute: num(env.DEMO_RATE_PER_MIN, DEFAULT_PER_MIN),
    perDay: num(env.DEMO_RATE_PER_DAY, DEFAULT_PER_DAY),
  };
}

/* ---------------- request sanitizing ---------------- */

function cleanPart(p) {
  if (!isObj(p)) throw new BadRequest('bad_request', 'Every part must be an object.');
  const out = {};
  if (typeof p.text === 'string') out.text = p.text;
  if (p.thought === true) out.thought = true;
  if (typeof p.thoughtSignature === 'string') out.thoughtSignature = p.thoughtSignature;
  if (isObj(p.inlineData)) {
    const { mimeType, data } = p.inlineData;
    if (!INLINE_TYPES.has(mimeType) || typeof data !== 'string') throw new BadRequest('bad_request', 'Only JPEG, PNG, WebP images and PDF files are accepted.');
    out.inlineData = { mimeType, data };
  }
  if (isObj(p.functionCall) && typeof p.functionCall.name === 'string') {
    out.functionCall = { name: p.functionCall.name, args: isObj(p.functionCall.args) ? p.functionCall.args : {} };
    if (typeof p.functionCall.id === 'string') out.functionCall.id = p.functionCall.id;
  }
  if (isObj(p.functionResponse) && typeof p.functionResponse.name === 'string') {
    out.functionResponse = { name: p.functionResponse.name, response: isObj(p.functionResponse.response) ? p.functionResponse.response : {} };
    if (typeof p.functionResponse.id === 'string') out.functionResponse.id = p.functionResponse.id;
  }
  // fileData (file URIs), executableCode and anything else is dropped.
  return out;
}

function cleanTools(tools) {
  if (tools === undefined) return undefined;
  if (!Array.isArray(tools) || tools.length > 4) throw new BadRequest('bad_request', 'tools must be a short list.');
  const out = [];
  for (const tool of tools) {
    if (!isObj(tool)) throw new BadRequest('bad_request', 'Every tool must be an object.');
    const keys = Object.keys(tool);
    if (keys.length === 1 && Array.isArray(tool.functionDeclarations)) {
      if (tool.functionDeclarations.length > 32) throw new BadRequest('bad_request', 'Too many functions.');
      out.push({
        functionDeclarations: tool.functionDeclarations.map((f) => {
          if (!isObj(f) || typeof f.name !== 'string') throw new BadRequest('bad_request', 'Every function needs a name.');
          const d = { name: f.name, description: typeof f.description === 'string' ? f.description : '' };
          if (isObj(f.parametersJsonSchema)) d.parametersJsonSchema = f.parametersJsonSchema;
          else if (isObj(f.parameters)) d.parameters = f.parameters;
          return d;
        }),
      });
    } else if (keys.length === 1 && (isObj(tool.google_search) || isObj(tool.googleSearch))) {
      out.push({ google_search: {} });
    } else {
      throw new BadRequest('tool_not_allowed', 'Only function declarations and Google Search are allowed in the free demo.');
    }
  }
  return out;
}

function thinkingFor(model) {
  // Thinking tokens count toward maxOutputTokens, so keep thinking short under the 2048 cap.
  if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: 'low' };
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 512 };
  return undefined;
}

function cleanGeneration(g, model) {
  const src = isObj(g) ? g : {};
  const out = { candidateCount: 1 };
  const max = Number(src.maxOutputTokens);
  out.maxOutputTokens = Number.isFinite(max) && max >= 1 ? Math.min(Math.floor(max), MAX_OUTPUT_TOKENS) : MAX_OUTPUT_TOKENS;
  for (const k of ['temperature', 'topP', 'topK']) if (typeof src[k] === 'number' && Number.isFinite(src[k])) out[k] = src[k];
  if (src.responseMimeType === 'application/json' || src.responseMimeType === 'text/plain') out.responseMimeType = src.responseMimeType;
  if (isObj(src.responseJsonSchema)) out.responseJsonSchema = src.responseJsonSchema;
  else if (isObj(src.responseSchema)) out.responseSchema = src.responseSchema;
  if (Array.isArray(src.stopSequences)) out.stopSequences = src.stopSequences.filter((s) => typeof s === 'string').slice(0, 5);
  const thinking = thinkingFor(model);
  if (thinking) out.thinkingConfig = thinking;
  return out;
}

/** Copy only the fields the app uses. model, key, URL, cachedContent, safetySettings and any
 *  other field sent by the client are dropped here. */
export function sanitizeRequest(input, model = DEFAULT_MODEL) {
  if (!isObj(input)) throw new BadRequest('bad_request', 'The body must be a JSON object.');
  if (!Array.isArray(input.contents) || input.contents.length === 0 || input.contents.length > 80) {
    throw new BadRequest('bad_request', 'contents must be a list of 1 to 80 turns.');
  }
  const out = {
    contents: input.contents.map((c) => {
      if (!isObj(c) || (c.role !== 'user' && c.role !== 'model') || !Array.isArray(c.parts)) {
        throw new BadRequest('bad_request', 'Every turn needs a role (user or model) and parts.');
      }
      const parts = c.parts.map(cleanPart).filter((p) => Object.keys(p).length > 0);
      if (!parts.length) throw new BadRequest('bad_request', 'Every turn needs at least one text, image or function part.');
      return { role: c.role, parts };
    }),
    generationConfig: cleanGeneration(input.generationConfig, model),
  };
  if (isObj(input.systemInstruction) && Array.isArray(input.systemInstruction.parts)) {
    const parts = input.systemInstruction.parts.filter((p) => isObj(p) && typeof p.text === 'string').map((p) => ({ text: p.text }));
    if (parts.length) out.systemInstruction = { parts };
  }
  const tools = cleanTools(input.tools);
  if (tools && tools.length) out.tools = tools;
  const fc = isObj(input.toolConfig) && isObj(input.toolConfig.functionCallingConfig) ? input.toolConfig.functionCallingConfig : null;
  if (fc && out.tools) {
    const cfg = {};
    if (CALLING_MODES.has(fc.mode)) cfg.mode = fc.mode;
    if (Array.isArray(fc.allowedFunctionNames)) cfg.allowedFunctionNames = fc.allowedFunctionNames.filter((n) => typeof n === 'string').slice(0, 32);
    out.toolConfig = { functionCallingConfig: cfg };
  }
  return out;
}

/* ---------------- body size ---------------- */

async function readLimited(request, max) {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/* ---------------- per-IP rate limit ---------------- */

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/** Counter storage: KV if bound (global, eventually consistent), else the Cache API of this data center. */
function counterStore(env, requestUrl) {
  if (env.DEMO_KV && typeof env.DEMO_KV.get === 'function') {
    const kv = env.DEMO_KV;
    return {
      async get(key) {
        return Number.parseInt((await kv.get(`rate:${key}`)) ?? '0', 10) || 0;
      },
      async set(key, value, ttlSec) {
        await kv.put(`rate:${key}`, String(value), { expirationTtl: Math.max(60, ttlSec) });
      },
    };
  }
  const cache = typeof caches !== 'undefined' ? caches.default : undefined;
  if (!cache) return null;
  const req = (key) => new Request(new URL(`/__demo-ai-rate/${key}`, requestUrl).toString());
  return {
    async get(key) {
      const hit = await cache.match(req(key));
      return hit ? Number.parseInt(await hit.text(), 10) || 0 : 0;
    },
    async set(key, value, ttlSec) {
      await cache.put(req(key), new Response(String(value), { headers: { 'Cache-Control': `max-age=${ttlSec}` } }));
    },
  };
}

/** Counts one request. Returns null when allowed, or the seconds to wait when a limit is reached. */
export async function rateLimit(env, request, cfg, now = Date.now()) {
  const store = counterStore(env, request.url);
  if (!store) return null;
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
  const sec = Math.floor(now / 1000);
  const windows = [
    { name: 'm', size: 60, limit: cfg.perMinute },
    { name: 'd', size: 86_400, limit: cfg.perDay },
  ];
  const keys = await Promise.all(windows.map(async (w) => `${w.name}/${await sha256(`${ip}|${w.name}|${Math.floor(sec / w.size)}`)}`));
  const counts = await Promise.all(keys.map((k) => store.get(k)));
  for (let i = 0; i < windows.length; i++) {
    if (counts[i] >= windows[i].limit) return windows[i].size - (sec % windows[i].size);
  }
  await Promise.all(keys.map((k, i) => store.set(k, counts[i] + 1, windows[i].size - (sec % windows[i].size))));
  return null;
}

/* ---------------- handlers ---------------- */

const scrub = (text, key) => (key ? text.split(key).join('[redacted]') : text);

export async function onRequestGet(context) {
  const cfg = config(context.env ?? {});
  return json(200, {
    ok: true,
    model: cfg.model,
    configured: Boolean(context.env?.GEMINI_API_KEY),
    limits: { perMinute: cfg.perMinute, perDay: cfg.perDay, maxBodyBytes: MAX_BODY_BYTES, maxOutputTokens: MAX_OUTPUT_TOKENS },
    rateStore: context.env?.DEMO_KV ? 'kv' : 'cache',
  });
}

/** No CORS headers on purpose: the relay is for the desktop app, not for other websites. */
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { Allow: 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' } });
}

export async function onRequestPost(context) {
  const { request } = context;
  const env = context.env ?? {};
  const cfg = config(env);
  const key = typeof env.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY.trim() : '';

  const client = request.headers.get('X-BoardPilot-Client') ?? '';
  if (!CLIENT_RE.test(client)) return fail(400, 'client_required', 'This endpoint is only for the BoardPilot app (X-BoardPilot-Client header missing).');
  if (!key) return fail(503, 'demo_not_configured', 'The free demo is not set up yet (demo not configured).');
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().includes('application/json')) return fail(415, 'bad_request', 'Send JSON.');

  const raw = await readLimited(request, MAX_BODY_BYTES);
  if (raw === null) return fail(413, 'too_large', `The request is larger than ${MAX_BODY_BYTES / 1024} KB, the limit of the free demo.`);

  let clean;
  try {
    clean = sanitizeRequest(JSON.parse(raw), cfg.model);
  } catch (e) {
    if (e instanceof BadRequest) return fail(400, e.code, e.message);
    return fail(400, 'bad_request', 'The body is not valid JSON.');
  }

  const wait = await rateLimit(env, request, cfg);
  if (wait !== null) {
    return fail(429, 'rate_limited', 'The free demo is busy or you reached its limit. Try again in a minute, or add your own key.', { 'Retry-After': String(Math.min(wait, 3600)) });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  let res;
  let text;
  try {
    res = await fetch(`${UPSTREAM}${encodeURIComponent(cfg.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(clean),
      signal: ctrl.signal,
    });
    text = await res.text();
  } catch {
    return ctrl.signal.aborted ? fail(504, 'upstream_timeout', 'The AI service took too long to answer.') : fail(502, 'upstream_unreachable', 'The relay could not reach the AI service.');
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) {
    return new Response(scrub(text, key), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Demo-Model': cfg.model } });
  }
  let message = '';
  try {
    const m = JSON.parse(text)?.error?.message;
    if (typeof m === 'string') message = scrub(m, key).slice(0, 300);
  } catch {
    // not JSON
  }
  const status = res.status;
  if (status === 429) return fail(429, 'upstream_busy', 'The free demo is busy or you reached its limit. Try again in a minute, or add your own key.', { 'Retry-After': '60' });
  if (status === 401 || status === 403) return fail(503, 'demo_not_configured', 'The free demo is not set up yet (the relay key was refused).');
  if (status === 404) return fail(503, 'demo_not_configured', 'The free demo is not set up yet (model not available).');
  if (status === 400) return fail(400, 'bad_request', message || 'The AI service rejected the request.');
  return fail(502, 'upstream_error', `The AI service returned an error (${status}).`);
}
