// Board pins in the code (CLAUDE.md rule 5: everything that names a pin leads to it in 3D). Each
// pin the code refers to (shared/codeRefs) is underlined in its role colour; hovering shows what
// the board file says about the pin and what the drawing wires to it, and lights it up in 3D;
// ⌘-click (Ctrl-click) focuses the camera on it. Library objects that are parts in the drawing
// (bme1) get the same card for the part.

import { Decoration, EditorView, ViewPlugin, hoverTooltip, type DecorationSet, type Tooltip, type ViewUpdate } from '@codemirror/view';
import { StateEffect, type Range } from '@codemirror/state';
import { PARTS, ROLE_VAR, getBoard } from '@shared/board';
import { pinFacts, pinRefAt, pinRefs, type PinRef } from '@shared/codeRefs';
import { memberOptions } from '@shared/codeComplete';
import { t } from '@shared/i18n';
import type { TargetRef } from '@shared/types';
import { useScene } from '../../state/store';

/** Dispatched when the drawing or the 3D selection changes, so colours and highlights follow. */
export const refreshPins = StateEffect.define<null>();

const el = (tag: string, cls: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const modKey = () => (isMac ? '⌘' : 'Ctrl');

class PinsPlugin {
  refs: PinRef[] = [];
  decorations: DecorationSet = Decoration.none;
  constructor(view: EditorView) {
    this.compute(view);
  }
  update(u: ViewUpdate) {
    if (u.docChanged || u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshPins)))) this.compute(u.view);
  }
  compute(view: EditorView) {
    const { scene, highlight, selected } = useScene.getState();
    const board = getBoard(scene.board);
    this.refs = pinRefs(view.state.doc.toString(), board);
    const lit = new Set<string>([...highlight, ...(selected ? [selected] : [])]);
    const marks: Range<Decoration>[] = this.refs.map((r) => {
      const role = pinFacts(r.pin, board, scene, PARTS).role;
      return Decoration.mark({
        class: `cm-pin${lit.has(`pin:${r.pin.id}`) ? ' cm-pin-lit' : ''}`,
        attributes: { style: `--pin-c: var(${ROLE_VAR[role]})`, 'data-pin': r.pin.id },
      }).range(r.from, r.to);
    });
    this.decorations = Decoration.set(marks, true);
  }
}

export const pinsPlugin = ViewPlugin.fromClass(PinsPlugin, { decorations: (p) => p.decorations });

/** The pin reference at a position, from the plugin's last computation. */
export function pinAt(view: EditorView, pos: number): PinRef | undefined {
  const p = view.plugin(pinsPlugin);
  return p ? pinRefAt(p.refs, pos) : undefined;
}

/** Light a target up in 3D while the card is open; the earlier highlight comes back after. */
function lightWhileOpen(targets: TargetRef[]) {
  let saved: TargetRef[] | null = null;
  return {
    mount() {
      saved = useScene.getState().highlight;
      useScene.getState().setHighlight(targets);
    },
    destroy() {
      const cur = useScene.getState().highlight;
      if (cur.length === targets.length && cur.every((x, i) => x === targets[i])) useScene.getState().setHighlight(saved ?? []);
    },
  };
}

function pinCard(ref: PinRef): HTMLElement {
  const { scene } = useScene.getState();
  const board = getBoard(scene.board);
  const f = pinFacts(ref.pin, board, scene, PARTS);
  const card = el('div', 'cm-pincard');
  card.style.setProperty('--pin-c', `var(${ROLE_VAR[f.role]})`);
  const head = el('div', 'cm-pincard-head');
  head.append(el('i', 'cm-pincard-dot'), el('b', 'mono', f.title));
  if (ref.via) head.append(el('span', 'mono dim', `= ${ref.via}`));
  card.append(head);
  if (f.wired.length) {
    const w = el('div', 'cm-pincard-row');
    w.append(el('span', 'dim', t('Wired to')), el('span', '', f.wired.map((x) => `${x.part} ${x.pin}`).join(', ')));
    card.append(w);
  } else card.append(el('div', 'cm-pincard-row dim', t('Nothing is wired to this pin in the drawing.')));
  if (f.functions.length) {
    const w = el('div', 'cm-pincard-row');
    w.append(el('span', 'dim', t('Also')), el('span', 'mono', f.functions.join(' · ')));
    card.append(w);
  }
  for (const c of f.cautions) card.append(el('div', 'cm-pincard-caution', c));
  card.append(el('div', 'cm-pincard-src mono', t('source: board file of the {board} and the drawing', { board: board.name })));
  const btn = el('button', 'btn small', t('Show on the board')) as HTMLButtonElement;
  btn.onclick = () => useScene.getState().focusOn([`pin:${ref.pin.id}`]);
  const row = el('div', 'cm-pincard-actions');
  row.append(btn, el('span', 'dim small', t('or {key}-click the pin in the code', { key: modKey() })));
  card.append(row);
  return card;
}

function partCard(partId: string, cls: string | undefined, header: string | undefined): HTMLElement | null {
  const { scene } = useScene.getState();
  const inst = scene.parts.find((p) => p.id === partId);
  const def = inst ? PARTS[inst.partId] : undefined;
  if (!inst || !def) return null;
  const board = getBoard(scene.board);
  const card = el('div', 'cm-pincard');
  const head = el('div', 'cm-pincard-head');
  head.append(el('b', '', inst.label ?? def.name), el('span', 'mono dim', partId));
  card.append(head);
  const pins = scene.wires
    .map((w) => (w.from.part === partId && w.to.part === 'board' ? [w.from.pin, w.to.pin] : w.to.part === partId && w.from.part === 'board' ? [w.to.pin, w.from.pin] : null))
    .filter((x): x is string[] => !!x)
    .map(([pp, bp]) => `${pp} → ${board.pins.find((p) => p.id === bp)?.label ?? bp}`);
  if (pins.length) card.append(el('div', 'cm-pincard-row mono', pins.join(' · ')));
  if (def.addresses?.length) card.append(el('div', 'cm-pincard-row mono', `I2C ${def.addresses.join(' / ')}`));
  if (cls) card.append(el('div', 'cm-pincard-src mono', t('source: parts library ({part}), {library}', { part: def.id, library: header ?? cls })));
  else card.append(el('div', 'cm-pincard-src mono', t('source: parts library ({part})', { part: def.id })));
  const btn = el('button', 'btn small', t('Show on the board')) as HTMLButtonElement;
  btn.onclick = () => useScene.getState().focusOn([`part:${partId}`]);
  const row = el('div', 'cm-pincard-actions');
  row.append(btn);
  card.append(row);
  return card;
}

export const pinHover = hoverTooltip(
  (view, pos): Tooltip | null => {
    const ref = pinAt(view, pos);
    if (ref) {
      return {
        pos: ref.from,
        end: ref.to,
        above: true,
        create: () => ({ dom: pinCard(ref), ...lightWhileOpen([`pin:${ref.pin.id}`]) }),
      };
    }
    // A part of the drawing used as an object in the code (bme1.readTemperature()).
    const word = view.state.wordAt(pos);
    if (!word) return null;
    const name = view.state.sliceDoc(word.from, word.to);
    if (!useScene.getState().scene.parts.some((p) => p.id === name)) return null;
    const lib = memberOptions(name, view.state.doc.toString());
    const dom = partCard(name, lib?.cls, lib ? `${lib.lib.library} (${lib.lib.header})` : undefined);
    if (!dom) return null;
    return { pos: word.from, end: word.to, above: true, create: () => ({ dom, ...lightWhileOpen([`part:${name}`]) }) };
  },
  { hoverTime: 350 },
);

/** ⌘-click (Ctrl-click) on a pin or a drawn part in the code focuses the 3D view on it. */
export const pinClick = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (!(isMac ? e.metaKey : e.ctrlKey) || e.button !== 0) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos === null) return false;
    const ref = pinAt(view, pos);
    if (ref) {
      e.preventDefault();
      useScene.getState().focusOn([`pin:${ref.pin.id}`]);
      return true;
    }
    const word = view.state.wordAt(pos);
    const name = word ? view.state.sliceDoc(word.from, word.to) : '';
    if (name && useScene.getState().scene.parts.some((p) => p.id === name)) {
      e.preventDefault();
      useScene.getState().focusOn([`part:${name}`]);
      return true;
    }
    return false;
  },
});
