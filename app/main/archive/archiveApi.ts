// The project archive calls behind window.bp.archive, shared by the IPC handlers (desktop app) and
// the browser demo (app/web/bpWeb.ts). Reading folders only; the sample archive is copied into the
// app data folder so it can be scanned and opened like any other folder.

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { BoardPilotApi } from '@shared/api';
import type { Result } from '@shared/types';
import { t } from '@shared/i18n';
import { SAMPLE_ARCHIVE } from '@shared/archive/sample';
import type { ArchiveStore } from './archiveStore';
import { isSafeProjectPath } from '@shared/starter/common';
import { toAppError } from '../hardware/errors';
import { SKIP_DIRS } from './scanner';

export interface ArchiveHost {
  /** Folder picker; null when cancelled. */
  pickFolder(): Promise<string | null>;
  /** Shows a file or folder in Finder / Explorer. */
  reveal(path: string): void;
  /** Where the sample archive is copied. */
  sampleDir: string;
}

/** What readSources takes from a project: code files, never more than this. */
export const SOURCE_LIMITS = { files: 40, fileBytes: 300 * 1024, totalBytes: 1536 * 1024, depth: 2 };
const CODE_FILE = /\.(ino|pde|c|cc|cpp|cxx|h|hh|hpp|hxx)$|(^|\/)platformio\.ini$/i;

const fail = <T>(code: string, humanMessage: string, hint: string): Result<T> => ({ ok: false, error: { code, humanMessage, hint } });

export function makeArchiveApi(store: ArchiveStore, host: ArchiveHost): BoardPilotApi['archive'] {
  const scanFailed = <T>(e: unknown): Result<T> => {
    const err = toAppError(e);
    return { ok: false, error: { ...err, humanMessage: t('The folder could not be read: {why}', { why: err.humanMessage }), hint: t('Check that the folder still exists and that you can open it, then rescan.') } };
  };

  /** A file inside a project, never outside it. */
  const inside = async (id: string, rel?: string): Promise<string | null> => {
    const e = await store.entry(id);
    if (!e) return null;
    if (!rel) return e.root;
    const base = (await stat(e.root).catch(() => null))?.isDirectory() ? e.root : dirname(e.root);
    const target = resolve(base, rel);
    return target.startsWith(resolve(base) + sep) ? target : null;
  };

  /** The code files of a project folder: relative paths with "/", in order, within SOURCE_LIMITS. */
  const sourcesOf = async (root: string): Promise<{ files: { name: string; text: string }[]; left: string[] }> => {
    const found: { rel: string; abs: string; size: number }[] = [];
    const left: string[] = [];
    const walk = async (dir: string, rel: string, depth: number) => {
      let names: string[] = [];
      try {
        names = (await readdir(dir)).sort((a, b) => a.localeCompare(b));
      } catch {
        return;
      }
      for (const name of names) {
        if (name.startsWith('.')) continue;
        const abs = join(dir, name);
        const s = await stat(abs).catch(() => null);
        if (!s) continue;
        if (s.isDirectory()) {
          if (SKIP_DIRS.test(name)) continue;
          if (depth >= SOURCE_LIMITS.depth) left.push(`${rel}${name}/`);
          else await walk(abs, `${rel}${name}/`, depth + 1);
        } else if (CODE_FILE.test(name)) found.push({ rel: `${rel}${name}`, abs, size: s.size });
      }
    };
    await walk(root, '', 0);
    const files: { name: string; text: string }[] = [];
    let total = 0;
    for (const f of found) {
      if (!isSafeProjectPath(f.rel) || f.size > SOURCE_LIMITS.fileBytes || files.length >= SOURCE_LIMITS.files || total + f.size > SOURCE_LIMITS.totalBytes) {
        left.push(f.rel);
        continue;
      }
      try {
        files.push({ name: f.rel, text: await readFile(f.abs, 'utf8') });
        total += f.size;
      } catch {
        left.push(f.rel);
      }
    }
    return { files, left };
  };

  return {
    async list() {
      return { roots: await store.roots(), projects: await store.entries() };
    },
    async addFolder() {
      const dir = await host.pickFolder();
      if (!dir) return fail('cancelled', t('No folder chosen.'), '');
      try {
        const r = await store.addRoot(dir);
        return { ok: true, value: r };
      } catch (e) {
        return scanFailed(e);
      }
    },
    async addSample() {
      try {
        for (const f of SAMPLE_ARCHIVE) {
          const target = join(host.sampleDir, f.path);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, f.text);
        }
        return { ok: true, value: await store.addRoot(host.sampleDir) };
      } catch (e) {
        return scanFailed(e);
      }
    },
    async removeFolder(root: string) {
      await store.removeRoot(String(root));
      return { ok: true, value: true };
    },
    async rescan() {
      try {
        return { ok: true, value: await store.rescan() };
      } catch (e) {
        return scanFailed(e);
      }
    },
    async update(id: string, edit) {
      const e = await store.update(String(id), edit);
      return e ? { ok: true, value: e } : fail('archive_unknown', t('This project is no longer in the archive.'), t('Rescan the archive, then try again.'));
    },
    async reveal(id: string, file?: string) {
      const path = await inside(String(id), typeof file === 'string' ? file : undefined);
      if (path) host.reveal(path);
    },
    async readFile(id: string, file: string) {
      const path = await inside(String(id), String(file));
      if (!path) return fail('archive_unknown', t('This file is not part of the project.'), t('Rescan the archive, then try again.'));
      try {
        const s = await stat(path);
        if (s.size > 1024 * 1024) return fail('too_big', t('This file is too big to open here.'), t('Open it from its folder instead.'));
        return { ok: true, value: { name: path.split(/[\\/]/).pop() ?? file, text: await readFile(path, 'utf8') } };
      } catch {
        return fail('read_failed', t('The file could not be read.'), t('Check that the file still exists and try again.'));
      }
    },
    async readSources(id: string) {
      const root = await inside(String(id));
      if (!root) return fail('archive_unknown', t('This project is no longer in the archive.'), t('Rescan the archive, then try again.'));
      try {
        if (!(await stat(root)).isDirectory()) return { ok: true, value: { files: [], left: [] } };
        return { ok: true, value: await sourcesOf(root) };
      } catch {
        return fail('read_failed', t('The project’s files could not be read.'), t('Check that the folder still exists and try again.'));
      }
    },
  };
}
