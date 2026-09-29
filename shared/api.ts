// The typed API the preload script exposes to the renderer as window.bp.

import type {
  AgentRequest,
  AiContext,
  AiReply,
  ChipInfo,
  ConnectionState,
  HardwareMode,
  HelloReply,
  I2cTraceStep,
  LicenseStatus,
  LiveFrame,
  LogEntry,
  PartDef,
  PhotoRecognition,
  PortInfo,
  ProbeFrame,
  Result,
  Scene,
  ScenarioInfo,
  WriteRequest,
} from './types';
import type { AiModelInfo, AiProviderId, AiSettingsInput, AiSettingsView, AiStatus } from './ai';
import type { PreflightReport } from './preflight';

export type Unsubscribe = () => void;

export interface TraceEvent {
  cmd: string;
  sda: number;
  scl: number;
  trace: I2cTraceStep[];
}

export interface BoardPilotApi {
  hw: {
    state(): Promise<ConnectionState>;
    setMode(mode: HardwareMode): Promise<Result<ConnectionState>>;
    /** Pick the board (id from /boards). Clears the connection; the simulator bench follows. */
    setBoard(boardId: string): Promise<Result<ConnectionState>>;
    listPorts(): Promise<Result<PortInfo[]>>;
    identify(port: string): Promise<Result<ChipInfo>>;
    installAgent(token: string): Promise<Result<HelloReply>>;
    connectAgent(): Promise<Result<HelloReply>>;
    agent(req: AgentRequest): Promise<Result<unknown>>;
    agentWrite(req: AgentRequest, token: string): Promise<Result<unknown>>;
    restore(backupId: string, token: string): Promise<Result<true>>;
    flashUser(token: string, filePath: string): Promise<Result<{ bytes: number }>>;
    openSerial(baud: number): Promise<Result<true>>;
    closeSerial(): Promise<Result<true>>;
    writeSerial(text: string): Promise<Result<true>>;
    captureSerial(baud: number, ms: number): Promise<Result<string[]>>;
    /** Checks a firmware file against the board before writing (format, chip, size). Read-only. */
    preflight(filePath: string): Promise<Result<PreflightReport>>;
  };
  sim: {
    scenarios(): Promise<ScenarioInfo[]>;
    load(id: string): Promise<Result<ConnectionState>>;
    scene(): Promise<Scene>;
    control(action: 'fixWiring' | 'turnKnob'): Promise<Result<true>>;
  };
  safety: {
    /** Call only from a user click on a Confirm button. */
    grant(kind: WriteRequest['kind'] | 'restore'): Promise<string>;
  };
  ai: {
    status(): Promise<AiStatus>;
    /** Provider, models and which keys exist. Never contains a key. */
    getSettings(): Promise<AiSettingsView>;
    saveSettings(input: AiSettingsInput): Promise<Result<AiSettingsView>>;
    clearKey(provider: AiProviderId): Promise<Result<AiSettingsView>>;
    /** Lists models with the pasted key (not saved) or the stored one. */
    listModels(provider: AiProviderId, apiKey?: string): Promise<Result<AiModelInfo[]>>;
    /** One tiny request to check key and model; uses the draft values when given. */
    test(draft?: Partial<AiSettingsInput>): Promise<Result<{ provider: AiProviderId; model: string; ms: number }>>;
    ask(question: string, ctx: AiContext): Promise<Result<AiReply>>;
    recognize(imageBase64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<Result<PhotoRecognition>>;
    classify(text: string, options: { id: string; label: string }[]): Promise<Result<{ optionId: string | null; reason: string }>>;
    reset(): Promise<void>;
  };
  session: {
    append(entry: LogEntry): void;
    pickFile(kind: 'firmware' | 'datasheet'): Promise<string | null>;
    /** Shows an open dialog for an Arduino sketch and returns its text (read-only, 1 MB max). */
    openSketch(): Promise<Result<{ name: string; text: string }>>;
    /** Shows a save dialog and writes text (CSV recordings, generated sketches). */
    saveFile(suggestedName: string, content: string): Promise<Result<string>>;
    exportReport(markdown: string, html: string, suggestedName: string): Promise<Result<{ markdownPath: string; pdfPath: string }>>;
    info(): Promise<{ dataDir: string; logPath: string; version: string }>;
  };
  parts: {
    /** The user's own parts (built-in parts ship with the renderer). */
    list(): Promise<PartDef[]>;
    save(def: PartDef, replaceId?: string): Promise<Result<PartDef>>;
    remove(id: string): Promise<Result<true>>;
    importFromUrl(url: string): Promise<Result<{ draft: PartDef; notes: string[]; usedAi: boolean; basis: 'ai' | 'library' | 'keywords'; pageTitle: string }>>;
  };
  project: {
    autosave(scene: Scene): void;
    last(): Promise<Scene | null>;
    save(scene: Scene): Promise<Result<string>>;
    open(): Promise<Result<Scene>>;
  };
  license: {
    status(): Promise<LicenseStatus>;
    activate(key: string): Promise<Result<LicenseStatus>>;
    openBuyPage(): Promise<void>;
  };
  app: {
    setLanguage(lang: 'en' | 'it'): Promise<void>;
    openExternal(url: string): Promise<void>;
  };
  on: {
    state(cb: (s: ConnectionState) => void): Unsubscribe;
    live(cb: (f: LiveFrame) => void): Unsubscribe;
    serial(cb: (lines: string[]) => void): Unsubscribe;
    probe(cb: (p: ProbeFrame) => void): Unsubscribe;
    log(cb: (e: Omit<LogEntry, 'id' | 't'>) => void): Unsubscribe;
    progress(cb: (p: { task: string; pct: number } | null) => void): Unsubscribe;
    trace(cb: (t: TraceEvent) => void): Unsubscribe;
  };
}

export const EVENT_CHANNELS = ['state', 'live', 'serial', 'probe', 'log', 'progress', 'trace'] as const;
