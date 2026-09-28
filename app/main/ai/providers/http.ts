// Small JSON-over-HTTPS helper for the providers called with the built-in fetch (OpenAI, Gemini).
// Every call has a timeout; every failure becomes a typed ProviderError.

import type { AiProviderId } from '@shared/ai';
import { DEFAULT_TIMEOUT_MS, ProviderError, type ProviderErrorKind } from './types';

interface ErrorBody {
  error?: { message?: unknown; code?: unknown; type?: unknown; status?: unknown; details?: unknown };
}

/** Map an HTTP error answer to a ProviderError. Pure, so it is unit-tested with recorded bodies. */
export function httpError(provider: AiProviderId, status: number, body: unknown): ProviderError {
  const e = (typeof body === 'object' && body !== null ? (body as ErrorBody).error : undefined) ?? {};
  const message = typeof e.message === 'string' && e.message ? e.message : `HTTP ${status}`;
  const code = typeof e.code === 'string' ? e.code : '';
  const gstatus = typeof e.status === 'string' ? e.status : '';
  const details = JSON.stringify(e.details ?? '');
  let kind: ProviderErrorKind;
  if (status === 401 || code === 'invalid_api_key' || details.includes('API_KEY_INVALID') || /api key not valid|invalid api key|incorrect api key/i.test(message)) kind = 'auth';
  else if (code === 'insufficient_quota' || /billing|credit balance|insufficient.?quota/i.test(message)) kind = 'quota';
  else if (status === 403 || gstatus === 'PERMISSION_DENIED') kind = 'auth';
  else if (status === 429) kind = 'rate';
  else if (status === 404 || code === 'model_not_found' || (/model/i.test(message) && /not found|does not exist|not supported for/i.test(message))) kind = 'model';
  else if (status >= 500) kind = 'server';
  else kind = 'bad_request';
  return new ProviderError(kind, provider, message, status);
}

export interface HttpOptions {
  method?: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export async function httpJson<T>(provider: AiProviderId, url: string, opts: HttpOptions): Promise<T> {
  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: { ...(opts.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...opts.headers },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (ctrl.signal.aborted) throw new ProviderError('timeout', provider, `No answer within ${Math.round(timeoutMs / 1000)} s`);
    throw new ProviderError('offline', provider, e instanceof Error ? e.message : String(e));
  }
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    clearTimeout(timer);
    if (ctrl.signal.aborted) throw new ProviderError('timeout', provider, `No answer within ${Math.round(timeoutMs / 1000)} s`);
    throw new ProviderError('offline', provider, e instanceof Error ? e.message : String(e));
  }
  clearTimeout(timer);
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) throw httpError(provider, res.status, body ?? { error: { message: text.slice(0, 300) } });
  if (body === null) throw new ProviderError('server', provider, 'The answer was not JSON', res.status);
  return body as T;
}
