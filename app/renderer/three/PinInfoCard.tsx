// Floating card for the selected pin, part or wire.

import type { BoardDef, PinFlag, TargetRef } from '@shared/types';
import { PARTS, ROLE_VAR, canOutput, pinById, pinRoleInScene, targetLabel } from '@shared/board';
import { useApp, useLive, useScene } from '../state/store';
import { confirmGpioWrite } from '../state/hw';

const FLAG_TEXT: Partial<Record<PinFlag, { text: string; sev: 'warn' | 'info' }>> = {
  input_only: { text: 'Input only: can read, cannot drive an LED or other output. No internal pull-up.', sev: 'warn' },
  strapping: { text: 'Strapping pin: its level at reset changes how the board boots.', sev: 'warn' },
  flash: { text: 'Connected to the internal flash. Never use.', sev: 'warn' },
  uart0: { text: 'Carries the USB serial link (uploads and the serial monitor).', sev: 'warn' },
  adc2: { text: 'ADC2: measuring voltage stops working while Wi-Fi is on.', sev: 'info' },
  adc1: { text: 'ADC1: can measure voltage, also with Wi-Fi on.', sev: 'info' },
  onboard_led: { text: 'Drives the blue LED on the board.', sev: 'info' },
};

function PinCard({ board, pinId }: { board: BoardDef; pinId: string }) {
  const p = pinById(board, pinId);
  const scene = useScene((s) => s.scene);
  const allFindings = useScene((s) => s.findings);
  const findings = allFindings.filter((f) => f.targets.includes(`pin:${pinId}` as TargetRef));
  const live = useLive((s) => (p?.gpio !== null && p?.gpio !== undefined && Date.now() - s.frameAt < 2000 ? s.frame?.pins[String(p.gpio)] : undefined));
  const agentOn = useApp((s) => !!s.conn.agent);
  if (!p) return null;
  const role = pinRoleInScene(board, scene, pinId);
  const wires = scene.wires.filter((w) => (w.from.part === 'board' && w.from.pin === pinId) || (w.to.part === 'board' && w.to.pin === pinId));
  return (
    <>
      <div className="card-head">
        <span className="swatch" style={{ background: `var(${ROLE_VAR[role]})` }} />
        <span className="mono big">{p.label}</span>
        {p.gpio !== null && <span className="mono dim">GPIO {p.gpio}</span>}
      </div>
      <div className="chips">
        {p.functions.map((f) => (
          <span key={f} className="chip mono">
            {f.replace(/_default$/, ' (default)')}
          </span>
        ))}
      </div>
      {p.notes && <p className="card-note">{p.notes}</p>}
      {p.flags.map((f) =>
        FLAG_TEXT[f] ? (
          <p key={f} className={`card-flag ${FLAG_TEXT[f]!.sev}`}>
            {FLAG_TEXT[f]!.text}
          </p>
        ) : null,
      )}
      {findings.map((f) => (
        <p key={f.id} className={`card-flag ${f.severity === 'error' ? 'err' : 'warn'}`}>
          {f.message} <span className="dim">{f.hint}</span>
        </p>
      ))}
      {wires.length > 0 && (
        <div className="card-section">
          <div className="label">Wired to</div>
          {wires.map((w) => {
            const other = w.from.part === 'board' ? w.to : w.from;
            const sp = scene.parts.find((x) => x.id === other.part);
            return (
              <button key={w.id} className="link" onClick={() => useScene.getState().focusOn([`wire:${w.id}`])}>
                <span className="swatch" style={{ background: w.color }} /> {sp?.label ?? other.part} · {other.pin}
              </button>
            );
          })}
        </div>
      )}
      <div className="card-section">
        <div className="label">Live</div>
        {live ? (
          <div className="mono">
            {live.mode}
            {live.level !== undefined && ` · level ${live.level}`}
            {live.mv !== undefined && ` · ${live.mv} mV`}
            {live.duty !== undefined && ` · ${live.duty}% duty`}
            <span className="src"> measured</span>
          </div>
        ) : (
          <div className="dim">No live data. {agentOn ? 'Start live view in Monitor.' : 'Needs the diagnostic agent.'}</div>
        )}
        {p.kind === 'gpio' && p.gpio !== null && (
          <p className="dim small">
            {p.flags.includes('adc1') || p.flags.includes('adc2')
              ? 'Voltage is measured only on ADC pins, and only when the app asks the ADC.'
              : 'This pin reports a digital level only (0 or 1), never a voltage.'}
          </p>
        )}
      </div>
      {agentOn && p.gpio !== null && canOutput(p) && p.gpio !== 1 && p.gpio !== 3 && (
        <div className="row gap">
          <button className="btn small" onClick={() => confirmGpioWrite(p.gpio!, 1)}>
            Set HIGH…
          </button>
          <button className="btn small" onClick={() => confirmGpioWrite(p.gpio!, 0)}>
            Set LOW…
          </button>
        </div>
      )}
    </>
  );
}

function PartCard({ id }: { id: string }) {
  const scene = useScene((s) => s.scene);
  const allFindings = useScene((s) => s.findings);
  const findings = allFindings.filter((f) => f.targets.includes(`part:${id}` as TargetRef));
  const sp = scene.parts.find((p) => p.id === id);
  const def = sp && PARTS[sp.partId];
  if (!sp || !def) return null;
  return (
    <>
      <div className="card-head">
        <span className="big">{sp.label ?? def.name}</span>
      </div>
      <div className="dim">{def.name}</div>
      <div className="chips">
        {def.bus && <span className="chip mono">{def.bus.toUpperCase()}</span>}
        {def.addresses?.map((a) => (
          <span key={a} className="chip mono">
            {a}
          </span>
        ))}
        <span className="chip mono">{def.voltage} V</span>
      </div>
      {def.measures && <p className="card-note">Measures {def.measures.join(', ')}.</p>}
      {findings.map((f) => (
        <p key={f.id} className={`card-flag ${f.severity === 'error' ? 'err' : 'warn'}`}>
          {f.message} <span className="dim">{f.hint}</span>
        </p>
      ))}
      <div className="card-section">
        <div className="label">Source</div>
        {def.sources.map((s, i) => (
          <div key={i} className="small dim">
            {s.title}
            {s.section ? `, ${s.section}` : ''}
          </div>
        ))}
      </div>
      <div className="row gap">
        <button
          className="btn small danger"
          onClick={() => {
            useScene.getState().updateScene((s) => ({ ...s, parts: s.parts.filter((p) => p.id !== id), wires: s.wires.filter((w) => w.from.part !== id && w.to.part !== id) }));
            useScene.getState().select(null);
          }}
        >
          Remove part
        </button>
      </div>
    </>
  );
}

function WireCard({ board, id }: { board: BoardDef; id: string }) {
  const scene = useScene((s) => s.scene);
  const allFindings = useScene((s) => s.findings);
  const findings = allFindings.filter((f) => f.targets.includes(`wire:${id}` as TargetRef));
  const w = scene.wires.find((x) => x.id === id);
  if (!w) return null;
  const end = (e: { part: string; pin: string }) =>
    e.part === 'board' ? targetLabel(board, scene, `pin:${e.pin}`) : `${scene.parts.find((p) => p.id === e.part)?.label ?? e.part} ${e.pin}`;
  return (
    <>
      <div className="card-head">
        <span className="swatch" style={{ background: w.color }} />
        <span className="big">Wire</span>
      </div>
      <div className="mono">
        {end(w.from)} → {end(w.to)}
      </div>
      {findings.map((f) => (
        <p key={f.id} className={`card-flag ${f.severity === 'error' ? 'err' : 'warn'}`}>
          {f.message} <span className="dim">{f.hint}</span>
        </p>
      ))}
      <div className="row gap">
        <button
          className="btn small danger"
          onClick={() => {
            useScene.getState().updateScene((s) => ({ ...s, wires: s.wires.filter((x) => x.id !== id) }));
            useScene.getState().select(null);
          }}
        >
          Remove wire
        </button>
      </div>
    </>
  );
}

export function PinInfoCard({ board }: { board: BoardDef }) {
  const selected = useScene((s) => s.selected);
  if (!selected) return null;
  const [kind, id] = selected.split(/:(.+)/) as [string, string];
  if (id === 'board') return null;
  return (
    <div className="info-card">
      <button className="close" aria-label="Close" onClick={() => useScene.getState().select(null)}>
        ×
      </button>
      {kind === 'pin' && <PinCard board={board} pinId={id} />}
      {kind === 'part' && <PartCard id={id} />}
      {kind === 'wire' && <WireCard board={board} id={id} />}
    </div>
  );
}
