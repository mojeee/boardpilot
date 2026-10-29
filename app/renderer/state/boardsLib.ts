// The boards the user imported (JSON files in the app data folder), as the UI sees them. The built-in
// boards ship with the renderer; the user's are registered into the same BOARDS table at start-up, so
// the board picker, the wiring rules and the 3D view treat them like any other board.

import { create } from 'zustand';
import type { BoardDef, Result } from '@shared/types';
import { BOARDS, BUILTIN_BOARD_IDS, registerBoard, unregisterBoard } from '@shared/board';
import { useScene } from './store';

interface BoardsLibStore {
  /** Bumped on every change, so the pickers redraw. */
  version: number;
  user(): BoardDef[];
  load(): Promise<void>;
  importFile(): Promise<Result<BoardDef>>;
  remove(id: string): Promise<Result<true>>;
}

export const isBuiltinBoard = (id: string) => BUILTIN_BOARD_IDS.has(id);

export const useBoardsLib = create<BoardsLibStore>((set, get) => ({
  version: 0,
  user: () => Object.values(BOARDS).filter((b) => !isBuiltinBoard(b.id)).sort((a, b) => a.name.localeCompare(b.name)),
  load: async () => {
    const list = await window.bp.boards.list();
    for (const b of list) registerBoard(b);
    set({ version: get().version + 1 });
    // run the wiring checker again: a project on a user board is known now
    const sc = useScene.getState();
    sc.setScene(sc.scene);
  },
  importFile: async () => {
    const r = await window.bp.boards.import();
    if (r.ok) {
      registerBoard(r.value);
      set({ version: get().version + 1 });
    }
    return r;
  },
  remove: async (id) => {
    const r = await window.bp.boards.remove(id);
    if (r.ok) {
      unregisterBoard(id);
      set({ version: get().version + 1 });
    }
    return r;
  },
}));
