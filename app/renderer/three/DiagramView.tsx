// Diagram tab: the project drawn flat, as a wiring diagram (shared/diagram) or as a schematic
// (shared/schematic), clickable like the 3D view, with SVG export. Findings from the wiring checker
// sit on the pin or wire they are about.

import { useMemo, useRef, type MouseEvent } from 'react';
import { create } from 'zustand';
import type { BoardDef, TargetRef } from '@shared/types';
import { PARTS } from '@shared/board';
import { diagramToSvg, sceneToDiagram, type DiagramBlock } from '@shared/diagram';
import { sceneToSchematic, schematicToSvg } from '@shared/schematic';
import { t } from '@shared/i18n';
import { log, useScene } from '../state/store';
import '../styles/schematic.css';

type DiagramMode = 'wiring' | 'schematic';
const useDiagramMode = create<{ mode: DiagramMode }>(() => ({ mode: 'wiring' }));
/** Wiring diagram or schematic (also used by the #demo=…&diagram=schematic screenshots). */
export const setDiagramMode = (mode: DiagramMode) => useDiagramMode.setState({ mode });

/** Top-left bar of the Diagram tab: Wiring / Schematic switch and SVG export. */
function DiagramBar({ onExport }: { onExport: () => void }) {
  const mode = useDiagramMode((s) => s.mode);
  return (
    <div className="dg-bar">
      <div className="seg">
        <button className={mode === 'wiring' ? 'on' : ''} title={t('Parts and wires as you place them')} onClick={() => setDiagramMode('wiring')}>
          {t('Wiring')}
        </button>
        <button className={mode === 'schematic' ? 'on' : ''} title={t('The same project as a circuit drawing, with symbols')} onClick={() => setDiagramMode('schematic')}>
          {t('Schematic')}
        </button>
      </div>
      <button className="btn small" onClick={onExport}>
        {t('Save as SVG…')}
      </button>
    </div>
  );
}

function SchematicView({ board }: { board: BoardDef }) {
  const scene = useScene((s) => s.scene);
  const findings = useScene((s) => s.findings);
  const selected = useScene((s) => s.selected);
  const highlight = useScene((s) => s.highlight);
  const sch = useMemo(() => sceneToSchematic(scene, board, PARTS, findings), [scene, board, findings]);
  const svg = useMemo(() => schematicToSvg(sch, { interactive: true, hot: (tg) => selected === tg || highlight.includes(tg) }), [sch, selected, highlight]);

  // One click handler for the whole drawing: a finding badge focuses on what it is about, anything
  // else with a target selects it (pin, wire or part), like in the 3D view.
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const el = (e.target as Element).closest('[data-mark], [data-target]');
    const mark = el?.getAttribute('data-mark');
    if (mark !== null && mark !== undefined) {
      const m = sch.marks[Number(mark)];
      if (m) useScene.getState().focusOn(m.targets);
      return;
    }
    const tg = el?.getAttribute('data-target');
    if (tg) useScene.getState().select(tg as TargetRef);
  };

  const exportSvg = async () => {
    const r = await window.bp.session.saveFile('schematic.svg', schematicToSvg(sch));
    if (r.ok) log('info', t('Schematic saved to {path}.', { path: r.value }));
  };

  return (
    <div className="dg-wrap">
      <div className="sch-host" onClick={onClick} dangerouslySetInnerHTML={{ __html: svg }} />
      <DiagramBar onExport={exportSvg} />
    </div>
  );
}

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
  const mode = useDiagramMode((s) => s.mode);
  const hasWires = useScene((s) => s.scene.wires.length > 0);
  if (!hasWires) {
    return <div className="dg-empty small dim">{t('No wires yet. Add parts and wires (or start from a template) and the diagram draws itself.')}</div>;
  }
  return mode === 'schematic' ? <SchematicView board={board} /> : <WiringView board={board} />;
}

function WiringView({ board }: { board: BoardDef }) {
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
      <DiagramBar onExport={exportSvg} />
    </div>
  );
}
