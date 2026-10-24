// Project memory store: one JSON file per memory in <app data>/memory, main process only. The
// renderer gets MemoryInfo (no text) and search hits; the assistant searches through MemoryAccess.
// Folder import reads source files only (see memoryFileKind / skipMemoryDir in shared/memory.ts),
// never follows links, and stops at the size caps in MEMORY_LIMITS.

import { lstat, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import type { Result } from '@shared/types';
import { t } from '@shared/i18n';
import {
  addFiles,
  addNote,
  buildIndex,
  cleanMemoryName,
  emptyMemory,
  exportMemory,
  MEMORY_LIMITS,
  memoryFileKind,
  memoryInfo,
  newMemoryId,
  parseMemoryFile,
  readRange,
  removeSource,
  searchIndex,
  skipMemoryDir,
  memoryCitation,
  type MemoryFile,
  type MemoryHit,
  type MemoryIndex,
  type MemoryFolderImport as FolderImport,
  type MemoryInfo,
} from '@shared/memory';

/** What the assistant (and later Display Studio) may do with the memories attached to a project. */
export interface MemoryAccess {
  /** Best chunks for a query in these memories, best first. */
  search(query: string, memoryIds: string[], limit: number): Promise<MemoryHit[]>;
  /** A chunk by ref ("<memory id>/<chunk id>") or "file:start-end" in these memories. */
  read(ref: string, memoryIds: string[]): Promise<MemoryRead | null>;
  /** Name and size of these memories, and how many others exist, for the context block. */
  describe(memoryIds: string[]): Promise<{ attached: { id: string; name: string; sources: number; chunks: number }[]; others: number }>;
}

export interface MemoryRead {
  memory: string;
  file: string;
  start: number;
  end: number;
  citation: string;
  text: string;
}


const fail = <T>(code: string, humanMessage: string, hint: string): Result<T> => ({ ok: false, error: { code, humanMessage, hint } });

/** Reads the source files of a folder, depth first, with the memory limits. */
export async function readSourceFolder(root: string): Promise<{ files: { path: string; text: string; kind: 'code' | 'text' }[]; skipped: number; skippedDirs: string[]; capped: boolean }> {
  const files: { path: string; text: string; kind: 'code' | 'text' }[] = [];
  const skippedDirs: string[] = [];
  let skipped = 0;
  let bytes = 0;
  let capped = false;
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (capped) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (capped) return;
      const full = join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (skipMemoryDir(e.name) || depth >= MEMORY_LIMITS.depth) {
          if (!e.name.startsWith('.') || e.name === '.pio') skippedDirs.push(relative(root, full).split(sep).join('/'));
          continue;
        }
        await walk(full, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      const kind = memoryFileKind(e.name);
      if (!kind) continue;
      try {
        const info = await lstat(full);
        if (info.size > MEMORY_LIMITS.fileBytes) {
          skipped++;
          continue;
        }
        if (files.length >= MEMORY_LIMITS.files || bytes + info.size > MEMORY_LIMITS.importBytes) {
          capped = true;
          return;
        }
        const buf = await readFile(full);
        // binary files (a NUL byte early on) are not text
        if (buf.subarray(0, 8192).includes(0)) {
          skipped++;
          continue;
        }
        const text = buf.toString('utf8');
        bytes += buf.length;
        files.push({ path: relative(root, full).split(sep).join('/'), text, kind });
      } catch {
        skipped++;
      }
    }
  };
  await walk(root, 0);
  return { files, skipped, skippedDirs, capped };
}

export class MemoryStore implements MemoryAccess {
  private cache = new Map<string, MemoryFile>();
  private loaded = false;
  private index: { key: string; index: MemoryIndex } | null = null;
  /** Writes run one after another. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dir: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async loadAll(): Promise<Map<string, MemoryFile>> {
    if (this.loaded) return this.cache;
    await mkdir(this.dir, { recursive: true });
    for (const f of await readdir(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const m = parseMemoryFile(JSON.parse(await readFile(join(this.dir, f), 'utf8')));
        if (m && `${m.id}.json` === f) this.cache.set(m.id, m);
      } catch {
        /* skip unreadable files */
      }
    }
    this.loaded = true;
    return this.cache;
  }

  private persist(m: MemoryFile): Promise<void> {
    this.cache.set(m.id, m);
    this.index = null;
    const file = join(this.dir, `${m.id}.json`);
    const body = JSON.stringify(m);
    const run = async () => {
      await mkdir(this.dir, { recursive: true });
      await writeFile(`${file}.tmp`, body);
      await rename(`${file}.tmp`, file);
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  private async get(id: string): Promise<Result<MemoryFile>> {
    const m = (await this.loadAll()).get(id);
    return m ? { ok: true, value: m } : fail('no_memory', t('That memory does not exist any more.'), t('Pick another memory, or create a new one.'));
  }

  private tooBig(m: MemoryFile): boolean {
    return m.sources.reduce((s, x) => s + x.bytes, 0) > MEMORY_LIMITS.memoryBytes;
  }

  async list(): Promise<MemoryInfo[]> {
    return [...(await this.loadAll()).values()].map(memoryInfo).sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(name: string): Promise<Result<MemoryInfo>> {
    const clean = cleanMemoryName(String(name ?? ''));
    if (!clean) return fail('bad_name', t('Give the memory a name.'), t('For example the customer or the product line: "acme-panels".'));
    const m = emptyMemory(clean, this.now());
    await this.persist(m);
    return { ok: true, value: memoryInfo(m) };
  }

  async rename(id: string, name: string): Promise<Result<MemoryInfo>> {
    const r = await this.get(id);
    if (!r.ok) return r;
    const clean = cleanMemoryName(String(name ?? ''));
    if (!clean) return fail('bad_name', t('Give the memory a name.'), t('For example the customer or the product line: "acme-panels".'));
    const m = { ...r.value, name: clean, updatedAt: this.now().toISOString() };
    await this.persist(m);
    return { ok: true, value: memoryInfo(m) };
  }

  async remove(id: string): Promise<Result<true>> {
    await this.loadAll();
    this.cache.delete(id);
    this.index = null;
    const run = () => unlink(join(this.dir, `${id}.json`)).catch(() => undefined);
    this.queue = this.queue.then(run, run);
    await this.queue;
    return { ok: true, value: true };
  }

  async importFolder(id: string, folder: string): Promise<Result<FolderImport>> {
    const r = await this.get(id);
    if (!r.ok) return r;
    try {
      const info = await lstat(folder);
      if (!info.isDirectory()) return fail('not_folder', t('That is not a folder.'), t('Pick the folder of an old project.'));
    } catch {
      return fail('read_failed', t('The folder could not be read.'), t('Check that it still exists and that BoardPilot may read it.'));
    }
    const read = await readSourceFolder(folder);
    if (!read.files.length) {
      return fail('no_sources', t('No source files were found in that folder.'), t('BoardPilot reads .ino, .c, .cpp, .h, CMakeLists.txt, .ioc, README and .txt files. Build folders and .git are skipped.'));
    }
    const m = addFiles(r.value, { kind: 'code', label: basename(folder), origin: folder, skipped: read.skipped }, read.files, this.now());
    if (this.tooBig(m)) return fail('memory_full', t('This memory is full.'), t('Remove a source or start a second memory for these files.'));
    await this.persist(m);
    const source = m.sources[m.sources.length - 1];
    return {
      ok: true,
      value: {
        memory: memoryInfo(m),
        files: read.files.length,
        chunks: m.chunks.filter((c) => c.source === source.id).length,
        skipped: read.skipped,
        skippedDirs: read.skippedDirs.slice(0, 20),
        capped: read.capped,
      },
    };
  }

  /** The text of a PDF, once a text extractor is installed (see docs/ai.md: Project memory). */
  async importPdfText(id: string, file: string, text: string): Promise<Result<MemoryInfo>> {
    const r = await this.get(id);
    if (!r.ok) return r;
    if (!text.trim()) return fail('no_text', t('No text could be read from this PDF.'), t('It may be a scanned document. Type the facts you need as a note instead.'));
    const m = addFiles(r.value, { kind: 'pdf', label: basename(file), origin: file, skipped: 0 }, [{ path: basename(file), text, kind: 'text' }], this.now());
    if (this.tooBig(m)) return fail('memory_full', t('This memory is full.'), t('Remove a source or start a second memory for these files.'));
    await this.persist(m);
    return { ok: true, value: memoryInfo(m) };
  }

  async addNote(id: string, text: string): Promise<Result<MemoryInfo>> {
    const r = await this.get(id);
    if (!r.ok) return r;
    if (!String(text ?? '').trim()) return fail('empty_note', t('The note is empty.'), t('Write what you learnt, e.g. "This ST7789 needs 120 ms after reset".'));
    const m = addNote(r.value, String(text), this.now());
    await this.persist(m);
    return { ok: true, value: memoryInfo(m) };
  }

  async removeSource(id: string, sourceId: string): Promise<Result<MemoryInfo>> {
    const r = await this.get(id);
    if (!r.ok) return r;
    const m = { ...removeSource(r.value, sourceId), updatedAt: this.now().toISOString() };
    await this.persist(m);
    return { ok: true, value: memoryInfo(m) };
  }

  /** The file to share: the memory as JSON, without the paths it came from. */
  async exportText(id: string): Promise<Result<{ name: string; text: string }>> {
    const r = await this.get(id);
    if (!r.ok) return r;
    return { ok: true, value: { name: r.value.name, text: exportMemory(r.value) } };
  }

  /** A memory file from a colleague. Same id as one here: it comes in as a copy with its own id. */
  async importText(text: string): Promise<Result<MemoryInfo>> {
    let m: MemoryFile | null = null;
    try {
      m = parseMemoryFile(JSON.parse(text));
    } catch {
      m = null;
    }
    if (!m) return fail('bad_memory', t('That file is not a BoardPilot memory.'), t('Pick a .bpmemory.json file exported from the Memory panel.'));
    const all = await this.loadAll();
    const names = new Set([...all.values()].map((x) => x.name.toLowerCase()));
    let name = m.name;
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `${m.name} (${i})`;
    const copy: MemoryFile = { ...m, id: all.has(m.id) ? newMemoryId() : m.id, name, sources: m.sources.map(({ origin: _o, ...s }) => s), updatedAt: this.now().toISOString() };
    if (this.tooBig(copy)) return fail('memory_full', t('This memory is too big to import.'), t('Ask for a smaller export.'));
    await this.persist(copy);
    return { ok: true, value: memoryInfo(copy) };
  }

  /* ---------- MemoryAccess ---------- */

  private async indexFor(ids: string[]): Promise<MemoryIndex> {
    const all = await this.loadAll();
    const mems = [...new Set(ids)].map((id) => all.get(id)).filter((m): m is MemoryFile => !!m);
    const key = mems.map((m) => `${m.id}@${m.updatedAt}#${m.chunks.length}`).sort().join('|');
    if (this.index?.key !== key) this.index = { key, index: buildIndex(mems) };
    return this.index.index;
  }

  async search(query: string, memoryIds: string[], limit = 6): Promise<MemoryHit[]> {
    if (!memoryIds.length || !String(query ?? '').trim()) return [];
    return searchIndex(await this.indexFor(memoryIds), String(query), limit);
  }

  async read(ref: string, memoryIds: string[]): Promise<MemoryRead | null> {
    const all = await this.loadAll();
    const mems = memoryIds.map((id) => all.get(id)).filter((m): m is MemoryFile => !!m);
    const s = String(ref ?? '').trim();
    // "<memory id>/<chunk id>"
    const byRef = /^([^/\s]+)\/(s\d+-\d+)$/.exec(s);
    if (byRef) {
      const m = mems.find((x) => x.id === byRef[1]);
      const c = m?.chunks.find((x) => x.id === byRef[2]);
      if (m && c) return { memory: m.name, file: c.file, start: c.start, end: c.end, citation: memoryCitation(m.name, c.file, c.start, c.end), text: c.text };
      return null;
    }
    // "file:start-end", "file:line" or a citation label
    const loc = /^(?:memory\s*·\s*(.+?)\s*·\s*)?(.+?)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?$/i.exec(s);
    if (!loc) return null;
    const start = loc[3] ? Number(loc[3]) : 1;
    const end = loc[4] ? Number(loc[4]) : loc[3] ? start + 40 : MEMORY_LIMITS.readLines;
    const order = loc[1] ? [...mems.filter((m) => m.name.toLowerCase() === loc[1].toLowerCase()), ...mems] : mems;
    for (const m of order) {
      const r = readRange(m, loc[2], Math.min(start, end), Math.max(start, end));
      if (r) return { memory: m.name, ...r, citation: memoryCitation(m.name, r.file, r.start, r.end) };
    }
    return null;
  }

  async describe(memoryIds: string[]) {
    const all = await this.loadAll();
    const attached = memoryIds
      .map((id) => all.get(id))
      .filter((m): m is MemoryFile => !!m)
      .map((m) => ({ id: m.id, name: m.name, sources: m.sources.length, chunks: m.chunks.length }));
    return { attached, others: all.size - attached.length };
  }
}
