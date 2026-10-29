// Display Studio: see what a display module will show, pixel for pixel, before any hardware.
// - DisplayStudioPanel (Project tools): every display in the drawing, its live preview, the screens,
//   values to set by hand, the checks, and "Write the code" (a suggestion in the Code panel).
// - DisplayCard: the assistant's design in the chat, animated, with Apply.
// - DisplayPip: a small live preview over the 3D view while the project's displays run.
// Everything is simulated and labelled so; the code generator writes the same drawing for the board.

import { useEffect, useMemo, useRef, useState } from 'react';
import { PARTS, getBoard } from '@shared/board';
import { checkSpec, panelOf, type DisplaySpec, type PanelInfo, type SpecProblem } from '@shared/displaySpec';
import { availableLibraries, generateDisplayCode, libraryName, type DisplayLibrary, type DisplayOutput } from '@shared/displayCode';
import { testPatternSpec } from '@shared/displayExamples';
import { t } from '@shared/i18n';
import { log, useApp, useScene } from '../state/store';
import { openFile, setFileText, useCodeUi } from '../state/code';
import { useLayout } from '../state/layout';
import { panelForPart, releaseTouched, repaint, restartDisplays, runDisplay, runningDisplay, showScreen, stopDisplay, tapDisplay, useDisplayClock, useDisplayFrames } from '../state/displays';
import { askAi } from './ai';

/** A running display's preview, scaled with crisp pixels. Each preview has its own canvas and copies
 *  the frames, so the studio, the chat card and the picture-in-picture can show the same display. */
export function DisplayCanvas({ runKey, maxW = 360, maxH = 300, round, tappable = true }: { runKey: string; maxW?: number; maxH?: number; round?: boolean; tappable?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useDisplayFrames((s) => s.frames[runKey]?.version ?? 0);
  const r = runningDisplay(runKey);
  useEffect(() => {
    const c = ref.current;
    if (!c || !r) return;
    if (c.width !== r.view.width || c.height !== r.view.height) {
      c.width = r.view.width;
      c.height = r.view.height;
    }
    c.getContext('2d')?.drawImage(r.view, 0, 0);
  }, [r, version]);
  if (!r) return null;
  const scale = Math.max(1, Math.floor(Math.min(maxW / r.fb.w, maxH / r.fb.h)));
  const touchy = tappable && (r.spec.screens.some((s) => s.elements.some((e) => e.type === 'button')) || r.spec.transitions.some((tr) => tr.touch));
  // A click is a tap: the pixel under the pointer, in screen pixels (the canvas is scaled up with crisp pixels).
  const tap = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    tapDisplay(runKey, ((e.clientX - box.left) / box.width) * r.fb.w, ((e.clientY - box.top) / box.height) * r.fb.h);
  };
  return (
    <div
      className={`display-canvas ${round ? 'round' : ''} panel-${r.panel.color} ${touchy ? 'touchy' : ''}`}
      style={{ width: r.fb.w * scale, height: r.fb.h * scale, ...(touchy ? { cursor: 'pointer' } : {}) }}
      onClick={touchy ? tap : undefined}
      title={touchy ? t('Simulated: click the screen to tap it ({w}x{h} pixels)', { w: r.fb.w, h: r.fb.h }) : t('Simulated: {w}x{h} pixels, as the {controller} shows them', { w: r.fb.w, h: r.fb.h, controller: r.panel.controller })}
    >
      <canvas ref={ref} />
    </div>
  );
}

/** Apply a design to the project: one spec per display part, undoable. */
export function applyDisplay(spec: DisplaySpec) {
  useScene.getState().updateScene((s) => ({ ...s, displays: [...(s.displays ?? []).filter((d) => d.part !== spec.part), spec] }));
  log('action', t('Display Studio: “{title}” now runs on {part} ({n} screens). Undo brings the previous one back.', { title: spec.title, part: spec.part, n: spec.screens.length }), {
    target: `part:${spec.part}`,
    source: 'Display Studio (simulated)',
  });
}

/**
 * Generate the code. A sketch is offered in the Code panel as a suggestion (Tab accepts, nothing is
 * overwritten); a module is added as new files (display_screens.h/.cpp) next to the user's own code.
 */
export function writeDisplayCode(spec: DisplaySpec, choice: { library?: DisplayLibrary; output?: DisplayOutput } = {}) {
  const scene = useScene.getState().scene;
  const inst = scene.parts.find((p) => p.id === spec.part);
  const def = inst ? PARTS[inst.partId] : undefined;
  const panel = def ? panelOf(def) : null;
  if (!def || !panel) return;
  const board = getBoard(scene.board);
  const r = generateDisplayCode(spec, panel, def, scene, board, choice);
  for (const n of r.notes) log('warning', n, { target: `part:${spec.part}`, source: 'Display Studio code generator' });
  if (!r.code) return;
  const extra = r.files ?? [];
  for (const file of extra) setFileText(file.name, file.text);
  if (choice.output === 'module' && extra.length) {
    openFile('display_screens.cpp');
    useLayout.getState().showBottom('code');
    log('action', t('Display Studio added the module for “{title}”: {files}. In your sketch, include "display_screens.h", call display_init() in setup() and display_update() in loop().', { title: spec.title, files: extra.map((x) => x.name).join(', ') }), {
      source: 'Display Studio code generator',
    });
    return;
  }
  if (extra.length) log('action', t('Display Studio added {files} to the project files. TFT_eSPI needs it in its library folder: copy it there before you build.', { files: extra.map((x) => x.name).join(', ') }), { source: 'Display Studio code generator' });
  useCodeUi.getState().set({
    suggestion: {
      title: t('Display Studio: “{title}” for the {part}', { title: spec.title, part: def.name }),
      afterLine: 0,
      replace: true,
      text: r.code,
      explanation: t('Draws the same pixels as the preview (same font, shapes and pattern maths). Values are simulated until you replace the lines marked TODO with your sensors. Libraries: {libs}.', { libs: r.libraries.join(', ') }),
      sources: [
        { kind: 'library', label: `parts library · ${def.id}` },
        { kind: 'library', label: r.libraries.join(' · ') },
      ],
      by: 'rules',
    },
  });
  useLayout.getState().showBottom('code');
  log('action', t('Display Studio wrote the code for “{title}”: press Tab in the Code panel to use it.', { title: spec.title }), { source: 'Display Studio code generator' });
}

function Problems({ problems }: { problems: SpecProblem[] }) {
  if (!problems.length) return <div className="ok-text small">✓ {t('Fits the screen')}</div>;
  return (
    <div className="findings">
      {problems.map((p, i) => (
        <div key={i} className={`finding sev-${p.severity}`}>
          <b>{p.message}</b>
        </div>
      ))}
    </div>
  );
}

function ClockControls() {
  const { playing, speed } = useDisplayClock();
  return (
    <div className="row gap wrap">
      <button className="btn small" onClick={() => useDisplayClock.setState({ playing: !playing })}>
        {playing ? t('Pause') : t('Play')}
      </button>
      <button className="btn small ghost" onClick={restartDisplays}>
        {t('Restart')}
      </button>
      <div className="seg" role="group" aria-label={t('Speed')}>
        {([1, 2, 4] as const).map((s) => (
          <button key={s} className={speed === s ? 'on' : ''} onClick={() => useDisplayClock.setState({ speed: s })}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

const NO_OVERRIDES: Record<string, number> = {};

/** Which library and which kind of output "Write the code" uses, with the choices this display and board allow. */
function CodeChoice({ libs, library, output, onLibrary, onOutput }: { libs: DisplayLibrary[]; library: DisplayLibrary; output: DisplayOutput; onLibrary: (l: DisplayLibrary) => void; onOutput: (o: DisplayOutput) => void }) {
  return (
    <div className="row gap wrap">
      {libs.length > 1 && (
        <div className="seg" role="group" aria-label={t('Library')}>
          {libs.map((l) => (
            <button key={l} className={library === l ? 'on' : ''} onClick={() => onLibrary(l)}>
              {libraryName(l)}
            </button>
          ))}
        </div>
      )}
      <div className="seg" role="group" aria-label={t('Code as')}>
        <button className={output === 'sketch' ? 'on' : ''} onClick={() => onOutput('sketch')} title={t('One sketch with setup() and loop()')}>
          {t('Sketch')}
        </button>
        <button className={output === 'module' ? 'on' : ''} onClick={() => onOutput('module')} title={t('display_screens.h and display_screens.cpp with display_init() and display_update(), to add to your own sketch')}>
          {t('Module')}
        </button>
      </div>
    </div>
  );
}

function SpecView({ spec, panel }: { spec: DisplaySpec; panel: PanelInfo }) {
  const key = spec.part;
  const board = useScene((s) => s.scene.board);
  const libs = useMemo(() => availableLibraries(panel, getBoard(board)), [panel, board]);
  const [pickedLibrary, setLibrary] = useState<DisplayLibrary | null>(null);
  const [output, setOutput] = useState<DisplayOutput>('sketch');
  const library = pickedLibrary && libs.includes(pickedLibrary) ? pickedLibrary : libs[0] ?? 'adafruit';
  const current = useDisplayClock((s) => s.screen[key]);
  // Select the stored object itself (a new {} on every render would loop: zustand compares selections).
  const held = useDisplayClock((s) => s.overrides[key]);
  const overrides = held ?? NO_OVERRIDES;
  const problems = useMemo(() => checkSpec(spec, panel), [spec, panel]);
  const setOverride = (name: string, v: number | null) => {
    useDisplayClock.setState((s) => {
      const o = { ...(s.overrides[key] ?? {}) };
      if (v === null) delete o[name];
      else o[name] = v;
      releaseTouched(key, name);
      return { overrides: { ...s.overrides, [key]: o } };
    });
    repaint(key);
  };
  return (
    <div className="display-spec">
      <div className="row between">
        <b>{spec.title}</b>
        <span className="chip">{t('Simulated')}</span>
      </div>
      <DisplayCanvas runKey={key} round={panel.round} />
      {spec.screens.some((s) => s.elements.some((e) => e.type === 'button')) && <div className="small dim">{t('Click the preview to tap it, like a finger on the touch screen.')}</div>}
      <div className="small dim mono">
        {panel.controller} · {panel.widthPx}x{panel.heightPx} · {panel.color === 'rgb565' ? t('16-bit colour') : panel.color === 'mono' ? t('one colour') : t('e-paper')}
      </div>
      <ClockControls />
      <div className="label">{t('Screens')}</div>
      <div className="display-screens">
        {spec.screens.map((s) => (
          <button key={s.id} className={`chip link ${current === s.id ? 'on' : ''}`} onClick={() => showScreen(key, s.id)}>
            {s.id}
          </button>
        ))}
      </div>
      {spec.transitions.length > 0 && (
        <ul className="small dim display-flow">
          {spec.transitions.map((tr, i) => (
            <li key={i}>
              {tr.from} → {tr.to} {tr.afterMs ? t('after {s} s', { s: tr.afterMs / 1000 }) : ''} {tr.when ? t('when {cond}', { cond: tr.when }) : ''} {tr.touch ? t('on a tap') : ''}
            </li>
          ))}
        </ul>
      )}
      {spec.vars.length > 0 && (
        <>
          <div className="label">{t('Values (simulated: move a slider to try a value)')}</div>
          {spec.vars.map((v) => {
            const lo = 'min' in v.source ? v.source.min : Math.min(...(v.source.values.length ? v.source.values : [0]));
            const hi = 'max' in v.source ? v.source.max : Math.max(...(v.source.values.length ? v.source.values : [1]));
            const pad = (hi - lo) * 0.25 || 1;
            const held = v.name in overrides;
            return (
              <div key={v.name} className="display-var">
                <span className="mono small">{v.name}</span>
                <input type="range" min={lo - pad} max={hi + pad} step={(hi - lo) / 200 || 0.1} value={held ? overrides[v.name] : lo} onChange={(e) => setOverride(v.name, Number(e.target.value))} aria-label={v.name} />
                <span className="mono small">{held ? `${overrides[v.name].toFixed(v.digits)} ${v.unit}` : t('auto')}</span>
                {held && (
                  <button className="link small" onClick={() => setOverride(v.name, null)}>
                    {t('auto')}
                  </button>
                )}
                {v.from && <span className="small dim">{t('on the board: {from}', { from: v.from })}</span>}
              </div>
            );
          })}
        </>
      )}
      <Problems problems={problems} />
      {libs.length > 0 && <CodeChoice libs={libs} library={library} output={output} onLibrary={setLibrary} onOutput={setOutput} />}
      <div className="row gap wrap">
        <button className="btn small primary" onClick={() => writeDisplayCode(spec, { library, output })}>
          {t('Write the code')}
        </button>
        <button className="btn small ghost" onClick={() => void askAi(t('Change the display “{title}” on {part}: ', { title: spec.title, part: spec.part }))}>
          {t('Change it with the assistant')}
        </button>
        <button
          className="btn small ghost"
          onClick={() => {
            useScene.getState().updateScene((s) => ({ ...s, displays: (s.displays ?? []).filter((d) => d.part !== spec.part) }));
            stopDisplay(spec.part);
          }}
        >
          {t('Remove')}
        </button>
      </div>
    </div>
  );
}

/** Project tools → Display Studio. */
export function DisplayStudioPanel() {
  const scene = useScene((s) => s.scene);
  const aiOn = useApp((s) => s.ai.enabled);
  const displays = scene.parts.map((p) => ({ inst: p, def: PARTS[p.partId] })).filter((x) => x.def && panelOf(x.def));
  if (!displays.length)
    return <p className="small dim">{t('Add a display to the project (for example an ST7789, ILI9341 or SSD1306), then design what it shows here, or ask the assistant.')}</p>;
  return (
    <div className="display-studio">
      {displays.map(({ inst, def }) => {
        const panel = panelOf(def)!;
        const spec = scene.displays?.find((d) => d.part === inst.id);
        return (
          <div key={inst.id} className="display-part">
            <div className="small">
              <b>{inst.label ?? def.name}</b> <span className="dim">{def.name}</span>
            </div>
            {spec ? (
              <SpecView spec={spec} panel={panel} />
            ) : (
              <div className="row gap wrap">
                <button className="btn small" onClick={() => applyDisplay(testPatternSpec(inst.id, panel))}>
                  {t('Start with test patterns')}
                </button>
                {aiOn && (
                  <button className="btn small ai" onClick={() => void askAi(t('Design what the {part} ({id}) should show: ', { part: def.name, id: inst.id }))}>
                    {t('Describe it to the assistant')}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The assistant's design in the chat: animated, checked, with Apply. */
export function DisplayCard({ id, display, applied, onApply }: { id: number; display: { spec: DisplaySpec; problems: SpecProblem[] }; applied: boolean; onApply: () => void }) {
  const key = `preview:${id}`;
  const panel = panelForPart(display.spec.part);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!panel) return;
    runDisplay(display.spec, panel, key);
    setReady(true);
    return () => stopDisplay(key);
  }, [display.spec, key, panel?.controller]); // eslint-disable-line react-hooks/exhaustive-deps
  const errors = display.problems.filter((p) => p.severity === 'error');
  return (
    <div className="proposal display-card" data-display={display.spec.title}>
      <div className="proposal-head">
        <div>
          <div className="proposal-title">{display.spec.title}</div>
          <div className="small dim">
            {display.spec.part} · {t('{n} screens', { n: display.spec.screens.length })}
          </div>
        </div>
        <span className="chip">{t('Simulated')}</span>
      </div>
      {ready && panel ? <DisplayCanvas runKey={key} maxW={300} maxH={220} round={panel.round} /> : <p className="small warn-text">{t('The display {part} is not in the drawing.', { part: display.spec.part })}</p>}
      <Problems problems={display.problems} />
      <div className="row gap wrap">
        {applied ? (
          <>
            <span className="ok-text small">✓ {t('Running on your project')}</span>
            <button className="btn small" onClick={() => writeDisplayCode(display.spec)} data-action="code">
              {t('Write the code')}
            </button>
            <button className="btn small ghost" onClick={() => useLayout.getState().setRightTab('tools')}>
              {t('Open Display Studio')}
            </button>
          </>
        ) : (
          <button className="btn primary small" disabled={!panel || errors.length > 0} onClick={onApply} data-action="apply">
            {t('Apply to my project')}
          </button>
        )}
      </div>
    </div>
  );
}

/** A small live preview over the 3D view while the project's displays run. */
export function DisplayPip() {
  const specs = useScene((s) => s.scene.displays);
  const screen = useApp((s) => s.screen);
  const [hidden, setHidden] = useState(false);
  const first = specs?.find((d) => panelForPart(d.part));
  if (!first || hidden || screen !== 'newProject') return null;
  const panel = panelForPart(first.part)!;
  return (
    <div className="display-pip" role="img" aria-label={t('Live preview of {part}', { part: first.part })}>
      <div className="row between small">
        <span>
          {first.part} · {t('simulated')}
        </span>
        <button className="link small" onClick={() => setHidden(true)} aria-label={t('Hide')}>
          ×
        </button>
      </div>
      <DisplayCanvas runKey={first.part} maxW={150} maxH={120} round={panel.round} />
    </div>
  );
}
