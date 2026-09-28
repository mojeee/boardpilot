// Floating card for the selected pin, part or wire.

import type { BoardDef, PinFlag, TargetRef } from '@shared/types';
import { PARTS, ROLE_HEX, ROLE_VAR, canOutput, partRoleColor, pinById, pinRoleInScene, targetLabel } from '@shared/board';
import { useApp, useLive, useScene } from '../state/store';
import { confirmGpioWrite } from '../state/hw';
import { duplicateSelected, removeTarget, renamePart, rotateSelected } from '../state/sceneActions';
import { isBuiltin } from '../state/partsLib';
import { usePartEditor } from '../components/PartEditor';
import { Icon } from '../components/Icon';
import { t } from '@shared/i18n';

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
  const wires = scene.wires.filter((w) => w.from.part === id || w.to.part === id);
  return (
    <>
      <div className="card-head">
        <input className="text-in rename" value={sp.label ?? ''} placeholder={def.name} onChange={(e) => renamePart(id, e.target.value)} title={t('Rename')} />
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
        {!isBuiltin(def.id) && <span className="chip ai-chip">{t('my part')}</span>}
      </div>
      <div className="part-tools">
        <button className="btn small" title="R" onClick={() => rotateSelected(90)}>
          <Icon name="rotate" size={14} /> {t('Rotate')}
        </button>
        <button className="btn small" title="⌘D" onClick={() => duplicateSelected()}>
          <Icon name="copy" size={14} /> {t('Duplicate')}
        </button>
        <button className="btn small danger" title="Delete" onClick={() => removeTarget(`part:${id}`)}>
          <Icon name="trash" size={14} /> {t('Remove')}
        </button>
      </div>
      {def.measures && <p className="card-note">{t('Measures {what}.', { what: def.measures.join(', ') })}</p>}
      {findings.map((f) => (
        <p key={f.id} className={`card-flag ${f.severity === 'error' ? 'err' : 'warn'}`}>
          {t(f.message)} <span className="dim">{t(f.hint)}</span>
        </p>
      ))}
      <div className="card-section">
        <div className="label">{t('Pins')}</div>
        {def.pins.map((p) => {
          const w = wires.find((x) => (x.from.part === id && x.from.pin === p.name) || (x.to.part === id && x.to.pin === p.name));
          const other = w ? (w.from.part === id ? w.to : w.from) : null;
          return (
            <div key={p.name} className="pin-line mono small">
              <span className="swatch" style={{ background: ROLE_HEX[partRoleColor(p.role)] }} /> {p.name}
              <span className="dim"> → {other ? (other.part === 'board' ? other.pin : `${other.part}.${other.pin}`) : t('not wired')}</span>
            </div>
          );
        })}
      </div>
      <div className="card-section">
        <div className="label">{t('Source')}</div>
        {def.sources.map((s, i) => (
          <div key={i} className="small dim">
            {s.title}
            {s.section ? `, ${s.section}` : ''}
          </div>
        ))}
        {def.origin?.url && <div className="small dim">{def.origin.url}</div>}
      </div>
      {!isBuiltin(def.id) && (
        <button className="btn small ghost" onClick={() => usePartEditor.getState().open({ draft: def, replaceId: def.id })}>
          <Icon name="edit" size={14} /> {t('Edit part definition')}
        </button>
      )}
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
          onClick={() => removeTarget(`wire:${id}`)}
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
