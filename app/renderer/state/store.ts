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
import { getBoard, PARTS, pinByGpio } from '@shared/board';

export type Screen = 'home' | 'connect' | 'newProject' | 'flash' | 'debug' | 'monitor' | 'test' | 'report';

/* ---------------- app ---------------- */

interface AppStore {
  screen: Screen;
  conn: ConnectionState;
  progress: { task: string; pct: number } | null;
  ai: { enabled: boolean; model: string };
  scenarios: ScenarioInfo[];
  devOpen: boolean;
  setScreen(s: Screen): void;
  set(p: Partial<Omit<AppStore, 'setScreen' | 'set'>>): void;
}

export const useApp = create<AppStore>((set) => ({
  screen: 'home',
  conn: { mode: 'sim', port: null, chip: null, agent: null, streaming: false, serialOpen: false, scenario: null, backups: [] },
  progress: null,
  ai: { enabled: false, model: '' },
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

const EMPTY_SCENE: Scene = { board: 'esp32-devkitc-30', parts: [], wires: [] };

interface SceneStore {
  scene: Scene;
  findings: WiringFinding[];
  selected: TargetRef | null;
  highlight: TargetRef[];
  focus: { targets: TargetRef[]; nonce: number };
  view: '3d' | '2d';
  labels: boolean;
  wireMode: boolean;
  wireFrom: string | null;
  draggingPart: string | null;
  cameraPreset: { name: 'top' | 'side' | 'module' | 'home'; nonce: number };
  setScene(s: Scene): void;
  updateScene(fn: (s: Scene) => Scene): void;
  select(t: TargetRef | null): void;
  focusOn(targets: TargetRef[]): void;
  setHighlight(targets: TargetRef[]): void;
  set(p: Partial<Pick<SceneStore, 'view' | 'labels' | 'wireFrom' | 'wireMode' | 'draggingPart'>>): void;
  preset(name: 'top' | 'side' | 'module' | 'home'): void;
}

function withFindings(scene: Scene) {
  return { scene, findings: checkWiring(scene, getBoard(scene.board), PARTS) };
}

export const useScene = create<SceneStore>((set, get) => ({
  ...withFindings(EMPTY_SCENE),
  selected: null,
  highlight: [],
  focus: { targets: [], nonce: 0 },
  view: '3d',
  labels: true,
  wireMode: false,
  wireFrom: null,
  draggingPart: null,
  cameraPreset: { name: 'home', nonce: 0 },
  setScene: (s) => set(withFindings(s)),
  updateScene: (fn) => set(withFindings(fn(get().scene))),
  select: (selected) => set({ selected }),
  focusOn: (targets) => set((s) => ({ focus: { targets, nonce: s.focus.nonce + 1 }, highlight: targets, selected: targets[0] ?? s.selected })),
  setHighlight: (highlight) => set({ highlight }),
  set: (p) => set(p),
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
  recording: { startedAt: number; rows: string[] } | null;
  pushFrame(f: LiveFrame): void;
  pushTrace(t: TraceEvent): void;
  pushSerial(lines: string[]): void;
  pushProbe(p: ProbeFrame): void;
  set(p: Partial<Pick<LiveStore, 'paused' | 'recording' | 'serial'>>): void;
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
  recording: null,
  pushFrame: (f) => {
    const now = Date.now() / 1000;
    const st = get();
    if (!st.paused) {
      const series = st.series;
      const board = getBoard();
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
