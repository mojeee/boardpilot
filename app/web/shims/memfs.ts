// In-memory files for the browser demo. The main-process code that the demo runs in the page
// (simulator backups, the user parts library, interview answers, AI settings) writes files with
// node:fs; in the web build those imports point at shims backed by this map, so nothing leaves
// the browser tab and everything is gone when the tab closes.

const files = new Map<string, Uint8Array | string>();

/** Absolute, normalised path ("a//b/../c" becomes "/a/c"). */
export function norm(path: string): string {
  const out: string[] = [];
  for (const seg of String(path).replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.join('/');
}

export class FsError extends Error {
  constructor(
    readonly code: 'ENOENT' | 'EISDIR',
    path: string,
  ) {
    super(`${code}: ${path}`);
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type Data = string | Uint8Array | ArrayBuffer | ArrayBufferView;

function toStored(data: Data): Uint8Array | string {
  if (typeof data === 'string') return data;
  if (data instanceof Uint8Array) return data.slice();
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
}

/** 'utf8' or { encoding: 'utf8' } asks for text; anything else returns bytes. */
function wantsText(encoding: unknown): boolean {
  if (typeof encoding === 'string') return true;
  return typeof encoding === 'object' && encoding !== null && typeof (encoding as { encoding?: unknown }).encoding === 'string';
}

export const memfs = {
  has: (path: string) => files.has(norm(path)),
  isDir(path: string): boolean {
    const p = norm(path);
    if (p === '/') return true;
    for (const k of files.keys()) if (k.startsWith(p + '/')) return true;
    return false;
  },
  read(path: string, encoding?: unknown): string | Uint8Array {
    const p = norm(path);
    const v = files.get(p);
    if (v === undefined) throw new FsError(memfs.isDir(p) ? 'EISDIR' : 'ENOENT', p);
    if (wantsText(encoding)) return typeof v === 'string' ? v : decoder.decode(v);
    return typeof v === 'string' ? encoder.encode(v) : v.slice();
  },
  write(path: string, data: Data) {
    files.set(norm(path), toStored(data));
  },
  append(path: string, data: Data) {
    const p = norm(path);
    const old = files.get(p);
    if (old === undefined) return memfs.write(p, data);
    const add = toStored(data);
    if (typeof old === 'string' && typeof add === 'string') {
      files.set(p, old + add);
      return;
    }
    const a = typeof old === 'string' ? encoder.encode(old) : old;
    const b = typeof add === 'string' ? encoder.encode(add) : add;
    const all = new Uint8Array(a.length + b.length);
    all.set(a);
    all.set(b, a.length);
    files.set(p, all);
  },
  size(path: string): number {
    const v = files.get(norm(path));
    if (v === undefined) throw new FsError('ENOENT', norm(path));
    return typeof v === 'string' ? encoder.encode(v).length : v.length;
  },
  remove(path: string) {
    const p = norm(path);
    if (!files.delete(p)) throw new FsError('ENOENT', p);
  },
  rename(from: string, to: string) {
    const v = files.get(norm(from));
    if (v === undefined) throw new FsError('ENOENT', norm(from));
    files.delete(norm(from));
    files.set(norm(to), v);
  },
  /** Names directly inside a folder (files and sub-folders). */
  list(dir: string): string[] {
    const p = norm(dir);
    const prefix = p === '/' ? '/' : p + '/';
    const names = new Set<string>();
    for (const k of files.keys()) if (k.startsWith(prefix)) names.add(k.slice(prefix.length).split('/')[0]);
    return [...names].sort();
  },
};
