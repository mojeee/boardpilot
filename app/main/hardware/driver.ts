// The HardwareDriver contract. The real driver (serialport + esptool) and the simulator both implement it,
// so every screen works the same with or without a board plugged in.

import type {
  AgentReplyMap,
  AgentRequest,
  BackupInfo,
  BoardDef,
  ChipInfo,
  FirmwareImage,
  PortInfo,
  StreamFrame,
} from '@shared/types';

export interface HardwareDriver {
  readonly kind: 'sim' | 'real';
  /** The board the user picked. Chip tools, pin rules and the simulated bench follow it. */
  setBoard(board: BoardDef): void;
  listPorts(): Promise<PortInfo[]>;
  identify(port: string): Promise<ChipInfo>;
  /** Full flash to the app data folder. */
  backupFlash(port: string, chip: ChipInfo, onProgress?: (pct: number) => void): Promise<BackupInfo>;
  restoreFlash(port: string, backup: BackupInfo, onProgress?: (pct: number) => void): Promise<void>;
  /** The caller (HardwareHub) checks image.confirmToken before calling this. */
  flash(port: string, image: FirmwareImage, onProgress?: (pct: number) => void): Promise<void>;
  openAgent(port: string): Promise<AgentClient>;
  /** The user's own firmware output. */
  openSerial(port: string, baud: number): Promise<SerialStream>;
}

export interface AgentClient {
  request<K extends AgentRequest['cmd']>(
    req: Extract<AgentRequest, { cmd: K }>,
    timeoutMs?: number,
  ): Promise<AgentReplyMap[K]>;
  onStream(cb: (f: StreamFrame) => void): () => void;
  onEvent(cb: (event: string, body: Record<string, unknown>) => void): () => void;
  onText(cb: (line: string) => void): () => void;
  close(): Promise<void>;
}

export interface SerialStream {
  onLine(cb: (line: string) => void): () => void;
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
