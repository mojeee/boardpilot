// "Export PDF": the project's electrical design as a technical drawing set, one HTML document with
// one page per sheet, printed to PDF by the app (Electron printToPDF) or the browser. Generated only
// from the scene, the board and part files, the checks and this session's log:
//   1 schematic (IEC 60617 or ANSI symbols), 2 wiring diagram and pin map, 3 bill of materials,
//   4 checks, power budget and measurements, 5 (optional) code listing.
// Every sheet has a frame, notes with the datasheet sources, and a title block (project, drawn
// by, date, revision, sheet n of m). Pure (no DOM), so it is unit-tested.

import type { BoardDef, LogEntry, PartDef, Scene, WiringFinding } from './types';
import type { CodeFinding } from './codeCheck';
import { pinById } from './board';
import { sceneToSchematic, schematicToSvg, type SymbolStyle } from './schematic';
import { diagramToSvg, sceneToDiagram } from './diagram';
import { billOfMaterials } from './bom';
import { powerRows } from './power';
import { t } from './i18n';

export type PaperSize = 'A4' | 'A3' | 'Letter' | 'Tabloid';

/** Landscape sheet sizes in mm (ISO 216 and ANSI Y14.1). */
export const PAPER_MM: Record<PaperSize, [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  Letter: [279.4, 215.9],
  Tabloid: [431.8, 279.4],
};

export type SheetId = 'schematic' | 'wiring' | 'bom' | 'checks' | 'code';
export const SHEET_IDS: SheetId[] = ['schematic', 'wiring', 'bom', 'checks', 'code'];

export interface DrawingSetOptions {
  paper: PaperSize;
  symbols: SymbolStyle;
  /** which sheets, in this order (the code listing only when the project has code) */
  sheets: SheetId[];
  project: string;
  drawnBy: string;
  /** ISO date, e.g. 2026-09-29 */
  date: string;
  revision: string;
}

export interface DrawingSetInput {
  scene: Scene;
  board: BoardDef;
  parts: Record<string, PartDef>;
  findings: WiringFinding[];
  codeFindings: CodeFinding[];
  /** this session's log; the entries with a "measured" source go on sheet 4 */
  log: LogEntry[];
  /** app version, printed in the title block */
  version?: string;
}

export interface DrawingSet {
  html: string;
  /** the titles of the sheets, in order */
  sheets: string[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- screen colours → paper ---------- */

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.length === 4 ? h.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3').slice(1) : h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/**
 * The same drawing for white paper: dark backgrounds become white or light grey, light grey text
 * becomes dark grey, and the role colours that are too pale on white are darkened.
 */
export function paperColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  if (sat < 0.18) {
    if (lum < 0.12) return '#ffffff';
    if (lum < 0.3) return '#eef1f4';
    // grey text and lines: the lighter they were on screen, the darker on paper
    const v = Math.round(255 * (1 - lum) * 0.55);
    return toHex(v, v + 4, v + 10);
  }
  if (lum < 0.2) return toHex(r + (255 - r) * 0.85, g + (255 - g) * 0.85, b + (255 - b) * 0.85);
  if (lum > 0.62) return toHex(r * 0.55, g * 0.55, b * 0.55);
  if (lum > 0.45) return toHex(r * 0.75, g * 0.75, b * 0.75);
  return hex;
}

export function toPaper(svg: string): string {
  return svg
    .replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (h) => paperColor(h))
    .replace(/<svg([^>]*?)\swidth="[\d.]+"\sheight="[\d.]+"/, '<svg$1 width="100%" height="100%" preserveAspectRatio="xMidYMid meet"');
}

/* ---------- sheets ---------- */

interface SheetContent {
  id: SheetId;
  title: string;
  body: string;
}

function table(head: string[], rows: string[][], cls = ''): string {
  return `<table class="${cls}"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

function pinMap(inp: DrawingSetInput): string {
  const { scene, board, parts } = inp;
  const rows = scene.wires
    .map((w) => {
      const boardEnd = w.from.part === 'board' ? w.from : w.to.part === 'board' ? w.to : null;
      const partEnd = w.from.part === 'board' ? w.to : w.from;
      if (!boardEnd) return null;
      const pin = pinById(board, boardEnd.pin);
      const inst = scene.parts.find((p) => p.id === partEnd.part);
      const def = inst ? parts[inst.partId] : undefined;
      const role = def?.pins.find((p) => p.name === partEnd.pin)?.role ?? '';
      return {
        order: pin?.index ?? 0,
        cells: [
          `<b>${esc(pin?.label ?? boardEnd.pin)}</b>`,
          esc(pin?.gpio !== null && pin?.gpio !== undefined ? String(pin.gpio) : '–'),
          esc(`${inst?.label ?? def?.name ?? partEnd.part} · ${partEnd.pin}`),
          esc(role.replace(/_/g, ' ')),
          `<span class="sw" style="background:${paperColor(w.color)}"></span>`,
        ],
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (!rows.length) return `<p class="muted">${esc(t('No wires in the drawing yet.'))}</p>`;
  return table([t('Board pin'), 'GPIO', t('To'), t('Role'), t('Wire')], rows.map((r) => r.cells), 'pinmap');
}

/** mA for the power table: 0.0036 stays readable, sums get one decimal. */
const ma = (n: number) => (n === 0 ? '0' : n < 1 ? String(Number(n.toPrecision(2))) : String(Math.round(n * 10) / 10));

function checksSheet(inp: DrawingSetInput): string {
  const open = [
    ...inp.findings.filter((f) => f.severity !== 'info').map((f) => ({ sev: f.severity, text: `${f.message} ${f.hint}`, src: f.source ?? t('wiring check of the drawing') })),
    ...inp.codeFindings.filter((f) => f.severity !== 'info').map((f) => ({ sev: f.severity, text: `${f.message} ${f.hint}`, src: f.line ? t('code check · line {line}', { line: f.line }) : t('code check') })),
  ];
  const checks = open.length
    ? table(
        ['', t('Open warning'), t('Source')],
        open.map((o) => [`<span class="sev ${o.sev}">${o.sev === 'error' ? '✕' : '!'}</span>`, esc(o.text), `<span class="muted">${esc(o.src)}</span>`]),
        'checks',
      )
    : `<p>${esc(t('No open warnings: the wiring and code checks found nothing to fix.'))}</p>`;
  const power = powerRows(inp.scene, inp.board, inp.parts);
  const known = power.filter((r) => r.awakeMa !== undefined);
  const powerTable = table(
    [t('Consumer'), t('Typical mA'), t('Peak mA'), t('Source')],
    [
      ...power.map((r) => [esc(r.name), r.awakeMa !== undefined ? ma(r.awakeMa) : `<span class="muted">${esc(t('unknown'))}</span>`, r.peakMa !== undefined ? ma(r.peakMa) : '–', `<span class="muted">${esc(r.source || '–')}</span>`]),
      [`<b>${esc(t('Total (known parts)'))}</b>`, `<b>${ma(known.reduce((a, r) => a + (r.awakeMa ?? 0), 0))}</b>`, `<b>${ma(known.reduce((a, r) => a + (r.peakMa ?? r.awakeMa ?? 0), 0))}</b>`, ''],
    ],
    'power',
  );
  const measured = inp.log.filter((e) => e.source?.startsWith('measured')).slice(-24);
  const meas = measured.length
    ? table(
        [t('Time'), t('Measurement'), t('Source')],
        measured.map((e) => [esc(new Date(e.t).toLocaleTimeString([], { hour12: false })), esc(e.text), `<span class="muted">${esc(e.source ?? '')}</span>`]),
        'meas',
      )
    : `<p class="muted">${esc(t('No measurements in this session. Connect the board and run Test or Debug to add them.'))}</p>`;
  return `<div class="cols2"><div><h3>${esc(t('Checks'))}</h3>${checks}<h3>${esc(t('Power budget'))}</h3>${powerTable}</div><div><h3>${esc(t('Measurements from this session'))}</h3>${meas}</div></div>`;
}

function codeSheets(inp: DrawingSetInput, perSheet: number): SheetContent[] {
  const sk = inp.scene.sketch;
  if (!sk?.text.trim()) return [];
  const lines = sk.text.split('\n');
  const out: SheetContent[] = [];
  for (let i = 0; i < lines.length; i += perSheet) {
    const chunk = lines.slice(i, i + perSheet);
    const body = `<pre class="code">${chunk.map((l, j) => `<span class="ln">${String(i + j + 1).padStart(4)}</span> ${esc(l)}`).join('\n')}</pre>`;
    out.push({ id: 'code', title: `${t('Code listing')} · ${sk.name}${lines.length > perSheet ? ` (${Math.floor(i / perSheet) + 1})` : ''}`, body });
  }
  return out;
}

/** Datasheets and library entries the drawing relies on, for the notes of every sheet. */
function sourceNotes(inp: DrawingSetInput): string[] {
  const out = new Set<string>();
  out.add(`${inp.board.name}: ${inp.board.rules.datasheet}`);
  for (const s of inp.board.sources ?? []) out.add(s.section ? `${s.title}, ${s.section}` : s.title);
  for (const id of new Set(inp.scene.parts.map((p) => p.partId))) {
    const def = inp.parts[id];
    for (const s of def?.sources ?? []) out.add(`${def.name}: ${s.section ? `${s.title}, ${s.section}` : s.title}`);
  }
  return [...out];
}

const CSS = (w: number, h: number, paper: PaperSize) => `
@page { size: ${paper} landscape; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #1b2027; font-family: 'IBM Plex Sans', Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { position: relative; width: ${w}mm; height: ${h}mm; padding: 7mm; page-break-after: always; break-after: page; overflow: hidden; }
.zx, .zy { position: absolute; display: flex; font-size: 6pt; color: #6b7580; }
.zx { left: 7mm; right: 7mm; top: 1.8mm; height: 4mm; }
.zy { top: 7mm; bottom: 7mm; left: 1.8mm; width: 4mm; flex-direction: column; }
.zx span, .zy span { flex: 1; display: flex; align-items: center; justify-content: center; }
.zx span + span { border-left: 0.2mm solid #c9ced4; }
.zy span + span { border-top: 0.2mm solid #c9ced4; }
.sheet:last-child { page-break-after: auto; break-after: auto; }
.frame { width: 100%; height: 100%; border: 0.6mm solid #1b2027; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
.content { padding: 4mm 5mm; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 2mm; }
.content h2 { margin: 0; font-size: 12pt; }
.content h3 { margin: 2mm 0 1mm; font-size: 9.5pt; }
.fig { flex: 1; min-height: 0; display: flex; }
.fig svg { width: 100%; height: 100%; }
.split { flex: 1; min-height: 0; display: grid; grid-template-columns: 1.4fr 1fr; gap: 5mm; }
.split > div { min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; font-size: 7.5pt; }
table { border-collapse: collapse; width: 100%; font-size: 7.5pt; }
th { text-align: left; font-weight: 600; border-bottom: 0.35mm solid #1b2027; padding: 1mm 1.5mm; }
td { border-bottom: 0.2mm solid #c9ced4; padding: 0.9mm 1.5mm; vertical-align: top; }
.sw { display: inline-block; width: 8mm; height: 2mm; border-radius: 1mm; vertical-align: middle; }
.muted { color: #6b7580; }
.sev { font-weight: 700; }
.sev.error { color: #c62d24; }
.sev.warning { color: #b36b00; }
pre.code { margin: 0; font-family: 'IBM Plex Mono', Menlo, monospace; font-size: 6.6pt; line-height: 1.35; column-count: 2; column-gap: 8mm; column-rule: 0.2mm solid #c9ced4; white-space: pre-wrap; word-break: break-all; }
pre.code .ln { color: #8a96a3; }
.bottom { display: grid; grid-template-columns: minmax(0, 1fr) 100mm; border-top: 0.5mm solid #1b2027; min-height: 25mm; }
.notes { padding: 1.5mm 3mm; font-size: 6.4pt; line-height: 1.35; color: #3d4650; border-right: 0.5mm solid #1b2027; overflow: hidden; }
.notes b { color: #1b2027; }
.tb { display: grid; grid-template-columns: 1fr 1fr 1fr; font-size: 6.6pt; }
.tb > div { border-bottom: 0.25mm solid #1b2027; border-right: 0.25mm solid #1b2027; padding: 0.8mm 1.6mm; min-width: 0; overflow: hidden; }
.tb > div:nth-child(3n) { border-right: none; }
.tb .k { display: block; color: #6b7580; font-size: 5.4pt; text-transform: uppercase; letter-spacing: 0.04em; }
.tb .v { font-weight: 600; font-size: 7.6pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.tb .wide { grid-column: span 3; border-right: none; }
.tb .wide .v { font-size: 9.5pt; }
.tb .brand .v { font-size: 8pt; }
.tb > div:nth-last-child(-n+3) { border-bottom: none; }
`;

/** The whole drawing set as one printable HTML document. */
export function buildDrawingSet(inp: DrawingSetInput, opts: DrawingSetOptions): DrawingSet {
  const [w, h] = PAPER_MM[opts.paper];
  const small = opts.paper === 'A4' || opts.paper === 'Letter';
  const findings = inp.findings;
  const sch = toPaper(schematicToSvg(sceneToSchematic(inp.scene, inp.board, inp.parts, findings, { symbols: opts.symbols })));
  const dia = toPaper(diagramToSvg(sceneToDiagram(inp.scene, inp.board, inp.parts, findings)));
  const bom = billOfMaterials(inp.scene, inp.board, inp.parts);
  const all: SheetContent[] = [
    {
      id: 'schematic',
      title: t('Schematic'),
      body: `<div class="fig">${sch}</div><p class="muted" style="margin:0;font-size:6.6pt">${esc(
        opts.symbols === 'iec' ? t('Symbols: IEC 60617. Dashed parts are suggested by the checks, not in the drawing.') : t('Symbols: ANSI/IEEE 315. Dashed parts are suggested by the checks, not in the drawing.'),
      )}</p>`,
    },
    {
      id: 'wiring',
      title: t('Wiring diagram and pin map'),
      body: `<div class="split"><div class="fig">${dia}</div><div><h3>${esc(t('Pin map'))}</h3>${pinMap(inp)}</div></div>`,
    },
    {
      id: 'bom',
      title: t('Bill of materials'),
      body: table(
        [t('Qty'), t('Item'), t('Details'), t('Why it is needed')],
        bom.map((r) => [String(r.qty), `<b>${esc(r.item)}</b>`, esc(r.detail), `<span class="muted">${esc(r.why)}</span>`]),
        'bom',
      ),
    },
    { id: 'checks', title: t('Checks, power budget and measurements'), body: checksSheet(inp) },
    ...(opts.sheets.includes('code') ? codeSheets(inp, small ? 110 : 150) : []),
  ];
  const sheets = all.filter((s) => opts.sheets.includes(s.id));
  const notes = sourceNotes(inp);
  const openWarnings = findings.filter((f) => f.severity !== 'info').length + inp.codeFindings.filter((f) => f.severity !== 'info').length;
  const html = sheets
    .map((s, i) => {
      const tb = [
        `<div class="wide"><span class="k">${esc(t('Project'))}</span><span class="v">${esc(opts.project || t('Untitled'))}</span></div>`,
        `<div class="wide"><span class="k">${esc(t('Sheet title'))}</span><span class="v">${esc(s.title)}</span></div>`,
        `<div><span class="k">${esc(t('Board'))}</span><span class="v">${esc(inp.board.name)}</span></div>`,
        `<div><span class="k">${esc(t('Drawn by'))}</span><span class="v">${esc(opts.drawnBy || '–')}</span></div>`,
        `<div><span class="k">${esc(t('Date'))}</span><span class="v">${esc(opts.date)}</span></div>`,
        `<div><span class="k">${esc(t('Revision'))}</span><span class="v">${esc(opts.revision || 'A')}</span></div>`,
        `<div><span class="k">${esc(t('Sheet'))}</span><span class="v">${esc(t('{n} of {m}', { n: i + 1, m: sheets.length }))}</span></div>`,
        `<div class="brand"><span class="k">${esc(t('Paper'))}</span><span class="v">${esc(opts.paper)}</span></div>`,
      ].join('');
      const noteHtml = [
        `<b>${esc(t('Notes'))}</b>`,
        openWarnings ? esc(t('{n} open warnings: see the checks sheet.', { n: openWarnings })) : esc(t('No open warnings.')),
        esc(t('Generated by BoardPilot {version} from the drawing; not a manufacturing drawing. Verify pins and voltages against the datasheets:', { version: inp.version ?? '' })),
        ...notes.slice(0, small ? 5 : 8).map((n) => `· ${esc(n)}`),
      ].join('<br>');
      const zonesX = Array.from({ length: small ? 6 : 8 }, (_, k) => `<span>${k + 1}</span>`).join('');
      const zonesY = Array.from({ length: 4 }, (_, k) => `<span>${'ABCD'[k]}</span>`).join('');
      return `<section class="sheet"><div class="zx">${zonesX}</div><div class="zy">${zonesY}</div><div class="frame"><div class="content"><h2>${esc(s.title)}</h2>${s.body}</div><div class="bottom"><div class="notes">${noteHtml}</div><div class="tb">${tb}</div></div></div></section>`;
    })
    .join('\n');
  return {
    sheets: sheets.map((s) => s.title),
    html: `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.project || 'BoardPilot')}</title><style>${CSS(w, h, opts.paper)}</style></head><body>${html}</body></html>`,
  };
}
