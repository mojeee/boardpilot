// The typed API the preload script exposes to the renderer as window.bp.

import type {
  AgentRequest,
  AiCodeSuggestion,
  AiContext,
  AiReply,
  BackupInfo,
  ChipInfo,
  CodeSuggestionRequest,
  ConnectionState,
  HardwareMode,
  HelloReply,
  I2cTraceStep,
  LicenseStatus,
  LiveFrame,
  LogEntry,
  PartDef,
  BoardDef,
  PhotoRecognition,
  PortInfo,
  ProbeFrame,
  ProjectFile,
  Result,
  Scene,
  ScenarioInfo,
  WriteRequest,
} from './types';
import type { AiModelInfo, AiProviderId, AiSettingsInput, AiSettingsView, AiStatus } from './ai';
import type { PreflightReport } from './preflight';
import type { SceneOp } from './sceneEdit';
import type { CoachAttempt } from './coach';
import type { StarterFile } from './starter/common';
import type { DisplaySpec, SpecProblem } from './displaySpec';
import type { ArchiveEdit, ArchiveEntry } from './archive/types';
import type { MemoryFolderImport, MemoryHit, MemoryInfo } from './memory';
import type { CompileReport } from './compileOutput';

export type Unsubscribe = () => void;

export interface TraceEvent {
  cmd: string;
  sda: number;
  scl: number;
  trace: I2cTraceStep[];
}

export interface BoardPilotApi {
  /** True only in the browser demo (app/web/bpWeb.ts): simulator only, nothing on the computer. */
  readonly web?: boolean;
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
    /** Reads the whole program on the board into a backup (read-only, no confirmation needed). */
    backup(): Promise<Result<BackupInfo>>;
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
    control(action: 'fixWiring' | 'turnKnob' | 'pressButton'): Promise<Result<true>>;
  };
  safety: {
    /** Call only from a user click on a Confirm button. */
    grant(kind: WriteRequest['kind'] | 'restore', uses?: number): Promise<string>;
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
    /** Code for the Code panel, from the drawing and the code so far. A suggestion to accept or dismiss. */
    suggestCode(ctx: AiContext, req: CodeSuggestionRequest): Promise<Result<AiCodeSuggestion>>;
    reset(): Promise<void>;
  };
  session: {
    append(entry: LogEntry): void;
    pickFile(kind: 'firmware' | 'datasheet'): Promise<string | null>;
    /** Shows an open dialog for an Arduino sketch and returns its text (read-only, 1 MB max). */
    openSketch(): Promise<Result<{ name: string; text: string }>>;
    /** Shows a save dialog and writes text (CSV recordings, generated sketches). */
    saveFile(suggestedName: string, content: string): Promise<Result<string>>;
    /** Shows a save dialog and writes a PNG given as a data:image/png;base64 URL (timing view export). */
    savePng(suggestedName: string, dataUrl: string): Promise<Result<string>>;
    /**
     * Asks for a place with a folder dialog, creates `folder` there (adds -2, -3… if it exists) and
     * writes the files into it. Names must pass isSafeProjectName (no paths). Returns the folder path.
     */
    saveProject(folder: string, files: StarterFile[]): Promise<Result<string>>;
    exportReport(markdown: string, html: string, suggestedName: string): Promise<Result<{ markdownPath: string; pdfPath: string }>>;
    /** Asks where to save, prints the drawing set (landscape, the given paper) to PDF and writes it. */
    exportPdf(html: string, suggestedName: string, paper: 'A4' | 'A3' | 'Letter' | 'Tabloid'): Promise<Result<string>>;
    info(): Promise<{ dataDir: string; logPath: string; version: string }>;
  };
  boards: {
    /** The user's own boards (built-in boards ship with the renderer). */
    list(): Promise<BoardDef[]>;
    /** Asks for a board JSON file, checks it with the rules of boards/*.json and saves it. */
    import(): Promise<Result<BoardDef>>;
    /** Checks and saves a board definition (its id changes if it is taken). */
    save(def: unknown): Promise<Result<BoardDef>>;
    remove(id: string): Promise<Result<true>>;
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
  /** Past projects: folders of old projects, read (never changed) and described in a table. */
  archive: {
    list(): Promise<{ roots: string[]; projects: ArchiveEntry[] }>;
    /** Folder dialog, then a scan of the chosen folder. */
    addFolder(): Promise<Result<{ found: number; truncated: boolean }>>;
    /** Copies the fictional sample archive to the app data folder and scans it. */
    addSample(): Promise<Result<{ found: number; truncated: boolean }>>;
    /** Forgets a folder and its projects (the files stay where they are). */
    removeFolder(root: string): Promise<Result<true>>;
    rescan(): Promise<Result<{ found: number; truncated: boolean }>>;
    /** The user's notes, tags and corrections; kept across rescans. */
    update(id: string, edit: ArchiveEdit): Promise<Result<ArchiveEntry>>;
    /** Shows the project folder, or a file in it, in Finder / Explorer. */
    reveal(id: string, file?: string): Promise<void>;
    /** Text of a file in a project (1 MB max), e.g. its main source. */
    readFile(id: string, file: string): Promise<Result<{ name: string; text: string }>>;
    /**
     * Every source file of a project folder (C, C++, Arduino, headers, platformio.ini) with its path inside
     * the project, limited in number, size and depth; `left` names what was left out.
     */
    readSources(id: string): Promise<Result<{ files: { name: string; text: string }[]; left: string[] }>>;
  };
  /** Project memory: knowledge from old projects, kept in the app data folder on this computer. */
  memory: {
    list(): Promise<MemoryInfo[]>;
    create(name: string): Promise<Result<MemoryInfo>>;
    rename(id: string, name: string): Promise<Result<MemoryInfo>>;
    remove(id: string): Promise<Result<true>>;
    /** Asks for a folder and reads its source files (build output, .git and node_modules are skipped). */
    importFolder(id: string): Promise<Result<MemoryFolderImport>>;
    /** Asks for a datasheet or app note PDF and adds its text. */
    importPdf(id: string): Promise<Result<MemoryInfo>>;
    addNote(id: string, text: string): Promise<Result<MemoryInfo>>;
    removeSource(id: string, sourceId: string): Promise<Result<MemoryInfo>>;
    /** Asks where to save and writes the memory as one file to share. */
    exportFile(id: string): Promise<Result<string>>;
    /** Asks for a memory file from a colleague and adds it. */
    importFile(): Promise<Result<MemoryInfo>>;
    search(query: string, memoryIds: string[], limit: number): Promise<MemoryHit[]>;
  };
  mcp: {
    status(): Promise<McpStatus>;
    setEnabled(on: boolean): Promise<McpStatus>;
    /** Answer to an MCP write request, after the user's click. */
    writeResult(id: string, status: 'approved' | 'refused'): Promise<void>;
    /** Answer to an MCP project change. False when the request is no longer waiting (it timed out): then do not apply it. */
    sceneEditResult(id: string, answer: McpSceneEditAnswer): Promise<boolean>;
    /** Answer to an MCP display design. False when the request is no longer waiting (it timed out): then do not apply it. */
    displayResult(id: string, answer: McpDisplayAnswer): Promise<boolean>;
    /** Result of an app action an MCP agent asked for. */
    actionResult(id: string, answer: McpActionAnswer): Promise<boolean>;
  };
  /** Interview coach on the Learn screen. Answers are kept only on this computer, 90 days at most. */
  coach: {
    /** Grades an answer (always a suggestion citing lesson sections) and saves the attempt. */
    ask(lessonId: string, question: string, answer: string): Promise<Result<{ attempt: CoachAttempt; saved: boolean }>>;
    /** Past attempts for one question, newest first, and how many answers are saved in total. */
    history(lessonId: string, question: string): Promise<Result<{ attempts: CoachAttempt[]; total: number }>>;
    /** Deletes the saved answers of one question. */
    remove(lessonId: string, question: string): Promise<Result<true>>;
    /** Deletes every saved answer. */
    removeAll(): Promise<Result<true>>;
  };
  license: {
    status(): Promise<LicenseStatus>;
    activate(key: string): Promise<Result<LicenseStatus>>;
    openBuyPage(): Promise<void>;
  };
  code: {
    /** Compile the project with arduino-cli for the board (nothing is uploaded). Desktop app only. */
    compile(boardId: string, files: ProjectFile[], main: string): Promise<Result<CompileReport>>;
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
    mcpWrite(cb: (ask: McpWriteAsk) => void): Unsubscribe;
    mcpSceneEdit(cb: (ask: McpSceneEditAsk) => void): Unsubscribe;
    mcpDisplay(cb: (ask: McpDisplayAsk) => void): Unsubscribe;
    mcpAction(cb: (ask: McpActionAsk) => void): Unsubscribe;
  };
}

/** The MCP server switch (Settings → AI agents). */
export interface McpStatus {
  enabled: boolean;
  running: boolean;
  /** The command an MCP client runs to reach BoardPilot. */
  command: string;
  /** Ready-to-paste Claude Code line. */
  claudeCode: string;
}

/** A write an AI agent asked for over MCP; the app shows its confirmation dialog. */
export interface McpWriteAsk {
  id: string;
  client: string;
  req: WriteRequest;
}

/** Changes to the project drawing an AI agent asked for over MCP; the app shows them with Apply. */
export interface McpSceneEditAsk {
  id: string;
  client: string;
  ops: SceneOp[];
  reason: string;
}

/** A Display Studio design an AI agent made over MCP; the app shows it animated with Apply. */
export interface McpDisplayAsk {
  id: string;
  client: string;
  spec: DisplaySpec;
  problems: SpecProblem[];
}

export interface McpDisplayAnswer {
  status: 'approved' | 'refused';
  /** why it was not applied, in plain words */
  error?: string;
}

/** One of the app's actions (shared/actions.ts) an AI agent asked to run over MCP. */
export interface McpActionAsk {
  id: string;
  client: string;
  action: string;
  arg: string;
  reason: string;
  /** ms since epoch: after this the agent was told "refused", so it must not run any more */
  expiresAt: number;
}

export interface McpActionAnswer {
  status: 'done' | 'failed' | 'stopped' | 'refused';
  /** the steps the app showed on the action's card, in plain words */
  steps: string[];
  error?: string;
}

export interface McpSceneEditAnswer {
  status: 'approved' | 'refused';
  /** the project after the changes, when applied */
  scene?: Scene;
  /** why it was not applied, in plain words */
  error?: string;
}

/** Browser demo: a window event asking the page to show the "Download the app" prompt.
 *  `detail.reason` says, in plain words, what needs the app. */
export const NEEDS_APP_EVENT = 'bp:needs-app';

export const EVENT_CHANNELS =['state', 'live', 'serial', 'probe', 'log', 'progress', 'trace'] as const;
