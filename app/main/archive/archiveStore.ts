// The project archive index: the folders the user added, what the scan found in them and the
// user's own notes and corrections, in one JSON file in the app data folder. Nothing leaves this
// computer. Writes are queued and atomic (same pattern as session/coachStore.ts).

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { PartDef } from '@shared/types';
import { EMPTY_INDEX, cleanEdit, entriesOf, parseIndex } from '@shared/archive/entries';
import type { ArchiveEdit, ArchiveEntry, ArchiveIndexFile } from '@shared/archive/types';
import { scanFolder } from './scanner';

export class ArchiveStore {
  private index: ArchiveIndexFile | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly parts: () => Record<string, PartDef>,
    private readonly now: () => number = Date.now,
  ) {}

  private async load(): Promise<ArchiveIndexFile> {
    if (this.index) return this.index;
    let raw: unknown = null;
    try {
      raw = JSON.parse(await readFile(this.file, 'utf8'));
    } catch {
      raw = null; // no archive yet
    }
    this.index = parseIndex(raw);
    return this.index;
  }

  private persist(): Promise<void> {
    const body = this.index ?? EMPTY_INDEX;
    const run = async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(body));
      await rename(tmp, this.file);
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  async roots(): Promise<string[]> {
    return [...(await this.load()).roots];
  }

  async entries(): Promise<ArchiveEntry[]> {
    return entriesOf(await this.load());
  }

  async entry(id: string): Promise<ArchiveEntry | undefined> {
    return (await this.entries()).find((e) => e.id === id);
  }

  /** Adds a folder (if new) and scans it. Returns how many projects it holds. */
  async addRoot(root: string): Promise<{ found: number; truncated: boolean }> {
    const index = await this.load();
    if (!index.roots.includes(root)) index.roots.push(root);
    return this.scanRoot(root);
  }

  async removeRoot(root: string): Promise<void> {
    const index = await this.load();
    index.roots = index.roots.filter((r) => r !== root);
    const gone = new Set(index.projects.filter((p) => p.archiveRoot === root).map((p) => p.id));
    index.projects = index.projects.filter((p) => !gone.has(p.id));
    for (const id of gone) delete index.edits[id];
    await this.persist();
  }

  /** Scans one folder again; unchanged projects are kept as they were. Edits always survive. */
  async scanRoot(root: string): Promise<{ found: number; truncated: boolean }> {
    const index = await this.load();
    const previous = index.projects.filter((p) => p.archiveRoot === root);
    const r = await scanFolder(root, this.parts(), previous, this.now());
    index.projects = [...index.projects.filter((p) => p.archiveRoot !== root), ...r.projects];
    await this.persist();
    return { found: r.projects.length, truncated: r.truncated };
  }

  async rescan(): Promise<{ found: number; truncated: boolean }> {
    let found = 0;
    let truncated = false;
    for (const root of await this.roots()) {
      const r = await this.scanRoot(root);
      found += r.found;
      truncated ||= r.truncated;
    }
    return { found, truncated };
  }

  async update(id: string, edit: unknown): Promise<ArchiveEntry | undefined> {
    const index = await this.load();
    if (!index.projects.some((p) => p.id === id)) return undefined;
    const clean: ArchiveEdit = { ...index.edits[id], ...cleanEdit(edit, this.parts()) };
    index.edits[id] = clean;
    await this.persist();
    return this.entry(id);
  }
}
