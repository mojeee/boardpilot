// Typed IPC handlers. Every handler returns data or a Result; nothing throws into the renderer.

import { BrowserWindow, dialog, ipcMain, app } from 'electron';
import { writeFile } from 'node:fs/promises';
import type { AgentRequest, AiContext, HardwareMode, LogEntry, Result, WriteRequest } from '@shared/types';
import { EVENT_CHANNELS } from '@shared/api';
import type { HardwareHub } from './hardware/hub';
import type { Assistant } from './ai/assistant';
import { MAIN_MODEL } from './ai/assistant';
import { grant } from './session/safety';
import type { SessionLog } from './session/sessionLog';
import { toAppError } from './hardware/errors';

export function registerIpc(hub: HardwareHub, ai: Assistant, log: SessionLog, dataDir: string) {
  const h = (ch: string, fn: (...args: never[]) => unknown) => ipcMain.handle(ch, (_e, ...args) => fn(...(args as never[])));

  h('hw:state', () => hub.state);
  h('hw:setMode', (mode: HardwareMode) => hub.setMode(mode));
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
  h('hw:captureSerial', (baud: number, ms: number) => hub.captureSerial(baud, ms));

  h('sim:scenarios', () => hub.scenarios());
  h('sim:load', (id: string) => hub.loadScenario(id));
  h('sim:scene', () => hub.scenarioScene());
  h('sim:control', (a: 'fixWiring' | 'turnKnob') => hub.simControl(a));

  h('safety:grant', (kind: WriteRequest['kind'] | 'restore') => grant(kind));

  h('ai:status', () => ({ enabled: ai.enabled, model: MAIN_MODEL }));
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
      filters: kind === 'firmware' ? [{ name: 'Firmware image', extensions: ['bin'] }] : [{ name: 'Datasheet', extensions: ['pdf'] }],
    };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
  h('session:saveFile', async (name: string, content: string): Promise<Result<string>> => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const opts: Electron.SaveDialogOptions = { defaultPath: name };
      const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || !r.filePath) return { ok: false, error: { code: 'cancelled', humanMessage: 'Not saved.', hint: '' } };
      await writeFile(r.filePath, content);
      return { ok: true, value: r.filePath };
    } catch (e) {
      return { ok: false, error: toAppError(e) };
    }
  });
  h('session:exportReport', async (markdown: string, html: string, name: string): Promise<Result<{ markdownPath: string; pdfPath: string }>> => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const opts: Electron.SaveDialogOptions = { defaultPath: `${name}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] };
      const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || !r.filePath) return { ok: false, error: { code: 'cancelled', humanMessage: 'Export cancelled.', hint: '' } };
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

  // Forward hub events to every window.
  for (const ch of EVENT_CHANNELS) {
    hub.on(ch, (payload: unknown) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send(`evt:${ch}`, payload);
    });
  }
}
