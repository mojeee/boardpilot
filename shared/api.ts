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
  LiveFrame,
  LogEntry,
  PhotoRecognition,
  PortInfo,
  ProbeFrame,
  Result,
  Scene,
  ScenarioInfo,
  WriteRequest,
} from './types';

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
    status(): Promise<{ enabled: boolean; model: string }>;
    ask(question: string, ctx: AiContext): Promise<Result<AiReply>>;
    recognize(imageBase64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<Result<PhotoRecognition>>;
    classify(text: string, options: { id: string; label: string }[]): Promise<Result<{ optionId: string | null; reason: string }>>;
    reset(): Promise<void>;
  };
  session: {
    append(entry: LogEntry): void;
    pickFile(kind: 'firmware' | 'datasheet'): Promise<string | null>;
    /** Shows a save dialog and writes text (CSV recordings, generated sketches). */
    saveFile(suggestedName: string, content: string): Promise<Result<string>>;
    exportReport(markdown: string, html: string, suggestedName: string): Promise<Result<{ markdownPath: string; pdfPath: string }>>;
    info(): Promise<{ dataDir: string; logPath: string; version: string }>;
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
