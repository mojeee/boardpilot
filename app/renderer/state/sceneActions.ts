// Editing actions on the project scene. All of them are undoable (Cmd+Z).

import type { ScenePart, TargetRef } from '@shared/types';
import { PARTS } from '@shared/board';
import { t } from '@shared/i18n';
import { log, useScene } from './store';

const SLOTS: [number, number][] = [
  [12, 44], [-18, 44], [40, 44], [-2, -42], [24, -44], [-26, -42], [50, -44], [-48, 44],
  [70, 20], [-70, 20], [70, -30], [-70, -30], [12, 76], [-30, 76], [40, -76], [-10, -76],
];

function freeSpot(parts: ScenePart[]): [number, number] {
  const free = SLOTS.find(([x, z]) => !parts.some((p) => Math.abs(p.position[0] - x) < 14 && Math.abs(p.position[2] - z) < 14));
  return free ?? [90 + (parts.length % 4) * 22, -60 + Math.floor(parts.length / 4) * 24];
}

export function addPart(partId: string, opts: { confirmed?: boolean; at?: [number, number] } = {}): string | null {
  const def = PARTS[partId];
  if (!def) return null;
  let newId = '';
  useScene.getState().updateScene((s) => {
    const base = partId.replace(/-.*$/, '').replace(/[^a-z0-9]/gi, '') || 'part';
    let n = 1;
    while (s.parts.some((p) => p.id === `${base}${n}`)) n++;
    newId = `${base}${n}`;
    const [x, z] = opts.at ?? freeSpot(s.parts);
    return { ...s, parts: [...s.parts, { id: newId, partId, position: [x, 0, z], label: def.name.split(/[ (]/)[0], confirmed: opts.confirmed ?? true }] };
  });
  log('action', t('Added {name}.', { name: def.name }), { target: `part:${newId}` as TargetRef });
  useScene.getState().select(`part:${newId}` as TargetRef);
  return newId;
}

function selectedPart(): ScenePart | undefined {
  const sel = useScene.getState().selected;
  if (!sel?.startsWith('part:')) return undefined;
  return useScene.getState().scene.parts.find((p) => `part:${p.id}` === sel);
}

export function removeTarget(target: TargetRef | null = useScene.getState().selected) {
  if (!target) return;
  const [kind, id] = target.split(/:(.+)/);
  const st = useScene.getState();
  if (kind === 'part' && id !== 'board') {
    const p = st.scene.parts.find((x) => x.id === id);
    st.updateScene((s) => ({ ...s, parts: s.parts.filter((x) => x.id !== id), wires: s.wires.filter((w) => w.from.part !== id && w.to.part !== id) }));
    if (p) log('action', t('Removed {name} and its wires. Press ⌘Z to undo.', { name: p.label ?? p.id }));
  } else if (kind === 'wire') {
    st.updateScene((s) => ({ ...s, wires: s.wires.filter((w) => w.id !== id) }));
    log('action', t('Removed a wire. Press ⌘Z to undo.'));
  } else return;
  st.select(null);
}

export function rotateSelected(deg = 90) {
  const p = selectedPart();
  if (!p) return;
  const cur = p.rotation ?? (p.position[2] >= 0 ? 0 : 180);
  useScene.getState().updateScene((s) => ({ ...s, parts: s.parts.map((x) => (x.id === p.id ? { ...x, rotation: (((cur + deg) % 360) + 360) % 360 } : x)) }));
}

export function nudgeSelected(dx: number, dz: number, transient = false) {
  const p = selectedPart();
  if (!p) return;
  useScene
    .getState()
    .updateScene((s) => ({ ...s, parts: s.parts.map((x) => (x.id === p.id ? { ...x, position: [x.position[0] + dx, 0, x.position[2] + dz] } : x)) }), { transient });
}

export function duplicateSelected() {
  const p = selectedPart();
  if (!p) return;
  addPart(p.partId, { at: [p.position[0] + 18, p.position[2]] });
}

export function renamePart(id: string, label: string) {
  useScene.getState().updateScene((s) => ({ ...s, parts: s.parts.map((x) => (x.id === id ? { ...x, label: label.slice(0, 30) || undefined } : x)) }));
}

/** Keyboard shortcuts for the 3D view. Ignored while typing in a text field. */
export function handleSceneKey(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return false;
  const st = useScene.getState();
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') {
    if (e.shiftKey) st.redo();
    else st.undo();
    return true;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    st.redo();
    return true;
  }
  if (mod && e.key.toLowerCase() === 'd') {
    duplicateSelected();
    return true;
  }
  if (mod) return false;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    removeTarget();
    return true;
  }
  if (e.key === 'Escape') {
    st.set({ wireMode: false, wireFrom: null });
    st.select(null);
    return true;
  }
  if (e.key === 'r' || e.key === 'R') {
    rotateSelected(e.shiftKey ? -90 : 90);
    return true;
  }
  if (e.key === 'w' || e.key === 'W') {
    st.set({ wireMode: !st.wireMode, wireFrom: null });
    return true;
  }
  const step = e.shiftKey ? 5 : 1;
  const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (arrows[e.key] && selectedPart()) {
    if (!e.repeat) st.checkpoint();
    nudgeSelected(arrows[e.key][0], arrows[e.key][1], true);
    return true;
  }
  return false;
}
