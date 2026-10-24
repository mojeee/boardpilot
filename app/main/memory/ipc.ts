// IPC handlers of the Memory panel. Dialogs open here, in the main process; the renderer only gets
// MemoryInfo and search hits back, never a path it could read itself.

import { BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import type { Result } from '@shared/types';
import { t } from '@shared/i18n';
import type { MemoryInfo } from '@shared/memory';
import { toAppError } from '../hardware/errors';
import type { MemoryStore } from './store';

const cancelled = <T>(humanMessage: string): Result<T> => ({ ok: false, error: { code: 'cancelled', humanMessage, hint: '' } });

async function pick(opts: Electron.OpenDialogOptions): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow();
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  return r.canceled ? null : r.filePaths[0] ?? null;
}

export function registerMemoryIpc(store: MemoryStore) {
  const h = (ch: string, fn: (...args: never[]) => unknown) => ipcMain.handle(ch, (_e, ...args) => fn(...(args as never[])));
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

  h('memory:list', () => store.list());
  h('memory:create', (name: string) => store.create(String(name)));
  h('memory:rename', (id: string, name: string) => store.rename(String(id), String(name)));
  h('memory:remove', (id: string) => store.remove(String(id)));
  h('memory:addNote', (id: string, text: string) => store.addNote(String(id), String(text)));
  h('memory:removeSource', (id: string, sourceId: string) => store.removeSource(String(id), String(sourceId)));
  h('memory:search', (query: string, memoryIds: unknown, limit: number) => store.search(String(query), ids(memoryIds), typeof limit === 'number' ? limit : 6));

  h('memory:importFolder', async (id: string) => {
    // BP_PICK_DIR (end-to-end tests): use that folder without asking.
    const folder = process.env.BP_PICK_DIR || (await pick({ title: t('Choose the folder of an old project'), properties: ['openDirectory'] }));
    if (!folder) return cancelled(t('No folder chosen.'));
    try {
      return await store.importFolder(String(id), folder);
    } catch (e) {
      return { ok: false, error: toAppError(e) };
    }
  });

  // Reading PDF text needs a PDF library (pdfjs-dist), which is not installed yet: CLAUDE.md asks
  // before a new dependency. Until then the panel offers notes; store.importPdfText takes the text.
  h('memory:importPdf', async (): Promise<Result<MemoryInfo>> => ({
    ok: false,
    error: {
      code: 'pdf_unsupported',
      humanMessage: t('Reading PDF datasheets is not built in yet.'),
      hint: t('Copy the facts you need (an init sequence, a timing) from the datasheet into a note for now.'),
    },
  }));

  h('memory:exportFile', async (id: string): Promise<Result<string>> => {
    const r = await store.exportText(String(id));
    if (!r.ok) return r;
    try {
      const win = BrowserWindow.getFocusedWindow();
      const safe = r.value.name.replace(/[\\/:*?"<>|]+/g, '-');
      const opts: Electron.SaveDialogOptions = { defaultPath: `${safe}.bpmemory.json`, filters: [{ name: 'BoardPilot memory', extensions: ['json'] }] };
      const s = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (s.canceled || !s.filePath) return cancelled(t('Not saved.'));
      await writeFile(s.filePath, r.value.text);
      return { ok: true, value: s.filePath };
    } catch (e) {
      return { ok: false, error: toAppError(e) };
    }
  });

  h('memory:importFile', async (): Promise<Result<MemoryInfo>> => {
    const file = await pick({ title: t('Choose a memory file'), properties: ['openFile'], filters: [{ name: 'BoardPilot memory', extensions: ['json'] }] });
    if (!file) return cancelled(t('Nothing opened.'));
    try {
      if ((await stat(file)).size > 80 * 1024 * 1024) return { ok: false, error: { code: 'too_big', humanMessage: t('This memory is too big to import.'), hint: t('Ask for a smaller export.') } };
      return await store.importText(await readFile(file, 'utf8'));
    } catch (e) {
      return { ok: false, error: toAppError(e) };
    }
  });
}
