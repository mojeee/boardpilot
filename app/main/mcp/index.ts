// MCP in the app: the on/off switch (off by default, remembered), the localhost server while it is
// on, and write requests routed to the app window's confirmation dialog.

import { BrowserWindow, app, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LogEntry, PartDef, Scene, WriteRequest } from '@shared/types';
import type { McpStatus } from '@shared/api';
import type { HardwareHub } from '../hardware/hub';
import { McpHttpServer } from './server';
import type { McpDeps } from './tools';


/** How an MCP client starts BoardPilot's stdio bridge on this computer. */
export function stdioCommand(): string[] {
  return app.isPackaged ? [process.execPath, '--mcp-stdio'] : [process.execPath, app.getAppPath(), '--mcp-stdio'];
}

/** Deps shared by the app server and headless mode: the hub, the autosaved project, the log. */
export function baseDeps(hub: HardwareHub, dataDir: string, recentLog: (n: number) => LogEntry[], userParts: () => PartDef[]) {
  return {
    hub,
    recentLog,
    userParts,
    scene: async (): Promise<Scene | null> => {
      try {
        return JSON.parse(await readFile(join(dataDir, 'projects', 'last.json'), 'utf8')) as Scene;
      } catch {
        return null;
      }
    },
  };
}

export function setupMcp(opts: { hub: HardwareHub; dataDir: string; recentLog: (n: number) => LogEntry[]; userParts: () => PartDef[] }) {
  const settingsPath = join(opts.dataDir, 'mcp-settings.json');
  let enabled = false;
  try {
    enabled = (JSON.parse(readFileSync(settingsPath, 'utf8')) as { enabled?: boolean }).enabled === true;
  } catch {
    enabled = false;
  }

  // Write requests wait here for the user's answer in the window.
  const pending = new Map<string, (status: 'approved' | 'refused') => void>();
  const requestWrite = (req: WriteRequest, client: string) =>
    new Promise<'approved' | 'refused'>((resolve) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return resolve('refused');
      const id = randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve('refused');
      }, 3 * 60 * 1000);
      pending.set(id, (s) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(s);
      });
      if (win.isMinimized()) win.restore();
      win.focus();
      win.webContents.send('evt:mcpWrite', { id, req, client });
    });
  ipcMain.handle('mcp:writeResult', (_e, id: string, status: 'approved' | 'refused') => pending.get(id)?.(status === 'approved' ? 'approved' : 'refused'));

  const deps: Omit<McpDeps, 'clientName'> = {
    ...baseDeps(opts.hub, opts.dataDir, opts.recentLog, opts.userParts),
    headless: false,
    requestWrite,
  };
  const server = new McpHttpServer(deps, opts.dataDir, app.getVersion());

  const status = (): McpStatus => {
    const cmd = stdioCommand().map((p) => (/\s/.test(p) ? `"${p}"` : p));
    return { enabled, running: server.running, command: cmd.join(' '), claudeCode: `claude mcp add boardpilot -- ${cmd.join(' ')}` };
  };
  const setEnabled = async (on: boolean) => {
    enabled = on;
    writeFileSync(settingsPath, JSON.stringify({ enabled }));
    if (on) {
      await server.start();
      opts.hub.note('info', 'AI agents can now use BoardPilot through MCP (localhost only).', 'MCP');
    } else {
      await server.stop();
      opts.hub.note('info', 'MCP server stopped.', 'MCP');
    }
    return status();
  };
  ipcMain.handle('mcp:status', () => status());
  ipcMain.handle('mcp:setEnabled', (_e, on: boolean) => setEnabled(on === true));
  if (enabled) void server.start();
  app.on('before-quit', () => void server.stop());
  return { status };
}
