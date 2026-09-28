// Electron main process entry.

import { app, BrowserWindow, shell } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { HardwareHub } from './hardware/hub';
import { Assistant } from './ai/assistant';
import { registerIpc } from './ipc';
import { SessionLog } from './session/sessionLog';

/** Minimal .env.local reader (KEY=value lines). The key stays in this process only. */
function loadEnvLocal() {
  const candidates = [join(process.cwd(), '.env.local'), join(app.getAppPath(), '.env.local')];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}

loadEnvLocal();

const dataDir = app.getPath('userData');
const agentDir = app.isPackaged ? join(process.resourcesPath, 'agent') : join(app.getAppPath(), 'resources/agent');
const mode = process.env.BOARDPILOT_MODE === 'real' ? 'real' : 'sim';
const hub = new HardwareHub(dataDir, agentDir, mode);
const sessionLog = new SessionLog(dataDir);
const assistant = new Assistant(hub, process.env.ANTHROPIC_API_KEY || undefined);

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#161B21',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 20 },
    title: 'BoardPilot',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => {
    if (!process.env.BP_SNAPSHOT) win.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const hash = process.env.BP_SNAPSHOT_HASH ?? '';
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL + hash);
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: hash.replace(/^#/, '') });

  // Developer aid: BP_SNAPSHOT=/path.png captures the window after a delay and quits.
  if (process.env.BP_SNAPSHOT) {
    const out = process.env.BP_SNAPSHOT;
    const delay = Number(process.env.BP_SNAPSHOT_DELAY ?? 5000);
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        await writeFile(out, img.toPNG());
        app.quit();
      }, delay);
    });
    win.showInactive();
  }
}

app.whenReady().then(() => {
  registerIpc(hub, assistant, sessionLog, dataDir);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  void hub.shutdown();
  if (process.platform !== 'darwin' || process.env.BP_SNAPSHOT) app.quit();
});
