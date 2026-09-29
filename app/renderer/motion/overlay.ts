// Motion capture overlay (issue #22): captions, highlight rings, arrows and a moving "camera" drawn
// on top of the real app while scripts/render-motion.mjs records a social clip. Loaded only when the
// hash has motion=1, and it does nothing until the main process (BP_MOTION) calls bpMotion.load().
// Nothing here is part of the app's UI: the text comes from motion/clips.json (English captions;
// the Italian ones go to the .srt subtitle files), so it does not go through t().

import './overlay.css';
import markSvg from '../../../assets/brand/boardpilot-mark.svg?raw';
import type { MotionFormatId, MotionJob, MotionStep, MotionTone } from '@shared/motion';
import type { TargetRef } from '@shared/types';
import { useScene } from '../state/store';
import { addPart } from '../state/sceneActions';

interface Cam {
  x: number;
  y: number;
  s: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The app is laid out at its desktop size and framed inside the video by a CSS transform. */
const SHELL: Record<MotionFormatId, [number, number]> = { '16x9': [1600, 900], '1x1': [1400, 1000], '9x16': [1200, 1300] };

/** Where the app shows in the page (CSS px); the rest holds the caption band. Must match overlay.css.
 *  In 16:9 the app fills the frame, but a framed target stays above the lower-third caption. */
function contentBox(f: MotionFormatId, W: number, H: number, whole: boolean): Box {
  if (f === '1x1') return { x: 0, y: 132, w: W, h: H - 132 };
  if (f === '9x16') return { x: 0, y: 250, w: W, h: H - 250 };
  return whole ? { x: 0, y: 0, w: W, h: H } : { x: 0, y: 0, w: W, h: H - 140 };
}

const TONE: Record<MotionTone, string> = {
  warn: 'var(--warn)',
  ok: 'var(--ok)',
  err: 'var(--err)',
  ai: 'var(--ai)',
  sda: 'var(--pin-sda)',
  scl: 'var(--pin-scl)',
  gpio: 'var(--pin-gpio)',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function find(selector: string, text?: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`#root ${selector}`));
  return (text ? all.find((e) => e.textContent?.includes(text)) : all[0]) ?? null;
}

async function waitFor(selector: string, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (find(selector)) return true;
    await sleep(150);
  }
  return false;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

class Motion {
  private job: MotionJob | null = null;
  private root = document.getElementById('root') as HTMLElement;
  private layer!: HTMLElement;
  private caption!: HTMLElement;
  private cam: Cam = { x: 0, y: 0, s: 1 };
  private camAnim: { from: Cam; to: Cam; t0: number; ms: number } | null = null;
  private marks: { node: HTMLElement; target: () => HTMLElement | null; pad: number; kind: 'ring' | 'arrow'; from?: string }[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private raf = 0;
  status = 'idle';

  /** Lays out the page for the format, waits for the demo, runs the setup. Resolves 'ready' or a reason. */
  async load(job: MotionJob): Promise<string> {
    this.job = job;
    this.status = 'loading';
    const f = job.format.id;
    const [sw, sh] = SHELL[f];
    document.body.classList.add('motion', `motion-${f}`);
    this.root.style.width = `${sw}px`;
    this.root.style.height = `${sh}px`;
    this.buildLayer(job);
    this.frame('all', 0, 0);
    this.tick();
    if (!(await waitFor(job.clip.ready, 90000))) return (this.status = `the app never showed ${job.clip.ready}`);
    await sleep((job.clip.settle ?? 1) * 1000);
    for (const s of job.clip.setup ?? []) await this.run(s, true);
    await sleep(400);
    return (this.status = 'ready');
  }

  /** Starts the timeline; the main process captures frames from now on. */
  play() {
    this.status = 'playing';
    for (const s of this.job?.clip.steps ?? []) this.timers.push(setTimeout(() => void this.run(s, false), s.at * 1000));
  }

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.status = 'stopped';
  }

  private buildLayer(job: MotionJob) {
    this.layer = el('div', 'mo-layer', document.body);
    const band = el('div', 'mo-band', this.layer);
    const brand = el('div', 'mo-brand', band);
    brand.innerHTML = `${markSvg}<span class="mo-name">Board<b>Pilot</b></span>`;
    this.caption = el('div', 'mo-caption', band);
    const tag = el('div', `mo-tag ${job.clip.tag === 'Simulator' ? 'sim' : 'lesson'}`, brand);
    tag.textContent = job.clip.tag;
  }

  // ---------- camera ----------

  private page() {
    return { W: window.innerWidth, H: window.innerHeight };
  }

  /** Target box in shell coordinates ('all' = the whole app). */
  private shellBox(target: string, text?: string): Box | null {
    const [sw, sh] = SHELL[this.job!.format.id];
    if (target === 'all') return { x: 0, y: 0, w: sw, h: sh };
    const e = find(target, text);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const { x, y, s } = this.cam;
    return { x: (r.left - x) / s, y: (r.top - y) / s, w: r.width / s, h: r.height / s };
  }

  /** Moves the camera so the target fits the content box (`fill`: covers it, cropping the target). */
  private frame(target: string, over: number, pad = 12, maxZoom = 1.4, text?: string, fill = false) {
    const b = this.shellBox(target, text);
    if (!b || !this.job) return;
    const f = this.job.format.id;
    const { W, H } = this.page();
    const c = contentBox(f, W, H, target === 'all' || fill);
    const [sw, sh] = SHELL[f];
    // Never smaller than "cover": the app always fills the content box, a tall target is cropped.
    const cover = Math.max(c.w / sw, c.h / sh);
    const fit = fill ? Math.max(c.w / (b.w + 2 * pad), c.h / (b.h + 2 * pad)) : Math.min(c.w / (b.w + 2 * pad), c.h / (b.h + 2 * pad));
    const s = Math.max(cover, Math.min(fit, maxZoom));
    const place = (start: number, size: number, bs: number, bl: number, full: number) => {
      const want = start + (size - bl * s) / 2 - bs * s;
      // Keep the app filling the content box: no empty space beside it when it is bigger.
      if (full * s <= size) return start + (size - full * s) / 2;
      return Math.min(start, Math.max(start + size - full * s, want));
    };
    const to = { s, x: place(c.x, c.w, b.x, b.w, sw), y: place(c.y, c.h, b.y, b.h, sh) };
    if (over <= 0) {
      this.cam = to;
      this.camAnim = null;
      this.applyCam();
    } else this.camAnim = { from: { ...this.cam }, to, t0: performance.now(), ms: over * 1000 };
  }

  private applyCam() {
    const { x, y, s } = this.cam;
    this.root.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }

  /** Every animation frame: move the camera, keep rings and arrows on their targets. */
  private tick = () => {
    // Focus or scrollIntoView can scroll the page or the app root; the camera alone places the app.
    const doc = document.scrollingElement;
    if (doc && (doc.scrollLeft || doc.scrollTop)) doc.scrollLeft = doc.scrollTop = 0;
    if (this.root.scrollLeft || this.root.scrollTop) this.root.scrollLeft = this.root.scrollTop = 0;
    const a = this.camAnim;
    if (a) {
      const k = Math.min(1, (performance.now() - a.t0) / a.ms);
      const e = ease(k);
      this.cam = { x: a.from.x + (a.to.x - a.from.x) * e, y: a.from.y + (a.to.y - a.from.y) * e, s: a.from.s + (a.to.s - a.from.s) * e };
      this.applyCam();
      if (k >= 1) this.camAnim = null;
    }
    for (const m of this.marks) {
      const t = m.target();
      if (!t) continue;
      const r = t.getBoundingClientRect();
      if (m.kind === 'ring') {
        Object.assign(m.node.style, { left: `${r.left - m.pad}px`, top: `${r.top - m.pad}px`, width: `${r.width + 2 * m.pad}px`, height: `${r.height + 2 * m.pad}px` });
      } else {
        const side = m.from ?? (r.left > window.innerWidth - r.right ? 'left' : 'right');
        const L = 64;
        const pos: Record<string, [number, number, number]> = {
          left: [r.left - L - 6, r.top + r.height / 2 - L / 2, 0],
          right: [r.right + 6, r.top + r.height / 2 - L / 2, 180],
          above: [r.left + r.width / 2 - L / 2, r.top - L - 6, 90],
          below: [r.left + r.width / 2 - L / 2, r.bottom + 6, -90],
        };
        const [x, y, rot] = pos[side] ?? pos.left;
        Object.assign(m.node.style, { left: `${x}px`, top: `${y}px`, transform: `rotate(${rot}deg)` });
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  // ---------- steps ----------

  private setCaption(text: string) {
    for (const old of Array.from(this.caption.children)) {
      old.classList.add('out');
      setTimeout(() => old.remove(), 350);
    }
    if (!text) return;
    const line = el('div', 'mo-line', this.caption);
    line.textContent = text;
  }

  private mark(kind: 'ring' | 'arrow', target: string, text: string | undefined, tone: MotionTone | undefined, pad: number, from?: string) {
    const node = el('div', `mo-${kind}`, this.layer);
    node.style.setProperty('--mo-tone', TONE[tone ?? 'warn']);
    if (kind === 'arrow')
      node.innerHTML = '<svg viewBox="0 0 64 64" width="64" height="64"><path d="M6 32 H52 M38 18 L54 32 L38 46" fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    this.marks.push({ node, target: () => find(target, text), pad, kind, from });
  }

  private async run(s: MotionStep, instant: boolean) {
    switch (s.do) {
      case 'caption':
        return this.setCaption(s.en);
      case 'uncaption':
        return this.setCaption('');
      case 'ring':
        return this.mark('ring', s.target, s.text, s.tone, s.pad ?? 6);
      case 'arrow':
        return this.mark('arrow', s.target, s.text, s.tone, 0, s.from);
      case 'clear':
        for (const m of this.marks) {
          m.node.classList.add('out');
          setTimeout(() => m.node.remove(), 300);
        }
        this.marks = [];
        return;
      case 'camera':
        return this.frame(s.target, instant ? 0 : (s.over ?? 1.2), s.pad ?? 12, s.maxZoom ?? 1.4, s.text, s.fill);
      case 'click': {
        const e = find(s.target, s.text);
        if (!e) return;
        const r = e.getBoundingClientRect();
        const tap = el('div', 'mo-tap', this.layer);
        Object.assign(tap.style, { left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px` });
        setTimeout(() => tap.remove(), 700);
        e.click();
        return;
      }
      case 'slide': {
        const input = find(s.target) as HTMLInputElement | null;
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        const from = Number(input.value);
        const t0 = performance.now();
        const stepV = Number(input.step) || 1;
        const move = () => {
          const k = Math.min(1, (performance.now() - t0) / (s.over * 1000));
          const v = Math.round((from + (s.to - from) * ease(k)) / stepV) * stepV;
          setter?.call(input, String(v));
          input.dispatchEvent(new Event('input', { bubbles: true }));
          if (k < 1) requestAnimationFrame(move);
        };
        move();
        return;
      }
      case 'pan': {
        // Scroll a wide panel sideways at a steady speed (to = 0…1 of its scroll range).
        const e = find(s.target);
        if (!e) return;
        const from = e.scrollLeft;
        const t0 = performance.now();
        const move = () => {
          const k = Math.min(1, (performance.now() - t0) / (s.over * 1000));
          e.scrollLeft = from + ((e.scrollWidth - e.clientWidth) * s.to - from) * k;
          if (k < 1) requestAnimationFrame(move);
        };
        move();
        return;
      }
      case 'hide': {
        const e = find(s.target);
        if (e) e.style.clipPath = 'inset(0 100% 0 0)';
        return;
      }
      case 'reveal':
      case 'type': {
        const e = find(s.target);
        if (!e) return;
        const n = Math.max(1, (e.textContent ?? '').length);
        e.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
          duration: s.over * 1000,
          easing: s.do === 'type' ? `steps(${n}, end)` : 'linear',
          fill: 'forwards',
        });
        return;
      }
      case 'scroll':
        find(s.target, s.text)?.scrollIntoView({ block: 'center' });
        return;
      case 'board':
        useScene.getState().openScene({ board: s.id, parts: [], wires: [] });
        this.setCaption(this.job?.boardNames?.[s.id] ?? s.id);
        return;
      case 'part':
        // Drop the part, close its card and pull the 3D camera back so every part stays in view.
        addPart(s.id);
        useScene.getState().select(null);
        useScene.getState().preset('home');
        return;
      case 'view':
        useScene.getState().preset(s.preset);
        return;
      case 'focus':
        useScene.getState().focusOn(s.targets as TargetRef[]);
        return;
      case 'mode':
        await window.bp.hw.setMode(s.mode);
        return;
    }
  }
}

declare global {
  interface Window {
    bpMotion?: Motion;
  }
}

window.bpMotion = new Motion();
