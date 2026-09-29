// window.bp for the browser demo. The desktop app's preload script sends every call to the main
// process; here the same main-process code runs in the page instead, with the simulator as the
// only hardware: the HardwareHub with its SimDriver, the confirmation tokens, the assistant (free
// demo relay only), the parts library and the interview coach. Their node:fs, node:path,
// node:events and node:crypto imports point at in-memory shims (vite.web.config.ts), so nothing
// is written anywhere and nothing is kept after the tab closes.
//
// What needs the computer (real boards on USB, chip tools, saved API keys, the MCP server, reading
// other websites) answers with a "needs the app" error and asks the page to show the
// "Download the app" prompt. Saving a file becomes a browser download; opening one uses the
// browser's file picker.

import type { BoardPilotApi, McpStatus, TraceEvent, Unsubscribe } from '@shared/api';
import { EVENT_CHANNELS } from '@shared/api';
import type { HardwareMode, LicenseStatus, LogEntry, PartDef, Result, Scene } from '@shared/types';
import type { AiProviderId, AiSettingsInput } from '@shared/ai';
import { PROVIDER_INFO } from '@shared/ai';
import { BUY_URL, TRIAL_DAYS } from '@shared/brand';
import { BUILTIN_PART_IDS, PARTS } from '@shared/board';
import { setLanguage, t } from '@shared/i18n';
import { HardwareHub } from '../main/hardware/hub';
import { Assistant } from '../main/ai/assistant';
import { AiSettingsStore, type SecretBox } from '../main/settings/settings';
import { grant } from '../main/session/safety';
import { UserParts } from '../main/parts/userParts';
import { CoachStore } from '../main/session/coachStore';
import { makeCoachApi } from '../main/session/coachApi';
import type { StarterFile } from '@shared/starter/common';
import { memfs } from './shims/memfs';
import { needsApp, showNeedsApp } from './needsApp';

const DATA = '/data';

/** The relay of the free demo AI on this site (same origin, so no CORS and no key in the page). */
function relayUrl(): string {
  return /^https?:$/.test(location.protocol) ? new URL('/api/demo-ai', location.origin).toString() : 'off';
}
const env: Record<string, string | undefined> = { BOARDPILOT_DEMO_AI_URL: relayUrl(), BOARDPILOT_VERSION: __BP_VERSION__ };

/** A web page cannot keep a secret, so API keys are never saved here. */
const noSecrets: SecretBox = {
  isEncryptionAvailable: () => false,
  encryptString: () => {
    throw new Error('not available in the browser demo');
  },
  decryptString: () => {
    throw new Error('not available in the browser demo');
  },
};

const hub = new HardwareHub(DATA, '/agent', 'sim');
const settings = new AiSettingsStore(`${DATA}/settings.json`, noSecrets, env);
const assistant = new Assistant(hub, settings, env);
const userParts = new UserParts(`${DATA}/parts`);
const coach = makeCoachApi(assistant, new CoachStore(`${DATA}/coach-answers.json`));
const sessionLog: LogEntry[] = [];

const WHY = {
  usb: () => t('A real board needs the BoardPilot app: a web page cannot reach USB ports or run the chip tools.'),
  key: () => t('Your own AI key needs the BoardPilot app: a web page cannot keep a key safe.'),
  mcp: () => t('Letting AI coding agents use your board (MCP) needs the BoardPilot app on your computer.'),
  link: () => t('Importing a part from a web link needs the BoardPilot app: a web page cannot read other websites.'),
  license: () => t('License keys are entered in the BoardPilot app.'),
};

/* ---------- IPC-like copying: the renderer never shares objects with the "main" side ---------- */

const copy = <T>(v: T): T => (v === undefined || v === null ? v : structuredClone(v));

function wrap<A extends unknown[], R>(fn: (...args: A) => R | Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => copy(await fn(...(args.map((a) => copy(a)) as A)));
}

/* ---------- files: downloads and the browser's file picker ---------- */

const inDownloads = (name: string) => t('{name} in your downloads', { name });

function download(name: string, data: BlobPart | { dataUrl: string }, type = 'application/octet-stream') {
  const url = typeof data === 'object' && data !== null && 'dataUrl' in data ? data.dataUrl : URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

const cancelled = <T>(humanMessage: string): Result<T> => ({ ok: false, error: { code: 'cancelled', humanMessage, hint: '' } });

const isScene = (x: unknown): x is Scene =>
  typeof x === 'object' && x !== null && Array.isArray((x as Scene).parts) && Array.isArray((x as Scene).wires) && typeof (x as Scene).board === 'string';

/* ---------- events ---------- */

type Channel = keyof BoardPilotApi['on'];
const listeners = new Map<Channel, Set<(payload: never) => void>>();
function listen(ch: Channel) {
  return (cb: (payload: never) => void): Unsubscribe => {
    const set = listeners.get(ch) ?? new Set();
    listeners.set(ch, set);
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  };
}
for (const ch of EVENT_CHANNELS) {
  hub.on(ch, (payload: unknown) => {
    for (const cb of listeners.get(ch) ?? []) (cb as (p: unknown) => void)(copy(payload));
  });
}

/* ---------- the API ---------- */

const mcpOff: McpStatus = { enabled: false, running: false, command: '', claudeCode: '' };

const api: BoardPilotApi = {
  web: true,
  hw: {
    state: wrap(() => hub.state),
    setMode: wrap((mode: HardwareMode) => (mode === 'sim' ? hub.setMode('sim') : needsApp(WHY.usb()))),
    setBoard: wrap((boardId: string) => hub.setBoard(String(boardId))),
    listPorts: wrap(() => hub.listPorts()),
    identify: wrap((port: string) => hub.identify(port)),
    installAgent: wrap((token: string) => hub.installAgent(token)),
    connectAgent: wrap(() => hub.connectAgent()),
    agent: wrap((req) => hub.agent(req)),
    agentWrite: wrap((req, token: string) => hub.agentWrite(req, token)),
    restore: wrap((id: string, token: string) => hub.restore(id, token)),
    flashUser: wrap((token: string, path: string) => hub.flashUser(token, path)),
    openSerial: wrap((baud: number) => hub.openSerial(baud)),
    closeSerial: wrap(() => hub.closeSerial()),
    writeSerial: wrap((text: string) => hub.writeSerial(text)),
    captureSerial: wrap((baud: number, ms: number) => hub.captureSerial(baud, ms)),
    // Reads a file picked in this tab (session.pickFile keeps it in memory).
    preflight: wrap((path: string) => hub.preflight(path)),
  },
  sim: {
    scenarios: wrap(() => hub.scenarios()),
    load: wrap((id: string) => hub.loadScenario(id)),
    scene: wrap(() => hub.scenarioScene()),
    control: wrap((a: 'fixWiring' | 'turnKnob' | 'pressButton') => hub.simControl(a)),
  },
  safety: {
    grant: wrap((kind, uses?: number) => grant(kind, typeof uses === 'number' ? uses : 1)),
  },
  ai: {
    status: wrap(() => assistant.status()),
    getSettings: wrap(() => assistant.getSettings()),
    saveSettings: wrap((input: AiSettingsInput) => (input.apiKey?.trim() || PROVIDER_INFO[input.provider]?.needsKey ? needsApp(WHY.key()) : assistant.saveSettings(input))),
    clearKey: wrap((provider: AiProviderId) => assistant.clearKey(provider)),
    listModels: wrap((provider: AiProviderId) => (PROVIDER_INFO[provider]?.needsKey ? needsApp(WHY.key()) : assistant.listModels(provider))),
    test: wrap((draft?: Partial<AiSettingsInput>) => (draft?.provider && PROVIDER_INFO[draft.provider]?.needsKey ? needsApp(WHY.key()) : assistant.test({ ...draft, apiKey: undefined }))),
    ask: wrap((q: string, ctx) => assistant.ask(q, { ...ctx, log: ctx.log.length ? ctx.log : sessionLog.slice(-50) })),
    recognize: wrap((b64: string, mt: 'image/jpeg' | 'image/png' | 'image/webp') => assistant.recognizePart(b64, mt)),
    classify: wrap((text: string, options: { id: string; label: string }[]) => assistant.classify(text, options)),
    reset: wrap(() => assistant.reset()),
  },
  session: {
    append: (entry: LogEntry) => {
      sessionLog.push(copy(entry));
      if (sessionLog.length > 2000) sessionLog.splice(0, 500);
    },
    pickFile: async (kind: 'firmware' | 'datasheet') => {
      const f = await pickFile(kind === 'firmware' ? '.bin,.uf2,.hex' : '.pdf,application/pdf');
      if (!f) return null;
      const path = `/uploads/${f.name.replace(/[\\/]/g, '_')}`;
      memfs.write(path, new Uint8Array(await f.arrayBuffer()));
      return path;
    },
    openSketch: async () => {
      const f = await pickFile('.ino,.cpp,.h,.c,.txt');
      if (!f) return cancelled(t('No file chosen.'));
      if (f.size > 1024 * 1024) return { ok: false, error: { code: 'too_big', humanMessage: t('This file is too big for a sketch.'), hint: t('Pick the .ino file of your project.') } };
      try {
        return { ok: true, value: { name: f.name, text: await f.text() } };
      } catch {
        return { ok: false, error: { code: 'read_failed', humanMessage: t('The file could not be read.'), hint: t('Check that the file still exists and try again.') } };
      }
    },
    saveFile: async (name: string, content: string) => {
      const type = /\.svg$/i.test(name) ? 'image/svg+xml' : /\.csv$/i.test(name) ? 'text/csv' : /\.md$/i.test(name) ? 'text/markdown' : 'text/plain';
      download(name, content, `${type};charset=utf-8`);
      return { ok: true, value: inDownloads(name) };
    },
    // A folder cannot be created from a web page: each file downloads as <folder>-<name>.
    saveProject: async (folder: string, files: StarterFile[]) => {
      const safe = (x: string) => x.replace(/[\\/:*?"<>|]/g, '_');
      for (const f of files) download(`${safe(folder)}-${safe(f.name)}`, f.text, 'text/plain;charset=utf-8');
      return { ok: true, value: inDownloads(`${safe(folder)}-*`) };
    },
    savePng: async (name: string, dataUrl: string) => {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,'))
        return { ok: false, error: { code: 'bad_image', humanMessage: t('The picture could not be saved.'), hint: t('Try the export again.') } };
      download(name, { dataUrl });
      return { ok: true, value: inDownloads(name) };
    },
    // The desktop app also prints a PDF; in the browser the report comes as Markdown and as a web
    // page that the browser can print to PDF.
    exportReport: async (markdown: string, html: string, name: string) => {
      download(`${name}.md`, markdown, 'text/markdown;charset=utf-8');
      download(`${name}.html`, html, 'text/html;charset=utf-8');
      return { ok: true, value: { markdownPath: inDownloads(`${name}.md`), pdfPath: inDownloads(`${name}.html`) } };
    },
    info: async () => ({ dataDir: t('This browser tab (nothing is kept after you close it)'), logPath: '', version: __BP_VERSION__ }),
  },
  parts: {
    list: wrap(() => userParts.load()),
    save: wrap((def: PartDef, replaceId?: string) => userParts.save(def, replaceId)),
    remove: wrap((id: string) => userParts.remove(id)),
    importFromUrl: wrap(() => needsApp(WHY.link())),
  },
  project: {
    autosave: () => undefined,
    last: async () => null,
    save: async (scene: Scene) => {
      const used = [...new Set(scene.parts.map((p) => p.partId))];
      const customParts = used.filter((id) => !BUILTIN_PART_IDS.has(id)).map((id) => PARTS[id]).filter(Boolean);
      const name = 'my-project.boardpilot.json';
      download(name, JSON.stringify({ format: 'boardpilot-project@1', scene, customParts }, null, 2), 'application/json');
      return { ok: true, value: inDownloads(name) };
    },
    open: async () => {
      const f = await pickFile('.json,application/json');
      if (!f) return cancelled(t('Nothing opened.'));
      try {
        const file = JSON.parse(await f.text()) as { scene?: unknown; customParts?: unknown[] };
        const scene = file.scene ?? file;
        if (!isScene(scene)) throw new Error('not a project');
        for (const cp of file.customParts ?? []) await userParts.save(cp, (cp as PartDef).id);
        return { ok: true, value: copy(scene) };
      } catch {
        return { ok: false, error: { code: 'bad_project', humanMessage: t('That file is not a BoardPilot project.'), hint: t('Pick a .boardpilot.json file saved from the app.') } };
      }
    },
  },
  mcp: {
    status: async () => mcpOff,
    setEnabled: async (on: boolean) => {
      if (on) showNeedsApp(WHY.mcp());
      return mcpOff;
    },
    writeResult: async () => undefined,
  },
  coach: {
    ask: wrap((lessonId: string, question: string, answer: string) => coach.ask(lessonId, question, answer)),
    history: wrap((lessonId: string, question: string) => coach.history(lessonId, question)),
    remove: wrap((lessonId: string, question: string) => coach.remove(lessonId, question)),
    removeAll: wrap(() => coach.removeAll()),
  },
  license: {
    // The demo has no trial clock; the top bar shows "Get the app" instead of the trial chip.
    status: async (): Promise<LicenseStatus> => ({ state: 'trial', daysLeft: TRIAL_DAYS, trialDays: TRIAL_DAYS, firstRun: new Date().toISOString() }),
    activate: async () => needsApp(WHY.license()),
    openBuyPage: async () => {
      window.open(BUY_URL, '_blank', 'noopener,noreferrer');
    },
  },
  app: {
    setLanguage: async (lang: 'en' | 'it') => setLanguage(lang),
    openExternal: async (url: string) => {
      if (/^https:\/\//.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
    },
  },
  on: {
    state: listen('state'),
    live: listen('live'),
    serial: listen('serial'),
    probe: listen('probe'),
    log: listen('log'),
    progress: listen('progress'),
    trace: listen('trace') as (cb: (t: TraceEvent) => void) => Unsubscribe,
    mcpWrite: listen('mcpWrite'),
  },
};

window.bp = api;
