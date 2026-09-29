// Parser for BoardPilotProbe lines printed by the user's own firmware:
//   @bp {"t":123,"v":{"temperature":22.4},"pins":{"temperature":21}}
//   @bp {"t":123,"mem":{"heapFree":201344,"heapMin":190000}}

import type { ProbeFrame } from './types';

export const PROBE_PREFIX = '@bp ';

export function parseProbeLine(line: string): ProbeFrame | null {
  const i = line.indexOf(PROBE_PREFIX);
  if (i < 0) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(line.slice(i + PROBE_PREFIX.length));
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const frame: ProbeFrame = { t: typeof o.t === 'number' ? o.t : 0 };
  const nums = (x: unknown): Record<string, number> | undefined => {
    if (typeof x !== 'object' || x === null) return undefined;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(x)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    return Object.keys(out).length ? out : undefined;
  };
  frame.values = nums(o.v);
  frame.pins = nums(o.pins);
  const mem = nums(o.mem);
  if (mem && typeof mem.heapFree === 'number') {
    frame.mem = { heapFree: mem.heapFree, heapMin: mem.heapMin, heapSize: mem.heapSize, stackFree: mem.stackFree };
  }
  for (const k of ['step', 'state', 'event'] as const) if (typeof o[k] === 'string' && o[k]) frame[k] = String(o[k]).slice(0, 80);
  if (!frame.values && !frame.mem && !frame.step && !frame.state && !frame.event) return null;
  return frame;
}

/** Share of printable characters; low values mean the baud rate is probably wrong. */
export function printableRatio(lines: string[]): number {
  const text = lines.join('');
  if (!text.length) return 1;
  let good = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if ((c >= 32 && c < 127) || c === 9) good++;
  }
  return good / text.length;
}
