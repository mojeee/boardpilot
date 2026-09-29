// Report: a summary of this session (board, findings, what was measured, the fix), exported as
// Markdown and PDF with a 3D snapshot.

import { useMemo, useState } from 'react';
import { PARTS, getBoard, targetLabel } from '@shared/board';
import { diagramToSvg, sceneToDiagram } from '@shared/diagram';
import type { ResultData } from '@shared/flow';
import { useAi, useApp, useLog, useScene, log } from '../state/store';
import { useWizard } from '../wizard/session';
import { Viewport } from '../three/Viewport';
import { BomTable } from '../components/BomTable';
import { billOfMaterials, bomToMarkdown } from '@shared/bom';
import { t, getLanguage } from '@shared/i18n';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function buildMarkdown(snapshot: string | null, result: ResultData | undefined) {
  const conn = useApp.getState().conn;
  const { scene, findings } = useScene.getState();
  const board = getBoard(scene.board);
  const entries = useLog.getState().entries.filter((e) => e.type !== 'info');
  const ai = useAi.getState().items;
  const locale = getLanguage() === 'it' ? 'it-IT' : undefined;
  const L: string[] = [];
  L.push(`# ${t('BoardPilot session report')}`, '', t('Date: {date}', { date: new Date().toLocaleString(locale) }));
  L.push(
    conn.chip
      ? t('Board: {chip}, {flash} flash, MAC {mac} on {port}', { chip: conn.chip.chip, flash: conn.chip.flashSize, mac: conn.chip.mac, port: conn.port ?? '' })
      : t('Board: not connected'),
  );
  if (conn.mode === 'sim') L.push('', `> **${t('Simulated session.')}** ${t('No real hardware was used; all measurements come from the simulator scenario.')}`);
  if (result) {
    L.push('', `## ${t('Result: {title}', { title: result.title })}`, '', `*${t('Confidence: {level}', { level: t(result.confidence) })}*`, '', result.cause, '');
    if (result.evidence.length) {
      L.push(`### ${t('Evidence')}`, '');
      for (const e of result.evidence) L.push(`- ${e.text} _(${e.source})_`);
    }
    if (result.nextSteps.length) {
      L.push('', `### ${t('Fix / next steps')}`, '');
      result.nextSteps.forEach((s, i) => L.push(`${i + 1}. ${s}`));
    }
    if (result.sources.length) L.push('', t('Sources: {list}', { list: result.sources.join('; ') }));
  }
  if (snapshot) L.push('', `## ${t('3D snapshot')}`, '', `![${t('3D view')}](${snapshot})`);
  if (scene.wires.length) {
    // The wiring diagram, generated from the project (same drawing as the Diagram view).
    const svg = diagramToSvg(sceneToDiagram(scene, board, PARTS, findings));
    L.push('', `## ${t('Wiring diagram')}`, '', `![${t('Wiring diagram')}](data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))})`);
  }
  L.push('', `## ${t('Wiring check')}`, '');
  if (!findings.length) L.push(t('No rule found a problem in the wiring drawing.'));
  for (const f of findings) L.push(`- **${t(f.severity)}**: ${f.message} ${f.hint}${f.source ? ` _(${f.source})_` : ''}`);
  if (scene.parts.length) L.push('', `## ${t('Shopping list')}`, '', bomToMarkdown(billOfMaterials(scene, board, PARTS)));
  L.push('', `## ${t('Project')}`, '', `| ${t('Part')} | ${t('Model')} |`, '|---|---|');
  for (const p of scene.parts)
    L.push(`| ${p.label ?? p.id} | ${PARTS[p.partId]?.name ?? p.partId}${p.confirmed === false ? ` (${t('unconfirmed suggestion')})` : ''} |`);
  L.push('', `| ${t('Wire')} | ${t('From')} | ${t('To')} |`, '|---|---|---|');
  for (const w of scene.wires) {
    const end = (e: { part: string; pin: string }) => (e.part === 'board' ? targetLabel(board, scene, `pin:${e.pin}`) : `${scene.parts.find((p) => p.id === e.part)?.label ?? e.part} ${e.pin}`);
    L.push(`| ${w.id} | ${end(w.from)} | ${end(w.to)} |`);
  }
  L.push('', `## ${t('Session log')}`, '');
  for (const e of entries) L.push(`- \`${new Date(e.t).toLocaleTimeString(locale ? [locale] : [], { hour12: false })}\` **${t(e.type)}** ${e.text}${e.source ? ` _(${e.source})_` : ''}`);
  const qa = ai.filter((i) => i.role !== 'error');
  if (qa.length) {
    L.push('', `## ${t('Assistant')}`, '');
    for (const i of qa) {
      if (i.role === 'user') L.push(`**${t('Q:')}** ${i.text}`, '');
      else if (i.role === 'assistant') {
        L.push(`**${t('A')}** _(${t(i.reply.confidence)})_: ${i.reply.message}`, '');
        if (i.reply.sources.length) L.push(t('Sources: {list}', { list: i.reply.sources.map((s) => `${s.kind}: ${s.label}`).join('; ') }), '');
      }
    }
  }
  return L.join('\n');
}

function mdToHtml(md: string) {
  // Small Markdown subset: headings, lists, tables, bold/italic, images, quotes.
  const out: string[] = [];
  let inList = false;
  let inTable = false;
  for (const raw of md.split('\n')) {
    let line = esc(raw)
      .replace(/!\[([^\]]*)\]\((data:[^)]+)\)/g, '<img alt="$1" src="$2"/>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/_\(([^)]+)\)_/g, '<i class="src">($1)</i>')
      .replace(/\*([^*]+)\*/g, '<i>$1</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    if (raw.startsWith('|')) {
      if (/^\|[-| ]+\|$/.test(raw)) continue;
      if (!inTable) out.push('<table>');
      inTable = true;
      out.push('<tr>' + line.split('|').slice(1, -1).map((c) => `<td>${c.trim()}</td>`).join('') + '</tr>');
      continue;
    } else if (inTable) {
      out.push('</table>');
      inTable = false;
    }
    if (/^(- |\d+\. )/.test(raw)) {
      if (!inList) out.push('<ul>');
      inList = true;
      out.push(`<li>${line.replace(/^(- |\d+\. )/, '')}</li>`);
      continue;
    } else if (inList) {
      out.push('</ul>');
      inList = false;
    }
    if (raw.startsWith('### ')) line = `<h3>${line.slice(4)}</h3>`;
    else if (raw.startsWith('## ')) line = `<h2>${line.slice(3)}</h2>`;
    else if (raw.startsWith('# ')) line = `<h1>${line.slice(2)}</h1>`;
    else if (raw.startsWith('&gt; ')) line = `<blockquote>${line.slice(5)}</blockquote>`;
    else if (line.trim()) line = `<p>${line}</p>`;
    out.push(line);
  }
  if (inList) out.push('</ul>');
  if (inTable) out.push('</table>');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:'IBM Plex Sans',-apple-system,sans-serif;color:#1c232b;margin:32px;font-size:12px;line-height:1.5}
h1{font-size:22px}h2{font-size:16px;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:24px}h3{font-size:13px}
table{border-collapse:collapse;margin:8px 0}td{border:1px solid #ddd;padding:3px 8px}
img{max-width:100%;border-radius:6px}.src{color:#7d8997}code{font-family:'IBM Plex Mono',monospace;color:#555}
blockquote{background:#fff6e5;border-left:3px solid #f2a93b;margin:8px 0;padding:6px 10px}
</style></head><body>${out.join('\n')}</body></html>`;
}

export function Report() {
  const result = useWizard((s) => s.state?.result);
  const findings = useScene((s) => s.findings);
  const entries = useLog((s) => s.entries);
  const conn = useApp((s) => s.conn);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const md = useMemo(() => buildMarkdown(snapshot, result), [snapshot, result, findings, entries.length, conn]);

  const capture = () => {
    const c = document.querySelector<HTMLCanvasElement>('.report-3d canvas');
    if (c) setSnapshot(c.toDataURL('image/png'));
  };

  const exportIt = async () => {
    setBusy(true);
    const r = await window.bp.session.exportReport(md, mdToHtml(md), `boardpilot-report-${new Date().toISOString().slice(0, 10)}`);
    setBusy(false);
    if (r.ok) log('info', t('Report saved: {md} and {pdf}', { md: r.value.markdownPath, pdf: r.value.pdfPath }));
    else if (r.error.code !== 'cancelled') log('failed', `${r.error.humanMessage} ${r.error.hint}`);
  };

  return (
    <div className="screen-scroll">
      <div className="screen-head row between">
        <div>
          <h2>{t('Report')}</h2>
          <p className="dim">{t('A summary of this session: what was checked, what was found, and the fix.')}</p>
        </div>
        <div className="row gap">
          <button className="btn" onClick={capture}>
            {t('Capture 3D snapshot')}
          </button>
          <button className="btn primary" disabled={busy} onClick={exportIt}>
            {t('Export Markdown + PDF…')}
          </button>
        </div>
      </div>
      <div className="report-grid">
        <div className="report-3d">
          <Viewport compact />
        </div>
        <div className="card report-bom">
          <div className="label">{t('Shopping list')}</div>
          <BomTable />
        </div>
        <div className="card report-preview">
          {snapshot && <img src={snapshot} alt={t('3D snapshot')} className="snap" />}
          <pre className="md">{md.replace(/\(data:image\/png[^)]+\)/, '(snapshot.png)').replace(/\(data:image\/svg[^)]+\)/, '(wiring-diagram.svg)')}</pre>
        </div>
      </div>
    </div>
  );
}
