// Editing actions on the project scene. All of them are undoable (Cmd+Z).

import type { ScenePart, TargetRef } from '@shared/types';
import { BOARDS, PARTS, canOutput, getBoard, gotchasFor, groundPins, pinById, powerPinFor } from '@shared/board';
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
  // Known traps for this part on this board, the moment it is added (each one sourced).
  for (const g of gotchasFor(def, getBoard(useScene.getState().scene.board)))
    log('warning', t('Good to know ({part}): {text}', { part: def.name.split(/[ (]/)[0], text: t(g.text) }), {
      target: `part:${newId}` as TargetRef,
      source: `${g.source.title}${g.source.section ? `, ${g.source.section}` : ''}`,
    });
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

/**
 * Move the project to another board. Wires follow their role: power and ground go to the new
 * board's matching pins, I2C and SPI to its default bus pins, other signals keep a pin with the
 * same name when it can do the job, or get a free safe pin. Parts move out of the new board's way.
 */
export function changeBoard(boardId: string) {
  const s = useScene.getState().scene;
  if (s.board === boardId || !BOARDS[boardId]) return;
  const to = getBoard(boardId);
  const used = new Set<string>();
  let moved = 0;
  let dropped = 0;
  const roleOf = (part: string, pin: string) => {
    const inst = s.parts.find((p) => p.id === part);
    const def = inst ? PARTS[inst.partId] : undefined;
    return { def, role: def?.pins.find((p) => p.name === pin)?.role };
  };
  const pick = (list: string[]) => {
    const id = list.find((x) => pinById(to, x) && !used.has(x));
    if (id) used.add(id);
    return id;
  };
  const target = (oldPin: string, part: string, pin: string): string | undefined => {
    const { def, role } = roleOf(part, pin);
    const spi = to.rules.spi;
    switch (role) {
      case 'power':
        return powerPinFor(to, def?.voltage ?? String(to.logicVolt))?.id;
      case 'ground':
        return groundPins(to)[0]?.id;
      case 'i2c_sda':
        return to.rules.i2c.sda;
      case 'i2c_scl':
        return to.rules.i2c.scl;
      case 'spi_mosi':
        return spi?.mosi;
      case 'spi_miso':
        return spi?.miso;
      case 'spi_sck':
        return spi?.sck;
      case 'spi_cs':
        return spi?.cs ?? pick(to.rules.safeIo);
      case 'analog_out':
        return pick(to.rules.adcPins);
      default: {
        const same = pinById(to, oldPin);
        if (same && same.kind === 'gpio' && canOutput(same) && !same.flags.some((f) => f === 'uart0' || f === 'usb' || f === 'swd') && !used.has(oldPin)) {
          used.add(oldPin);
          return oldPin;
        }
        return pick(to.rules.safeIo);
      }
    }
  };
  const wires = s.wires.flatMap((w) => {
    const boardEnd = w.from.part === 'board' ? 'from' : w.to.part === 'board' ? 'to' : null;
    if (!boardEnd) return [w];
    const partEnd = boardEnd === 'from' ? w.to : w.from;
    const next = target(w[boardEnd].pin, partEnd.part, partEnd.pin);
    if (!next) {
      dropped++;
      return [];
    }
    if (next !== w[boardEnd].pin) moved++;
    return [{ ...w, [boardEnd]: { part: 'board', pin: next } }];
  });
  const edge = to.pcbMm.width / 2 + 18;
  const parts = s.parts.map((p) =>
    Math.abs(p.position[2]) >= edge ? p : { ...p, position: [p.position[0], p.position[1], (p.position[2] < 0 ? -1 : 1) * edge] as [number, number, number] },
  );
  useScene.getState().updateScene(() => ({ ...s, board: boardId, parts, wires }));
  log('action', t('The project now uses the {board}.', { board: to.name }), { source: `library: ${to.id}` });
  if (moved || dropped) {
    log(
      dropped ? 'warning' : 'info',
      t('{moved} wires moved to matching pins, {dropped} removed. Check them in the 3D view.', { moved: String(moved), dropped: String(dropped) }),
    );
  }
}
