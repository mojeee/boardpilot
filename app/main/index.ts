// Electron main process entry.

import { app, BrowserWindow, safeStorage, shell } from 'electron';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { HardwareHub } from './hardware/hub';
import { Assistant } from './ai/assistant';
import { registerIpc } from './ipc';
import { SessionLog } from './session/sessionLog';
import { UserParts } from './parts/userParts';
import { License } from './license/license';
import { AiSettingsStore } from './settings/settings';
import { baseDeps, setupMcp } from './mcp';
import { runStdio, stdioInput } from './mcp/server';
import { motionHash, motionJob, motionWindowOptions, runMotion } from './motion';
import type { PartDef } from '@shared/types';

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

// BP_MOTION=<job.json>: record a social clip (scripts/render-motion.mjs). A fresh profile every
// time, so each render starts from the same state (new trial, no saved project, English).
const MOTION = motionJob();
if (MOTION) {
  const profile = join(app.getPath('temp'), 'boardpilot-motion-profile');
  rmSync(profile, { recursive: true, force: true });
  app.setPath('userData', profile);
}
// BP_PROFILE=<dir>: use this folder as the app's data (end-to-end tests and screenshots start from a
// clean profile, so nothing remembered by an earlier run changes what they see).
if (!MOTION && process.env.BP_PROFILE) app.setPath('userData', process.env.BP_PROFILE);
const dataDir = app.getPath('userData');
// `BoardPilot --mcp-stdio`: an MCP client started us. No window; talk MCP on stdin/stdout. Use a
// separate Chromium profile so this process never locks the app's, but read the app's data.
const MCP_STDIO = process.argv.includes('--mcp-stdio');
if (MCP_STDIO) {
  app.setPath('userData', join(dataDir, 'mcp-stdio-profile'));
  app.disableHardwareAcceleration();
}
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
    ...(MOTION ? motionWindowOptions(MOTION) : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => {
    if (!process.env.BP_SNAPSHOT && !MOTION) win.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const hash = MOTION ? motionHash(MOTION) : (process.env.BP_SNAPSHOT_HASH ?? '');
  const load = () => {
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL + hash);
    else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: hash.replace(/^#/, '') });
  };
  // The motion capture injects its clock before the page loads, then loads it.
  if (MOTION) void runMotion(win, MOTION, load);
  else load();

  // Developer aid: BP_SNAPSHOT=/path.png captures the window after a delay and quits.
  if (process.env.BP_SNAPSHOT) {
    const out = process.env.BP_SNAPSHOT;
    const delay = Number(process.env.BP_SNAPSHOT_DELAY ?? 5000);
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        // BP_SNAPSHOT_RECT=x,y,w,h captures only that part of the window (e.g. the 3D viewport).
        const r = process.env.BP_SNAPSHOT_RECT?.split(',').map(Number);
        const img = await win.webContents.capturePage(r?.length === 4 ? { x: r[0], y: r[1], width: r[2], height: r[3] } : undefined);
        // BP_SNAPSHOT_WIDTH scales the image (e.g. a 2x capture down to a sharp 2400 px).
        const w = Number(process.env.BP_SNAPSHOT_WIDTH ?? 0);
        const main = w ? img.resize({ width: w, quality: 'best' }) : img;
        await writeFile(out, out.endsWith('.jpg') ? main.toJPEG(86) : main.toPNG());
        // BP_SNAPSHOT_COPIES=/a.jpg:1800,/b.jpg:900 also writes resized JPEG copies (website sizes).
        for (const spec of (process.env.BP_SNAPSHOT_COPIES ?? '').split(',').filter(Boolean)) {
          const i = spec.lastIndexOf(':');
          await writeFile(spec.slice(0, i), img.resize({ width: Number(spec.slice(i + 1)), quality: 'best' }).toJPEG(85));
        }
        app.quit();
      }, delay);
    });
    win.showInactive();
  } else if (MOTION) win.showInactive();
}

let userPartList: PartDef[] = [];
const refreshUserParts = () => void userParts.load().then((p) => (userPartList = p)).catch(() => undefined);

app.whenReady().then(() => {
  if (MCP_STDIO) {
    if (process.platform === 'darwin') app.dock?.hide();
    refreshUserParts();
    // The client closed the pipe: we are done.
    const input = stdioInput();
    input.on('end', () => app.quit());
    void runStdio(input, dataDir, app.getVersion(), () => ({ ...baseDeps(hub, dataDir, (n) => sessionLog.recent(n), () => userPartList), headless: true, requestWrite: async () => 'refused' as const, requestSceneEdit: async () => ({ status: 'refused' as const }), runAppAction: async () => ({ status: 'refused' as const, steps: [] }) }));
    return;
  }
  refreshUserParts();
  setupMcp({
    hub,
    dataDir,
    recentLog: (n) => sessionLog.recent(n),
    // The last loaded list, refreshed in the background so new parts show up on the next call.
    userParts: () => {
      refreshUserParts();
      return userPartList;
    },
  });
  registerIpc(hub, assistant, sessionLog, dataDir, userParts, license);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  void hub.shutdown();
  if (process.platform !== 'darwin' || process.env.BP_SNAPSHOT || MOTION) app.quit();
});
