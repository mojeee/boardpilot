// Session log persisted as JSON lines in the app data folder (one file per app run).

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { LogEntry } from '@shared/types';

export class SessionLog {
  readonly path: string;
  private entries: LogEntry[] = [];
  private ready: Promise<unknown>;

  constructor(dir: string) {
    this.path = join(dir, 'sessions', `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    this.ready = mkdir(join(dir, 'sessions'), { recursive: true });
  }

  append(e: LogEntry) {
    this.entries.push(e);
    if (this.entries.length > 5000) this.entries.splice(0, 1000);
    void this.ready.then(() => appendFile(this.path, JSON.stringify(e) + '\n')).catch(() => {});
  }

  recent(n = 50): LogEntry[] {
    return this.entries.slice(-n);
  }
}
