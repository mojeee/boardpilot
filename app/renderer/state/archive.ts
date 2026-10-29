// Past projects in the renderer: the archive list from the main process, the project open in the
// detail panel, and "similar past projects" for what is being planned right now (the chat and the
// drawing). The comparison runs here, on the list, so it is instant and works with the AI off.

import { useMemo } from 'react';
import { create } from 'zustand';
import type { ArchiveEdit, ArchiveEntry, SimilarMatch } from '@shared/archive/types';
import { similarProjects } from '@shared/archive/similarity';
import { BOARDS, PARTS, DEFAULT_BOARD_ID, bareModuleForMcu } from '@shared/board';
import { t } from '@shared/i18n';
import { log, useAi, useApp, useScene } from './store';
import { useProjects } from './projects';
import { sketchFileName, projectFromParts } from './buildProject';

interface ArchiveState {
  roots: string[];
  projects: ArchiveEntry[];
  loaded: boolean;
  busy: boolean;
  /** last result to show at the top of the screen */
  note: { ok: boolean; text: string } | null;
  selected: string | null;
  /** similar-project cards the user closed, per project id */
  dismissed: string[];
  load(): Promise<void>;
  addFolder(): Promise<void>;
  addSample(): Promise<void>;
  rescan(): Promise<void>;
  removeFolder(root: string): Promise<void>;
  update(id: string, edit: ArchiveEdit): Promise<void>;
  select(id: string | null): void;
  dismiss(id: string): void;
}

export const useArchive = create<ArchiveState>((set, get) => {
  const after = async (r: Awaited<ReturnType<typeof window.bp.archive.rescan>>, verb: 'added' | 'rescan') => {
    if (!r.ok) {
      if (r.error.code !== 'cancelled') set({ note: { ok: false, text: `${r.error.humanMessage} ${r.error.hint}`.trim() } });
      return;
    }
    await get().load();
    const text =
      verb === 'added' ? t('Found {n} projects in the folder.', { n: r.value.found }) : t('Rescanned: {n} projects.', { n: r.value.found });
    set({ note: { ok: true, text: r.value.truncated ? `${text} ${t('The folder is very big: only part of it was read.')}` : text } });
    log('info', text, { source: 'project archive scan (files read on this computer)' });
  };
  const busy = async (fn: () => Promise<void>) => {
    set({ busy: true, note: null });
    try {
      await fn();
    } finally {
      set({ busy: false });
    }
  };
  return {
    roots: [],
    projects: [],
    loaded: false,
    busy: false,
    note: null,
    selected: null,
    dismissed: [],
    load: async () => {
      const r = await window.bp.archive.list();
      set({ roots: r.roots, projects: r.projects, loaded: true });
    },
    addFolder: () => busy(async () => after(await window.bp.archive.addFolder(), 'added')),
    addSample: () => busy(async () => after(await window.bp.archive.addSample(), 'added')),
    rescan: () => busy(async () => after(await window.bp.archive.rescan(), 'rescan')),
    removeFolder: (root) =>
      busy(async () => {
        await window.bp.archive.removeFolder(root);
        await get().load();
        if (get().selected && !get().projects.some((p) => p.id === get().selected)) set({ selected: null });
      }),
    update: async (id, edit) => {
      const r = await window.bp.archive.update(id, edit);
      if (r.ok) set({ projects: get().projects.map((p) => (p.id === id ? r.value : p)) });
      else set({ note: { ok: false, text: `${r.error.humanMessage} ${r.error.hint}` } });
    },
    select: (id) => set({ selected: id }),
    dismiss: (id) => set({ dismissed: [...get().dismissed, id] }),
  };
});

/** Load the archive once (the first screen that needs it). */
export function ensureArchive() {
  const s = useArchive.getState();
  if (!s.loaded) void s.load().catch(() => undefined);
}

/** Past projects like the one being planned: the user's chat messages and the drawing. */
export function useSimilarProjects(extraText = ''): SimilarMatch[] {
  const projects = useArchive((s) => s.projects);
  const dismissed = useArchive((s) => s.dismissed);
  const items = useAi((s) => s.items);
  const scene = useScene((s) => s.scene);
  return useMemo(() => {
    if (!projects.length) return [];
    const said = items
      .filter((i): i is Extract<typeof i, { role: 'user' }> => i.role === 'user')
      .slice(-6)
      .map((i) => i.text)
      .join('\n');
    const text = `${said}\n${extraText}`.trim();
    if (!text && !scene.parts.length) return [];
    // from the drawing alone (nothing said yet), only a clear overlap: two parts in common or more
    return similarProjects({ text, scene: scene.parts.length ? scene : undefined }, projects, PARTS).filter(
      (m) => !dismissed.includes(m.id) && (text || m.reasons.filter((r) => r.kind === 'part').length >= 2),
    );
  }, [projects, dismissed, items, scene, extraText]);
}

/** A reason as a short phrase in the user's language. */
export function reasonLabel(r: SimilarMatch['reasons'][number]): string {
  switch (r.kind) {
    case 'part':
      return t(r.value);
    case 'protocol':
      return PROTOCOL_LABEL[r.value] ?? r.value;
    case 'bus':
      return BUS_LABEL[r.value] ?? r.value;
    case 'board':
      return t('same board ({name})', { name: r.value });
    case 'mcu':
      return t('same chip family ({mcu})', { mcu: r.value });
    case 'framework':
      return r.value;
    case 'words':
      return t('words: {list}', { list: r.value });
  }
}

export const PROTOCOL_LABEL: Record<string, string> = {
  modbus: 'Modbus',
  opentherm: 'OpenTherm',
  wifi: 'Wi-Fi',
  ble: 'Bluetooth LE',
  mqtt: 'MQTT',
  lora: 'LoRa',
  ethernet: 'Ethernet',
  http: 'HTTP',
};
export const BUS_LABEL: Record<string, string> = { i2c: 'I²C', spi: 'SPI', uart: 'UART', onewire: '1-Wire', can: 'CAN', rs485: 'RS-485', adc: 'ADC' };

/** Opens a past project as a new project tab: its own drawing, or its board and parts wired by the safe-pin rules. */
export async function startFromArchive(e: ArchiveEntry) {
  // it is open now: no need to keep suggesting it
  useArchive.getState().dismiss(e.id);
  if (e.scene) {
    useProjects.getState().add(e.scene, e.name);
    log('action', t('Opened “{name}” from the archive as a new project.', { name: e.name }), { source: `archive · ${e.name}` });
  } else {
    // a custom board that is not one of ours opens on the bare module it is built around (its pin numbers still mean something there)
    const bare = e.board?.value.boardId ? null : bareModuleForMcu(e.board?.value.mcu ?? '');
    const boardId = e.board?.value.boardId && BOARDS[e.board.value.boardId] ? e.board.value.boardId : bare?.id ?? (useScene.getState().scene.board || DEFAULT_BOARD_ID);
    const ids = e.parts.map((p) => p.value.partId).filter((id): id is string => !!id && !!PARTS[id]);
    const { scene, notes } = projectFromParts(boardId, ids, sketchFileName(e.name));
    // the old code comes along when there is one: the code check then shows where its pins differ
    let sketch = scene.sketch;
    if (e.mainSource && /\.(ino|cpp|c)$/i.test(e.mainSource)) {
      const r = await window.bp.archive.readFile(e.id, e.mainSource);
      if (r.ok) sketch = { name: r.value.name.replace(/\.(cpp|c)$/i, '.ino'), text: r.value.text };
    }
    useProjects.getState().add({ ...scene, ...(sketch ? { sketch } : {}) }, e.name);
    log('action', t('Started a new project from “{name}”: {parts}.', { name: e.name, parts: ids.map((id) => PARTS[id]?.name ?? id).join(', ') || t('no library parts') }), {
      source: `archive · ${e.name} (parts read from its files)`,
    });
    for (const n of notes) log('action', t('Pin assigned: {note}', { note: n }), { source: 'pin rules (safe pins)' });
    if (bare) log('warning', t('“{name}” runs on a custom board ({mcu}). The project opens on the bare {board}: its pin numbers carry over, but the pad positions are not your board’s. Change it with the board picker.', { name: e.name, mcu: e.board?.value.mcu ?? '', board: bare.name }), { source: `archive · ${e.name}` });
    else if (!e.board?.value.boardId) log('warning', t('The board of “{name}” ({mcu}) is not one of BoardPilot’s boards: the project opens on {board}. Change it with the board picker.', { name: e.name, mcu: e.board?.value.mcu ?? t('unknown'), board: BOARDS[boardId]?.name ?? boardId }), { source: `archive · ${e.name}` });
  }
  useApp.getState().setScreen('newProject');
}
