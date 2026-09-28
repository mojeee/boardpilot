// New project (right panel): add parts, let the app pick safe pins, get a starter sketch.

import { useState } from 'react';
import { PARTS, getBoard } from '@shared/board';
import { assignPins } from '@shared/assign';
import { generateSketch } from '@shared/sketch';
import { useScene, log } from '../state/store';
import { PhotoInput } from '../components/PhotoInput';
import { AssistantPanel } from '../components/AssistantPanel';

const SLOTS: [number, number][] = [
  [12, 44],
  [-18, 44],
  [40, 44],
  [-2, -40],
  [22, -42],
  [-24, -40],
  [48, -40],
  [-46, 44],
];

export function addPart(partId: string, confirmed = true) {
  const def = PARTS[partId];
  useScene.getState().updateScene((s) => {
    const base = partId.split('-')[0];
    let n = 1;
    while (s.parts.some((p) => p.id === `${base}${n}`)) n++;
    const free = SLOTS.find(([x, z]) => !s.parts.some((p) => Math.abs(p.position[0] - x) < 10 && Math.abs(p.position[2] - z) < 10)) ?? [60 + n * 5, 50];
    return { ...s, parts: [...s.parts, { id: `${base}${n}`, partId, position: [free[0], 0, free[1]], label: def.name.split(' ')[0], confirmed }] };
  });
  log('action', `Added ${def.name}.`);
}

export function NewProjectPanel() {
  const scene = useScene((s) => s.scene);
  const findings = useScene((s) => s.findings);
  const [sketch, setSketch] = useState<string | null>(null);
  const board = getBoard(scene.board);

  const assign = () => {
    const r = assignPins(scene, board, PARTS);
    useScene.getState().setScene(r.scene);
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
          <div className="lib-grid">
            {Object.values(PARTS).map((p) => (
              <button key={p.id} className="lib-item" onClick={() => addPart(p.id)}>
                <b>{p.name}</b>
                <span>
                  {p.bus?.toUpperCase()} · {p.voltage} V
                </span>
              </button>
            ))}
          </div>
          <PhotoInput compact onConfirm={(id) => addPart(id, true)} />
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
                useScene.getState().setScene({ ...scene, wires: [] });
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
