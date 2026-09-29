// Timing view (issue #8): logic-analyser style rows for the pins the agent streams, with the
// agent's decoded I2C transaction under SDA/SCL, two cursors, period / frequency / duty cycle,
// pause, zoom and PNG / CSV export.
//
// Honesty: the agent's stream reports levels at about 20 Hz, so this is a *sampled* view. The
// measured sample rate (from the board's frame timestamps) is always shown, an edge is drawn as a
// slope across the whole time between the two samples around it, pulses shorter than one sample
// can be missed and the label says so, and a measurement that would need more edges is refused
// (see shared/timing.ts). A fast buffered capture command in the agent is planned for later.
//
// Performance: frames go into a ring buffer outside React; one requestAnimationFrame loop redraws
// the canvas only when something changed; React re-renders only for button clicks and a readout
// that updates at most 4 times a second.

import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { TraceEvent } from '@shared/api';
import { ROLE_HEX, ROLE_VAR, pinByGpio, pinRoleInScene, type PinRoleColor } from '@shared/board';
import { SampleRing, formatHz, formatMs, i2cBoxes, isGap, measureDigital, niceStep, sampleStats, type DigitalMeasure } from '@shared/timing';
import { t } from '@shared/i18n';
import { currentBoard, log, useLive, useScene } from '../state/store';
import '../styles/timing.css';

/* ---------------- capture (outside React) ---------------- */

/** 5 minutes at 20 Hz. */
const ring = new SampleRing(6000);

interface SeenTrace {
  ev: TraceEvent;
  /** About when the reply arrived, on the board clock (ms); null before the first stream frame. */
  boardT: number | null;
}
let lastTrace: SeenTrace | null = null;
let traceVersion = 0;
/** Date.now() minus the board time of the newest frame: maps the I2C reply time onto the board clock. */
let clockOffset: number | null = null;

interface TimingUi {
  paused: boolean;
  /** Width of the view, ms. */
  windowMs: number;
  /** Right edge of the view on the board clock; null follows the newest sample. */
  viewEnd: number | null;
  /** GPIO of the row chosen for period / duty cycle. */
  selected: number | null;
  cursorA: number | null;
  cursorB: number | null;
  set(p: Partial<Omit<TimingUi, 'set'>>): void;
}

const useTiming = create<TimingUi>((set) => ({
  paused: false,
  windowMs: 5000,
  viewEnd: null,
  selected: null,
  cursorA: null,
  cursorB: null,
  set: (p) => set(p),
}));

/** Choose the row measured for period and duty cycle (scripted demos). */
export function selectTimingRow(gpio: number | null) {
  useTiming.getState().set({ selected: gpio });
}

let wired = false;
/** Collect frames and I2C traces from the moment the app starts, whichever screen is open. */
function ensureCapture() {
  if (wired) return;
  wired = true;
  useLive.subscribe((s, prev) => {
    if (s.frame && s.frame !== prev.frame) {
      clockOffset = s.frameAt - s.frame.t;
      // Paused (here or with the Monitor's Pause): frames are dropped, so the resumed view shows a gap.
      if (!s.paused && !useTiming.getState().paused) ring.push(s.frame.t, s.frame.pins);
    }
    if (s.trace && s.trace !== prev.trace) {
      lastTrace = { ev: s.trace, boardT: clockOffset === null ? null : s.traceAt - clockOffset };
      traceVersion++;
    }
  });
}
ensureCapture();

/* ---------------- layout and colours ---------------- */

const GUTTER = 136;
const PAD_R = 10;
const AXIS_H = 22;
const ROW_DIGITAL = 38;
const ROW_ANALOG = 54;
const ROW_I2C = 34;
const MIN_WINDOW = 250;
const MAX_WINDOW = 300000;

type Row = { kind: 'pin'; gpio: number; top: number; h: number } | { kind: 'i2c'; trace: SeenTrace; top: number; h: number };

interface Palette {
  panel: string;
  chrome: string;
  raised: string;
  line: string;
  text: string;
  muted: string;
  dim: string;
  ai: string;
  warn: string;
  err: string;
  ok: string;
  role: Record<PinRoleColor, string>;
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  const role = {} as Record<PinRoleColor, string>;
  for (const k of Object.keys(ROLE_VAR) as PinRoleColor[]) role[k] = v(ROLE_VAR[k], ROLE_HEX[k]);
  return {
    panel: v('--panel', '#1c232b'),
    chrome: v('--chrome', '#12171c'),
    raised: v('--raised', '#2c3541'),
    line: v('--line', '#2c3540'),
    text: v('--text', '#e9edf1'),
    muted: v('--muted', '#a7b3bf'),
    dim: v('--dim', '#7d8997'),
    ai: v('--ai', '#c9beff'),
    warn: v('--warn', '#f2a93b'),
    err: v('--err', '#ff5d52'),
    ok: v('--ok', '#5ccb8f'),
    role,
  };
}

/** Colour of a row = the pin's role in the scene, like the plots and the 3D board. Analog rows are ADC. */
function rowRole(gpio: number): PinRoleColor {
  if (ring.meta.get(gpio)?.analog) return 'adc';
  const board = currentBoard();
  const p = pinByGpio(board, gpio);
  if (!p) return 'gpio';
  const r = pinRoleInScene(board, useScene.getState().scene, p.id);
  return r === 'none' || r === 'power' || r === 'ground' ? 'gpio' : r;
}

const ROLE_TEXT: Partial<Record<PinRoleColor, string>> = { sda: 'SDA', scl: 'SCL', spi: 'SPI', uart: 'UART', adc: 'ADC' };

function pinName(gpio: number) {
  return pinByGpio(currentBoard(), gpio)?.label ?? `GPIO ${gpio}`;
}

const alpha = (hex: string, a: number) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

const fmtBoardT = (ms: number) => `${(ms / 1000).toFixed(3)} s`;

/** Rows in display order: pins as first streamed, the I2C lane right under the lower of SDA/SCL. */
function layoutRows(): Row[] {
  const rows: Row[] = [];
  let top = AXIS_H;
  const pins = ring.pins();
  const tr = lastTrace;
  let i2cAfter = -1;
  if (tr) i2cAfter = Math.max(pins.indexOf(tr.ev.sda), pins.indexOf(tr.ev.scl));
  if (tr && i2cAfter < 0) i2cAfter = pins.length - 1;
  pins.forEach((g, i) => {
    const h = ring.meta.get(g)?.analog ? ROW_ANALOG : ROW_DIGITAL;
    rows.push({ kind: 'pin', gpio: g, top, h });
    top += h;
    if (tr && i === i2cAfter) {
      rows.push({ kind: 'i2c', trace: tr, top, h: ROW_I2C });
      top += ROW_I2C;
    }
  });
  if (tr && !pins.length) rows.push({ kind: 'i2c', trace: tr, top, h: ROW_I2C });
  return rows;
}

const rowsHeight = (rows: Row[]) => (rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].h : AXIS_H) + 2;

interface View {
  tStart: number;
  tEnd: number;
  x0: number;
  w: number;
  rows: Row[];
}

/* ---------------- drawing ---------------- */

function drawTiming(ctx: CanvasRenderingContext2D, W: number, H: number, pal: Palette, spacingMs: number): View {
  const ui = useTiming.getState();
  const n = ring.length;
  const last = n ? ring.timeAt(n - 1) : 0;
  const tEnd = ui.viewEnd ?? last;
  const tStart = tEnd - ui.windowMs;
  const x0 = GUTTER;
  const w = Math.max(10, W - GUTTER - PAD_R);
  const X = (tt: number) => x0 + ((tt - tStart) / ui.windowMs) * w;
  const rows = layoutRows();
  const board = currentBoard();
  const adcMax = board.rules.adcMaxMv || 3300;

  ctx.fillStyle = pal.panel;
  ctx.fillRect(0, 0, W, H);

  // time axis (board clock)
  ctx.fillStyle = pal.chrome;
  ctx.fillRect(0, 0, W, AXIS_H);
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.dim;
  ctx.fillText(t('board time'), 8, AXIS_H / 2);
  const step = niceStep((ui.windowMs / w) * 110);
  const decimals = Math.max(0, Math.min(3, Math.ceil(-Math.log10(step / 1000))));
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 1;
  for (let tt = Math.ceil(tStart / step) * step; tt <= tEnd; tt += step) {
    const x = Math.round(X(tt)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, AXIS_H - 5);
    ctx.lineTo(x, H);
    ctx.globalAlpha = 0.45;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(`${(tt / 1000).toFixed(decimals)} s`, x + 3, AXIS_H / 2);
  }

  const iFrom = Math.max(0, ring.indexAtOrBefore(tStart));
  const iTo = Math.min(n - 1, ring.indexAtOrBefore(tEnd) + 1);
  const pxPerSample = spacingMs > 0 ? (spacingMs / ui.windowMs) * w : 0;

  for (const row of rows) {
    const { top, h } = row;
    // row background, selection and separator
    if (row.kind === 'pin' && row.gpio === ui.selected) {
      ctx.fillStyle = alpha(pal.raised, 0.55);
      ctx.fillRect(0, top, W, h);
    }
    if (row.kind === 'i2c') {
      ctx.fillStyle = alpha(pal.chrome, 0.6);
      ctx.fillRect(0, top, W, h);
    }
    ctx.strokeStyle = pal.line;
    ctx.beginPath();
    ctx.moveTo(0, top + h - 0.5);
    ctx.lineTo(W, top + h - 0.5);
    ctx.stroke();

    if (row.kind === 'i2c') {
      drawI2cLane(ctx, row, pal, x0, w, X, tStart, tEnd, rows);
      continue;
    }

    const g = row.gpio;
    const meta = ring.meta.get(g);
    const color = pal.role[rowRole(g)];
    // gutter labels
    ctx.fillStyle = color;
    ctx.fillRect(8, top + 9, 4, h - 18);
    ctx.fillStyle = pal.text;
    ctx.font = '600 12px "IBM Plex Sans", sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(pinName(g), 18, top + 16);
    ctx.fillStyle = pal.dim;
    ctx.font = '10px "IBM Plex Mono", monospace';
    const roleText = ROLE_TEXT[rowRole(g)];
    ctx.fillText(`GPIO ${g}${roleText ? ` · ${roleText}` : ''}`, 18, top + 29);
    const latest = n ? ring.valueAt(g, n - 1) : NaN;
    if (!Number.isNaN(latest)) {
      ctx.fillStyle = pal.muted;
      ctx.textAlign = 'right';
      ctx.fillText(meta?.analog ? `${Math.round(latest)} mV` : String(latest), GUTTER - 8, top + 16);
      ctx.textAlign = 'left';
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, top, w, h);
    ctx.clip();

    if (meta?.mode === 'uart' && Number.isNaN(latest)) {
      ctx.fillStyle = pal.dim;
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('Serial pin: not sampled by the agent.'), x0 + 8, top + h / 2);
      ctx.restore();
      continue;
    }

    const analog = !!meta?.analog;
    const yOf = (v: number) => (analog ? top + h - 8 - (Math.max(0, Math.min(adcMax, v)) / adcMax) * (h - 16) : v >= 0.5 ? top + 8 : top + h - 10);
    const base = analog ? top + h - 8 : top + h - 10;

    // Walk the samples: contiguous runs become polylines; long silences become "no samples" gaps.
    const runs: [number, number][][] = [];
    const edgeWindows: [number, number][] = [];
    const gaps: [number, number][] = [];
    const dots: [number, number][] = [];
    let run: [number, number][] = [];
    let pT = NaN;
    let pV = NaN;
    for (let i = iFrom; i <= iTo; i++) {
      const v = ring.valueAt(g, i);
      if (Number.isNaN(v)) continue;
      const tt = ring.timeAt(i);
      const x = X(tt);
      const y = yOf(v);
      if (!Number.isNaN(pT) && isGap(tt - pT, spacingMs)) {
        gaps.push([X(pT), x]);
        if (run.length) runs.push(run);
        run = [];
      } else if (!Number.isNaN(pT) && !analog && (pV >= 0.5) !== (v >= 0.5)) {
        // The edge is somewhere between the two samples: a slope across that window, never a vertical line.
        edgeWindows.push([X(pT), x]);
      }
      run.push([x, y]);
      dots.push([x, y]);
      pT = tt;
      pV = v;
    }
    if (run.length) runs.push(run);

    ctx.fillStyle = alpha(color, 0.1);
    for (const [a, b] of edgeWindows) if (b - a >= 3) ctx.fillRect(a, top + 4, b - a, h - 10);
    for (const r of runs) {
      if (r.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(r[0][0], r[0][1]);
      for (const [x, y] of r.slice(1)) ctx.lineTo(x, y);
      ctx.lineTo(r[r.length - 1][0], base);
      ctx.lineTo(r[0][0], base);
      ctx.closePath();
      ctx.fillStyle = alpha(color, analog ? 0.1 : 0.14);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r[0][0], r[0][1]);
      for (const [x, y] of r.slice(1)) ctx.lineTo(x, y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    if (pxPerSample >= 6 || runs.some((r) => r.length === 1)) {
      ctx.fillStyle = color;
      for (const [x, y] of dots) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const [a, b] of gaps) {
      ctx.fillStyle = alpha(pal.dim, 0.1);
      ctx.fillRect(a, top + 4, b - a, h - 10);
      if (b - a > 70) {
        ctx.fillStyle = pal.dim;
        ctx.font = '10px "IBM Plex Sans", sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('no samples'), a + 6, top + h / 2);
      }
    }
    if (analog) {
      ctx.fillStyle = pal.dim;
      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(`${adcMax} mV`, x0 + 4, top + 3);
    }
    // PWM the agent reports as faster than the sampling: say plainly what the dots are.
    const rate = spacingMs > 0 ? 1000 / spacingMs : 0;
    if (meta?.mode === 'pwm' && meta.pwmHz && rate && meta.pwmHz > rate / 2) {
      const msg = t('PWM at {hz} is faster than the sampling: these are snapshots, not the real waveform.', { hz: formatHz(meta.pwmHz) });
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(msg).width;
      ctx.fillStyle = alpha(pal.panel, 0.85);
      ctx.fillRect(x0 + 6, top + h / 2 - 9, tw + 12, 18);
      ctx.fillStyle = pal.warn;
      ctx.fillText(msg, x0 + 12, top + h / 2);
    }
    ctx.restore();
  }

  // cursors
  const cur: [number | null, string, string][] = [
    [ui.cursorA, 'A', pal.ai],
    [ui.cursorB, 'B', pal.text],
  ];
  if (ui.cursorA !== null && ui.cursorB !== null) {
    const a = X(Math.min(ui.cursorA, ui.cursorB));
    const b = X(Math.max(ui.cursorA, ui.cursorB));
    ctx.fillStyle = alpha(pal.ai, 0.07);
    ctx.fillRect(Math.max(x0, a), AXIS_H, Math.min(x0 + w, b) - Math.max(x0, a), H - AXIS_H);
  }
  for (const [ct, name, c] of cur) {
    if (ct === null) continue;
    const x = Math.round(X(ct)) + 0.5;
    if (x < x0 || x > x0 + w) continue;
    ctx.strokeStyle = c;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, AXIS_H);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = c;
    ctx.fillRect(x - 7, 3, 14, AXIS_H - 6);
    ctx.fillStyle = pal.chrome;
    ctx.font = '600 10px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(name, x, AXIS_H / 2);
    ctx.textAlign = 'left';
  }

  // gutter divider
  ctx.strokeStyle = pal.line;
  ctx.beginPath();
  ctx.moveTo(x0 - 0.5, AXIS_H);
  ctx.lineTo(x0 - 0.5, H);
  ctx.stroke();

  return { tStart, tEnd, x0, w, rows };
}

function drawI2cLane(
  ctx: CanvasRenderingContext2D,
  row: Extract<Row, { kind: 'i2c' }>,
  pal: Palette,
  x0: number,
  w: number,
  X: (tt: number) => number,
  tStart: number,
  tEnd: number,
  rows: Row[],
) {
  const { top, h, trace } = row;
  ctx.fillStyle = pal.ai;
  ctx.fillRect(8, top + 8, 4, h - 16);
  ctx.fillStyle = pal.text;
  ctx.font = '600 12px "IBM Plex Sans", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(t('I2C decoded'), 18, top + 15);
  ctx.fillStyle = pal.dim;
  ctx.font = '10px "IBM Plex Sans", sans-serif';
  ctx.fillText(t('agent trace, not sampled'), 18, top + 27);

  // Marker: about when the reply arrived, across the SDA/SCL rows (only if it is in view).
  if (trace.boardT !== null && trace.boardT >= tStart && trace.boardT <= tEnd) {
    const x = Math.round(X(trace.boardT)) + 0.5;
    const busRows = rows.filter((r) => r.kind === 'pin' && (r.gpio === trace.ev.sda || r.gpio === trace.ev.scl));
    const y0 = Math.min(top, ...busRows.map((r) => r.top));
    ctx.strokeStyle = pal.ai;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y0 + 2);
    ctx.lineTo(x, top + h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, top, w, h);
  ctx.clip();
  ctx.textBaseline = 'middle';
  const boxes = i2cBoxes(trace.ev.trace);
  // Compact boxes when the whole transaction would not fit at the normal size.
  ctx.font = '11px "IBM Plex Mono", monospace';
  let pad = 14;
  let gap = 4;
  const total = boxes.reduce((s, b) => s + ctx.measureText(b.text).width + pad + gap, 0);
  if (total > w - 16) {
    ctx.font = '10px "IBM Plex Mono", monospace';
    pad = 10;
    gap = 2;
  }
  const yMid = top + h / 2;
  if (!boxes.length) {
    ctx.fillStyle = pal.dim;
    ctx.fillText(t('The last I2C command returned no steps (no device answered).'), x0 + 8, yMid);
  }
  let x = x0 + 8;
  const right = x0 + w - 8;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const bw = ctx.measureText(b.text).width + pad;
    if (x + bw > right - 20) {
      ctx.fillStyle = pal.dim;
      ctx.fillText('…', x + 2, yMid);
      break;
    }
    const nack = b.ack === false && !b.expectedNack;
    const edge = b.kind === 'addr' ? pal.role.sda : b.kind === 'data' ? pal.role.scl : pal.dim;
    const border = nack ? pal.warn : edge;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (b.kind === 'addr' || b.kind === 'data') {
      // bus-analyser style hexagon box
      ctx.moveTo(x + 5, yMid - 9);
      ctx.lineTo(x + bw - 5, yMid - 9);
      ctx.lineTo(x + bw, yMid);
      ctx.lineTo(x + bw - 5, yMid + 9);
      ctx.lineTo(x + 5, yMid + 9);
      ctx.lineTo(x, yMid);
      ctx.closePath();
    } else ctx.rect(x + 0.5, yMid - 8.5, bw - 1, 17);
    // opaque first, so the reply marker line does not run through the text
    ctx.fillStyle = pal.chrome;
    ctx.fill();
    ctx.fillStyle = alpha(border, 0.14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = nack ? pal.warn : pal.text;
    ctx.fillText(b.text, x + pad / 2, yMid + 0.5);
    x += bw + gap;
  }
  ctx.restore();
}

/* ---------------- component ---------------- */

interface Readout {
  empty: boolean;
  hz: number | null;
  spacingMs: number | null;
  measure: DigitalMeasure | { ok: false; reason: 'analog' } | null;
  between: boolean;
  anyAnalog: boolean;
  hasTrace: boolean;
  rowLabel: string;
}

const EMPTY_READOUT: Readout = { empty: true, hz: null, spacingMs: null, measure: null, between: false, anyAnalog: false, hasTrace: false, rowLabel: '' };

function computeReadout(): Readout {
  const n = ring.length;
  if (!n && !lastTrace) return EMPTY_READOUT;
  const stats = sampleStats(ring.allTimes(Math.max(0, n - 200)));
  const ui = useTiming.getState();
  const between = ui.cursorA !== null && ui.cursorB !== null;
  let measure: Readout['measure'] = null;
  let rowLabel = '';
  if (ui.selected !== null && ring.pins().includes(ui.selected)) {
    const g = ui.selected;
    rowLabel = `${pinName(g)} (GPIO ${g})`;
    if (ring.meta.get(g)?.analog) measure = { ok: false, reason: 'analog' };
    else {
      const last = ring.timeAt(n - 1);
      const tEnd = ui.viewEnd ?? last;
      const from = between ? Math.min(ui.cursorA as number, ui.cursorB as number) : tEnd - ui.windowMs;
      const to = between ? Math.max(ui.cursorA as number, ui.cursorB as number) : tEnd;
      const s = ring.slice(g, Math.max(0, ring.indexAtOrBefore(from)), ring.indexAtOrBefore(to) + 1);
      measure = measureDigital(s.times, s.values, from, to);
    }
  }
  return {
    empty: false,
    hz: stats?.hz ?? null,
    spacingMs: stats?.spacingMs ?? null,
    measure,
    between,
    anyAnalog: ring.pins().some((g) => ring.meta.get(g)?.analog),
    hasTrace: !!lastTrace,
    rowLabel,
  };
}

function rateCaption(r: Readout) {
  if (r.hz === null || r.spacingMs === null) return t('Waiting for at least two samples to measure the sample rate.');
  return t('Sampled at {hz}: pulses shorter than {ms} can be missed.', { hz: formatHz(r.hz), ms: formatMs(r.spacingMs) });
}

function MeasureText({ r }: { r: Readout }) {
  const m = r.measure;
  if (!m) return <span className="dim">{t('Click a row name to measure its period, frequency and duty cycle.')}</span>;
  const where = r.between ? t('Between the cursors on {pin}:', { pin: r.rowLabel }) : t('Over the visible window on {pin}:', { pin: r.rowLabel });
  if (!m.ok) {
    const why =
      m.reason === 'analog'
        ? t('This row is a measured voltage (ADC). Period and duty cycle need a digital row.')
        : m.reason === 'no_samples'
          ? t('No samples in this range.')
          : m.reason === 'too_fast'
            ? t('A level lasted only one sample, so the signal may change faster than the sampling can show. No period is given.')
            : t('Not enough edges: a full cycle needs 3 edges and {n} were seen. Nothing is guessed.', { n: m.edges });
    return (
      <span>
        <b>{where}</b> <span className="timing-refuse">{why}</span>
      </span>
    );
  }
  const hzErr = (m.hz * m.periodErrMs) / m.periodMs;
  return (
    <span className="timing-values">
      <b>{where}</b>
      <span>
        {t('Period')} <i className="mono">{formatMs(m.periodMs)} ± {formatMs(m.periodErrMs)}</i>
      </span>
      <span>
        {t('Frequency')} <i className="mono">{formatHz(m.hz)} ± {formatHz(hzErr)}</i>
      </span>
      <span>
        {t('Duty cycle')} <i className="mono">{Math.round(m.duty * 100)}% ± {Math.max(1, Math.round(m.dutyErr * 100))}%</i>
      </span>
      <span className="dim small">{t('from {n} sampled edges ({cycles} full cycles)', { n: m.edges, cycles: m.cycles })}</span>
    </span>
  );
}

export function TimingPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const dragRef = useRef<'A' | 'B' | null>(null);
  const [readout, setReadout] = useState<Readout>(EMPTY_READOUT);
  const ui = useTiming();
  const globalPaused = useLive((s) => s.paused);

  // One animation loop: redraw only when data, view or size changed; readout at most 4×/s.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const pal = readPalette();
    let raf = 0;
    let drawn = '';
    let lastReadout = 0;
    let readoutKey = '';
    let spacing = 50;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - lastReadout > 250) {
        lastReadout = now;
        const r = computeReadout();
        if (r.spacingMs) spacing = r.spacingMs;
        const k = JSON.stringify(r);
        if (k !== readoutKey) {
          readoutKey = k;
          setReadout(r);
        }
      }
      const s = useTiming.getState();
      const W = wrap.clientWidth;
      const rows = layoutRows();
      const H = rowsHeight(rows);
      const dpr = window.devicePixelRatio || 1;
      const key = `${ring.version}|${traceVersion}|${W}|${H}|${dpr}|${s.windowMs}|${s.viewEnd}|${s.selected}|${s.cursorA}|${s.cursorB}|${spacing}`;
      if (key === drawn || W <= 0) return;
      drawn = key;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.height = `${H}px`;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      viewRef.current = drawTiming(ctx, W, H, pal, spacing);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Wheel: zoom (around the mouse when paused); shift+wheel or sideways: pan (pauses the view).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      if (!v || !ring.length) return;
      e.preventDefault();
      const s = useTiming.getState();
      const rect = canvas.getBoundingClientRect();
      const fx = Math.max(0, Math.min(1, (e.clientX - rect.left - v.x0) / v.w));
      const last = ring.timeAt(ring.length - 1);
      const pan = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (pan) {
        const d = ((e.shiftKey ? e.deltaY : e.deltaX) / v.w) * s.windowMs;
        s.set({ paused: true, viewEnd: Math.min(last, Math.max(ring.timeAt(0) + s.windowMs * 0.1, v.tEnd + d)) });
        return;
      }
      const win = Math.max(MIN_WINDOW, Math.min(MAX_WINDOW, s.windowMs * (e.deltaY > 0 ? 1.25 : 0.8)));
      if (s.viewEnd === null) s.set({ windowMs: win });
      else {
        const tm = v.tStart + fx * s.windowMs;
        s.set({ windowMs: win, viewEnd: Math.min(last, tm - fx * win + win) });
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const timeAtClientX = (clientX: number) => {
    const v = viewRef.current;
    const canvas = canvasRef.current;
    if (!v || !canvas) return null;
    const x = clientX - canvas.getBoundingClientRect().left;
    return { x, tt: v.tStart + ((x - v.x0) / v.w) * (v.tEnd - v.tStart) };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const v = viewRef.current;
    const p = timeAtClientX(e.clientX);
    if (!v || !p) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const s = useTiming.getState();
    if (p.x < v.x0) {
      // Row names: choose the row to measure.
      const row = v.rows.find((r) => y >= r.top && y < r.top + r.h);
      if (row?.kind === 'pin') s.set({ selected: row.gpio === s.selected ? null : row.gpio });
      return;
    }
    if (!ring.length) return;
    const near = (ct: number | null) => ct !== null && Math.abs(v.x0 + ((ct - v.tStart) / (v.tEnd - v.tStart)) * v.w - p.x) < 7;
    let which: 'A' | 'B';
    if (near(s.cursorA)) which = 'A';
    else if (near(s.cursorB)) which = 'B';
    else if (s.cursorA === null) which = 'A';
    else if (s.cursorB === null) which = 'B';
    else which = Math.abs((s.cursorA as number) - p.tt) <= Math.abs((s.cursorB as number) - p.tt) ? 'A' : 'B';
    // A live view keeps moving; cursors are placed on the board clock, so freeze the view first.
    s.set({ paused: true, viewEnd: v.tEnd, ...(which === 'A' ? { cursorA: p.tt } : { cursorB: p.tt }) });
    dragRef.current = which;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const which = dragRef.current;
    const v = viewRef.current;
    const p = timeAtClientX(e.clientX);
    if (!which || !v || !p) return;
    const tt = Math.max(v.tStart, Math.min(v.tEnd, p.tt));
    useTiming.getState().set(which === 'A' ? { cursorA: tt } : { cursorB: tt });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const zoom = (f: number) => {
    const s = useTiming.getState();
    const win = Math.max(MIN_WINDOW, Math.min(MAX_WINDOW, s.windowMs * f));
    s.set({ windowMs: win, viewEnd: s.viewEnd === null ? null : s.viewEnd - s.windowMs / 2 + win / 2 });
  };
  const showAll = () => {
    if (ring.length < 2) return;
    const span = ring.timeAt(ring.length - 1) - ring.timeAt(0);
    useTiming.getState().set({ windowMs: Math.max(MIN_WINDOW, Math.min(MAX_WINDOW, span)), viewEnd: ui.paused ? ring.timeAt(ring.length - 1) : null });
  };
  const togglePause = () => (ui.paused ? ui.set({ paused: false, viewEnd: null }) : ui.set({ paused: true, viewEnd: ring.length ? ring.timeAt(ring.length - 1) : null }));

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const exportPng = async () => {
    const src = canvasRef.current;
    if (!src || !src.width) return;
    const dpr = window.devicePixelRatio || 1;
    const capH = Math.round(24 * dpr);
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height + capH;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    const pal = readPalette();
    ctx.fillStyle = pal.chrome;
    ctx.fillRect(0, 0, out.width, capH);
    ctx.fillStyle = pal.muted;
    ctx.font = `${Math.round(11 * dpr)}px "IBM Plex Sans", sans-serif`;
    ctx.textBaseline = 'middle';
    const caption =
      readout.hz !== null && readout.spacingMs !== null
        ? t('BoardPilot timing. Sampled at {hz} (board clock): pulses shorter than {ms} can be missed. The I2C lane is decoded by the agent, not sampled.', {
            hz: formatHz(readout.hz),
            ms: formatMs(readout.spacingMs),
          })
        : t('BoardPilot timing (sampled).');
    ctx.fillText(caption, 8 * dpr, capH / 2);
    ctx.drawImage(src, 0, capH);
    const r = await window.bp.session.savePng(`boardpilot-timing-${stamp()}.png`, out.toDataURL('image/png'));
    if (r.ok) log('info', t('Timing picture saved to {path}.', { path: r.value }));
    else if (r.error.code !== 'cancelled') log('failed', `${r.error.humanMessage} ${r.error.hint}`);
  };
  const exportCsv = async () => {
    if (!ring.length) return;
    const csv = ring.toCsv((g, m) => `${pinName(g)} (GPIO ${g}) ${m?.analog ? 'mV' : 'level'}`);
    const r = await window.bp.session.saveFile(`boardpilot-timing-${stamp()}.csv`, csv);
    if (r.ok) log('info', t('Timing samples saved to {path}.', { path: r.value }));
  };

  const dt = ui.cursorA !== null && ui.cursorB !== null ? Math.abs(ui.cursorB - ui.cursorA) : null;
  const paused = ui.paused || globalPaused;

  return (
    <div className="card timing-card">
      <div className="card-title timing-title">
        {t('Timing')}
        <span className="timing-badge">{t('sampled')}</span>
        <span className="small dim timing-rate">{rateCaption(readout)}</span>
      </div>
      <div className="timing-bar">
        {globalPaused ? (
          <span className="small dim">{t('Paused with the Monitor’s Pause button.')}</span>
        ) : (
          <button className={`btn small ${paused ? 'on' : ''}`} onClick={togglePause}>
            {paused ? t('Resume') : t('Pause')}
          </button>
        )}
        <div className="seg">
          <button onClick={() => zoom(1.5)} title={t('Zoom out')} aria-label={t('Zoom out')}>
            −
          </button>
          <button disabled title={t('Time shown on screen')}>
            <span className="mono">{formatMs(ui.windowMs)}</span>
          </button>
          <button onClick={() => zoom(1 / 1.5)} title={t('Zoom in')} aria-label={t('Zoom in')}>
            +
          </button>
          <button onClick={showAll}>{t('Show all')}</button>
        </div>
        <button className="link small" disabled={ui.cursorA === null && ui.cursorB === null} onClick={() => ui.set({ cursorA: null, cursorB: null })}>
          {t('Clear cursors')}
        </button>
        <span className="timing-spacer" />
        <button className="btn small" disabled={readout.empty} onClick={exportPng}>
          {t('Export PNG')}
        </button>
        <button className="btn small" disabled={readout.empty} onClick={exportCsv}>
          {t('Export CSV')}
        </button>
        <button
          className="link small"
          onClick={() => {
            ring.clear();
            ui.set({ cursorA: null, cursorB: null, viewEnd: null });
          }}
        >
          {t('Clear samples')}
        </button>
      </div>
      <div ref={wrapRef} className="timing-wrap">
        {readout.empty && <div className="empty">{t('No samples yet. Press “Stream live pins” above to see the pins over time.')}</div>}
        <canvas
          ref={canvasRef}
          className="timing-canvas"
          style={{ display: readout.empty ? 'none' : 'block' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      {!readout.empty && (
        <div className="timing-foot">
          <div className="timing-cursors">
            {ui.cursorA === null && ui.cursorB === null ? (
              <span className="dim">{t('Click the waveform to place cursor A, then B. Drag a cursor to move it. Wheel to zoom, Shift+wheel to scroll.')}</span>
            ) : (
              <span className="mono">
                {ui.cursorA !== null && <span className="cur-a">A {fmtBoardT(ui.cursorA)}</span>}
                {ui.cursorB !== null && <span className="cur-b">B {fmtBoardT(ui.cursorB)}</span>}
                {dt !== null && dt > 0 && (
                  <span>
                    Δt {formatMs(dt)} ({formatHz(1000 / dt)}){readout.spacingMs !== null && ` ${t('± one sample ({ms})', { ms: formatMs(readout.spacingMs) })}`}
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="timing-measure">
            <MeasureText r={readout} />
          </div>
          <div className="small dim timing-notes">
            {t('Edges are drawn as slopes across the time between two samples: the real edge is somewhere in there.')}
            {readout.anyAnalog && ` ${t('Analog pins (ADC) show their measured voltage as a line, not as levels.')}`}
            {readout.hasTrace && ` ${t('The I2C lane is the agent’s decoded transaction, in order but not to time scale; the dotted line marks about when its reply arrived.')}`}
          </div>
        </div>
      )}
    </div>
  );
}
