import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getLocalModel } from '@shared/localModels';
import { ModelStore, modelBaseUrl, type DownloadProgress } from '../app/main/ai/local/store';

// A stand-in for Hugging Face: serves one fake model file with Range support and the
// x-linked-etag header (the file's SHA-256). Behaviour is switched per test.
const model = getLocalModel('qwen3-4b')!;
const payload = Buffer.alloc(300_000, 7).map((_, i) => (i * 31 + 5) % 251);
const goodHash = createHash('sha256').update(payload).digest('hex');
let mode: 'ok' | 'bad_hash' | 'short' | 'error' | 'no_range' = 'ok';
let requests: { range?: string }[] = [];
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push({ range: req.headers.range });
    if (mode === 'error') {
      res.writeHead(503).end();
      return;
    }
    const m = /^bytes=(\d+)-$/.exec(req.headers.range ?? '');
    const start = m && mode !== 'no_range' ? Number(m[1]) : 0;
    if (start >= payload.length) {
      res.writeHead(416).end();
      return;
    }
    const body = mode === 'short' ? payload.subarray(start, start + 1000) : payload.subarray(start);
    const headers: Record<string, string | number> = { 'content-length': mode === 'short' ? payload.length - start : body.length };
    headers['x-linked-etag'] = `"${mode === 'bad_hash' ? 'f'.repeat(64) : goodHash}"`;
    if (start > 0) headers['content-range'] = `bytes ${start}-${payload.length - 1}/${payload.length}`;
    res.writeHead(start > 0 ? 206 : 200, headers);
    if (mode === 'short') {
      // The connection drops halfway through the file.
      res.write(body, () => res.socket?.destroy());
      return;
    }
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

let dir = '';
let store: ModelStore;
beforeEach(() => {
  mode = 'ok';
  requests = [];
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = mkdtempSync(join(tmpdir(), 'bp-models-'));
  store = new ModelStore(dir, { baseUrl: base });
});

describe('downloading an offline model', () => {
  it('downloads, checks the hash, records it and lists the model as installed', async () => {
    const seen: DownloadProgress[] = [];
    const r = await store.download('qwen3-4b', (p) => seen.push(p));
    expect(r.ok).toBe(true);
    expect(readFileSync(join(dir, model.file)).equals(payload)).toBe(true);
    expect(existsSync(join(dir, model.file + '.part'))).toBe(false);
    expect(store.installed().map((i) => i.id)).toEqual(['qwen3-4b']);
    expect(store.pathOf('qwen3-4b')).toBe(join(dir, model.file));
    expect(seen.at(-1)?.phase).toBe('verifying');
    expect(seen.filter((p) => p.phase === 'downloading').at(-1)?.received).toBe(payload.length);
    expect(seen[0].total).toBe(payload.length);
  });

  it('does nothing when the model is already there', async () => {
    await store.download('qwen3-4b', () => {});
    requests = [];
    const r = await store.download('qwen3-4b', () => {});
    expect(r.ok).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it('resumes a partial download with a Range request', async () => {
    writeFileSync(join(dir, model.file + '.part'), payload.subarray(0, 100_000));
    expect(store.partialBytes('qwen3-4b')).toBe(100_000);
    const r = await store.download('qwen3-4b', () => {});
    expect(r.ok).toBe(true);
    expect(requests[0].range).toBe('bytes=100000-');
    expect(readFileSync(join(dir, model.file)).equals(payload)).toBe(true);
  });

  it('starts again when the server ignores the Range header', async () => {
    mode = 'no_range';
    writeFileSync(join(dir, model.file + '.part'), payload.subarray(0, 100_000));
    const r = await store.download('qwen3-4b', () => {});
    expect(r.ok).toBe(true);
    expect(readFileSync(join(dir, model.file)).equals(payload)).toBe(true);
  });

  it('starts again when the partial file is bigger than the model (416)', async () => {
    writeFileSync(join(dir, model.file + '.part'), Buffer.concat([payload, Buffer.from('junk')]));
    const r = await store.download('qwen3-4b', () => {});
    expect(r.ok).toBe(true);
    expect(readFileSync(join(dir, model.file)).equals(payload)).toBe(true);
  });

  it('deletes a damaged download and says so', async () => {
    mode = 'bad_hash';
    const r = await store.download('qwen3-4b', () => {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('bad_hash');
    expect(existsSync(join(dir, model.file))).toBe(false);
    expect(existsSync(join(dir, model.file + '.part'))).toBe(false);
    expect(store.installed()).toEqual([]);
  });

  it('reports a dropped connection, keeps the partial file for later, and installs nothing', async () => {
    mode = 'short';
    const r = await store.download('qwen3-4b', () => {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('download_failed');
    expect(store.installed()).toEqual([]);
    expect(store.partialBytes('qwen3-4b')).toBeGreaterThan(0);
    // The next try continues from there.
    mode = 'ok';
    const again = await store.download('qwen3-4b', () => {});
    expect(again.ok).toBe(true);
    expect(readFileSync(join(dir, model.file)).equals(payload)).toBe(true);
  });

  it('reports a server error in plain words', async () => {
    mode = 'error';
    const r = await store.download('qwen3-4b', () => {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('download_failed');
      expect(r.error.humanMessage).toContain('503');
    }
  });

  it('can be cancelled, keeps the partial file, and continues later', async () => {
    let cancelled = false;
    const r = await store.download('qwen3-4b', () => {
      if (!cancelled) {
        cancelled = true;
        store.cancel();
      }
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('cancelled');
    expect(store.downloading).toBeNull();
    expect(store.installed()).toEqual([]);
    const again = await store.download('qwen3-4b', () => {});
    expect(again.ok).toBe(true);
    expect(readFileSync(join(dir, model.file)).equals(payload)).toBe(true);
  });

  it('refuses a second download at the same time and unknown models', async () => {
    const first = store.download('qwen3-4b', () => {});
    const second = await store.download('qwen3-8b', () => {});
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('busy');
    await first;
    const bad = await store.download('gpt-6-sol', () => {});
    expect(bad.ok).toBe(false);
  });

  it('removes a model and its leftovers', async () => {
    await store.download('qwen3-4b', () => {});
    expect(store.remove('qwen3-4b').ok).toBe(true);
    expect(store.installed()).toEqual([]);
    expect(existsSync(join(dir, model.file))).toBe(false);
    expect(store.remove('nope').ok).toBe(false);
  });

  it('does not list a file whose size changed since the download', async () => {
    await store.download('qwen3-4b', () => {});
    writeFileSync(join(dir, model.file), Buffer.from('short'));
    expect(store.installed()).toEqual([]);
  });
});

describe('the download server', () => {
  it('is Hugging Face unless a mirror is set with https (or http on localhost)', () => {
    expect(modelBaseUrl({})).toBe('https://huggingface.co');
    expect(modelBaseUrl({ BOARDPILOT_MODEL_BASE_URL: 'https://mirror.example.com/' })).toBe('https://mirror.example.com');
    expect(modelBaseUrl({ BOARDPILOT_MODEL_BASE_URL: 'http://localhost:9000' })).toBe('http://localhost:9000');
    expect(modelBaseUrl({ BOARDPILOT_MODEL_BASE_URL: 'http://evil.example.com' })).toBe('https://huggingface.co');
    expect(modelBaseUrl({ BOARDPILOT_MODEL_BASE_URL: 'not a url' })).toBe('https://huggingface.co');
  });
});
