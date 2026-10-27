// "Check with compiler": compile the project with arduino-cli (desktop app), put the errors on
// their lines and in the log. Compiling never touches the board.

import { compileSummary } from '@shared/compileOutput';
import { t } from '@shared/i18n';
import { log, useScene } from '../../state/store';
import { currentFiles, currentSketch, useCodeUi } from '../../state/code';

export async function compileNow() {
  const ui = useCodeUi.getState();
  if (ui.compile.running) return;
  const sk = currentSketch();
  const files = currentFiles();
  if (!sk.text.trim()) return;
  if (!/\.ino$/i.test(sk.name)) {
    log('info', t('Only Arduino sketches (.ino) are compiled here. ESP-IDF, Pico SDK and STM32 projects build with their own tools: see their README.'));
    return;
  }
  ui.set({ compile: { ...ui.compile, running: true } });
  const board = useScene.getState().scene.board;
  log('info', t('Compiling {file} with arduino-cli. Nothing is written to the board.', { file: sk.name }), { source: 'arduino-cli compile' });
  const r = await window.bp.code.compile(board, files, sk.name);
  if (!r.ok) {
    useCodeUi.getState().set({ compile: { running: false, report: null, files: {} } });
    log('failed', [r.error.humanMessage, r.error.hint].filter(Boolean).join(' '));
    return;
  }
  const report = r.value;
  useCodeUi.getState().set({ compile: { running: false, report, files: Object.fromEntries(files.map((f) => [f.name, f.text])) } });
  const src = `compiler: arduino-cli · ${report.fqbn}`;
  log(report.ok ? 'check' : 'failed', compileSummary(report), { source: src });
  for (const d of report.diagnostics.slice(0, 12)) {
    const where = d.file ? `${d.file}:${d.line}` : `${d.external}:${d.line}`;
    log(d.severity === 'error' ? 'failed' : 'warning', `${where}: ${d.message}${d.hint ? ` ${d.hint}` : ''}`, { source: src });
  }
  for (const m of report.missing) {
    log(
      'info',
      m.library
        ? t('{header} usually comes from the library “{library}”. Install it with the Arduino Library Manager (or: arduino-cli lib install "{library}"), then check again.', { header: m.header, library: m.library })
        : t('Find the library that provides {header} and install it with the Arduino Library Manager, then check again.', { header: m.header }),
      { source: t('suggestion: library index of BoardPilot') },
    );
  }
  if (report.missingCore) log('info', t('Install the board package once: arduino-cli core install {core}', { core: report.missingCore }), { source: src });
  if (!report.ok && !report.diagnostics.length && !report.missing.length && !report.missingCore) for (const l of report.tail.slice(-4)) log('info', l, { source: src });
}
