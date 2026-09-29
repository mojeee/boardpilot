// New project (right panel): add parts, let the app pick safe pins, get a starter sketch.

import { useState } from 'react';
import { PARTS, getBoard } from '@shared/board';
import { assignPins } from '@shared/assign';
import { generateSketch } from '@shared/sketch';
import { generateStarter, starterToolchains, type StarterProject, type StarterToolchain } from '@shared/starter';
import { useScene, log } from '../state/store';
import { PhotoInput } from '../components/PhotoInput';
import { PartsLibrary } from '../components/PartsLibrary';
import { addPart } from '../state/sceneActions';
import { AssistantPanel } from '../components/AssistantPanel';
import { CodeCheck } from '../components/CodeCheck';
import { BomTable } from '../components/BomTable';
import { PowerBudget } from '../components/PowerBudget';
import { Calculators } from '../components/Calculators';
import { PortfolioPanel } from '../components/PortfolioPanel';
import { PinPlanner } from '../components/PinPlanner';
import { StateMachineDesigner } from '../components/StateMachineDesigner';
import { TemplatePicker, TemplateView } from '../components/TemplatePanel';
import { useTemplate } from '../state/templateRun';
import { TEMPLATES } from '@shared/templates';
import { t } from '@shared/i18n';
import '../styles/starter.css';

export function NewProjectPanel() {
  const scene = useScene((s) => s.scene);
  const findings = useScene((s) => s.findings);
  const [sketch, setSketch] = useState<string | null>(null);
  const [toolchainPick, setToolchain] = useState<StarterToolchain>('arduino');
  const [project, setProject] = useState<StarterProject | null>(null);
  const [openFile, setOpenFile] = useState('main.c');
  const [showTemplates, setShowTemplates] = useState(false);
  const tplOpen = useTemplate((s) => !!s.tpl);
  const hasMachine = useScene((s) => s.scene.stateMachine !== undefined);
  const board = getBoard(scene.board);
  const toolchains = starterToolchains(board);
  // A board without the picked toolchain falls back to Arduino.
  const toolchain = toolchains.includes(toolchainPick) ? toolchainPick : 'arduino';
  const shownProject = toolchain === 'arduino' ? null : project;
  const shownFile = shownProject?.files.find((f) => f.name === openFile) ?? shownProject?.files[0];

  const generate = () => {
    if (toolchain === 'arduino') {
      setSketch(generateSketch(scene, board, PARTS));
      return;
    }
    const p = generateStarter(toolchain, scene, board, PARTS);
    setProject(p);
    setOpenFile('main.c');
    log('action', t('Generated a Pico SDK project for {board}.', { board: board.name }), { source: 'starter generator' });
    for (const n of p.notes) log('warning', n, { source: 'starter generator' });
  };

  const saveFolder = async () => {
    const p = toolchain === 'arduino' ? (sketch ? generateStarter('arduino', scene, board, PARTS) : null) : shownProject;
    if (!p) return;
    // The Arduino folder holds the sketch shown on screen, as generated.
    const files = toolchain === 'arduino' && sketch ? p.files.map((f) => ({ ...f, text: sketch })) : p.files;
    const r = await window.bp.session.saveProject(p.folder, files);
    if (r.ok) log('action', t('Saved the project in {path}.', { path: r.value }));
    else if (r.error.code !== 'cancelled') log('failed', [r.error.humanMessage, r.error.hint].filter(Boolean).join(' '));
  };

  const assign = () => {
    const r = assignPins(scene, board, PARTS);
    useScene.getState().setScene(r.scene, true);
    if (!r.notes.length) log('info', t('Every part pin is already wired.'));
    for (const n of r.notes) log('action', t('Pin assigned: {note}', { note: n }), { source: 'pin rules (safe pins)' });
    useScene.getState().preset('home');
  };

  return (
    <div className="right-split">
      <div className="right-top">
        <div className="wizard">
          <div className="wiz-head">
            <div>
              <div className="panel-title">{t('New project')}</div>
              <div className="small dim">{t('Add your parts. The app picks safe pins and writes starter code.')}</div>
            </div>
          </div>
          {tplOpen ? (
            <TemplateView />
          ) : (
            <>
          <div className="row between">
            <div className="label">{t('Start from a template')}</div>
            <button className="btn small ghost" onClick={() => setShowTemplates(!showTemplates)}>
              {showTemplates ? t('Hide') : t('Show {n} templates', { n: TEMPLATES.length })}
            </button>
          </div>
          {showTemplates && <TemplatePicker />}
          <details className="bom-details">
            <summary className="label">{t('Plan my pins')}</summary>
            <PinPlanner />
          </details>
          <div className="label">{t('1. Add parts')}</div>
          <PartsLibrary />
          <PhotoInput compact onConfirm={(id) => addPart(id, { confirmed: true })} />
          <div className="label">{t('2. Wire them')}</div>
          <div className="row gap wrap">
            <button className="btn primary small" disabled={!scene.parts.length} onClick={assign}>
              {t('Assign safe pins')}
            </button>
            <button className="btn small" onClick={() => useScene.getState().set({ wireMode: true, wireFrom: null })}>
              {t('Draw wires myself')}
            </button>
            <button
              className="btn small ghost"
              onClick={() => {
                useScene.getState().setScene({ ...scene, wires: [] }, true);
                log('action', t('Removed all wires.'));
              }}
            >
              {t('Clear wires')}
            </button>
          </div>
          <p className="small dim">
            {t('Safe pins avoid the flash pins (GPIO 6–11), input-only pins (34–39) for outputs, strapping pins (0, 2, 5, 12, 15) and the USB serial pins.')}
          </p>
          {findings.length > 0 && (
            <div className="findings">
              {findings.map((f) => (
                <button key={f.id} className={`finding sev-${f.severity}`} onClick={() => useScene.getState().focusOn(f.targets)}>
                  <b>{f.message}</b>
                  <span>{f.hint}</span>
                </button>
              ))}
            </div>
          )}
          {scene.parts.length > 0 && (
            <details className="bom-details">
              <summary className="label">{t('Shopping list')}</summary>
              <BomTable />
            </details>
          )}
          {scene.parts.length > 0 && (
            <details className="bom-details">
              <summary className="label">{t('Power and battery life')}</summary>
              <PowerBudget />
            </details>
          )}
          <details className="bom-details">
            <summary className="label">{t('Portfolio project, stage by stage')}</summary>
            <PortfolioPanel />
          </details>
          <details className="bom-details">
            <summary className="label">{t('Calculators: timer, PWM, UART, ADC')}</summary>
            <Calculators />
          </details>
          <details className="bom-details" open={hasMachine || undefined}>
            <summary className="label">{t('State machine designer: diagram, C code and tests')}</summary>
            <StateMachineDesigner />
          </details>
          <div className="label">{t('3. Starter code')}</div>
          {toolchains.length > 1 && (
            <div className="row gap wrap">
              <span className="small dim">{t('Toolchain')}</span>
              <div className="seg" role="group" aria-label={t('Toolchain')}>
                {toolchains.map((tc) => (
                  <button key={tc} className={toolchain === tc ? 'on' : ''} onClick={() => setToolchain(tc)}>
                    {tc === 'arduino' ? t('Arduino') : t('Pico SDK')}
                  </button>
                ))}
              </div>
            </div>
          )}
          {toolchain === 'pico-sdk' && <p className="small dim">{t('A CMake project for the official Raspberry Pi Pico SDK, with only the pins in your drawing. The README says how to build it.')}</p>}
          <div className="row gap wrap">
            <button className="btn small" disabled={!scene.parts.length} onClick={generate}>
              {toolchain === 'arduino' ? t('Generate sketch') : t('Generate Pico SDK project')}
            </button>
            {toolchain === 'arduino' && sketch && (
              <button className="btn small ghost" onClick={() => window.bp.session.saveFile('BoardPilotProject.ino', sketch)}>
                {t('Save .ino…')}
              </button>
            )}
            {((toolchain === 'arduino' && sketch) || shownProject) && (
              <button className="btn small ghost" onClick={saveFolder}>
                {t('Save project folder…')}
              </button>
            )}
          </div>
          {toolchain === 'arduino' && sketch && <pre className="code">{sketch}</pre>}
          {shownProject && (
            <>
              {shownProject.notes.length > 0 && (
                <div className="findings">
                  {shownProject.notes.map((n) => (
                    <div key={n} className="finding sev-warning">
                      <b>{n}</b>
                    </div>
                  ))}
                </div>
              )}
              <div className="seg starter-files" role="tablist" aria-label={t('Project files')}>
                {shownProject.files.map((f) => (
                  <button key={f.name} role="tab" aria-selected={shownFile?.name === f.name} className={shownFile?.name === f.name ? 'on mono' : 'mono'} onClick={() => setOpenFile(f.name)}>
                    {f.name}
                  </button>
                ))}
              </div>
              {shownFile && <pre className="code">{shownFile.text}</pre>}
            </>
          )}
          <div className="label">{t('4. Check my code against the drawing')}</div>
          <CodeCheck />
            </>
          )}
        </div>
      </div>
      <div className="right-bottom small-assistant">
        <AssistantPanel />
      </div>
    </div>
  );
}
