// Wiring diagram view: the project drawn flat (shared/diagram), clickable like the 3D view, with
// SVG export. Findings from the wiring checker sit on the pin or wire they are about.

import { useMemo, useRef } from 'react';
import type { BoardDef, TargetRef } from '@shared/types';
import { PARTS } from '@shared/board';
import { diagramToSvg, sceneToDiagram, type DiagramBlock } from '@shared/diagram';
import { t } from '@shared/i18n';
import { log, useScene } from '../state/store';

const SEV = { error: 'var(--err)', warning: 'var(--warn)', info: 'var(--pin-sda)' } as const;

function Block({ b, side, hot, onPick }: { b: DiagramBlock; side: 'left' | 'right'; hot: (t: TargetRef) => boolean; onPick: (t: TargetRef) => void }) {
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={8} className={`dg-block ${hot(b.target) ? 'hot' : ''}`} onClick={() => onPick(b.target)} />
      <text x={b.x + 12} y={b.y + 20} className="dg-title">
        {b.title}
      </text>
      <text x={b.x + 12} y={b.y + 35} className="dg-sub">
        {b.sub.length > 30 ? `${b.sub.slice(0, 29)}…` : b.sub}
      </text>
      {b.pins.map((p) => (
        <g key={p.id} onClick={() => onPick(p.target)} className="dg-pin">
          <circle cx={p.x} cy={p.y} r={4.5} fill={p.color} className={hot(p.target) ? 'hot' : ''} />
          <text x={side === 'right' ? p.x - 10 : p.x + 10} y={p.y + 4} textAnchor={side === 'right' ? 'end' : 'start'} className="dg-pin-label">
            {p.label}
          </text>
        </g>
      ))}
    </g>
  );
}

export function DiagramView({ board }: { board: BoardDef }) {
  const scene = useScene((s) => s.scene);
  const findings = useScene((s) => s.findings);
  const selected = useScene((s) => s.selected);
  const highlight = useScene((s) => s.highlight);
  const svg = useRef<SVGSVGElement>(null);
  const d = useMemo(() => sceneToDiagram(scene, board, PARTS, findings), [scene, board, findings]);
  const hot = (tg: TargetRef) => selected === tg || highlight.includes(tg);
  const pick = (tg: TargetRef) => useScene.getState().select(tg);

  const exportSvg = async () => {
    const r = await window.bp.session.saveFile('wiring-diagram.svg', diagramToSvg(d));
    if (r.ok) log('info', t('Wiring diagram saved to {path}.', { path: r.value }));
  };

  if (!scene.wires.length) {
    return <div className="dg-empty small dim">{t('No wires yet. Add parts and wires (or start from a template) and the diagram draws itself.')}</div>;
  }
  return (
    <div className="dg-wrap">
      <svg ref={svg} className="diagram" viewBox={`0 0 ${d.width} ${d.height}`} width={d.width} height={d.height}>
        {d.wires.map((w) => (
          <g key={w.id} onClick={() => pick(w.target)} className="dg-wire">
            <polyline points={w.points.map((p) => p.join(',')).join(' ')} stroke="transparent" strokeWidth={10} fill="none" />
            <polyline points={w.points.map((p) => p.join(',')).join(' ')} stroke={w.color} strokeWidth={hot(w.target) ? 3.5 : 2} fill="none" strokeLinejoin="round" opacity={selected?.startsWith('wire:') && !hot(w.target) ? 0.3 : 1} />
          </g>
        ))}
        <Block b={d.board} side="right" hot={hot} onPick={pick} />
        {d.gaps.map((y, i) => (
          <text key={i} x={d.board.x + d.board.w - 10} y={y} textAnchor="end" className="dg-gap">
            ⋮
          </text>
        ))}
        {d.parts.map((b) => (
          <Block key={b.id} b={b} side="left" hot={hot} onPick={pick} />
        ))}
        {d.marks.map((m, i) => (
          <g key={i} onClick={() => useScene.getState().focusOn(m.targets)} className="dg-mark">
            <title>{m.text}</title>
            <circle cx={m.x} cy={m.y} r={8} fill={SEV[m.severity]} />
            <text x={m.x} y={m.y + 4} textAnchor="middle" className="dg-mark-text">
              !
            </text>
          </g>
        ))}
      </svg>
      <button className="btn small dg-export" onClick={exportSvg}>
        {t('Save as SVG…')}
      </button>
    </div>
  );
}
