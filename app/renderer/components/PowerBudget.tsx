// Power budget and battery life (shared/power): datasheet currents for the board and every part,
// the user's own duty cycle and battery, and which devices use the most. Parts without a
// datasheet figure are listed as unknown, never guessed.

import { useMemo, useState } from 'react';
import { PARTS, getBoard } from '@shared/board';
import { estimatePower, fmtDuration, powerRows } from '@shared/power';
import { t } from '@shared/i18n';
import { useScene } from '../state/store';

const fmtMa = (ma: number) => (ma >= 1 ? `${Math.round(ma * 10) / 10} mA` : ma >= 0.001 ? `${Math.round(ma * 1000 * 10) / 10} µA` : `${Math.round(ma * 1e6)} nA`);

export function PowerBudget() {
  const scene = useScene((s) => s.scene);
  const [awakeMs, setAwakeMs] = useState(2000);
  const [periodS, setPeriodS] = useState(600);
  const [batteryMah, setBatteryMah] = useState(2000);
  const rows = useMemo(() => powerRows(scene, getBoard(scene.board), PARTS), [scene]);
  const est = useMemo(() => estimatePower(rows, { awakeMs, periodS, batteryMah }), [rows, awakeMs, periodS, batteryMah]);
  const life = fmtDuration(est.hours);
  const unit = { hours: t('hours'), days: t('days'), months: t('months'), years: t('years') }[life.unit];
  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return (
    <div className="power">
      <div className="power-inputs">
        <label>
          {t('Awake for (ms)')}
          <input type="number" min={0} value={awakeMs} onChange={(e) => setAwakeMs(num(e.target.value, awakeMs))} />
        </label>
        <label>
          {t('Wakes up every (s, 0 = always on)')}
          <input type="number" min={0} value={periodS} onChange={(e) => setPeriodS(num(e.target.value, periodS))} />
        </label>
        <label>
          {t('Battery (mAh)')}
          <input type="number" min={0} value={batteryMah} onChange={(e) => setBatteryMah(num(e.target.value, batteryMah))} />
        </label>
      </div>
      <table className="bom-table">
        <thead>
          <tr>
            <th>{t('Device')}</th>
            <th>{t('Awake')}</th>
            <th>{t('Asleep')}</th>
            <th>{t('Peak')}</th>
          </tr>
        </thead>
        <tbody>
          {est.rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.name}
                {r.note && <div className="small dim">{t(r.note)}</div>}
                {r.source && <div className="small dim src">{t('Source: {source}', { source: r.source })}</div>}
              </td>
              <td className="mono">{fmtMa(r.awakeMa ?? 0)}</td>
              <td className="mono">{r.sleepMa !== undefined ? fmtMa(r.sleepMa) : <span title={t('No sleep figure: counted as awake.')}>{fmtMa(r.awakeMa ?? 0)}*</span>}</td>
              <td className="mono">{r.peakMa !== undefined ? fmtMa(r.peakMa) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {est.unknown.length > 0 && (
        <div className="small warn-text">
          {t('No datasheet current for: {names}. They are left out, so the real battery life is shorter.', { names: est.unknown.map((r) => r.name).join(', ') })}
        </div>
      )}
      <div className="power-result">
        <div>
          <span className="dim small">{t('Average current')}</span>
          <b className="mono">{fmtMa(est.averageMa)}</b>
        </div>
        <div>
          <span className="dim small">{t('Peak (all at once)')}</span>
          <b className="mono">{fmtMa(est.peakMa)}</b>
        </div>
        <div>
          <span className="dim small">{t('Battery life, about')}</span>
          <b className="mono">{Number.isFinite(life.n) ? `${life.n} ${unit}` : '∞'}</b>
        </div>
      </div>
      {est.biggest.length > 0 && est.averageMa > 0 && (
        <div className="small">
          {t('Uses the most: {list}.', { list: est.biggest.map((b) => `${b.row.name} ${Math.round(b.share * 100)}%`).join(', ') })}
        </div>
      )}
      <div className="small dim">
        {t('Estimate from datasheet figures, not a measurement. Battery self-discharge, regulator losses and the cut-off voltage make real life shorter.')}
        {' '}
        {t('* marks a device without a sleep figure: it is counted at its awake current.')}
      </div>
    </div>
  );
}
