// How the 3D view looks: the lighting (Studio, Bench, High contrast) and the detail (Simple, Full,
// Labels). Remembered on this computer; slow computers start with Simple.

import { create } from 'zustand';
import { useScene } from './store';

export type Light = 'studio' | 'bench' | 'contrast';
export type Detail = 'simple' | 'full' | 'labels';

const KEY = 'bp.view3d';

function slowComputer() {
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number });
  return (nav?.hardwareConcurrency ?? 8) <= 4 || (nav?.deviceMemory ?? 8) <= 4;
}

function load(): { light: Light; detail: Detail } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { light?: string; detail?: string };
    return {
      light: v.light === 'bench' || v.light === 'contrast' || v.light === 'studio' ? v.light : 'studio',
      detail: v.detail === 'simple' || v.detail === 'full' || v.detail === 'labels' ? v.detail : slowComputer() ? 'simple' : 'full',
    };
  } catch {
    return { light: 'studio', detail: slowComputer() ? 'simple' : 'full' };
  }
}

interface View3d {
  light: Light;
  detail: Detail;
  setLight(l: Light): void;
  setDetail(d: Detail): void;
}

export const useView3d = create<View3d>((set, get) => ({
  ...load(),
  setLight: (light) => set({ light }),
  setDetail: (detail) => {
    set({ detail });
    // "Labels" shows every pin name; the other settings keep only the tags that matter.
    useScene.getState().set({ labels: detail === 'labels' });
  },
}));

useView3d.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ light: s.light, detail: s.detail }));
  } catch {
    /* no storage: the choice lasts for this session */
  }
});

/** Full or Labels: the detailed board and parts. */
export const useDetailed = () => useView3d((s) => s.detail !== 'simple');
