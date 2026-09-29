// "Check my code against the drawing": open or paste an Arduino sketch, compare it with the 3D
// scene (shared/codeCheck), and show each finding on its pin and code line. Re-runs whenever the
// drawing changes. These are checks of the drawing, not measurements, and the panel says so.

import { useEffect, useMemo, useRef } from 'react';
import { PARTS, getBoard } from '@shared/board';
import { checkCode, type CodeFinding } from '@shared/codeCheck';
import { t } from '@shared/i18n';
import { create } from 'zustand';
import { log, useLive, useScene } from '../state/store';

/** The sketch being checked; outside the component so demos can load one. */
const useSketch = create<{ code: string; name: string | null; open: boolean }>(() => ({ code: '', name: null, open: false }));
export const loadSketch = (name: string, text: string) => useSketch.setState({ code: text, name, open: true });

export function CodeCheck() {
  const scene = useScene((s) => s.scene);
  const baud = useLive((s) => s.baud);
  const { code, name, open } = useSketch();
  const setCode = (v: string) => useSketch.setState({ code: v });
  const setName = (v: string | null) => useSketch.setState({ name: v });
  const setOpen = (v: boolean) => useSketch.setState({ open: v });
  const board = getBoard(scene.board);
  const findings: CodeFinding[] = useMemo(() => (code.trim() ? checkCode(code, scene, board, PARTS, { monitorBaud: baud }) : []), [code, scene, board, baud]);

  // Log each finding once per sketch, so it can be clicked in the session log too.
  const logged = useRef(new Set<string>());
  useEffect(() => {
    for (const f of findings) {
      const key = `${name ?? 'pasted'}:${f.id}`;
      if (logged.current.has(key)) continue;
      logged.current.add(key);
      log(f.severity === 'error' ? 'failed' : f.severity === 'warning' ? 'warning' : 'info', `${f.message} ${f.hint}`, { target: f.targets[0], source: f.source });
    }
  }, [findings, name]);

  const openFile = async () => {
    const r = await window.bp.session.openSketch();
    if (!r.ok) {
      if (r.error.code !== 'cancelled') log('failed', `${r.error.humanMessage} ${r.error.hint}`.trim());
      return;
    }
    setCode(r.value.text);
    setName(r.value.name);
    setOpen(true);
    log('info', t('Checking {file} against the drawing.', { file: r.value.name }));
  };

  const lines = code.split('\n');
  const errors = findings.filter((f) => f.severity === 'error').length;

  return (
    <div className="code-check">
      <div className="row gap wrap">
        <button className="btn small" onClick={openFile}>
          {t('Open my sketch…')}
        </button>
        <button className="btn small ghost" onClick={() => setOpen(!open)}>
          {open ? t('Hide the code') : t('Paste code')}
        </button>
        {name && <span className="small mono dim">{name}</span>}
      </div>
      {open && (
        <textarea
          className="code-input mono"
          spellCheck={false}
          placeholder={t('Paste your Arduino sketch here.')}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setName(null);
          }}
        />
      )}
      {code.trim() && (
        <>
          <p className="small dim">
            {findings.length === 0
              ? t('The pins in your code match the drawing.')
              : errors
                ? t('{n} problems found. Fix the red ones before uploading.', { n: findings.length })
                : t('{n} things to check.', { n: findings.length })}{' '}
            {t('This compares the code with the drawing; it does not measure the board.')}
          </p>
          {findings.length > 0 && (
            <div className="findings">
              {findings.map((f) => (
                <button key={f.id} className={`finding sev-${f.severity}`} onClick={() => f.targets.length && useScene.getState().focusOn(f.targets)}>
                  <b>{f.message}</b>
                  <span>{f.hint}</span>
                  {f.line > 0 && lines[f.line - 1] !== undefined && (
                    <code className="code-line">
                      {f.line}: {lines[f.line - 1].trim()}
                    </code>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
