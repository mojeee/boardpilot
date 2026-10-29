// The user's own boards: JSON files in <data folder>/boards, checked with the same rules as boards/*.json
// (shared/boardCheck.mjs) on load and on save. Mirrors parts/userParts.ts.

import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BoardDef, Result } from '@shared/types';
import { BOARDS, BUILTIN_BOARD_IDS, registerBoard, unregisterBoard } from '@shared/board';
import { MAX_BOARD_BYTES, validateBoardDef } from '@shared/boardSchema';
import { t } from '@shared/i18n';

export class UserBoards {
  constructor(private readonly dir: string) {}

  /** Registers every valid board file of the folder and returns them. Invalid or built-in ids are skipped. */
  async load(): Promise<BoardDef[]> {
    await mkdir(this.dir, { recursive: true });
    const out: BoardDef[] = [];
    for (const f of await readdir(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const text = await readFile(join(this.dir, f), 'utf8');
        if (text.length > MAX_BOARD_BYTES) continue;
        const r = validateBoardDef(JSON.parse(text));
        if (r.ok && !BUILTIN_BOARD_IDS.has(r.value.id)) {
          registerBoard(r.value);
          out.push(r.value);
        }
      } catch {
        /* skip unreadable files */
      }
    }
    return out;
  }

  /** The boards of the folder that are registered now (no disk access). */
  list(): BoardDef[] {
    return Object.values(BOARDS).filter((b) => !BUILTIN_BOARD_IDS.has(b.id));
  }

  async save(raw: unknown): Promise<Result<BoardDef>> {
    const r = validateBoardDef(raw);
    if (!r.ok) return r;
    // The prebuilt diagnostic agents exist only for the boards that ship with the app.
    const def: BoardDef = { ...r.value, toolchain: { ...r.value.toolchain, agent: false } };
    // never overwrite a built-in board; pick a free id when the id is taken (by a built-in or another user board)
    if (BOARDS[def.id]) {
      const base = def.id;
      let n = 2;
      while (BOARDS[`${base}-${n}`]) n++;
      def.id = `${base}-${n}`;
    }
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${def.id}.json`), JSON.stringify(def, null, 2));
    registerBoard(def);
    return { ok: true, value: def };
  }

  async remove(id: string): Promise<Result<true>> {
    if (BUILTIN_BOARD_IDS.has(id)) {
      return { ok: false, error: { code: 'builtin', humanMessage: t('Built-in boards cannot be deleted.'), hint: t('You can switch the project to another board instead.') } };
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return { ok: true, value: true };
    await unlink(join(this.dir, `${id}.json`)).catch(() => undefined);
    unregisterBoard(id);
    return { ok: true, value: true };
  }
}
