// The parts library as the UI sees it: built-in parts plus the user's own (saved in app data).

import { create } from 'zustand';
import type { PartDef, Result } from '@shared/types';
import { BUILTIN_PART_IDS, PARTS, registerPart, unregisterPart } from '@shared/board';
import { useScene } from './store';

interface PartsLibStore {
  version: number;
  all(): PartDef[];
  load(): Promise<void>;
  save(def: PartDef, replaceId?: string): Promise<Result<PartDef>>;
  remove(id: string): Promise<Result<true>>;
}

export const isBuiltin = (id: string) => BUILTIN_PART_IDS.has(id);

export const usePartsLib = create<PartsLibStore>((set, get) => ({
  version: 0,
  all: () => Object.values(PARTS).sort((a, b) => Number(isBuiltin(b.id)) - Number(isBuiltin(a.id)) || a.name.localeCompare(b.name)),
  load: async () => {
    const list = await window.bp.parts.list();
    for (const p of list) registerPart(p);
    set({ version: get().version + 1 });
    // re-run the wiring checker now that custom parts are known
    const sc = useScene.getState();
    sc.setScene(sc.scene);
  },
  save: async (def, replaceId) => {
    const r = await window.bp.parts.save(def, replaceId);
    if (r.ok) {
      if (replaceId && replaceId !== r.value.id) unregisterPart(replaceId);
      registerPart(r.value);
      set({ version: get().version + 1 });
      const sc = useScene.getState();
      sc.setScene(sc.scene, true);
    }
    return r;
  },
  remove: async (id) => {
    const r = await window.bp.parts.remove(id);
    if (r.ok) {
      unregisterPart(id);
      set({ version: get().version + 1 });
    }
    return r;
  },
}));
