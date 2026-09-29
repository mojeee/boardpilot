// Interview coach history: the user's practice answers and their grades, in one JSON file in the
// app data folder. Nothing leaves this computer. Entries older than 90 days are removed on load;
// the user can delete the answers of one question or all of them.

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  addAttempt,
  attemptsFor,
  parseHistory,
  pruneAttempts,
  removeQuestion,
  type CoachAttempt,
  type CoachHistoryFile,
} from '@shared/coach';

export class CoachStore {
  private attempts: CoachAttempt[] | null = null;
  /** Writes run one after another so a quick delete never races a save. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now,
  ) {}

  private async load(): Promise<CoachAttempt[]> {
    if (this.attempts) return this.attempts;
    let raw: unknown = null;
    try {
      raw = JSON.parse(await readFile(this.file, 'utf8'));
    } catch {
      raw = null; // no file yet, or unreadable: start empty
    }
    const all = parseHistory(raw);
    const kept = pruneAttempts(all, this.now());
    this.attempts = kept;
    if (kept.length !== all.length) await this.persist();
    return kept;
  }

  private persist(): Promise<void> {
    const body: CoachHistoryFile = { format: 'boardpilot-coach@1', attempts: this.attempts ?? [] };
    const run = async () => {
      await mkdir(dirname(this.file), { recursive: true });
      if (!body.attempts.length) {
        await unlink(this.file).catch(() => undefined);
        return;
      }
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(body, null, 1));
      await rename(tmp, this.file);
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  /** Attempts for one question, newest first. */
  async list(lessonId: string, question: string): Promise<CoachAttempt[]> {
    // prune again here too, for an app left open for days
    return attemptsFor(pruneAttempts(await this.load(), this.now()), lessonId, question);
  }

  async count(): Promise<number> {
    return (await this.load()).length;
  }

  async add(attempt: CoachAttempt): Promise<void> {
    this.attempts = addAttempt(await this.load(), attempt);
    await this.persist();
  }

  async removeQuestion(lessonId: string, question: string): Promise<void> {
    this.attempts = removeQuestion(await this.load(), lessonId, question);
    await this.persist();
  }

  async removeAll(): Promise<void> {
    await this.load();
    this.attempts = [];
    await this.persist();
  }
}
