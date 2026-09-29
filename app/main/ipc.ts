// Typed IPC handlers. Every handler returns data or a Result; nothing throws into the renderer.

import { BrowserWindow, dialog, ipcMain, app, shell } from 'electron';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import type { AgentRequest, AiContext, HardwareMode, LogEntry, PartDef, Result, Scene, WriteRequest } from '@shared/types';
import type { AiProviderId, AiSettingsInput } from '@shared/ai';
import { BUY_URL } from '@shared/brand';
import { setLanguage, t } from '@shared/i18n';
import type { UserParts } from './parts/userParts';
import { importPartFromUrl } from './parts/importer';
import type { License } from './license/license';
import { EVENT_CHANNELS } from '@shared/api';
import type { HardwareHub } from './hardware/hub';
import type { Assistant } from './ai/assistant';
import { grant } from './session/safety';
import type { SessionLog } from './session/sessionLog';
import { toAppError } from './hardware/errors';
import { randomUUID } from 'node:crypto';
import { LESSONS, type Lesson } from '@shared/lessons';
import { COACH_MAX_ANSWER, type CoachAttempt } from '@shared/coach';
import { CoachStore } from './session/coachStore';
import { isSafeProjectName, type StarterFile } from '@shared/starter/common';

export function registerIpc(hub: HardwareHub, ai: Assistant, log: SessionLog, dataDir: string, parts: UserParts, license: License) {
  const h = (ch: string, fn: (...args: never[]) => unknown) => ipcMain.handle(ch, (_e, ...args) => fn(...(args as never[])));

  h('hw:state', () => hub.state);
  h('hw:setMode', (mode: HardwareMode) => hub.setMode(mode));
  h('hw:setBoard', (boardId: string) => hub.setBoard(String(boardId)));
  h('hw:listPorts', () => hub.listPorts());
  h('hw:identify', (port: string) => hub.identify(port));
  h('hw:installAgent', (token: string) => hub.installAgent(token));
  h('hw:connectAgent', () => hub.connectAgent());
  h('hw:agent', (req: AgentRequest) => hub.agent(req));
  h('hw:agentWrite', (req: AgentRequest, token: string) => hub.agentWrite(req, token));
  h('hw:restore', (id: string, token: string) => hub.restore(id, token));
  h('hw:flashUser', (token: string, path: string) => hub.flashUser(token, path));
  h('hw:openSerial', (baud: number) => hub.openSerial(baud));
  h('hw:closeSerial', () => hub.closeSerial());
  h('hw:writeSerial', (text: string) => hub.writeSerial(text));
  h('hw:preflight', (path: string) => hub.preflight(path));
  h('hw:captureSerial', (baud: number, ms: number) => hub.captureSerial(baud, ms));

  h('sim:scenarios', () => hub.scenarios());
  h('sim:load', (id: string) => hub.loadScenario(id));
  h('sim:scene', () => hub.scenarioScene());
  h('sim:control', (a: 'fixWiring' | 'turnKnob' | 'pressButton') => hub.simControl(a));

  h('safety:grant', (kind: WriteRequest['kind'] | 'restore', uses?: number) => grant(kind, typeof uses === 'number' ? uses : 1));

  h('ai:status', () => ai.status());
  h('ai:getSettings', () => ai.getSettings());
  h('ai:saveSettings', (input: AiSettingsInput) => ai.saveSettings(input));
  h('ai:clearKey', (provider: AiProviderId) => ai.clearKey(provider));
  h('ai:listModels', (provider: AiProviderId, apiKey?: string) => ai.listModels(provider, apiKey));
  h('ai:test', (draft?: Partial<AiSettingsInput>) => ai.test(draft));
  h('ai:ask', (q: string, ctx: AiContext) => ai.ask(q, { ...ctx, log: ctx.log.length ? ctx.log : log.recent(50) }));
  h('ai:recognize', (b64: string, mt: 'image/jpeg' | 'image/png' | 'image/webp') => ai.recognizePart(b64, mt));
  h('ai:classify', (text: string, options: { id: string; label: string }[]) => ai.classify(text, options));
  h('ai:reset', () => ai.reset());

  ipcMain.on('session:append', (_e, entry: LogEntry) => log.append(entry));
  h('session:info', () => ({ dataDir, logPath: log.path, version: app.getVersion() }));
  h('session:pickFile', async (kind: 'firmware' | 'datasheet') => {
    const win = BrowserWindow.getFocusedWindow();
    const opts: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: kind === 'firmware' ? [{ name: 'Firmware image', extensions: [hub.board.toolchain.imageFormat, ...(hub.board.toolchain.imageFormat === 'bin' ? [] : ['bin'])] }] : [{ name: 'Datasheet', extensions: ['pdf'] }],
    };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
  h('session:openSketch', async (): Promise<Result<{ name: string; text: string }>> => {
    const win = BrowserWindow.getFocusedWindow();
    const opts: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'Arduino sketch', extensions: ['ino', 'cpp', 'h', 'c', 'txt'] }] };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    const path = r.canceled ? undefined : r.filePaths[0];
    if (!path) return { ok: false, error: { code: 'cancelled', humanMessage: t('No file chosen.'), hint: '' } };
    try {
      const info = await stat(path);
      if (info.size > 1024 * 1024) return { ok: false, error: { code: 'too_big', humanMessage: t('This file is too big for a sketch.'), hint: t('Pick the .ino file of your project.') } };
      return { ok: true, value: { name: basename(path), text: await readFile(path, 'utf8') } };
    } catch {
      return { ok: false, error: { code: 'read_failed', humanMessage: t('The file could not be read.'), hint: t('Check that the file still exists and try again.') } };
    }
  });
  h('session:saveFile', async (name: string, content: string): Promise<Result<string>> => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const opts: Electron.SaveDialogOptions = { defaultPath: name };
      const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || !r.filePath) return { ok: false, error: { code: 'cancelled', humanMessage: t('Not saved.'), hint: '' } };
      await writeFile(r.filePath, content);
      return { ok: true, value: r.filePath };
    } catch (e) {
      return { ok: false, error: toAppError(e) };
    }
  });
  h('session:savePng', async (name: string, dataUrl: string): Promise<Result<string>> => {
    const prefix = 'data:image/png;base64,';
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix) || dataUrl.length > 40 * 1024 * 1024)
      return { ok: false, error: { code: 'bad_image', humanMessage: t('The picture could not be saved.'), hint: t('Try the export again.') } };
    try {
      const win = BrowserWindow.getFocusedWindow();
      const opts: Electron.SaveDialogOptions = { defaultPath: String(name), filters: [{ name: 'PNG', extensions: ['png'] }] };
      const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || !r.filePath) return { ok: false, error: { code: 'cancelled', humanMessage: t('Not saved.'), hint: '' } };
      await writeFile(r.filePath, Buffer.from(dataUrl.slice(prefix.length), 'base64'));
      return { ok: true, value: r.filePath };
    } catch (e) {
      return { ok: false, error: toAppError(e) };
    }
  });
  h('session:saveProject', async (folder: string, files: StarterFile[]): Promise<Result<string>> => {
    // Only plain names (no separators, no ".."), at most 16 files of 1 MB: everything lands inside
    // the new folder, which is created inside the place the user picked.
    const valid =
      isSafeProjectName(folder) &&
      Array.isArray(files) &&
      files.length > 0 &&
      files.length <= 16 &&
      files.every((f) => f && isSafeProjectName(f.name) && typeof f.text === 'string' && f.text.length <= 1024 * 1024) &&
      new Set(files.map((f) => f.name.toLowerCase())).size === files.length;
    if (!valid) return { ok: false, error: { code: 'bad_project', humanMessage: t('The project files are not valid, so nothing was saved.'), hint: t('Generate the project again, then save it.') } };
    try {
      const win = BrowserWindow.getFocusedWindow();
      const opts: Electron.OpenDialogOptions = { title: t('Choose where to create the project folder'), buttonLabel: t('Create folder here'), properties: ['openDirectory', 'createDirectory'] };
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      const parent = r.canceled ? undefined : r.filePaths[0];
      if (!parent) return { ok: false, error: { code: 'cancelled', humanMessage: t('Not saved.'), hint: '' } };
      // A new folder: never write into (or over) an existing one.
      let dir = '';
      for (let i = 1; i <= 99 && !dir; i++) {
        const candidate = join(parent, i === 1 ? folder : `${folder}-${i}`);
        try {
          await mkdir(candidate);
          dir = candidate;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        }
      }
      if (!dir) return { ok: false, error: { code: 'folder_exists', humanMessage: t('There are already too many folders with this name here.'), hint: t('Pick another place, or remove old copies.') } };
      const root = resolve(dir) + sep;
      for (const f of files) {
        const target = resolve(dir, f.name);
        if (!target.startsWith(root)) throw new Error(`refused to write outside the project folder: ${f.name}`);
        await writeFile(target, f.text, { flag: 'wx' });
      }
      return { ok: true, value: dir };
    } catch (e) {
      return { ok: false, error: toAppError(e) };
    }
  });
  h('session:exportReport', async (markdown: string, html: string, name: string): Promise<Result<{ markdownPath: string; pdfPath: string }>> => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const opts: Electron.SaveDialogOptions = { defaultPath: `${name}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] };
      const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || !r.filePath) return { ok: false, error: { code: 'cancelled', humanMessage: t('Export cancelled.'), hint: '' } };
      const markdownPath = r.filePath;
      await writeFile(markdownPath, markdown);
      const pdfPath = markdownPath.replace(/\.md$/i, '') + '.pdf';
      const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
      await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      const pdf = await pdfWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
      pdfWin.destroy();
      await writeFile(pdfPath, pdf);
      return { ok: true, value: { markdownPath, pdfPath } };
    } catch (e) {
      return { ok: false, error: toAppError(e) };
    }
  });

  h('parts:list', () => parts.load());
  h('parts:save', (def: PartDef, replaceId?: string) => parts.save(def, replaceId));
  h('parts:remove', (id: string) => parts.remove(id));
  h('parts:import', (url: string) => importPartFromUrl(url, ai));

  const projDir = join(dataDir, 'projects');
  const isScene = (x: unknown): x is Scene =>
    typeof x === 'object' && x !== null && Array.isArray((x as Scene).parts) && Array.isArray((x as Scene).wires) && typeof (x as Scene).board === 'string';
  ipcMain.on('project:autosave', (_e, scene: Scene) => {
    void mkdir(projDir, { recursive: true }).then(() => writeFile(join(projDir, 'last.json'), JSON.stringify(scene))).catch(() => undefined);
  });
  h('project:last', async () => {
    try {
      const s = JSON.parse(await readFile(join(projDir, 'last.json'), 'utf8')) as unknown;
      return isScene(s) ? s : null;
    } catch {
      return null;
    }
  });
  h('project:save', async (scene: Scene): Promise<Result<string>> => {
    const win = BrowserWindow.getFocusedWindow();
    const opts: Electron.SaveDialogOptions = { defaultPath: 'my-project.boardpilot.json', filters: [{ name: 'BoardPilot project', extensions: ['json'] }] };
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return { ok: false, error: { code: 'cancelled', humanMessage: t('Not saved.'), hint: '' } };
    const used = [...new Set(scene.parts.map((p) => p.partId))];
    // user parts travel with the project so it opens on another Mac
    const { PARTS, BUILTIN_PART_IDS } = await import('@shared/board');
    const customParts = used.filter((id) => !BUILTIN_PART_IDS.has(id)).map((id) => PARTS[id]).filter(Boolean);
    await writeFile(r.filePath, JSON.stringify({ format: 'boardpilot-project@1', scene, customParts }, null, 2));
    return { ok: true, value: r.filePath };
  });
  h('project:open', async (): Promise<Result<Scene>> => {
    const win = BrowserWindow.getFocusedWindow();
    const opts: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'BoardPilot project', extensions: ['json'] }] };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (r.canceled || !r.filePaths[0]) return { ok: false, error: { code: 'cancelled', humanMessage: t('Nothing opened.'), hint: '' } };
    try {
      const f = JSON.parse(await readFile(r.filePaths[0], 'utf8')) as { scene?: unknown; customParts?: unknown[] };
      const scene = f.scene ?? f;
      if (!isScene(scene)) throw new Error('not a project');
      for (const cp of f.customParts ?? []) await parts.save(cp, (cp as PartDef).id);
      return { ok: true, value: scene };
    } catch {
      return { ok: false, error: { code: 'bad_project', humanMessage: t('That file is not a BoardPilot project.'), hint: t('Pick a .boardpilot.json file saved from the app.') } };
    }
  });

  // Interview coach (Learn): answers are stored only on this computer, pruned after 90 days.
  const coach = new CoachStore(join(dataDir, 'coach-answers.json'));
  const coachLesson = (lessonId: unknown, question: unknown): Lesson | null => {
    const lesson = LESSONS.find((l) => l.id === lessonId);
    return lesson && typeof question === 'string' && lesson.interview.includes(question) ? lesson : null;
  };
  const noQuestion = <T>(): Result<T> => ({ ok: false, error: { code: 'coach_unknown', humanMessage: t('This interview question was not found.'), hint: t('Open the lesson again and pick the question.') } });
  const saveFailed = <T>(): Result<T> => ({
    ok: false,
    error: { code: 'coach_storage', humanMessage: t('Your saved answers could not be read or changed.'), hint: t('Check that the app data folder is not full or read-only, then try again.') },
  });
  h('coach:ask', async (lessonId: string, question: string, answer: string): Promise<Result<{ attempt: CoachAttempt; saved: boolean }>> => {
    const lesson = coachLesson(lessonId, question);
    if (!lesson) return noQuestion();
    const text = typeof answer === 'string' ? answer.trim().slice(0, COACH_MAX_ANSWER) : '';
    if (!text) return { ok: false, error: { code: 'coach_empty', humanMessage: t('Write your answer first.'), hint: t('A few sentences are enough.') } };
    const r = await ai.coach(lesson, question, text);
    if (!r.ok) return r;
    const attempt: CoachAttempt = { id: randomUUID(), lessonId: lesson.id, question, answer: text, at: Date.now(), feedback: r.value };
    let saved = true;
    try {
      await coach.add(attempt);
    } catch {
      saved = false; // the grade is still shown; the renderer says it was not saved
    }
    return { ok: true, value: { attempt, saved } };
  });
  h('coach:history', async (lessonId: string, question: string): Promise<Result<{ attempts: CoachAttempt[]; total: number }>> => {
    if (!coachLesson(lessonId, question)) return noQuestion();
    try {
      return { ok: true, value: { attempts: await coach.list(lessonId, question), total: await coach.count() } };
    } catch {
      return saveFailed();
    }
  });
  h('coach:remove', async (lessonId: string, question: string): Promise<Result<true>> => {
    if (!coachLesson(lessonId, question)) return noQuestion();
    try {
      await coach.removeQuestion(lessonId, question);
      return { ok: true, value: true };
    } catch {
      return saveFailed();
    }
  });
  h('coach:removeAll', async (): Promise<Result<true>> => {
    try {
      await coach.removeAll();
      return { ok: true, value: true };
    } catch {
      return saveFailed();
    }
  });

  h('license:status', () => license.status());
  h('license:activate', (key: string) => license.activate(key));
  h('license:buy', () => shell.openExternal(BUY_URL));
  h('app:setLanguage', (lang: 'en' | 'it') => setLanguage(lang));
  h('app:openExternal', (url: string) => (/^https:\/\//.test(url) ? shell.openExternal(url) : undefined));

  // Forward hub events to every window.
  for (const ch of EVENT_CHANNELS) {
    hub.on(ch, (payload: unknown) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send(`evt:${ch}`, payload);
    });
  }
}
