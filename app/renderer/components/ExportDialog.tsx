// Export PDF: the project's electrical design as a drawing set (shared/drawingSet.ts). Pick the
// sheets, the symbol standard, the paper and the title block; the preview shows each sheet as it
// will print; open warnings are named before you export.

import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { PARTS, getBoard } from '@shared/board';
import { buildDrawingSet, PAPER_MM, type PaperSize, type SheetId } from '@shared/drawingSet';
import type { SymbolStyle } from '@shared/schematic';
import { t } from '@shared/i18n';
import { log, useLog, useScene } from '../state/store';
import { useCodeFindings } from '../state/code';
import { tabName, useProjects } from '../state/projects';

const useExport = create<{ open: boolean; set(open: boolean): void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openExport = () => useExport.getState().set(true);

const KEY = 'bp.export';
interface Saved {
  paper: PaperSize;
  symbols: SymbolStyle;
  drawnBy: string;
}
function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>;
    return {
      paper: v.paper && v.paper in PAPER_MM ? v.paper : 'A4',
      symbols: v.symbols === 'ansi' ? 'ansi' : 'iec',
      drawnBy: typeof v.drawnBy === 'string' ? v.drawnBy : '',
    };
  } catch {
    return { paper: 'A4', symbols: 'iec', drawnBy: '' };
  }
}

const SHEET_LABEL: Record<SheetId, string> = {
  schematic: 'Schematic',
  wiring: 'Wiring diagram and pin map',
  bom: 'Bill of materials',
  checks: 'Checks, power budget, measurements',
  code: 'Source code listing',
};
const MM_PX = 96 / 25.4;

export function ExportDialog() {
  const open = useExport((s) => s.open);
  if (!open) return null;
  return <ExportBody />;
}

function ExportBody() {
  const saved = useMemo(load, []);
  const scene = useScene((s) => s.scene);
  const findings = useScene((s) => s.findings);
  const codeFindings = useCodeFindings();
  const log_ = useLog((s) => s.entries);
  const active = useProjects((s) => s.tabs.find((x) => x.id === s.active));
  const hasCode = !!scene.sketch?.text.trim();
  const [paper, setPaper] = useState<PaperSize>(saved.paper);
  const [symbols, setSymbols] = useState<SymbolStyle>(saved.symbols);
  const [drawnBy, setDrawnBy] = useState(saved.drawnBy);
  const [project, setProject] = useState(active ? tabName(active) : t('Untitled'));
  const [revision, setRevision] = useState('A');
  const [sheets, setSheets] = useState<SheetId[]>(['schematic', 'wiring', 'bom', 'checks']);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [version, setVersion] = useState('');
  const close = () => useExport.getState().set(false);
  useEffect(() => {
    void window.bp.session.info().then((i) => setVersion(i.version));
  }, []);

  const set = useMemo(
    () =>
      buildDrawingSet(
        { scene, board: getBoard(scene.board), parts: PARTS, findings, codeFindings, log: log_, version },
        { paper, symbols, sheets, project, drawnBy, date: new Date().toISOString().slice(0, 10), revision },
      ),
    [scene, findings, codeFindings, log_, paper, symbols, sheets, project, drawnBy, revision, version],
  );
  const [wMm, hMm] = PAPER_MM[paper];

  // Fit one sheet into the preview box.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min((el.clientWidth - 40) / (wMm * MM_PX), (el.clientHeight - 40) / (hMm * MM_PX)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wMm, hMm]);
  useEffect(() => {
    frame.current?.contentWindow?.scrollTo(0, page * hMm * MM_PX);
  }, [page, hMm, set.html]);
  useEffect(() => {
    if (page >= set.sheets.length) setPage(Math.max(0, set.sheets.length - 1));
  }, [set.sheets.length, page]);

  const openWarnings = findings.filter((f) => f.severity !== 'info').length + codeFindings.filter((f) => f.severity !== 'info').length;

  const save = async () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ paper, symbols, drawnBy }));
    } catch {
      /* not remembered */
    }
    setBusy(true);
    const name = `${project.replace(/[\\/:*?"<>|]+/g, '').trim() || 'BoardPilot'} - electrical design`;
    const r = await window.bp.session.exportPdf(set.html, name, paper);
    setBusy(false);
    if (!r.ok) {
      if (r.error.code !== 'cancelled') log('failed', `${t(r.error.humanMessage)} ${t(r.error.hint)}`);
      return;
    }
    log('action', t('Drawing set saved: {n} sheets, {paper} → {path}', { n: set.sheets.length, paper, path: r.value }), { source: 'export PDF' });
    close();
  };

  const toggle = (id: SheetId) => setSheets((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...(['schematic', 'wiring', 'bom', 'checks', 'code'] as SheetId[]).filter((x) => x === id || s.includes(x))]));

  return (
    <div className="modal-back ex-back" onClick={close}>
      <div className="ex" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('Electrical design (PDF)')}>
        <aside className="ex-side">
          <div className="row between">
            <h2>{t('Electrical design (PDF)')}</h2>
            <button className="close" onClick={close} aria-label={t('Close')}>
              ×
            </button>
          </div>
          <p className="muted">{t('A technical drawing set of this project, ready to print or send to someone who builds or checks it.')}</p>
          <div className="label">{t('Sheets')}</div>
          {(['schematic', 'wiring', 'bom', 'checks', 'code'] as SheetId[]).map((id, i) => (
            <label key={id} className={`ex-check ${id === 'code' && !hasCode ? 'dim' : ''}`}>
              <input type="checkbox" checked={sheets.includes(id)} disabled={id === 'code' && !hasCode} onChange={() => toggle(id)} /> {i + 1} · {t(SHEET_LABEL[id])}
            </label>
          ))}
          <div className="label">{t('Symbols')}</div>
          <div className="seg">
            <button className={symbols === 'iec' ? 'on' : ''} onClick={() => setSymbols('iec')}>
              IEC 60617
            </button>
            <button className={symbols === 'ansi' ? 'on' : ''} onClick={() => setSymbols('ansi')}>
              ANSI / IEEE 315
            </button>
          </div>
          <div className="label">{t('Paper')}</div>
          <div className="seg">
            {(Object.keys(PAPER_MM) as PaperSize[]).map((p) => (
              <button key={p} className={paper === p ? 'on' : ''} onClick={() => setPaper(p)}>
                {p}
              </button>
            ))}
          </div>
          <div className="label">{t('Title block')}</div>
          <label className="ex-field">
            <span>{t('Project')}</span>
            <input className="text-in" value={project} onChange={(e) => setProject(e.target.value)} />
          </label>
          <label className="ex-field">
            <span>{t('Drawn by')}</span>
            <input className="text-in" value={drawnBy} placeholder={t('Your name')} onChange={(e) => setDrawnBy(e.target.value)} />
          </label>
          <label className="ex-field">
            <span>{t('Revision')}</span>
            <input className="text-in" value={revision} onChange={(e) => setRevision(e.target.value.slice(0, 8))} />
          </label>
          {openWarnings > 0 && (
            <div className="ex-warn">
              ✦ <b>{t('Before you export:')}</b> {openWarnings === 1 ? t('1 open warning.') : t('{n} open warnings.', { n: openWarnings })} {t('They are listed on the checks sheet.')}{' '}
              <button className="link" onClick={close}>
                {t('Fix them first')}
              </button>
            </div>
          )}
          <span className="grow" />
          <div className="row gap ex-actions">
            <button className="btn" onClick={close}>
              {t('Cancel')}
            </button>
            <button className="btn primary grow" disabled={busy || !set.sheets.length} onClick={save}>
              {busy ? <span className="spinner sm" /> : null} {set.sheets.length === 1 ? t('Save PDF · 1 sheet') : t('Save PDF · {n} sheets', { n: set.sheets.length })}
            </button>
          </div>
        </aside>
        <div className="ex-main">
          <div className="ex-preview" ref={box}>
            <div className="ex-paper" style={{ width: wMm * MM_PX * scale, height: hMm * MM_PX * scale }}>
              <iframe
                ref={frame}
                title={t('Preview')}
                srcDoc={set.html}
                sandbox="allow-same-origin"
                scrolling="no"
                onLoad={() => frame.current?.contentWindow?.scrollTo(0, page * hMm * MM_PX)}
                style={{ width: wMm * MM_PX, height: hMm * MM_PX, transform: `scale(${scale})` }}
              />
            </div>
          </div>
          <div className="ex-thumbs">
            {set.sheets.map((title, i) => (
              <button key={i} className={`ex-thumb ${page === i ? 'on' : ''}`} onClick={() => setPage(i)} title={title}>
                <span className="ex-thumb-n">{i + 1}</span>
                <span>{title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
