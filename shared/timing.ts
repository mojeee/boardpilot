// Timing view logic (issue #8): a ring buffer of the agent's pin stream, the measured sample rate,
// the edges seen between samples, and period / frequency / duty cycle computed only from those edges.
//
// Everything here is "sampled": the agent's `stream` command reports each pin's level at a fixed
// rate (about 20 Hz), so an edge is only known to lie somewhere between two samples and a pulse
// shorter than one sample spacing can be missed completely. Nothing in this file invents an edge
// time finer than that: edge times carry the width of the window they fall in, and a measurement
// that would need more edges, or edges closer than the sampling allows, is refused, not guessed.

import type { AgentPinState, I2cTraceStep } from './types';

/* ---------- sample rate ---------- */

export interface SampleStats {
  /** samples used */
  n: number;
  /** median time between samples, ms (robust against one late frame) */
  spacingMs: number;
  /** 1000 / spacingMs */
  hz: number;
  /** largest time between two samples, ms */
  maxGapMs: number;
}

/** The sample rate actually seen in the frame timestamps (board clock, ms). Null with fewer than 2 samples. */
export function sampleStats(times: ArrayLike<number>, from = 0, to = times.length): SampleStats | null {
  const diffs: number[] = [];
  for (let i = Math.max(from, 0) + 1; i < Math.min(to, times.length); i++) {
    const d = times[i] - times[i - 1];
    if (d > 0) diffs.push(d);
  }
  if (!diffs.length) return null;
  const sorted = [...diffs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const spacingMs = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { n: diffs.length + 1, spacingMs, hz: 1000 / spacingMs, maxGapMs: sorted[sorted.length - 1] };
}

/** Two samples further apart than this many spacings are a gap: nothing is known about what happened in it. */
export const GAP_FACTOR = 3;

export function isGap(dtMs: number, spacingMs: number): boolean {
  return dtMs > spacingMs * GAP_FACTOR;
}

/* ---------- edges ---------- */

export interface SampledEdge {
  rising: boolean;
  /** time of the last sample still at the old level (ms) */
  before: number;
  /** time of the first sample showing the new level (ms) */
  after: number;
}

/** The middle of the window an edge lies in: the best estimate, ± half the window. */
export const edgeMid = (e: SampledEdge) => (e.before + e.after) / 2;

/**
 * Level changes between consecutive valid samples whose times fall in [fromT, toT].
 * NaN values (pin not in that frame) are skipped: an edge across them has a wider window.
 */
export function findEdges(times: ArrayLike<number>, levels: ArrayLike<number>, fromT = -Infinity, toT = Infinity): SampledEdge[] {
  const out: SampledEdge[] = [];
  let lastT = NaN;
  let lastV = NaN;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const v = levels[i];
    if (t < fromT || t > toT || Number.isNaN(v)) continue;
    const high = v >= 0.5 ? 1 : 0;
    if (!Number.isNaN(lastV) && high !== lastV) out.push({ rising: high === 1, before: lastT, after: t });
    lastT = t;
    lastV = high;
  }
  return out;
}

/* ---------- period, frequency, duty cycle ---------- */

export type DigitalMeasure =
  | {
      ok: true;
      /** edges used */
      edges: number;
      /** complete cycles between the first and the last edge used */
      cycles: number;
      periodMs: number;
      /** ± ms: from the width of the first and last edge windows */
      periodErrMs: number;
      hz: number;
      /** 0..1 */
      duty: number;
      /** ± fraction */
      dutyErr: number;
    }
  | {
      ok: false;
      /**
       * no_samples: fewer than 2 samples in the range.
       * not_enough_edges: a full cycle needs 3 edges (for example rise, fall, rise).
       * too_fast: some level lasted a single sample, so the signal may change faster than the
       * sample rate and edges may have been missed; any number would be a guess.
       */
      reason: 'no_samples' | 'not_enough_edges' | 'too_fast';
      edges: number;
    };

/** Period, frequency and duty cycle of a digital row between fromT and toT, from sampled edges only. */
export function measureDigital(times: ArrayLike<number>, levels: ArrayLike<number>, fromT = -Infinity, toT = Infinity): DigitalMeasure {
  let valid = 0;
  for (let i = 0; i < times.length; i++) if (times[i] >= fromT && times[i] <= toT && !Number.isNaN(levels[i])) valid++;
  if (valid < 2) return { ok: false, reason: 'no_samples', edges: 0 };
  const edges = findEdges(times, levels, fromT, toT);
  if (edges.length < 3) return { ok: false, reason: 'not_enough_edges', edges: edges.length };
  // A level seen in one sample only: its real length is anywhere from almost 0 to two spacings,
  // and more pulses like it may have fallen between samples.
  for (let i = 1; i < edges.length; i++) if (edges[i].before === edges[i - 1].after) return { ok: false, reason: 'too_fast', edges: edges.length };

  const cycles = Math.floor((edges.length - 1) / 2);
  const first = edges[0];
  const last = edges[cycles * 2];
  const span = edgeMid(last) - edgeMid(first);
  const half = (e: SampledEdge) => (e.after - e.before) / 2;
  const periodMs = span / cycles;
  const periodErrMs = (half(first) + half(last)) / cycles;
  let highMs = 0;
  let edgeErr = 0;
  for (let i = 0; i <= cycles * 2; i++) {
    const a = edges[i];
    if (i < cycles * 2 && a.rising) highMs += edgeMid(edges[i + 1]) - edgeMid(a);
    // Every edge used borders at most one high segment: its half window bounds that segment's error.
    edgeErr += half(a);
  }
  const dutyErr = Math.min(1, edgeErr / span);
  return { ok: true, edges: cycles * 2 + 1, cycles, periodMs, periodErrMs, hz: 1000 / periodMs, duty: highMs / span, dutyErr };
}

/* ---------- ring buffer of stream frames ---------- */

export interface RowMeta {
  /** true when the agent reported a measured voltage (ADC) instead of a level */
  analog: boolean;
  /** latest mode reported by the agent (in, out, pwm, adc, uart…) */
  mode: string;
  /** PWM settings the agent reports (what it was told to do, not measured) */
  pwmHz?: number;
  pwmDuty?: number;
}

/** Fixed-size ring of stream frames: one time column (board ms) and one value column per GPIO. */
export class SampleRing {
  private times: Float64Array;
  private cols = new Map<number, Float64Array>();
  private order: number[] = [];
  private head = 0;
  private len = 0;
  readonly meta = new Map<number, RowMeta>();
  /** Bumped on every change, so a drawing loop knows when to redraw. */
  version = 0;

  constructor(readonly capacity = 6000) {
    this.times = new Float64Array(capacity);
  }

  get length() {
    return this.len;
  }

  clear() {
    this.cols.clear();
    this.order = [];
    this.meta.clear();
    this.head = 0;
    this.len = 0;
    this.version++;
  }

  /** Adds one frame. A clock that goes back means a new stream: the old samples are dropped. */
  push(tMs: number, pins: Record<string, AgentPinState>): 'ok' | 'reset' {
    let result: 'ok' | 'reset' = 'ok';
    if (this.len && tMs < this.timeAt(this.len - 1)) {
      this.clear();
      result = 'reset';
    }
    const slot = (this.head + this.len) % this.capacity;
    if (this.len === this.capacity) this.head = (this.head + 1) % this.capacity;
    else this.len++;
    this.times[slot] = tMs;
    for (const col of this.cols.values()) col[slot] = NaN;
    for (const [key, p] of Object.entries(pins)) {
      const g = Number(key);
      if (!Number.isInteger(g)) continue;
      let col = this.cols.get(g);
      if (!col) {
        col = new Float64Array(this.capacity).fill(NaN);
        this.cols.set(g, col);
        this.order.push(g);
      }
      const analog = p.mv !== undefined;
      col[slot] = analog ? (p.mv as number) : p.level !== undefined ? p.level : NaN;
      this.meta.set(g, { analog, mode: String(p.mode), pwmHz: p.mode === 'pwm' ? p.hz : undefined, pwmDuty: p.mode === 'pwm' ? p.duty : undefined });
    }
    this.version++;
    return result;
  }

  /** GPIOs in the order they first appeared. */
  pins(): number[] {
    return [...this.order];
  }

  timeAt(i: number): number {
    return this.times[(this.head + i) % this.capacity];
  }

  valueAt(gpio: number, i: number): number {
    const col = this.cols.get(gpio);
    return col ? col[(this.head + i) % this.capacity] : NaN;
  }

  /** Index of the last sample at or before tMs (-1 when none). */
  indexAtOrBefore(tMs: number): number {
    let lo = 0;
    let hi = this.len - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.timeAt(mid) <= tMs) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  /** Plain copies of samples [from, to) for one pin (times, values). */
  slice(gpio: number, from = 0, to = this.len): { times: number[]; values: number[] } {
    const times: number[] = [];
    const values: number[] = [];
    for (let i = Math.max(0, from); i < Math.min(to, this.len); i++) {
      times.push(this.timeAt(i));
      values.push(this.valueAt(gpio, i));
    }
    return { times, values };
  }

  allTimes(from = 0, to = this.len): number[] {
    const out: number[] = [];
    for (let i = Math.max(0, from); i < Math.min(to, this.len); i++) out.push(this.timeAt(i));
    return out;
  }

  /** CSV: time in seconds (board clock), one column per pin; empty cell = not in that frame. */
  toCsv(label: (gpio: number, meta: RowMeta | undefined) => string, from = 0, to = this.len): string {
    const pins = this.order;
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const rows = [['time_s', ...pins.map((g) => esc(label(g, this.meta.get(g))))].join(',')];
    for (let i = Math.max(0, from); i < Math.min(to, this.len); i++) {
      const cells = [(this.timeAt(i) / 1000).toFixed(3)];
      for (const g of pins) {
        const v = this.valueAt(g, i);
        cells.push(Number.isNaN(v) ? '' : String(v));
      }
      rows.push(cells.join(','));
    }
    return rows.join('\n');
  }
}

/* ---------- decoded I2C lane ---------- */

export interface I2cBox {
  kind: 'start' | 'restart' | 'addr' | 'data' | 'stop';
  text: string;
  /** undefined for start/stop */
  ack?: boolean;
  /**
   * A NACK that is part of a normal transaction: the controller NACKs the last byte it reads to end
   * the read (I2C specification UM10204, 3.1.6). Only NACKs on an address or a written byte are problems.
   */
  expectedNack?: boolean;
}

/** The agent's decoded I2C steps as boxes: S, 0x76 W ACK, 0xD0 ACK, Sr, 0x76 R ACK, 0x60 NACK, P. */
export function i2cBoxes(trace: I2cTraceStep[]): I2cBox[] {
  let reading = false;
  return trace.map((s): I2cBox => {
    if (s.t === 'addr') reading = s.rw === 'r';
    if (s.t === 'start' || s.t === 'restart' || s.t === 'stop') reading = false;
    switch (s.t) {
      case 'start':
        return { kind: 'start', text: 'S' };
      case 'restart':
        return { kind: 'restart', text: 'Sr' };
      case 'stop':
        return { kind: 'stop', text: 'P' };
      case 'addr':
        return { kind: 'addr', text: `${s.v ?? '?'} ${s.rw === 'r' ? 'R' : 'W'} ${s.ack ? 'ACK' : 'NACK'}`, ack: !!s.ack };
      default: {
        const read = s.dir ? s.dir === 'r' : reading;
        return { kind: 'data', text: `${s.v ?? '?'} ${s.ack ? 'ACK' : 'NACK'}`, ack: !!s.ack, ...(read && !s.ack ? { expectedNack: true } : {}) };
      }
    }
  });
}

/* ---------- formatting and axis ---------- */

/** 1250 → "1.25 s", 125 → "125 ms", 12.5 → "12.5 ms", 2.345 → "2.35 ms", 0.5 → "500 µs". */
export function formatMs(ms: number): string {
  const a = Math.abs(ms);
  if (a >= 1000) return `${+(ms / 1000).toFixed(a >= 10000 ? 1 : 2)} s`;
  if (a >= 100) return `${Math.round(ms)} ms`;
  if (a >= 10) return `${+ms.toFixed(1)} ms`;
  if (a >= 1) return `${+ms.toFixed(2)} ms`;
  return `${Math.round(ms * 1000)} µs`;
}

/** 0.5 → "0.5 Hz", 20 → "20 Hz", 1500 → "1.5 kHz". */
export function formatHz(hz: number): string {
  if (hz >= 1000) return `${+(hz / 1000).toFixed(2)} kHz`;
  if (hz >= 10) return `${+hz.toFixed(1)} Hz`;
  return `${+hz.toFixed(2)} Hz`;
}

/** A 1-2-5 step (ms) close to the wanted one, for axis ticks. */
export function niceStep(wantMs: number): number {
  if (!(wantMs > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(wantMs));
  const f = wantMs / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
