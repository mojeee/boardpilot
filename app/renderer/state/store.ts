// Zustand stores. Hardware state comes from the main process; everything else lives here.

import { create } from 'zustand';
import type {
  AiReply,
  ConnectionState,
  LiveFrame,
  LogEntry,
  LogType,
  ProbeFrame,
  Scene,
  ScenarioInfo,
  TargetRef,
  WiringFinding,
  WriteRequest,
} from '@shared/types';
import type { TraceEvent } from '@shared/api';
import { checkWiring } from '@shared/wiring';
import { DEFAULT_BOARD_ID, getBoard, PARTS, pinByGpio } from '@shared/board';
import type { AiStatus } from '@shared/ai';

export type Screen = 'home' | 'connect' | 'newProject' | 'flash' | 'debug' | 'monitor' | 'test' | 'report' | 'learn';

/* ---------------- app ---------------- */

interface AppStore {
  screen: Screen;
  conn: ConnectionState;
  progress: { task: string; pct: number } | null;
  ai: AiStatus;
  scenarios: ScenarioInfo[];
  devOpen: boolean;
  setScreen(s: Screen): void;
  set(p: Partial<Omit<AppStore, 'setScreen' | 'set'>>): void;
}

export const useApp = create<AppStore>((set) => ({
  screen: 'home',
  conn: { mode: 'sim', board: DEFAULT_BOARD_ID, port: null, chip: null, agent: null, streaming: false, serialOpen: false, scenario: null, backups: [] },
  progress: null,
  ai: { enabled: false, provider: 'anthropic', model: '' },
  scenarios: [],
  devOpen: false,
  setScreen: (screen) => set({ screen }),
  set: (p) => set(p),
}));

/* ---------------- log ---------------- */

interface LogStore {
  entries: LogEntry[];
  filter: LogType | 'all';
  add(type: LogType, text: string, opts?: { target?: TargetRef; source?: string }): LogEntry;
  setFilter(f: LogType | 'all'): void;
  clear(): void;
}

let logId = 1;
export const useLog = create<LogStore>((set) => ({
  entries: [],
  filter: 'all',
  add: (type, text, opts) => {
    const e: LogEntry = { id: logId++, t: Date.now(), type, text, ...opts };
    set((s) => ({ entries: s.entries.length > 2000 ? [...s.entries.slice(-1500), e] : [...s.entries, e] }));
    window.bp?.session.append(e);
    return e;
  },
  setFilter: (filter) => set({ filter }),
  clear: () => set({ entries: [] }),
}));

export const log = (type: LogType, text: string, opts?: { target?: TargetRef; source?: string }) => useLog.getState().add(type, text, opts);

/* ---------------- scene + 3D selection ---------------- */

const EMPTY_SCENE: Scene = { board: DEFAULT_BOARD_ID, parts: [], wires: [] };

/** The board of the open project. */
export function currentBoard() {
  return getBoard(useScene.getState().scene.board);
}

interface SceneStore {
  scene: Scene;
  findings: WiringFinding[];
  selected: TargetRef | null;
  highlight: TargetRef[];
  focus: { targets: TargetRef[]; nonce: number };
  view: '3d' | '2d' | 'diagram';
  labels: boolean;
  wireMode: boolean;
  wireFrom: string | null;
  draggingPart: string | null;
  libOpen: boolean;
  cameraPreset: { name: 'top' | 'side' | 'module' | 'home'; nonce: number };
  /** Bumped when a scene is opened (not on edits), so the camera frames it. */
  loadNonce: number;
  /** Floor style of the 3D view: a workbench or a plain grid. */
  stage: 'desk' | 'plain';
  /** A temporary scene shown by a lesson; the user's project is kept aside and comes back intact. */
  preview: { title: string } | null;
  startPreview(scene: Scene, focus: TargetRef[], title: string): void;
  endPreview(): void;
  past: Scene[];
  future: Scene[];
  /** Replace the scene. Pass keepHistory to make it undoable. */
  setScene(s: Scene, keepHistory?: boolean): void;
  /** Open a scene (project, example, new board) and frame it with the camera. */
  openScene(s: Scene, keepHistory?: boolean): void;
  /** Change the scene. Transient changes (drag moves) skip the undo history; call checkpoint() first. */
  updateScene(fn: (s: Scene) => Scene, opts?: { transient?: boolean }): void;
  checkpoint(): void;
  undo(): void;
  redo(): void;
  select(t: TargetRef | null): void;
  focusOn(targets: TargetRef[]): void;
  setHighlight(targets: TargetRef[]): void;
  set(p: Partial<Pick<SceneStore, 'view' | 'labels' | 'wireFrom' | 'wireMode' | 'draggingPart' | 'libOpen'>>): void;
  setStage(stage: 'desk' | 'plain'): void;
  preset(name: 'top' | 'side' | 'module' | 'home'): void;
}

const STAGE_KEY = 'bp.stage';

/** The user's project while a lesson preview is open (see startPreview). */
let previewSaved: { scene: Scene; past: Scene[]; future: Scene[]; selected: TargetRef | null; highlight: TargetRef[]; view: SceneStore['view'] } | null = null;

/** The remembered floor style; slow computers (few cores or little memory) start with the plain one. */
function initialStage(): 'desk' | 'plain' {
  try {
    const v = localStorage.getItem(STAGE_KEY);
    if (v === 'desk' || v === 'plain') return v;
  } catch {
    /* no storage: use the default */
  }
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number });
  const slow = (nav?.hardwareConcurrency ?? 8) <= 4 || (nav?.deviceMemory ?? 8) <= 4;
  return slow ? 'plain' : 'desk';
}

function withFindings(scene: Scene) {
  return { scene, findings: checkWiring(scene, getBoard(scene.board), PARTS) };
}

/**
 * The simulator's demo scene, as loaded at start-up. New project starts empty while the scene is
 * still exactly this object: any edit makes a new scene object, so the user's own work is never cleared.
 */
let demoScene: Scene | null = null;
export const markDemoScene = () => (demoScene = useScene.getState().scene);
export const isUntouchedDemo = () => demoScene !== null && useScene.getState().scene === demoScene;

export const useScene = create<SceneStore>((set, get) => ({
  ...withFindings(EMPTY_SCENE),
  selected: null,
  highlight: [],
  focus: { targets: [], nonce: 0 },
  view: '3d',
  labels: false,
  wireMode: false,
  wireFrom: null,
  draggingPart: null,
  libOpen: false,
  cameraPreset: { name: 'home', nonce: 0 },
  loadNonce: 0,
  stage: initialStage(),
  preview: null,
  startPreview: (scene, focus, title) => {
    const st = get();
    // Keep the user's project exactly as it is (history and view too), unless a preview is already open.
    if (!st.preview) previewSaved = { scene: st.scene, past: st.past, future: st.future, selected: st.selected, highlight: st.highlight, view: st.view };
    set((s) => ({ ...withFindings(scene), past: [], future: [], selected: null, highlight: focus, view: '3d', preview: { title }, loadNonce: s.loadNonce + 1 }));
    setTimeout(() => get().focusOn(focus), 400);
  },
  endPreview: () => {
    const saved = previewSaved;
    previewSaved = null;
    if (!get().preview || !saved) return set({ preview: null });
    set((s) => ({ ...withFindings(saved.scene), past: saved.past, future: saved.future, selected: saved.selected, highlight: saved.highlight, view: saved.view, preview: null, loadNonce: s.loadNonce + 1 }));
  },
  past: [],
  future: [],
  setScene: (s, keepHistory) =>
    set(keepHistory ? { ...withFindings(s), past: [...get().past.slice(-99), get().scene], future: [] } : { ...withFindings(s), past: [], future: [] }),
  updateScene: (fn, opts) => {
    const before = get().scene;
    const after = fn(before);
    if (after === before) return;
    set(opts?.transient ? withFindings(after) : { ...withFindings(after), past: [...get().past.slice(-99), before], future: [] });
  },
  openScene: (s, keepHistory) => {
    get().setScene(s, keepHistory);
    set((st) => ({ loadNonce: st.loadNonce + 1 }));
  },
  checkpoint: () => set({ past: [...get().past.slice(-99), get().scene], future: [] }),
  undo: () => {
    const { past, scene, future } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    set({ ...withFindings(prev), past: past.slice(0, -1), future: [scene, ...future] });
  },
  redo: () => {
    const { past, scene, future } = get();
    const next = future[0];
    if (!next) return;
    set({ ...withFindings(next), past: [...past, scene], future: future.slice(1) });
  },
  select: (selected) => set({ selected }),
  focusOn: (targets) => set((s) => ({ focus: { targets, nonce: s.focus.nonce + 1 }, highlight: targets, selected: targets[0] ?? s.selected })),
  setHighlight: (highlight) => set({ highlight }),
  set: (p) => set(p),
  setStage: (stage) => {
    try {
      localStorage.setItem(STAGE_KEY, stage);
    } catch {
      /* private mode: the choice lasts until the app closes */
    }
    set({ stage });
  },
  preset: (name) => set((s) => ({ cameraPreset: { name, nonce: s.cameraPreset.nonce + 1 } })),
}));

/* ---------------- live data ---------------- */

export interface Series {
  key: string;
  label: string;
  color: string;
  unit: string;
  pin?: number;
  t: number[];
  v: number[];
}

interface LiveStore {
  frame: LiveFrame | null;
  frameAt: number;
  trace: TraceEvent | null;
  traceAt: number;
  /** wire ids with bus activity until a given time */
  activeWires: Record<string, number>;
  serial: string[];
  probe: ProbeFrame | null;
  mem: ProbeFrame['mem'][];
  series: Record<string, Series>;
  paused: boolean;
  /** Baud rate chosen in Monitor (the code checker compares it with Serial.begin). */
  baud: number;
  recording: { startedAt: number; rows: string[] } | null;
  pushFrame(f: LiveFrame): void;
  pushTrace(t: TraceEvent): void;
  pushSerial(lines: string[]): void;
  pushProbe(p: ProbeFrame): void;
  set(p: Partial<Pick<LiveStore, 'paused' | 'recording' | 'serial' | 'baud'>>): void;
  resetSeries(): void;
}

const MAX_POINTS = 12000; // 10 min at 20 Hz

function pushPoint(series: Record<string, Series>, key: string, init: Omit<Series, 't' | 'v'>, t: number, v: number) {
  const s = series[key] ?? { ...init, t: [], v: [] };
  s.t.push(t);
  s.v.push(v);
  if (s.t.length > MAX_POINTS) {
    s.t.splice(0, s.t.length - MAX_POINTS);
    s.v.splice(0, s.v.length - MAX_POINTS);
  }
  series[key] = s;
}

const PROBE_COLORS: Record<string, string> = {
  temperature: '#FF6B5E',
  humidity: '#3FB6E8',
  pressure: '#9ADCF7',
  pot: '#E8D24A',
};
const PROBE_UNITS: Record<string, string> = { temperature: '°C', humidity: '%', pressure: 'hPa', pot: 'mV' };

export const useLive = create<LiveStore>((set, get) => ({
  frame: null,
  frameAt: 0,
  trace: null,
  traceAt: 0,
  activeWires: {},
  serial: [],
  probe: null,
  mem: [],
  series: {},
  paused: false,
  baud: 115200,
  recording: null,
  pushFrame: (f) => {
    const now = Date.now() / 1000;
    const st = get();
    if (!st.paused) {
      const series = st.series;
      const board = currentBoard();
      for (const [g, p] of Object.entries(f.pins)) {
        const pin = pinByGpio(board, Number(g));
        const label = pin ? `${pin.label} (GPIO ${g})` : `GPIO ${g}`;
        if (p.mv !== undefined) pushPoint(series, `pin${g}`, { key: `pin${g}`, label, color: '#E8D24A', unit: 'mV', pin: Number(g) }, now, p.mv);
        else if (p.level !== undefined) pushPoint(series, `pin${g}`, { key: `pin${g}`, label, color: p.mode === 'pwm' ? '#5CCB8F' : '#3FB6E8', unit: 'level', pin: Number(g) }, now, p.level);
      }
      if (st.recording) {
        st.recording.rows.push(`${now.toFixed(3)},pins,${Object.entries(f.pins).map(([g, p]) => `${g}=${p.mv ?? p.level ?? ''}`).join(' ')}`);
      }
    }
    set({ frame: f, frameAt: Date.now() });
  },
  pushTrace: (t) => {
    const scene = useScene.getState().scene;
    const board = getBoard(scene.board);
    const pinIds = [t.sda, t.scl].map((g) => pinByGpio(board, g)?.id);
    const until = Date.now() + 1500;
    const activeWires = { ...get().activeWires };
    for (const w of scene.wires) {
      const bp = w.from.part === 'board' ? w.from.pin : w.to.part === 'board' ? w.to.pin : null;
      if (bp && pinIds.includes(bp)) activeWires[w.id] = until;
    }
    set({ trace: t, traceAt: Date.now(), activeWires });
  },
  pushSerial: (lines) => {
    const st = get();
    if (st.recording) for (const l of lines) st.recording.rows.push(`${(Date.now() / 1000).toFixed(3)},serial,"${l.replace(/"/g, '""')}"`);
    if (st.paused) return;
    const serial = st.serial.length > 3000 ? [...st.serial.slice(-2000), ...lines] : [...st.serial, ...lines];
    set({ serial });
  },
  pushProbe: (p) => {
    const st = get();
    const now = Date.now() / 1000;
    if (!st.paused && p.values) {
      for (const [k, v] of Object.entries(p.values)) {
        pushPoint(st.series, `probe:${k}`, { key: `probe:${k}`, label: k, color: PROBE_COLORS[k] ?? '#5CCB8F', unit: PROBE_UNITS[k] ?? '', pin: p.pins?.[k] }, now, v);
      }
      if (st.recording) st.recording.rows.push(`${now.toFixed(3)},values,${Object.entries(p.values).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    }
    set({ probe: p, mem: p.mem ? [...st.mem.slice(-600), p.mem] : st.mem });
  },
  set: (p) => set(p),
  resetSeries: () => set({ series: {}, mem: [] }),
}));

/* ---------------- confirmation dialog ---------------- */

export interface ConfirmRequest {
  kind: WriteRequest['kind'] | 'restore';
  title: string;
  body: string;
  details: string[];
  confirmLabel: string;
  /** writes this one confirmation allows (default 1), stated in the dialog text */
  uses?: number;
  resolve(token: string | null): void;
}

interface ConfirmStore {
  req: ConfirmRequest | null;
  ask(r: Omit<ConfirmRequest, 'resolve'>): Promise<string | null>;
  close(): void;
}

export const useConfirm = create<ConfirmStore>((set, get) => ({
  req: null,
  ask: (r) =>
    new Promise((resolve) => {
      get().req?.resolve(null);
      set({ req: { ...r, resolve } });
    }),
  close: () => set({ req: null }),
}));

/* ---------------- assistant ---------------- */

export type ChatItem =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'assistant'; reply: AiReply }
  | { id: number; role: 'error'; text: string; hint: string };

type NewChatItem = ChatItem extends infer T ? (T extends ChatItem ? Omit<T, 'id'> : never) : never;

interface AiStore {
  items: ChatItem[];
  busy: boolean;
  push(i: NewChatItem): void;
  set(p: Partial<Pick<AiStore, 'busy'>>): void;
  clear(): void;
}

let chatId = 1;
export const useAi = create<AiStore>((set) => ({
  items: [],
  busy: false,
  push: (i) => set((s) => ({ items: [...s.items, { ...i, id: chatId++ } as ChatItem] })),
  set: (p) => set(p),
  clear: () => set({ items: [] }),
}));
