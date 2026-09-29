// Power budget and battery life. Uses only currents from datasheets (board.power, part.current);
// a part without data is listed as unknown, never guessed. The duty cycle is the user's own input.

import type { BoardDef, PartDef, Scene } from './types';

export interface PowerRow {
  id: string;
  name: string;
  /** mA while the device is awake, asleep, and at short peaks; undefined = no datasheet figure */
  awakeMa?: number;
  sleepMa?: number;
  peakMa?: number;
  note: string;
  source: string;
  kind: 'board' | 'part';
}

export interface PowerPlan {
  /** Awake time per wake-up, ms */
  awakeMs: number;
  /** Time between wake-ups, s (0 = always awake) */
  periodS: number;
  /** Battery capacity, mAh */
  batteryMah: number;
}

export interface PowerEstimate {
  rows: PowerRow[];
  unknown: PowerRow[];
  awakeMa: number;
  sleepMa: number;
  peakMa: number;
  /** average current over one cycle, mA */
  averageMa: number;
  /** hours on the battery (capacity / average); self-discharge and cut-off not included */
  hours: number;
  /** the rows that use the most charge over a cycle, largest first */
  biggest: { row: PowerRow; share: number }[];
}

const srcText = (s: { title: string; section?: string }) => `${s.title}${s.section ? `, ${s.section}` : ''}`;

export function powerRows(scene: Scene, board: BoardDef, parts: Record<string, PartDef>): PowerRow[] {
  const rows: PowerRow[] = [];
  const bp = board.power;
  rows.push({ id: 'board', name: board.name, awakeMa: bp?.typMa, sleepMa: bp?.sleepMa, peakMa: bp?.peakMa, note: bp?.note ?? '', source: bp ? srcText(bp.source) : '', kind: 'board' });
  for (const sp of scene.parts) {
    const def = parts[sp.partId];
    const c = def?.current;
    rows.push({ id: sp.id, name: sp.label ?? def?.name ?? sp.partId, awakeMa: c?.typMa, sleepMa: c?.sleepMa, peakMa: c?.peakMa, note: c?.note ?? '', source: c ? srcText(c.source) : '', kind: 'part' });
  }
  return rows;
}

export function estimatePower(rows: PowerRow[], plan: PowerPlan): PowerEstimate {
  const known = rows.filter((r) => r.awakeMa !== undefined);
  const unknown = rows.filter((r) => r.awakeMa === undefined);
  const awake = (r: PowerRow) => r.awakeMa ?? 0;
  // Asleep, a part without a sleep figure keeps drawing its awake current (the safe assumption).
  const asleep = (r: PowerRow) => r.sleepMa ?? r.awakeMa ?? 0;
  const awakeMa = known.reduce((a, r) => a + awake(r), 0);
  const sleepMa = known.reduce((a, r) => a + asleep(r), 0);
  const peakMa = known.reduce((a, r) => a + (r.peakMa ?? r.awakeMa ?? 0), 0);
  const cycleMs = plan.periodS > 0 ? Math.max(plan.periodS * 1000, plan.awakeMs) : plan.awakeMs || 1;
  const on = plan.periodS > 0 ? Math.min(plan.awakeMs, cycleMs) / cycleMs : 1;
  const charge = (r: PowerRow) => awake(r) * on + asleep(r) * (1 - on);
  const averageMa = known.reduce((a, r) => a + charge(r), 0);
  const hours = averageMa > 0 ? plan.batteryMah / averageMa : Infinity;
  const biggest = known
    .map((row) => ({ row, share: averageMa > 0 ? charge(row) / averageMa : 0 }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 3);
  return { rows: known, unknown, awakeMa, sleepMa, peakMa, averageMa, hours, biggest };
}

/** "3 days", "5 months", "18 h" */
export function fmtDuration(hours: number): { n: number; unit: 'hours' | 'days' | 'months' | 'years' } {
  if (!Number.isFinite(hours)) return { n: Infinity, unit: 'years' };
  if (hours < 48) return { n: Math.round(hours * 10) / 10, unit: 'hours' };
  if (hours < 24 * 60) return { n: Math.round(hours / 24), unit: 'days' };
  if (hours < 24 * 730) return { n: Math.round(hours / 24 / 30.4), unit: 'months' };
  return { n: Math.round((hours / 24 / 365) * 10) / 10, unit: 'years' };
}
