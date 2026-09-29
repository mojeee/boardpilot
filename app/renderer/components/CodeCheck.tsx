// "Check my code against the drawing": the project's sketch (Code panel) compared with the 3D scene
// (shared/codeCheck); each finding shows on its pin and code line. Re-runs whenever the code or
// the drawing changes. These are checks of the drawing, not measurements, and the panel says so.

import { useEffect, useRef } from 'react';
import { t } from '@shared/i18n';
import { log, setSketch, useScene } from '../state/store';
import { revealLine, useCodeFindings } from '../state/code';
import { useLayout } from '../state/layout';

/** Put a sketch in the project (demos, the Open button) and show it in the Code panel. */
export const loadSketch = (name: string, text: string) => {
  setSketch(name, text);
  useLayout.getState().showBottom('code');
};

/** Open a sketch file from disk into the project's code. */
export async function openSketchFile() {
  const r = await window.bp.session.openSketch();
  if (!r.ok) {
    if (r.error.code !== 'cancelled') log('failed', `${r.error.humanMessage} ${r.error.hint}`.trim());
    return;
  }
  loadSketch(r.value.name, r.value.text);
  log('info', t('Checking {file} against the drawing.', { file: r.value.name }));
}

/** Log each finding once per sketch, so it can be clicked in the session log too. Mounted once in the app. */
export function CodeFindingsLogger() {
  const findings = useCodeFindings();
  const name = useScene((s) => s.scene.sketch?.name ?? '');
  const logged = useRef(new Set<string>());
  useEffect(() => {
    for (const f of findings) {
      const key = `${name}:${f.id}:${f.message}`;
      if (logged.current.has(key)) continue;
      logged.current.add(key);
      log(f.severity === 'error' ? 'failed' : f.severity === 'warning' ? 'warning' : 'info', `${f.message} ${f.hint}`, { target: f.targets[0], source: f.source });
    }
  }, [findings, name]);
  return null;
}

export function CodeCheck() {
  const sketch = useScene((s) => s.scene.sketch);
  const findings = useCodeFindings();
  const code = sketch?.text ?? '';
  const lines = code.split('\n');
  const errors = findings.filter((f) => f.severity === 'error').length;

  return (
    <div className="code-check">
      <div className="row gap wrap">
        <button className="btn small" onClick={() => void openSketchFile()}>
          {t('Open my sketch…')}
        </button>
        <button className="btn small ghost" onClick={() => useLayout.getState().showBottom('code')}>
          {t('Show the code')}
        </button>
        {sketch && <span className="small mono dim">{sketch.name}</span>}
      </div>
      {!code.trim() && <p className="small dim">{t('Write or paste your sketch in the Code panel below; it is checked against the drawing as you type.')}</p>}
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
                <button
                  key={f.id}
                  className={`finding sev-${f.severity}`}
                  onClick={() => {
                    if (f.targets.length) useScene.getState().focusOn(f.targets);
                    if (f.line > 0) {
                      useLayout.getState().showBottom('code');
                      revealLine(f.line);
                    }
                  }}
                >
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
