// Offline model files on disk: download (with resume and a check), list, delete.
// Files live in <app data>/models. A download goes to "<file>.part" and becomes "<file>" only after
// its size and SHA-256 were checked, with a small "<file>.json" next to it that says so.
// Hugging Face reports the SHA-256 of a file in the x-linked-etag header; when the server does not
// send one the size check alone applies.

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform, type TransformCallback } from 'node:stream';
import type { AppError, Result } from '@shared/types';
import { fail, ok } from '@shared/types';
import { getLocalModel, LOCAL_MODELS, localModelUrl, type LocalModelInfo } from '@shared/localModels';
import { t } from '@shared/i18n';

export interface DownloadProgress {
  modelId: string;
  received: number;
  total: number;
  phase: 'downloading' | 'verifying';
}

export interface InstalledModel {
  id: string;
  path: string;
  bytes: number;
}

interface Sidecar {
  bytes: number;
  sha256: string;
}

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** The download server: Hugging Face, or the mirror in BOARDPILOT_MODEL_BASE_URL (https, or http on localhost). */
export function modelBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.BOARDPILOT_MODEL_BASE_URL?.trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL_HOSTS.test(u.hostname))) return u.toString().replace(/\/+$/, '');
    } catch {
      // fall through to the default
    }
  }
  return 'https://huggingface.co';
}

export class ModelStore {
  private active: { id: string; ctrl: AbortController } | null = null;

  constructor(
    readonly dir: string,
    private readonly opts: { fetch?: typeof fetch; baseUrl?: string } = {},
  ) {}

  private file(m: LocalModelInfo) {
    return join(this.dir, m.file);
  }

  /** A finished download: the file, its record, and a matching size. */
  private isInstalled(m: LocalModelInfo): Sidecar | null {
    try {
      const rec = JSON.parse(readFileSync(this.file(m) + '.json', 'utf8')) as Sidecar;
      if (typeof rec.bytes === 'number' && statSync(this.file(m)).size === rec.bytes) return rec;
    } catch {
      // not installed
    }
    return null;
  }

  installed(): InstalledModel[] {
    const out: InstalledModel[] = [];
    for (const m of LOCAL_MODELS) {
      const rec = this.isInstalled(m);
      if (rec) out.push({ id: m.id, path: this.file(m), bytes: rec.bytes });
    }
    return out;
  }

  pathOf(id: string): string | null {
    return this.installed().find((i) => i.id === id)?.path ?? null;
  }

  /** Bytes already downloaded for an unfinished model, so the screen can say "resume". */
  partialBytes(id: string): number {
    const m = getLocalModel(id);
    try {
      return m ? statSync(this.file(m) + '.part').size : 0;
    } catch {
      return 0;
    }
  }

  get downloading(): string | null {
    return this.active?.id ?? null;
  }

  cancel(): void {
    this.active?.ctrl.abort();
  }

  remove(id: string): Result<void> {
    const m = getLocalModel(id);
    if (!m) return fail('bad_model', t('Unknown offline model.'), t('Pick one from the list.'));
    if (this.active?.id === id) return fail('busy', t('This model is downloading.'), t('Cancel the download first.'));
    try {
      for (const f of [this.file(m), this.file(m) + '.json', this.file(m) + '.part']) rmSync(f, { force: true });
      return ok(undefined);
    } catch (e) {
      return fail('delete_failed', t('The model file could not be deleted: {msg}', { msg: e instanceof Error ? e.message : String(e) }), t('Close other programs that use it and try again.'));
    }
  }

  async download(id: string, onProgress: (p: DownloadProgress) => void): Promise<Result<InstalledModel>> {
    const m = getLocalModel(id);
    if (!m) return fail('bad_model', t('Unknown offline model.'), t('Pick one from the list.'));
    if (this.active) return fail('busy', t('Another model is downloading.'), t('Wait for it to finish, or cancel it.'));
    const ctrl = new AbortController();
    this.active = { id, ctrl };
    try {
      return await this.run(m, ctrl.signal, onProgress);
    } catch (e) {
      return { ok: false, error: this.toError(e, ctrl.signal.aborted) };
    } finally {
      this.active = null;
    }
  }

  private toError(e: unknown, aborted: boolean): AppError {
    if (aborted) return { code: 'cancelled', humanMessage: t('The download was cancelled.'), hint: t('Press Download to continue where it stopped.') };
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'ENOSPC') return { code: 'disk_full', humanMessage: t('The disk is full.'), hint: t('Free some space and press Download again. It continues where it stopped.') };
    return {
      code: 'download_failed',
      humanMessage: t('The model could not be downloaded: {msg}', { msg: e instanceof Error ? e.message : String(e) }),
      hint: t('Check your internet connection and press Download again. It continues where it stopped.'),
    };
  }

  private async run(m: LocalModelInfo, signal: AbortSignal, onProgress: (p: DownloadProgress) => void): Promise<Result<InstalledModel>> {
    mkdirSync(this.dir, { recursive: true });
    const done = this.isInstalled(m);
    if (done) return ok({ id: m.id, path: this.file(m), bytes: done.bytes });
    const part = this.file(m) + '.part';
    const fetchFn = this.opts.fetch ?? fetch;
    const url = localModelUrl(m, this.opts.baseUrl ?? modelBaseUrl());

    let have = existsSync(part) ? statSync(part).size : 0;
    let res = await fetchFn(url, { signal, redirect: 'follow', headers: have > 0 ? { Range: `bytes=${have}-` } : {} });
    if (res.status === 416) {
      // The partial file is not usable (or is complete but unrecorded): start again.
      rmSync(part, { force: true });
      have = 0;
      res = await fetchFn(url, { signal, redirect: 'follow' });
    }
    if (!res.ok || !res.body) {
      return fail('download_failed', t('The download server answered {status}.', { status: res.status }), t('Try again in a few minutes, or use your own AI key in AI settings.'));
    }
    const resumed = res.status === 206 && have > 0;
    if (!resumed) have = 0;
    const length = Number(res.headers.get('content-length') ?? 0);
    const total = length > 0 ? have + length : 0;
    const linked = (res.headers.get('x-linked-etag') ?? '').replace(/"/g, '').trim().toLowerCase();
    const expectedHash = /^[0-9a-f]{64}$/.test(linked) ? linked : '';

    let received = have;
    const counter = new ByteCounter((n) => {
      received += n;
      onProgress({ modelId: m.id, received, total, phase: 'downloading' });
    });
    const out = createWriteStream(part, { flags: resumed ? 'a' : 'w' });
    await pipeline(Readable.fromWeb(res.body as never), counter, out, { signal });

    onProgress({ modelId: m.id, received, total: total || received, phase: 'verifying' });
    const size = statSync(part).size;
    if (total > 0 && size !== total) {
      rmSync(part, { force: true });
      return fail('bad_size', t('The download stopped early.'), t('Press Download again.'));
    }
    const sha256 = await hashFile(part);
    if (expectedHash && sha256 !== expectedHash) {
      rmSync(part, { force: true });
      return fail('bad_hash', t('The downloaded file is damaged.'), t('It was deleted. Press Download to fetch it again.'));
    }
    renameSync(part, this.file(m));
    writeFileSync(this.file(m) + '.json', JSON.stringify({ bytes: size, sha256 } satisfies Sidecar));
    return ok({ id: m.id, path: this.file(m), bytes: size });
  }
}


/** Passes bytes through and reports how many went by. */
class ByteCounter extends Transform {
  constructor(private readonly onBytes: (n: number) => void) {
    super();
  }
  override _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
    this.onBytes(chunk.length);
    cb(null, chunk);
  }
}

async function hashFile(path: string): Promise<string> {
  const h = createHash('sha256');
  await pipeline(createReadStream(path), h);
  return h.digest('hex');
}
