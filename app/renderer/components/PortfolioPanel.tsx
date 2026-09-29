// Guided portfolio projects (shared/portfolio): build a project stage by stage, each stage with
// hints first, reference code on request, and a checkpoint checked with live data. Progress is
// remembered on this computer; the finished project exports as a GitHub README.

import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { PARTS, getBoard } from '@shared/board';
import { PORTFOLIO, portfolioReadme, portfolioTemplate, serialMissing, stageCode, stagesFor, type PortfolioStage, type StageRecord } from '@shared/portfolio';
import { templateCode, templateScene, templatePin } from '@shared/templates';
import { diagramToSvg, sceneToDiagram } from '@shared/diagram';
import { checkWiring } from '@shared/wiring';
import { t } from '@shared/i18n';
import { log, useApp, useScene } from '../state/store';
import { agent, confirmInstallAgent } from '../state/hw';
import { useWizard } from '../wizard/session';
import { openTask } from './TaskRail';

const KEY = 'bp.portfolio';
type Progress = Record<string, Record<string, StageRecord>>;
/** Stable empty value: a new {} in a store selector would re-render forever. */
const NO_PROGRESS: Record<string, StageRecord> = {};

function load(): Progress {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Progress) : {};
  } catch {
    return {};
  }
}

interface PortfolioStore {
  progress: Progress;
  /** the stage whose lab checkpoint is running */
  pending: { project: string; stage: string; flow: string } | null;
  pass(project: string, stage: string, source: string): void;
  reset(project: string): void;
}

export const usePortfolio = create<PortfolioStore>((set, get) => ({
  progress: load(),
  pending: null,
  pass: (project, stage, source) => {
    const progress = { ...get().progress, [project]: { ...get().progress[project], [stage]: { at: new Date().toISOString(), source } } };
    set({ progress });
    try {
      localStorage.setItem(KEY, JSON.stringify(progress));
    } catch {
      /* storage unavailable: progress lasts for this session only */
    }
  },
  reset: (project) => {
    const progress = { ...get().progress };
    delete progress[project];
    set({ progress });
    try {
      localStorage.setItem(KEY, JSON.stringify(progress));
    } catch {
      /* ignore */
    }
  },
}));

// A lab checkpoint that passes marks its stage done.
useWizard.subscribe((s, prev) => {
  const p = usePortfolio.getState().pending;
  if (!p || s.state?.flowId !== p.flow || s.state.status !== 'done' || prev.state?.status === 'done') return;
  if (s.state.result?.passed) {
    usePortfolio.getState().pass(p.project, p.stage, `measured: ${p.flow}`);
    log('found', t('Portfolio checkpoint passed: {stage}.', { stage: t(PORTFOLIO.find((x) => x.id === p.project)?.stages.find((x) => x.id === p.stage)?.title ?? p.stage) }));
  }
  usePortfolio.setState({ pending: null });
});

export function PortfolioPanel() {
  const scene = useScene((s) => s.scene);
  const board = getBoard(scene.board);
  const [projectId, setProjectId] = useState(PORTFOLIO[0].id);
  const project = PORTFOLIO.find((p) => p.id === projectId) ?? PORTFOLIO[0];
  const tpl = portfolioTemplate(project);
  const progress = usePortfolio((s) => s.progress[project.id] ?? NO_PROGRESS);
  const [open, setOpen] = useState<string | null>(null);
  const [showCode, setShowCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const stages = useMemo(() => stagesFor(project, board), [project, board]);
  const built = tpl.parts.every((p) => scene.parts.some((x) => x.id === p.id && x.partId === p.partId));
  const done = stages.filter((s) => progress[s.id]).length;

  const build = () => {
    useScene.getState().openScene(templateScene(tpl, board, PARTS), true);
    log('action', t('Portfolio project “{name}” built for {board}.', { name: t(project.name), board: board.name }), { source: `template: ${tpl.id}` });
  };

  const check = async (stage: PortfolioStage) => {
    const c = stage.check;
    setNote((n) => ({ ...n, [stage.id]: '' }));
    if (c.kind === 'lab') {
      usePortfolio.setState({ pending: { project: project.id, stage: stage.id, flow: c.flow } });
      useApp.getState().setScreen('test');
      useWizard.getState().start(c.flow);
      return;
    }
    setBusy(stage.id);
    try {
      if (c.kind === 'i2c') {
        if (!useApp.getState().conn.agent && !(await confirmInstallAgent())) return;
        const sda = templatePin(tpl, scene, board, 'SDA')?.gpio;
        const scl = templatePin(tpl, scene, board, 'SCL')?.gpio;
        if (sda == null || scl == null) return setNote((n) => ({ ...n, [stage.id]: t('The project has no I2C pins yet: build it first.') }));
        const r = await agent({ cmd: 'i2c_scan', sda, scl });
        if (!r.ok) return setNote((n) => ({ ...n, [stage.id]: `${t(r.error.humanMessage)} ${t(r.error.hint)}` }));
        if (r.value.found.some((a) => a.toLowerCase() === c.addr.toLowerCase())) {
          usePortfolio.getState().pass(project.id, stage.id, 'measured: i2c_scan');
          log('found', t('Portfolio checkpoint passed: {stage}.', { stage: t(stage.title) }), { source: 'measured: i2c_scan' });
        } else setNote((n) => ({ ...n, [stage.id]: t('Nothing answered at {addr}. Found: {list}.', { addr: c.addr, list: r.value.found.join(', ') || t('nothing') }) }));
      } else {
        if (useApp.getState().conn.agent) return setNote((n) => ({ ...n, [stage.id]: t('The diagnostic agent is on the board, not your sketch. Upload this stage’s sketch (Flash firmware or the Arduino IDE), then check again.') }));
        const r = await window.bp.hw.captureSerial(c.baud, 3000);
        if (!r.ok) return setNote((n) => ({ ...n, [stage.id]: `${t(r.error.humanMessage)} ${t(r.error.hint)}` }));
        const missing = serialMissing(c, r.value);
        if (!missing.length) {
          usePortfolio.getState().pass(project.id, stage.id, `measured: serial at ${c.baud} baud`);
          log('found', t('Portfolio checkpoint passed: {stage}.', { stage: t(stage.title) }), { source: 'measured: serial output' });
        } else
          setNote((n) => ({
            ...n,
            [stage.id]: r.value.length
              ? t('Heard {n} lines, but not: {missing}.', { n: r.value.length, missing: missing.map((m) => `“${m}”`).join(', ') })
              : t('Nothing arrived on serial in 3 seconds. Is the sketch uploaded, and is the speed {baud}?', { baud: c.baud }),
          }));
      }
    } finally {
      setBusy(null);
    }
  };

  const exportReadme = async () => {
    const md = portfolioReadme(project, board, scene, PARTS, progress);
    const r = await window.bp.session.saveFile('README.md', md);
    if (!r.ok) return;
    await window.bp.session.saveFile('wiring.svg', diagramToSvg(sceneToDiagram(scene, board, PARTS, checkWiring(scene, board, PARTS))));
    await window.bp.session.saveFile(`${tpl.id}.ino`, templateCode(tpl, board, scene));
    log('info', t('Portfolio README, wiring diagram and sketch saved.'));
  };

  return (
    <div className="portfolio">
      <div className="row gap wrap">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {PORTFOLIO.map((p) => (
            <option key={p.id} value={p.id}>
              {t(p.name)}
            </option>
          ))}
        </select>
        <span className="small dim">{t('{done} of {total} stages checked', { done, total: stages.length })}</span>
      </div>
      <p className="small">{t(project.summary)}</p>
      {!built && (
        <button className="btn primary small" onClick={build}>
          {t('Build the project on the {board}', { board: board.name })}
        </button>
      )}
      <ol className="portfolio-stages">
        {stages.map((s) => {
          const rec = progress[s.id];
          return (
            <li key={s.id} className={rec ? 'done' : ''}>
              <button className="portfolio-stage-head" onClick={() => setOpen(open === s.id ? null : s.id)}>
                <span className="mono">{rec ? '✓' : '○'}</span> <b>{t(s.title)}</b>
              </button>
              {open === s.id && (
                <div className="portfolio-stage">
                  <p>{t(s.goal)}</p>
                  <div className="label">{t('Hints')}</div>
                  <ul>
                    {s.hints.map((h) => (
                      <li key={h}>{t(h)}</li>
                    ))}
                  </ul>
                  <div className="row gap wrap">
                    <button className="btn small" disabled={!built || busy === s.id} onClick={() => check(s)}>
                      {busy === s.id ? t('Checking…') : t('Check on the board')}
                    </button>
                    <button className="btn small ghost" disabled={!built} onClick={() => setShowCode(showCode === s.id ? null : s.id)}>
                      {showCode === s.id ? t('Hide the reference code') : t('Show the reference code')}
                    </button>
                  </div>
                  <span className="small dim">
                    {s.check.kind === 'lab'
                      ? t('Checked by a lab: it measures the pins through the diagnostic agent.')
                      : s.check.kind === 'i2c'
                        ? t('Checked by scanning the I2C bus for {addr}.', { addr: s.check.addr })
                        : t('Checked by listening to your sketch on serial for 3 seconds.')}
                  </span>
                  {note[s.id] && <p className="small warn-text">{note[s.id]}</p>}
                  {note[s.id] && s.check.kind === 'serial' && useApp.getState().conn.agent && (
                    <button className="btn small ghost" onClick={() => openTask('flash')}>
                      {t('Open Flash firmware')}
                    </button>
                  )}
                  {rec && <p className="small ok-text">{t('Checked {date} ({source}).', { date: new Date(rec.at).toLocaleString(), source: rec.source })}</p>}
                  {showCode === s.id && <pre className="mono portfolio-code">{stageCode(project, s, board, scene)}</pre>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="row gap wrap">
        <button className="btn small" disabled={!built} onClick={exportReadme}>
          {t('Export for GitHub…')}
        </button>
        {done > 0 && (
          <button className="btn small ghost" onClick={() => usePortfolio.getState().reset(project.id)}>
            {t('Start over')}
          </button>
        )}
      </div>
    </div>
  );
}
