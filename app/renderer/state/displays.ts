// Live pixels of simulated displays (Display Studio), keyed by scene part id (e.g. "oled1").
// The 3D display mesh shows `canvas` as a texture on the active area and re-uploads it when
// `version` changes; no entry means the screen is off (dark glass). One loop animates every
// display spec of the project (scene.displays) and the studio's own preview, about 30 times a
// second, with play/pause, speed and values set by hand.

import { create } from 'zustand';
import { PARTS } from '@shared/board';
import { panelOf, type DisplaySpec, type PanelInfo } from '@shared/displaySpec';
import { DisplaySim, Framebuffer } from '@shared/displayRender';
import { useScene } from './store';

export interface DisplayFrame {
  canvas: HTMLCanvasElement;
  widthPx: number;
  heightPx: number;
  version: number;
}

export const useDisplayFrames = create<{ frames: Record<string, DisplayFrame> }>(() => ({ frames: {} }));

/** Clock and hand-set values shared by the studio and the 3D displays. */
export const useDisplayClock = create<{ playing: boolean; speed: 1 | 2 | 4; ms: number; overrides: Record<string, Record<string, number>>; screen: Record<string, string> }>(() => ({
  playing: true,
  speed: 1,
  ms: 0,
  overrides: {},
  screen: {},
}));

interface Running {
  spec: DisplaySpec;
  panel: PanelInfo;
  sim: DisplaySim;
  fb: Framebuffer;
  /** the panel's native orientation, for the 3D glass */
  native: HTMLCanvasElement;
  /** the designed (rotated) orientation, for previews */
  view: HTMLCanvasElement;
}

const running = new Map<string, Running>();

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** The panel of a display part in the scene, or null. */
export function panelForPart(partId: string): PanelInfo | null {
  const inst = useScene.getState().scene.parts.find((p) => p.id === partId);
  const def = inst ? PARTS[inst.partId] : undefined;
  return def ? panelOf(def) : null;
}

/** Start (or restart with a new spec) the simulation of one display. */
export function runDisplay(spec: DisplaySpec, panel: PanelInfo, key = spec.part): Running {
  const prev = running.get(key);
  if (prev && prev.spec === spec && prev.panel === panel) return prev;
  const fb = new Framebuffer(panel, spec.rotation);
  const r: Running = { spec, panel, sim: new DisplaySim(spec, panel), fb, native: prev?.native ?? canvas(panel.widthPx, panel.heightPx), view: canvas(fb.w, fb.h) };
  if (r.native.width !== panel.widthPx || r.native.height !== panel.heightPx) r.native = canvas(panel.widthPx, panel.heightPx);
  running.set(key, r);
  // A new spec starts from its first screen at the clock's current time.
  r.sim.state = { screen: spec.start, enteredAt: useDisplayClock.getState().ms };
  return r;
}

export function stopDisplay(key: string) {
  running.delete(key);
  useDisplayFrames.setState((s) => {
    const { [key]: _gone, ...rest } = s.frames;
    void _gone;
    return { frames: rest };
  });
}

export const runningDisplay = (key: string) => running.get(key);

/** Jump a display to a screen (the studio's screen list). */
export function showScreen(key: string, screen: string) {
  const r = running.get(key);
  if (r) r.sim.state = { screen, enteredAt: useDisplayClock.getState().ms };
}

export function restartDisplays() {
  useDisplayClock.setState({ ms: 0 });
  for (const r of running.values()) r.sim.state = { screen: r.spec.start, enteredAt: 0 };
}

function paint(key: string, r: Running, ms: number) {
  r.sim.overrides = useDisplayClock.getState().overrides[key] ?? {};
  // Screens only move forward in time: after a restart the sim starts again from its first screen.
  if (ms < r.sim.state.enteredAt) r.sim.state = { screen: r.spec.start, enteredAt: 0 };
  r.sim.frame(r.fb, ms);
  const put = (c: HTMLCanvasElement, native: boolean) => {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const data = r.fb.toRgba(native);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(data), c.width, c.height), 0, 0);
  };
  put(r.view, false);
  put(r.native, true);
  const prev = useDisplayFrames.getState().frames[key];
  if (!key.startsWith('preview:'))
    useDisplayFrames.setState((s) => ({ frames: { ...s.frames, [key]: { canvas: r.native, widthPx: r.panel.widthPx, heightPx: r.panel.heightPx, version: (prev?.version ?? 0) + 1 } } }));
  if (useDisplayClock.getState().screen[key] !== r.sim.state.screen) useDisplayClock.setState((s) => ({ screen: { ...s.screen, [key]: r.sim.state.screen } }));
}

/** The project's displays follow scene.displays: started, updated or stopped as the scene changes. */
function syncWithScene() {
  const specs = useScene.getState().scene.displays ?? [];
  const keep = new Set<string>();
  for (const spec of specs) {
    const panel = panelForPart(spec.part);
    if (!panel) continue;
    keep.add(spec.part);
    runDisplay(spec, panel);
  }
  for (const key of [...running.keys()]) if (!key.startsWith('preview:') && !keep.has(key)) stopDisplay(key);
}

let started = false;
/** Start the loop once (App start-up). */
export function startDisplayLoop() {
  if (started || typeof window === 'undefined') return;
  started = true;
  useScene.subscribe((s, prev) => {
    if (s.scene.displays !== prev.scene.displays || s.scene.parts !== prev.scene.parts) syncWithScene();
  });
  syncWithScene();
  let last = performance.now();
  let acc = 0;
  const tick = (now: number) => {
    const dt = Math.min(200, now - last);
    last = now;
    const clock = useDisplayClock.getState();
    if (clock.playing && running.size) {
      const ms = clock.ms + dt * clock.speed;
      useDisplayClock.setState({ ms });
      acc += dt;
      // About 30 frames a second is plenty for a preview and keeps slow computers cool.
      if (acc >= 33) {
        acc = 0;
        for (const [key, r] of running) paint(key, r, Math.floor(ms));
      }
    } else if (!clock.playing) {
      for (const [key, r] of running) if (!useDisplayFrames.getState().frames[key] && !key.startsWith('preview:')) paint(key, r, Math.floor(clock.ms));
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Paint one frame now (after a slider moved while paused). */
export function repaint(key: string) {
  const r = running.get(key);
  if (r) paint(key, r, Math.floor(useDisplayClock.getState().ms));
}
