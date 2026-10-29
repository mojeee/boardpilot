// Past projects in the renderer: the archive list from the main process, the project open in the
// detail panel, and "similar past projects" for what is being planned right now (the chat and the
// drawing). The comparison runs here, on the list, so it is instant and works with the AI off.

import { useMemo } from 'react';
import { create } from 'zustand';
import type { ArchiveEdit, ArchiveEntry, SimilarMatch } from '@shared/archive/types';
import { similarProjects } from '@shared/archive/similarity';
import { wireRecoveredPins, type KeptPins } from '@shared/archive/keepPins';
import { BOARDS, PARTS, DEFAULT_BOARD_ID, bareModuleForMcu, getBoard } from '@shared/board';
import { stripComments } from '@shared/codeCheck';
import { combineSources } from '@shared/codeProject';
import { displayPinsFromCode } from '@shared/displayPins';
import { t } from '@shared/i18n';
import type { ProjectSketch, Scene } from '@shared/types';
import { checkWiring } from '@shared/wiring';
import { log, useAi, useApp, useScene } from './store';
import { useProjects } from './projects';
import { replaceProjectCode } from './code';
import { sketchFileName, projectFromParts, sceneWithParts } from './buildProject';

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

/**
 * Opens a past project as a new project tab: its own drawing, or its board and parts wired by the
 * safe-pin rules. With `keepPins` the project's code files all come along unchanged and the display
 * pins read from them (User_Setup.h, PlatformIO flags, LovyanGFX, Adafruit) stay where they were;
 * the wiring check then runs on the result.
 */
export async function startFromArchive(e: ArchiveEntry, opts: { keepPins?: boolean } = {}) {
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
    // keep the project's pins: every code file, and the display pins they name
    let kept: KeptPins | null = null;
    let all: ProjectSketch | null = null;
    let left: string[] = [];
    let scene: Scene;
    let notes: string[];
    if (opts.keepPins && e.mainSource) {
      const r = await window.bp.archive.readSources(e.id);
      const main = r.ok ? r.value.files.find((f) => f.name === e.mainSource) : undefined;
      if (r.ok && main) {
        const pins = displayPinsFromCode(stripComments(combineSources(r.value.files, main.name).text));
        const placed = sceneWithParts({ board: boardId, parts: [], wires: [] }, ids, (s) => {
          kept = wireRecoveredPins(s, getBoard(boardId), PARTS, pins);
          return kept.wires;
        });
        scene = placed.scene;
        notes = placed.notes;
        left = r.value.left;
        const others = r.value.files.filter((f) => f.name !== main.name);
        all = { name: main.name.split('/').pop()!.replace(/\.(cpp|c)$/i, '.ino'), text: main.text, ...(others.length ? { files: others } : {}) };
      } else log('warning', t('The files of “{name}” could not be read, so only its main file is loaded and the pins are chosen by the safe-pin rules.', { name: e.name }), { source: `archive · ${e.name}` });
    }
    if (!all) {
      const p = projectFromParts(boardId, ids, sketchFileName(e.name));
      scene = p.scene;
      notes = p.notes;
      // the old code comes along when there is one: the code check then shows where its pins differ
      let sketch = scene.sketch;
      if (e.mainSource && /\.(ino|cpp|c)$/i.test(e.mainSource)) {
        const r = await window.bp.archive.readFile(e.id, e.mainSource);
        if (r.ok) sketch = { name: r.value.name.replace(/\.(cpp|c)$/i, '.ino'), text: r.value.text };
      }
      all = sketch ?? null;
    }
    useProjects.getState().add({ ...scene!, ...(all ? { sketch: all } : {}) }, e.name);
    if (opts.keepPins && all && kept) replaceProjectCode(all.name, all.text, all.files ?? []);
    log('action', t('Started a new project from “{name}”: {parts}.', { name: e.name, parts: ids.map((id) => PARTS[id]?.name ?? id).join(', ') || t('no library parts') }), {
      source: `archive · ${e.name} (parts read from its files)`,
    });
    if (opts.keepPins && all && kept) {
      const k: KeptPins = kept;
      log('action', t('Loaded {n} code files of “{name}” unchanged.', { n: 1 + (all.files?.length ?? 0), name: e.name }), { source: `archive · ${e.name}` });
      if (left.length) log('warning', t('Left out (too many, too big or too deep): {list}.', { list: left.slice(0, 8).join(', ') }), { source: `archive · ${e.name}` });
      for (const n of k.kept) log('action', t('Pin kept: {note}', { note: n }), { source: `archive · ${e.name} (read from its files)` });
      for (const n of k.skipped) log('warning', n, { source: `archive · ${e.name}` });
      if (!k.kept.length) log('info', t('No display pins were found in the files, so every pin was chosen by the safe-pin rules.'), { source: `archive · ${e.name}` });
      // the wiring rules on the pins that were kept
      const found = checkWiring(useScene.getState().scene, getBoard(boardId), PARTS).filter((f) => f.severity !== 'info');
      if (!found.length) log('check', t('Wiring check on the pins kept from “{name}”: no problems found.', { name: e.name }), { source: 'wiring rules' });
      for (const f of found) log(f.severity === 'error' ? 'failed' : 'warning', `${f.message} ${f.hint ?? ''}`.trim(), { target: f.targets[0], source: f.source });
    }
    for (const n of notes!) log('action', t('Pin assigned: {note}', { note: n }), { source: 'pin rules (safe pins)' });
    if (bare) log('warning', t('“{name}” runs on a custom board ({mcu}). The project opens on the bare {board}: its pin numbers carry over, but the pad positions are not your board’s. Change it with the board picker.', { name: e.name, mcu: e.board?.value.mcu ?? '', board: bare.name }), { source: `archive · ${e.name}` });
    else if (!e.board?.value.boardId) log('warning', t('The board of “{name}” ({mcu}) is not one of BoardPilot’s boards: the project opens on {board}. Change it with the board picker.', { name: e.name, mcu: e.board?.value.mcu ?? t('unknown'), board: BOARDS[boardId]?.name ?? boardId }), { source: `archive · ${e.name}` });
  }
  useApp.getState().setScreen('newProject');
}
