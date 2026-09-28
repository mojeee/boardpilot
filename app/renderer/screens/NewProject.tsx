// New project (right panel): add parts, let the app pick safe pins, get a starter sketch.

import { useState } from 'react';
import { PARTS, getBoard } from '@shared/board';
import { assignPins } from '@shared/assign';
import { generateSketch } from '@shared/sketch';
import { useScene, log } from '../state/store';
import { PhotoInput } from '../components/PhotoInput';
import { PartsLibrary } from '../components/PartsLibrary';
import { addPart } from '../state/sceneActions';
import { AssistantPanel } from '../components/AssistantPanel';

export function NewProjectPanel() {
  const scene = useScene((s) => s.scene);
  const findings = useScene((s) => s.findings);
  const [sketch, setSketch] = useState<string | null>(null);
  const board = getBoard(scene.board);

  const assign = () => {
    const r = assignPins(scene, board, PARTS);
    useScene.getState().setScene(r.scene, true);
    if (!r.notes.length) log('info', 'Every part pin is already wired.');
    for (const n of r.notes) log('action', `Pin assigned: ${n}`, { source: 'pin rules (safe pins)' });
    useScene.getState().preset('home');
  };

  return (
    <div className="right-split">
      <div className="right-top">
        <div className="wizard">
          <div className="wiz-head">
            <div>
              <div className="panel-title">New project</div>
              <div className="small dim">Add your parts. The app picks safe pins and writes starter code.</div>
            </div>
          </div>
          <div className="label">1. Add parts</div>
          <PartsLibrary />
          <PhotoInput compact onConfirm={(id) => addPart(id, { confirmed: true })} />
          <div className="label">2. Wire them</div>
          <div className="row gap wrap">
            <button className="btn primary small" disabled={!scene.parts.length} onClick={assign}>
              Assign safe pins
            </button>
            <button className="btn small" onClick={() => useScene.getState().set({ wireMode: true, wireFrom: null })}>
              Draw wires myself
            </button>
            <button
              className="btn small ghost"
              onClick={() => {
                useScene.getState().setScene({ ...scene, wires: [] }, true);
                log('action', 'Removed all wires.');
              }}
            >
              Clear wires
            </button>
          </div>
          <p className="small dim">
            Safe pins avoid the flash pins (GPIO 6–11), input-only pins (34–39) for outputs, strapping pins (0, 2, 5, 12, 15) and the USB serial pins.
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
          <div className="label">3. Starter code</div>
          <div className="row gap wrap">
            <button className="btn small" disabled={!scene.parts.length} onClick={() => setSketch(generateSketch(scene, board, PARTS))}>
              Generate sketch
            </button>
            {sketch && (
              <button className="btn small ghost" onClick={() => window.bp.session.saveFile('BoardPilotProject.ino', sketch)}>
                Save .ino…
              </button>
            )}
          </div>
          {sketch && <pre className="code">{sketch}</pre>}
        </div>
      </div>
      <div className="right-bottom small-assistant">
        <AssistantPanel />
      </div>
    </div>
  );
}
