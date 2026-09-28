// Flat pinout view: the same board file drawn as a 2D diagram, for people who prefer it.

import type { BoardDef, TargetRef } from '@shared/types';
import { ROLE_HEX, pinPositionMm, pinRoleInScene, rectToMm } from '@shared/board';
import { useLive, useScene } from '../state/store';

const S = 12; // px per mm
const PAD_X = 40;
const PAD_Y = 150;

export function PinoutView2D({ board }: { board: BoardDef }) {
  const scene = useScene((s) => s.scene);
  const selected = useScene((s) => s.selected);
  const highlight = useScene((s) => s.highlight);
  const findings = useScene((s) => s.findings);
  const frame = useLive((s) => s.frame);
  const { length, width } = board.pcbMm;
  const W = length * S + PAD_X * 2;
  const H = width * S + PAD_Y * 2;
  const toX = (mmX: number) => PAD_X + (mmX + length / 2) * S;
  const toY = (mmZ: number) => PAD_Y + (mmZ + width / 2) * S;

  return (
    <svg className="pinout2d" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <rect x={PAD_X} y={PAD_Y} width={length * S} height={width * S} rx={10} fill="var(--pcb)" stroke="#3d5a80" />
      {board.components.map((c, i) => {
        const r = rectToMm(board, c.rect);
        const fill = c.type === 'module' ? '#2a3a2e' : c.type === 'usb' ? 'var(--shield)' : c.type === 'led' ? (c.label === 'PWR' ? '#ff4d4d' : '#4da3ff') : '#15181c';
        return (
          <g key={i}>
            <rect x={toX(r.cx - r.w / 2)} y={toY(r.cz - r.h / 2)} width={r.w * S} height={r.h * S} rx={3} fill={fill} opacity={0.95} />
            {c.label && c.type !== 'led' && (
              <text x={toX(r.cx)} y={toY(r.cz) + 4} textAnchor="middle" className="svg-comp-label">
                {c.label}
              </text>
            )}
          </g>
        );
      })}
      {board.pins.map((p) => {
        const [x, , z] = pinPositionMm(board, p);
        const cx = toX(x);
        const cy = toY(z);
        const role = pinRoleInScene(board, scene, p.id);
        const color = ROLE_HEX[role];
        const t: TargetRef = `pin:${p.id}`;
        const live = p.gpio !== null ? frame?.pins[String(p.gpio)] : undefined;
        const high = live?.level === 1 || (live?.mode === 'pwm' && (live.duty ?? 0) > 0);
        const f = findings.find((x) => x.targets.includes(t));
        const out = p.row === 'front' ? 1 : -1;
        const fn = p.functions.filter((x) => x !== 'GPIO')[0];
        return (
          <g key={p.id} className="svg-pin" onClick={() => useScene.getState().select(t)}>
            <circle cx={cx} cy={cy} r={11} fill={high ? color : 'var(--chrome)'} stroke={color} strokeWidth={3} />
            {(selected === t || highlight.includes(t)) && <circle cx={cx} cy={cy} r={16} fill="none" stroke={highlight.includes(t) ? 'var(--ai)' : '#fff'} strokeWidth={2} />}
            {f && <circle cx={cx + 9} cy={cy - 9 * out} r={5} fill={f.severity === 'error' ? 'var(--err)' : 'var(--warn)'} />}
            <g transform={`translate(${cx}, ${cy + out * 22}) rotate(-90)`}>
              <text x={out === 1 ? -4 : 4} y={5} textAnchor={out === 1 ? 'end' : 'start'} className="svg-pin-label">
                {p.label}
                {p.gpio !== null && p.label !== `D${p.gpio}` ? ` · ${p.gpio}` : ''}
              </text>
              {fn && (
                <text x={out === 1 ? -52 : 52} y={5} textAnchor={out === 1 ? 'end' : 'start'} className="svg-pin-fn">
                  {fn.replace(/_default$/, '')}
                </text>
              )}
            </g>
            {live?.mv !== undefined && (
              <text x={cx} y={cy + 4} textAnchor="middle" className="svg-pin-mv">
                {(live.mv / 1000).toFixed(1)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
