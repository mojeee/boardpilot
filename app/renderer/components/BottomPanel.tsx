// The bottom panel of the workspace: two tabs, Code (the project's sketch in an editor, with the
// simulated run's debugger view) and Log (the session log, or the story of the run). It can be
// collapsed to its tab bar or expanded over the 3D view.

import { PARTS, getBoard, pinByGpio } from '@shared/board';
import { generateSketch } from '@shared/sketch';
import { t } from '@shared/i18n';
import { log, useLog, useScene } from '../state/store';
import { useLayout } from '../state/layout';
import { currentSketch, useCodeFindings, useCodeUi } from '../state/code';
import { useRunLine, useTemplate } from '../state/templateRun';
import { CodeEditor } from './CodeEditor';
import { openSketchFile } from './CodeCheck';
import { LogFilters, LogList } from './LogPanel';
import { RunControls, RunStory, useRunView } from './TemplatePanel';
import { openTask } from './TaskRail';
import { Icon } from './Icon';
import { suggestCode } from './codeSuggest';

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function CodeTools() {
  const tplOpen = useTemplate((s) => !!s.tpl);
  const suggesting = useCodeUi((s) => s.suggesting);
  const hasCode = useScene((s) => !!s.scene.sketch?.text.trim());
  return (
    <div className="tools">
      <button className="btn small ai" disabled={suggesting} onClick={() => void suggestCode()} title={t('Code for the parts and pins in your drawing, with its source')} data-where="code:suggest">
        ✦ {suggesting ? t('Thinking…') : t('Suggest code')}
      </button>
      {tplOpen ? (
        <RunControls compact />
      ) : (
        <button
          className="btn small"
          data-where="code:run"
          onClick={() =>
            log(
              'info',
              t('The simulator runs template projects step by step. For your own code: flash it to the board; the BoardPilotProbe markers (probe.step) then show each step live.'),
              {
                source: 'simulator',
              },
            )
          }
        >
          ▶ {t('Run in simulator')}
        </button>
      )}
      <button className="btn small" onClick={() => void openSketchFile()} title={t('Open my sketch…')}>
        <Icon name="folder" size={13} />
      </button>
      <button
        className="btn small"
        disabled={!hasCode}
        onClick={() => window.bp.session.saveFile(currentSketch().name, currentSketch().text)}
        title={t('Save the code as a file…')}
      >
        <Icon name="save" size={13} />
      </button>
      <button className="btn small" onClick={() => openTask('flash')} title={t('Write a program to the board, safely')}>
        {t('Flash to board')}
      </button>
    </div>
  );
}

/** Beside the code while a template runs: where the program is and what it sees (all simulated). */
function DebugView() {
  const { tpl, now, step, state, partText, simPins, running } = useTemplate();
  const scene = useScene((s) => s.scene);
  if (!tpl) return null;
  const board = getBoard(scene.board);
  const pins = Object.entries(simPins);
  return (
    <aside className="code-debug">
      <div className="row between">
        <span className="label">{t('Run')}</span>
        <span className="badge sim">{t('simulated')}</span>
      </div>
      <div className="dbg-row">
        <span className="dim">{t('Time')}</span>
        <span className="mono">
          {mmss(now)} {running ? '▶' : '❚❚'}
        </span>
      </div>
      {state && (
        <div className="dbg-row">
          <span className="dim">{t('State')}</span>
          <span className="chip mono">{state}</span>
        </div>
      )}
      {step && (
        <div className="dbg-row col">
          <span className="dim">{t('Step')}</span>
          <b>{step}</b>
        </div>
      )}
      {Object.keys(partText).length > 0 && <div className="label">{t('Values')}</div>}
      {Object.entries(partText).map(([id, text]) => {
        const inst = scene.parts.find((p) => p.id === id);
        return (
          <button key={id} className="dbg-row clickable" onClick={() => useScene.getState().focusOn([`part:${id}`])}>
            <span className="dim">{inst?.label ?? PARTS[inst?.partId ?? '']?.name.split(/[ (]/)[0] ?? id}</span>
            <span className="mono">{text}</span>
          </button>
        );
      })}
      {pins.length > 0 && <div className="label">{t('Pins')}</div>}
      {pins.map(([g, level]) => {
        const p = pinByGpio(board, Number(g));
        return (
          <button key={g} className="dbg-row clickable" onClick={() => p && useScene.getState().focusOn([`pin:${p.id}`])}>
            <span className="mono">{p?.label ?? `GPIO ${g}`}</span>
            <span className={`mono lvl-${level}`}>{level ? 'HIGH' : 'LOW'}</span>
          </button>
        );
      })}
    </aside>
  );
}

function CodePane() {
  const findings = useCodeFindings();
  const runLine = useRunLine();
  return (
    <div className="code-pane">
      <CodeEditor findings={findings} runLine={runLine} />
      <DebugView />
    </div>
  );
}

function LogPane() {
  const tplOpen = useTemplate((s) => !!s.tpl);
  const view = useRunView((s) => s.view);
  return tplOpen && view === 'story' ? <RunStory /> : <LogList />;
}

export function BottomPanel() {
  const tab = useLayout((s) => s.bottomTab);
  const open = useLayout((s) => s.bottomOpen);
  const max = useLayout((s) => s.bottomMax);
  const name = useScene((s) => s.scene.sketch?.name ?? 'sketch.ino');
  const findings = useCodeFindings();
  const tplOpen = useTemplate((s) => !!s.tpl);
  const runView = useRunView((s) => s.view);
  const warnCount = useLog((s) => s.entries.filter((e) => e.type === 'warning' || e.type === 'failed').length);
  const errs = findings.filter((f) => f.severity === 'error').length;
  const l = useLayout.getState();
  return (
    <section className="bottom-panel">
      <div className="tabbar" role="tablist" aria-label={t('Code and log')}>
        <button role="tab" aria-selected={tab === 'code'} className={`tab ${tab === 'code' ? 'on' : ''}`} onClick={() => l.showBottom('code')} data-where="bottom:code">
          {t('Code')} <span className="mono small">· {name}</span>
          {findings.length > 0 && <span className={`count ${errs ? 'err' : 'warn'}`}>{findings.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'log'} className={`tab ${tab === 'log' ? 'on' : ''}`} onClick={() => l.showBottom('log')} data-where="bottom:log">
          {t('Log')}
          {warnCount > 0 && <span className="count warn">{warnCount}</span>}
        </button>
        <span className="grow" />
        {open && tab === 'code' && <CodeTools />}
        {open && tab === 'log' && (
          <div className="tools">
            {tplOpen && (
              <div className="seg">
                <button className={runView === 'session' ? 'on' : ''} onClick={() => useRunView.getState().set('session')}>
                  {t('Session log')}
                </button>
                <button className={runView === 'story' ? 'on' : ''} onClick={() => useRunView.getState().set('story')}>
                  {t('Run story')}
                </button>
              </div>
            )}
            {(!tplOpen || runView === 'session') && <LogFilters />}
          </div>
        )}
        <button
          className="tb-btn"
          onClick={() => l.toggleBottomMax()}
          title={max ? t('Restore the panel size') : t('Expand the panel')}
          aria-label={max ? t('Restore the panel size') : t('Expand the panel')}
        >
          {max ? '▭' : '⤢'}
        </button>
        <button
          className="tb-btn"
          onClick={() => l.toggleBottom()}
          title={open ? t('Hide the panel (⌘J)') : t('Show the panel (⌘J)')}
          aria-label={open ? t('Hide the panel (⌘J)') : t('Show the panel (⌘J)')}
        >
          {open ? '▾' : '▴'}
        </button>
      </div>
      <div className="tab-body">{tab === 'code' ? <CodePane /> : <LogPane />}</div>
    </section>
  );
}

/** Starter code from the parts library, offered as a suggestion (used when the AI is off). */
export function starterSuggestion() {
  const scene = useScene.getState().scene;
  return generateSketch(scene, getBoard(scene.board), PARTS);
}
