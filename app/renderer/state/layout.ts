// Workspace layout: which panels are open (the assistant on the right, the Code/Log panel at the
// bottom), which bottom tab and right tab are shown. Remembered on this computer. The panel sizes
// themselves are CSS variables set by the Splitter handles.

import { create } from 'zustand';

export type BottomTab = 'code' | 'log';
export type RightTab = 'assistant' | 'tools';

interface LayoutState {
  rightOpen: boolean;
  bottomOpen: boolean;
  /** The bottom panel fills the whole centre column (the 3D view is hidden until restored). */
  bottomMax: boolean;
  bottomTab: BottomTab;
  /** Right panel of the project page: the assistant or the project tools (parts, pins, starter code). */
  rightTab: RightTab;
  toggleRight(open?: boolean): void;
  toggleBottom(open?: boolean): void;
  toggleBottomMax(): void;
  showBottom(tab: BottomTab): void;
  setRightTab(tab: RightTab): void;
  /** Hide both side panels to give the 3D view the whole window, or bring them back. */
  focusView(): void;
}

const KEY = 'bp.panels';
type Saved = Pick<LayoutState, 'rightOpen' | 'bottomOpen' | 'bottomMax' | 'bottomTab' | 'rightTab'>;
const DEFAULTS: Saved = { rightOpen: true, bottomOpen: true, bottomMax: false, bottomTab: 'code', rightTab: 'assistant' };

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>;
    return {
      rightOpen: typeof v.rightOpen === 'boolean' ? v.rightOpen : DEFAULTS.rightOpen,
      bottomOpen: typeof v.bottomOpen === 'boolean' ? v.bottomOpen : DEFAULTS.bottomOpen,
      bottomMax: typeof v.bottomMax === 'boolean' ? v.bottomMax : DEFAULTS.bottomMax,
      bottomTab: v.bottomTab === 'log' || v.bottomTab === 'code' ? v.bottomTab : DEFAULTS.bottomTab,
      rightTab: v.rightTab === 'tools' || v.rightTab === 'assistant' ? v.rightTab : DEFAULTS.rightTab,
    };
  } catch {
    return DEFAULTS;
  }
}

function save(s: LayoutState) {
  const { rightOpen, bottomOpen, bottomMax, bottomTab, rightTab } = s;
  try {
    localStorage.setItem(KEY, JSON.stringify({ rightOpen, bottomOpen, bottomMax, bottomTab, rightTab }));
  } catch {
    /* storage unavailable: the layout lasts for this session only */
  }
}

/** Panels as they were before focusView hid them. */
let beforeFocus: { rightOpen: boolean; bottomOpen: boolean } | null = null;

export const useLayout = create<LayoutState>((set, get) => ({
  ...load(),
  toggleRight: (open) => set((s) => ({ rightOpen: open ?? !s.rightOpen })),
  toggleBottom: (open) => set((s) => ({ bottomOpen: open ?? !s.bottomOpen, bottomMax: (open ?? !s.bottomOpen) ? s.bottomMax : false })),
  toggleBottomMax: () => set((s) => ({ bottomMax: !s.bottomMax, bottomOpen: true })),
  showBottom: (bottomTab) => set({ bottomTab, bottomOpen: true }),
  setRightTab: (rightTab) => set({ rightTab, rightOpen: true }),
  focusView: () => {
    const s = get();
    if (s.rightOpen || s.bottomOpen) {
      beforeFocus = { rightOpen: s.rightOpen, bottomOpen: s.bottomOpen };
      set({ rightOpen: false, bottomOpen: false, bottomMax: false });
    } else {
      set(beforeFocus ?? { rightOpen: true, bottomOpen: true });
      beforeFocus = null;
    }
  },
}));

useLayout.subscribe((s) => save(s));

/** Keyboard shortcuts for the panels: ⌘J the bottom panel, ⌘I the assistant, ⌘⇧F the 3D view alone. */
export function handleLayoutKey(e: KeyboardEvent): boolean {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || e.altKey) return false;
  const k = e.key.toLowerCase();
  const l = useLayout.getState();
  if (k === 'j' && !e.shiftKey) l.toggleBottom();
  else if (k === 'i' && !e.shiftKey) l.toggleRight();
  else if (k === 'f' && e.shiftKey) l.focusView();
  else return false;
  return true;
}
