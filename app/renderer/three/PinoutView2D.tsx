// Flat pinout view: the same board file drawn as a 2D diagram, for people who prefer it.

import type { BoardDef, TargetRef } from '@shared/types';
import { ROLE_HEX, pinOutward, pinPositionMm, pinRoleInScene, rectToMm } from '@shared/board';
import { useLive, useScene } from '../state/store';

const S = 12; // px per mm
const PAD = 150;

export function PinoutView2D({ board }: { board: BoardDef }) {
  const scene = useScene((s) => s.scene);
  const selected = useScene((s) => s.selected);
  const highlight = useScene((s) => s.highlight);
  const findings = useScene((s) => s.findings);
  const frame = useLive((s) => s.frame);
  const { length, width } = board.pcbMm;
  // Room for labels only on the sides that have pins pointing out.
  const sides = { l: false, r: false, t: false, b: false };
  for (const p of board.pins) {
    const [dx, dz] = pinOutward(board, p);
    if (dx < 0) sides.l = true;
    if (dx > 0) sides.r = true;
    if (dz < 0) sides.t = true;
    if (dz > 0) sides.b = true;
  }
  const padL = sides.l ? PAD : 40;
  const padR = sides.r ? PAD : 40;
  const padT = sides.t ? PAD : 40;
  const padB = sides.b ? PAD : 40;
  const W = length * S + padL + padR;
  const H = width * S + padT + padB;
  const toX = (mmX: number) => padL + (mmX + length / 2) * S;
  const toY = (mmZ: number) => padT + (mmZ + width / 2) * S;

  return (
    <svg className="pinout2d" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <rect x={padL} y={padT} width={length * S} height={width * S} rx={10} fill={board.pcbColor ?? 'var(--pcb)'} stroke="#3d5a80" />
      {board.components.map((c, i) => {
        const r = rectToMm(board, c.rect);
        const fill =
          c.color ??
          (c.type === 'module' ? '#2a3a2e' : c.type === 'usb' || c.type === 'crystal' ? 'var(--shield)' : c.type === 'antenna' ? 'var(--gold)' : c.type === 'led' ? (c.label === 'PWR' ? '#ff4d4d' : '#4da3ff') : '#15181c');
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
        const [dx, dz] = pinOutward(board, p);
        const vertical = dz !== 0;
        // Along the label: +1 when the text runs away from the pin (right or down), -1 otherwise.
        const out = vertical ? dz : dx;
        const fn = p.functions.filter((x) => x !== 'GPIO')[0];
        const suffix = p.chipPin && p.chipPin !== p.label && p.chipPin.length <= 6 ? p.chipPin : p.gpio !== null && !new RegExp(`(^|\\D)${p.gpio}$`).test(p.label) ? String(p.gpio) : '';
        return (
          <g key={p.id} className="svg-pin" onClick={() => useScene.getState().select(t)}>
            <circle cx={cx} cy={cy} r={11} fill={high ? color : 'var(--chrome)'} stroke={color} strokeWidth={3} />
            {(selected === t || highlight.includes(t)) && <circle cx={cx} cy={cy} r={16} fill="none" stroke={highlight.includes(t) ? 'var(--ai)' : '#fff'} strokeWidth={2} />}
            {f && <circle cx={cx + 9} cy={cy - 9 * out} r={5} fill={f.severity === 'error' ? 'var(--err)' : 'var(--warn)'} />}
            <g transform={vertical ? `translate(${cx}, ${cy + out * 22}) rotate(-90)` : `translate(${cx + out * 22}, ${cy})`}>
              <text x={vertical ? (out === 1 ? -4 : 4) : 0} y={5} textAnchor={vertical ? (out === 1 ? 'end' : 'start') : out === 1 ? 'start' : 'end'} className="svg-pin-label">
                {p.label}
                {suffix ? ` · ${suffix}` : ''}
              </text>
              {fn && (
                <text
                  x={vertical ? (out === 1 ? -52 : 52) : out * 80}
                  y={5}
                  textAnchor={vertical ? (out === 1 ? 'end' : 'start') : out === 1 ? 'start' : 'end'}
                  className="svg-pin-fn"
                >
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
