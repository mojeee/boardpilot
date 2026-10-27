// The project archive calls behind window.bp.archive, shared by the IPC handlers (desktop app) and
// the browser demo (app/web/bpWeb.ts). Reading folders only; the sample archive is copied into the
// app data folder so it can be scanned and opened like any other folder.

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { BoardPilotApi } from '@shared/api';
import type { Result } from '@shared/types';
import { t } from '@shared/i18n';
import { SAMPLE_ARCHIVE } from '@shared/archive/sample';
import type { ArchiveStore } from './archiveStore';
import { toAppError } from '../hardware/errors';

export interface ArchiveHost {
  /** Folder picker; null when cancelled. */
  pickFolder(): Promise<string | null>;
  /** Shows a file or folder in Finder / Explorer. */
  reveal(path: string): void;
  /** Where the sample archive is copied. */
  sampleDir: string;
}

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
  };
}
