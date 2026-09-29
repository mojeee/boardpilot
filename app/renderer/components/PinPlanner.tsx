// Pin planner (New project): say what the project needs, get pins picked from the board's rules
// with the reason for each, see them on the 3D board, copy the #defines.

import { useMemo, useState } from 'react';
import { getBoard, isEspFamily, ROLE_HEX, pinBaseRole } from '@shared/board';
import { planPins, planToMarkdown, type PlanRequest } from '@shared/planner';
import type { TargetRef } from '@shared/types';
import { t } from '@shared/i18n';
import { log, useScene } from '../state/store';

const NEEDS: { key: keyof Omit<PlanRequest, 'wifi'>; label: string; max: number }[] = [
  { key: 'i2c', label: 'I2C bus', max: 1 },
  { key: 'spi', label: 'SPI devices', max: 4 },
  { key: 'uart', label: 'Serial ports', max: 2 },
  { key: 'adc', label: 'Analog inputs', max: 8 },
  { key: 'pwm', label: 'PWM outputs', max: 8 },
  { key: 'out', label: 'Digital outputs', max: 12 },
  { key: 'in', label: 'Digital inputs', max: 12 },
];

export function PinPlanner() {
  const scene = useScene((s) => s.scene);
  const board = getBoard(scene.board);
  const [req, setReq] = useState<PlanRequest>({ i2c: 1, spi: 0, uart: 0, adc: 1, pwm: 1, out: 1, in: 1, wifi: false });
  const plan = useMemo(() => planPins(board, req, scene), [board, req, scene]);
  const targets = plan.pins.map((p) => `pin:${p.pin.id}` as TargetRef);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plan.defines);
      log('info', t('Pin #defines copied.'));
    } catch {
      log('failed', t('Could not copy. Save the pin map instead.'));
    }
  };
  const save = async () => {
    const r = await window.bp.session.saveFile('pin-plan.md', planToMarkdown(board, plan));
    if (r.ok) log('info', t('Pin plan saved to {path}.', { path: r.value }));
  };

  return (
    <div className="planner">
      <div className="planner-needs">
        {NEEDS.map((n) => (
          <label key={n.key} className="planner-need small">
            <span>{t(n.label)}</span>
            <input
              type="number"
              min={0}
              max={n.max}
              value={req[n.key]}
              onChange={(e) => setReq({ ...req, [n.key]: Math.max(0, Math.min(n.max, Number(e.target.value) || 0)) })}
              className="text-in mono"
            />
          </label>
        ))}
        {isEspFamily(board) && board.rules.adcWifiConflict && (
          <label className="planner-need small">
            <span>{t('Wi-Fi on')}</span>
            <input type="checkbox" checked={!!req.wifi} onChange={(e) => setReq({ ...req, wifi: e.target.checked })} />
          </label>
        )}
      </div>
      {plan.pins.length > 0 && (
        <table className="bom-table">
          <tbody>
            {plan.pins.map((p) => (
              <tr key={p.name} onClick={() => useScene.getState().focusOn([`pin:${p.pin.id}`])} className="planner-row">
                <td className="mono">{p.need}</td>
                <td className="mono">
                  <span className="swatch" style={{ background: ROLE_HEX[pinBaseRole(p.pin)] }} /> {p.pin.label}
                </td>
                <td className="small dim">{p.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {plan.problems.map((x) => (
        <p key={x} className="card-note gotcha small">
          {x}
        </p>
      ))}
      <div className="row gap wrap">
        <button className="btn small" disabled={!targets.length} onClick={() => useScene.getState().focusOn(targets)}>
          {t('Show on the board')}
        </button>
        <button className="btn small ghost" disabled={!plan.pins.length} onClick={copy}>
          {t('Copy #defines')}
        </button>
        <button className="btn small ghost" disabled={!plan.pins.length} onClick={save}>
          {t('Save pin map…')}
        </button>
      </div>
      <p className="small dim">{t('Pins come from the board file’s rules; pins already wired in the project are left alone.')}</p>
    </div>
  );
}
