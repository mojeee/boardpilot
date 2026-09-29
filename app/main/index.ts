// Electron main process entry.

import { app, BrowserWindow, safeStorage, shell } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { HardwareHub } from './hardware/hub';
import { Assistant } from './ai/assistant';
import { registerIpc } from './ipc';
import { SessionLog } from './session/sessionLog';
import { UserParts } from './parts/userParts';
import { License } from './license/license';
import { AiSettingsStore } from './settings/settings';

/** Minimal .env.local reader (KEY=value lines). Keys stay in this process only; they are the
 *  fallback when no key is saved in AI settings (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY). */
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
// Sent to the free demo relay as "X-BoardPilot-Client: BoardPilot/<version>" (see ai/providers/demo.ts).
process.env.BOARDPILOT_VERSION ||= app.getVersion();

const dataDir = app.getPath('userData');
const agentDir = app.isPackaged ? join(process.resourcesPath, 'agent') : join(app.getAppPath(), 'resources/agent');
const mode = process.env.BOARDPILOT_MODE === 'real' ? 'real' : 'sim';
const hub = new HardwareHub(dataDir, agentDir, mode);
const sessionLog = new SessionLog(dataDir);
const aiSettings = new AiSettingsStore(join(dataDir, 'settings.json'), safeStorage);
const assistant = new Assistant(hub, aiSettings);
const userParts = new UserParts(join(dataDir, 'parts'));
const license = new License(dataDir);

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#161B21',
    // macOS: content under the title bar with the traffic lights inset; Windows/Linux: normal frame, no menu bar.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 20 } }
      : { autoHideMenuBar: true }),
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
        // BP_SNAPSHOT_RECT=x,y,w,h captures only that part of the window (e.g. the 3D viewport).
        const r = process.env.BP_SNAPSHOT_RECT?.split(',').map(Number);
        const img = await win.webContents.capturePage(r?.length === 4 ? { x: r[0], y: r[1], width: r[2], height: r[3] } : undefined);
        await writeFile(out, out.endsWith('.jpg') ? img.toJPEG(86) : img.toPNG());
        // BP_SNAPSHOT_SMALL=/path-900.jpg also writes a 900 px wide copy for the website.
        const small = process.env.BP_SNAPSHOT_SMALL;
        if (small) await writeFile(small, img.resize({ width: 900, quality: 'best' }).toJPEG(84));
        app.quit();
      }, delay);
    });
    win.showInactive();
  }
}

app.whenReady().then(() => {
  void userParts.load();
  registerIpc(hub, assistant, sessionLog, dataDir, userParts, license);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  void hub.shutdown();
  if (process.platform !== 'darwin' || process.env.BP_SNAPSHOT) app.quit();
});
