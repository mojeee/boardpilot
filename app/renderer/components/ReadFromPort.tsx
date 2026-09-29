// "Read from port" in the New project dialog: runs shared/readPort against the board on USB, shows
// each step as it happens (with where each fact comes from), lets the user confirm what was only
// guessed, and opens the project in a new tab. Nothing is written without the usual dialog.

import { useEffect, useRef, useState } from 'react';
import { PARTS, getBoard, pinByGpio } from '@shared/board';
import { readFromPort, sceneFromRead, type ReadResult, type ReadStep } from '@shared/readPort';
import type { PartDef } from '@shared/types';
import { t } from '@shared/i18n';
import { log, useApp } from '../state/store';
import { agent, confirmInstallAgent } from '../state/hw';
import { useProjects } from '../state/projects';

const ICON: Record<ReadStep['status'], string> = { run: '…', ok: '✓', warn: '!', fail: '✕', skip: '–' };

/** Parts whose signal is an analog voltage: the choices for a steady ADC reading. */
function analogParts(): PartDef[] {
  const list = Object.values(PARTS).filter((p) => p.pins.some((x) => x.role === 'analog_out'));
  return list.sort((a, b) => (a.id === 'potentiometer' ? -1 : b.id === 'potentiometer' ? 1 : a.name.localeCompare(b.name)));
}

export function ReadFromPort({ onDone, onPickBoard }: { onDone(): void; onPickBoard(): void }) {
  const [steps, setSteps] = useState<ReadStep[]>([]);
  const [result, setResult] = useState<ReadResult | null>(null);
  const [running, setRunning] = useState(false);
  /** per I2C address: the part the user picked, and whether they confirmed it */
  const [choice, setChoice] = useState<Record<string, { partId: string; ok: boolean }>>({});
  /** per ADC gpio: the analog part to add (empty: do not add) */
  const [analog, setAnalog] = useState<Record<number, string>>({});
  const started = useRef(false);

  const run = async () => {
    setRunning(true);
    setSteps([]);
    setResult(null);
    const board = useApp.getState().conn.board;
    const r = await readFromPort(
      {
        listPorts: () => window.bp.hw.listPorts(),
        setBoard: async (id) => {
          const s = await window.bp.hw.setBoard(id);
          if (s.ok) useApp.getState().set({ conn: s.value });
        },
        identify: (port) => window.bp.hw.identify(port),
        agentReady: () => !!useApp.getState().conn.agent,
        installAgent: () => confirmInstallAgent(t('To see what is connected to your board, the app installs its diagnostic agent. Your program is backed up first and comes back with one click.')),
        agent: (req) => agent(req),
      },
      { currentBoard: board, boards: getBoard, parts: PARTS },
      (s) => {
        setSteps((list) => {
          const i = list.findIndex((x) => x.id === s.id);
          return i < 0 ? [...list, s] : list.map((x, j) => (j === i ? s : x));
        });
        if (s.status !== 'run') log(s.status === 'fail' ? 'failed' : s.status === 'warn' ? 'warning' : s.status === 'ok' ? 'found' : 'info', s.text, { source: s.source });
      },
    );
    setResult(r);
    setChoice(Object.fromEntries(r.i2c.filter((f) => f.partId).map((f) => [f.addr, { partId: f.partId!, ok: !f.guess }])));
    setRunning(false);
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, []);

  const open = () => {
    if (!result?.board) return;
    const r: ReadResult = {
      ...result,
      i2c: result.i2c.map((f) => {
        const c = choice[f.addr];
        if (!c) return f;
        const changed = c.partId !== f.partId;
        return { ...f, partId: c.partId, guess: !c.ok, evidence: changed ? t('Answers at {addr}; you said it is a {part}.', { addr: f.addr, part: PARTS[c.partId]?.name ?? c.partId }) : f.evidence };
      }),
    };
    const confirmed = Object.entries(analog)
      .filter(([, id]) => id)
      .map(([g, partId]) => ({ gpio: Number(g), partId }));
    const { scene, notes } = sceneFromRead(r, PARTS, confirmed);
    useProjects.getState().add(scene, t('{board} (read from port)', { board: result.board.name }));
    for (const n of notes) log('info', n, { source: 'suggestion' });
    const guessed = r.i2c.filter((f) => f.guess && f.partId).length;
    log(
      'action',
      guessed
        ? t('Project built from what was found on the board. {n} part(s) are a guess: click them in 3D to confirm.', { n: guessed })
        : t('Project built from what was found on the board.'),
      { source: 'Read from port' },
    );
    onDone();
  };

  const done = steps.filter((s) => s.status !== 'run').length;
  const pct = running ? Math.min(95, (done / 7) * 100) : 100;
  const board = result?.board;
  const guesses = result?.i2c.filter((f) => f.partId && (f.guess || f.alternatives.length)) ?? [];
  return (
    <div className="np-port">
      <div className="row gap">
        <b>{t('Reading your board')}</b>
        <span className="small dim">{t('only reads · nothing is written without your OK')}</span>
      </div>
      <ul className="np-steps">
        {steps.map((s) => (
          <li key={s.id} className={`st-${s.status}`}>
            <span className="np-ico">{s.status === 'run' ? <span className="spinner sm" /> : ICON[s.status]}</span>
            <span>
              {s.text}
              {s.source && <span className="log-src">{s.source}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="np-bar">
        <i style={{ width: `${pct}%` }} />
      </div>

      {!running && result && guesses.length > 0 && (
        <div className="np-confirm">
          <div className="label">{t('Please confirm what was guessed')}</div>
          {guesses.map((f) => {
            const c = choice[f.addr];
            const opts = [f.partId!, ...f.alternatives];
            return (
              <div key={f.addr} className="np-guess">
                <span className="mono">{f.addr}</span>
                <select className="select" value={c?.partId ?? f.partId!} onChange={(e) => setChoice({ ...choice, [f.addr]: { partId: e.target.value, ok: true } })}>
                  {opts.map((id) => (
                    <option key={id} value={id}>
                      {PARTS[id]?.name ?? id}
                    </option>
                  ))}
                </select>
                <label className="small">
                  <input type="checkbox" checked={!!c?.ok} onChange={(e) => setChoice({ ...choice, [f.addr]: { partId: c?.partId ?? f.partId!, ok: e.target.checked } })} /> {t('This is right')}
                </label>
                {f.note && <span className="small warn-text">{t(f.note)}</span>}
              </div>
            );
          })}
        </div>
      )}
      {!running && result && board && result.analog.length > 0 && (
        <div className="np-confirm">
          <div className="label">{t('Something may be connected to these analog pins')}</div>
          {result.analog.map((a) => (
            <div key={a.gpio} className="np-guess">
              <span className="mono">
                {pinByGpio(board, a.gpio)?.label ?? a.pinId} · {a.mv} mV
              </span>
              <select className="select" value={analog[a.gpio] ?? ''} onChange={(e) => setAnalog({ ...analog, [a.gpio]: e.target.value })}>
                <option value="">{t('Not sure: leave it out')}</option>
                {analogParts().map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="small dim">{t('measured voltage; what it is, you tell the app')}</span>
            </div>
          ))}
        </div>
      )}

      <div className="row between np-foot">
        <span className="small dim">{t('Found parts are added as “detected”, each with its measurement. You confirm anything that was guessed.')}</span>
        <div className="row gap">
          {!running && (
            <button className="btn small ghost" onClick={() => void run()}>
              {t('Read again')}
            </button>
          )}
          <button className="btn small" onClick={onPickBoard}>
            {t('Pick the board myself')}
          </button>
          <button className="btn small primary" disabled={running || !board} onClick={open}>
            {t('Open the project')}
          </button>
        </div>
      </div>
    </div>
  );
}
