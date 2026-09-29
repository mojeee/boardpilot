// Register map viewer: the chip's datasheet register table, read live through the diagnostic agent
// (i2c_read only, never a write) and decoded bit by bit. Values that were not read are shown as
// "not read"; values the datasheet does not describe are shown without a meaning, never guessed.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { RegisterDef, TargetRef } from '@shared/types';
import { PARTS, boardPinFor, getBoard, pinById } from '@shared/board';
import { bytesFromAgent, decodeBurst, decodeRegister, hex, parseHex, readPlan, regLen, registerMapFor, summarize, type DecodedRegister, type ReadBurst } from '@shared/regmap';
import { useApp, useScene, log } from '../state/store';
import { agent } from '../state/hw';
import { t } from '@shared/i18n';
import '../styles/registers.css';

interface Reading {
  d: DecodedRegister;
  /** epoch ms of the read */
  at: number;
}

const ACCESS_LABEL = { r: 'R', rw: 'R/W', w: 'W' } as const;

/** Parts in the scene whose chip has a register map the app can read over I2C. */
export function partsWithRegisters(scene: { parts: { id: string; partId: string; label?: string }[] }) {
  return scene.parts.filter((p) => PARTS[p.partId]?.bus === 'i2c' && !!registerMapFor(PARTS[p.partId], PARTS));
}

export function RegisterMap({ partId }: { partId: string }) {
  const scene = useScene((s) => s.scene);
  const conn = useApp((s) => s.conn);
  const sp = scene.parts.find((p) => p.id === partId);
  const def = sp ? PARTS[sp.partId] : undefined;
  const map = registerMapFor(def, PARTS);
  const board = getBoard(scene.board);
  const [addr, setAddr] = useState<string>(def?.addresses?.[0] ?? '');
  const [readings, setReadings] = useState<Record<string, Reading>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!sp || !def || !map) return null;

  const wiredSda = boardPinFor(scene, sp.id, 'SDA');
  const wiredScl = boardPinFor(scene, sp.id, 'SCL');
  const sdaPin = wiredSda ?? board.rules.i2c.sda;
  const sclPin = wiredScl ?? board.rules.i2c.scl;
  const sda = pinById(board, sdaPin)?.gpio ?? null;
  const scl = pinById(board, sclPin)?.gpio ?? null;
  const agentOn = !!conn.agent;
  const target: TargetRef = `part:${sp.id}`;
  const name = sp.label ?? def.name;

  /** One i2c_read for a burst of registers. Returns false when the read failed (error shown). */
  const readBurst = async (burst: ReadBurst, logEach: boolean): Promise<boolean> => {
    if (sda === null || scl === null) return false;
    const r = await agent({ cmd: 'i2c_read', sda, scl, addr, reg: hex(burst.addr), len: burst.len });
    if (!r.ok) {
      setError(`${t(r.error.humanMessage)} ${t(r.error.hint)}`);
      log('failed', t('Could not read {reg} from {name} at {addr}: {why}', { reg: hex(burst.addr), name, addr, why: t(r.error.humanMessage) }), {
        target,
        source: `measured: i2c_read ${hex(burst.addr)}`,
      });
      return false;
    }
    const bytes = bytesFromAgent(r.value.data);
    if (!bytes || bytes.length < burst.len) {
      setError(t('The board answered with data the app cannot read. Nothing is shown for these registers.'));
      return false;
    }
    const at = Date.now();
    const decoded = decodeBurst(burst, bytes);
    setReadings((old) => {
      const next = { ...old };
      for (const d of decoded) next[d.reg.addr] = { d, at };
      return next;
    });
    if (logEach)
      for (const d of decoded)
        log('check', summarize(d, t, 'undocumented value'), { target, source: `measured: i2c_read ${d.reg.addr} (${name} ${addr})` });
    return true;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    useScene.getState().focusOn([target]);
    await fn();
    setBusy(false);
  };

  const readAll = () =>
    run(async () => {
      const plan = readPlan(map);
      let n = 0;
      for (const b of plan) {
        if (!(await readBurst(b, false))) return;
        n += b.regs.length;
      }
      log('found', t('Read {n} registers from {name} at {addr}. Click a register to see its bits.', { n, name, addr }), {
        target,
        source: `measured: i2c_read (${plan.length}×)`,
      });
    });

  const readOne = (reg: RegisterDef) =>
    run(async () => {
      const a = parseHex(reg.addr);
      if (a === null) return;
      await readBurst({ addr: a, len: regLen(reg), regs: [reg] }, true);
      setOpen(reg.addr);
    });

  const canRead = agentOn && !busy && sda !== null && scl !== null && !!addr;

  return (
    <div className="regmap">
      <div className="regmap-head">
        <div className="regmap-where small">
          <span className="mono">{def.name}</span>
          <span className="dim">
            {' · '}
            SDA <b className="mono">{sdaPin}</b> · SCL <b className="mono">{sclPin}</b>
          </span>
          {def.addresses && def.addresses.length > 1 ? (
            <select className="regmap-addr mono" value={addr} onChange={(e) => { setAddr(e.target.value); setReadings({}); }} aria-label={t('I2C address')}>
              {def.addresses.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          ) : (
            <span className="chip mono">{addr}</span>
          )}
          {conn.mode === 'sim' && <span className="chip">{t('simulated board')}</span>}
        </div>
        <button className="btn primary small" disabled={!canRead} onClick={readAll}>
          {Object.keys(readings).length ? t('Read again') : t('Read all registers')}
        </button>
      </div>
      {(!wiredSda || !wiredScl) && <p className="dim small">{t('Not wired in your project: the app uses the board’s default I2C pins.')}</p>}
      {!agentOn && <p className="dim small">{t('Reading needs the diagnostic agent on the board (Test hardware installs it).')}</p>}
      <p className="regmap-ro small">{t('Read-only: this view only reads. It never writes to the chip.')}</p>
      {map.note && <p className="card-note small">{t(map.note)}</p>}
      {error && <p className="card-flag err">{error}</p>}

      <table className="regmap-table">
        <thead>
          <tr>
            <th>{t('Address')}</th>
            <th>{t('Register')}</th>
            <th>{t('Access')}</th>
            <th>{t('Value')}</th>
            <th>{t('Meaning')}</th>
          </tr>
        </thead>
        <tbody>
          {map.registers.map((reg) => {
            const rd = readings[reg.addr];
            const isOpen = open === reg.addr;
            return (
              <RegisterRow
                key={reg.addr}
                reg={reg}
                reading={rd}
                open={isOpen}
                canRead={canRead}
                onToggle={() => setOpen(isOpen ? null : reg.addr)}
                onRead={() => readOne(reg)}
              />
            );
          })}
        </tbody>
      </table>

      {map.commands && map.commands.length > 0 && (
        <details className="regmap-cmds">
          <summary>{t('Command table ({n} commands): documented, not read from the chip', { n: map.commands.length })}</summary>
          <p className="dim small">{t('Your code sends these bytes to set the chip up. The chip cannot report them back, so no current value is shown.')}</p>
          <table className="regmap-table">
            <thead>
              <tr>
                <th>{t('Code')}</th>
                <th>{t('Command')}</th>
                <th>{t('Bytes after')}</th>
                <th>{t('What it does')}</th>
              </tr>
            </thead>
            <tbody>
              {map.commands.map((c) => (
                <tr key={c.code}>
                  <td className="mono">{c.code}</td>
                  <td className="mono">{c.name}</td>
                  <td className="mono">{c.params ?? 0}</td>
                  <td>
                    {t(c.text)}
                    <div className="regmap-src">
                      {c.source.title}, {c.source.section}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

function RegisterRow({
  reg,
  reading,
  open,
  canRead,
  onToggle,
  onRead,
}: {
  reg: RegisterDef;
  reading?: Reading;
  open: boolean;
  canRead: boolean;
  onToggle: () => void;
  onRead: () => void;
}) {
  const d = reading?.d;
  const writeOnly = reg.access === 'w';
  const len = regLen(reg);
  const last = len > 1 ? hex((parseHex(reg.addr) ?? 0) + len - 1) : null;
  let meaning: string;
  if (writeOnly) meaning = t('Write-only: reading it back tells nothing.');
  else if (!d) meaning = '—';
  else if (d.fields.length) {
    const described = d.fields.filter((f) => !f.undescribed);
    meaning = described.map((f) => `${f.name}: ${f.meaning ? t(f.meaning) : t('undocumented value')}`).join(' · ');
  } else if (reg.values) meaning = d.meaning ? t(d.meaning) : t('This value is not in the datasheet table.');
  else meaning = t('Raw value {n}', { n: d.value });

  return (
    <>
      <tr className={`regmap-row ${open ? 'open' : ''} ${d ? 'read' : ''}`} onClick={onToggle}>
        <td className="mono">
          {reg.addr}
          {last && <span className="dim">–{last.slice(2)}</span>}
        </td>
        <td className="mono">{reg.name}</td>
        <td>
          <span className={`regmap-acc acc-${reg.access}`}>{ACCESS_LABEL[reg.access]}</span>
        </td>
        <td className="mono">
          {writeOnly ? <span className="dim">{t('write-only')}</span> : d ? d.hex : <span className="dim">{t('not read')}</span>}
        </td>
        <td className="regmap-meaning">{meaning}</td>
      </tr>
      {open && (
        <tr className="regmap-detail">
          <td colSpan={5}>
            <p className="card-note">{t(reg.text)}</p>
            {d && reg.fields && reg.fields.length > 0 && <BitStrip d={d} />}
            {d && d.fields.length > 0 && (
              <ul className="regmap-fields">
                {d.fields.map((f) => (
                  <li key={f.bits.join(':')} className={f.undescribed ? 'undescribed' : ''}>
                    <span className="mono regmap-bits">{f.bits[0] === f.bits[1] ? t('bit {n}', { n: f.bits[0] }) : t('bits {hi}:{lo}', { hi: f.bits[0], lo: f.bits[1] })}</span>
                    <span className="mono regmap-fname">{f.undescribed ? '—' : f.name}</span>
                    <span className="mono regmap-fval">{f.bin}</span>
                    <span>
                      {f.undescribed
                        ? t('Reserved or not described here: shown, not interpreted.')
                        : f.meaning
                          ? t(f.meaning)
                          : t('This value is not in the datasheet table.')}
                      {!f.undescribed && f.text && <span className="dim"> {t(f.text)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {d && d.bytes.length > 1 && (
              <p className="mono small">
                {t('Bytes read')}: {d.bytes.map((b) => hex(b)).join(' ')}
                {reg.shift ? ` → >> ${reg.shift}` : ''} = {d.hex} ({d.value})
              </p>
            )}
            <div className="regmap-foot small">
              {reading && (
                <span className="src-line src-measurement">
                  <span>{t('measured')}</span>
                  {t('i2c_read at {time}', { time: new Date(reading.at).toLocaleTimeString() })}
                </span>
              )}
              {reg.reset && (
                <span className="dim">
                  {t('Reset value {v}', { v: reg.reset })}
                  {d?.isReset === true ? ` · ${t('matches the value read')}` : d?.isReset === false ? ` · ${t('the value read is different')}` : ''}
                </span>
              )}
              <span className="src-line src-datasheet">
                <span>{t('datasheet')}</span>
                {reg.source.title}, {reg.source.section}
              </span>
              {!writeOnly && (
                <button
                  className="btn small"
                  disabled={!canRead}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRead();
                  }}
                >
                  {t('Read this register')}
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** The 8 bits of a one-byte register, grouped by field, highest bit on the left like the datasheet. */
function BitStrip({ d }: { d: DecodedRegister }) {
  const byte = d.bytes[0];
  return (
    <div className="regmap-strip" aria-label={t('Bits of {reg}', { reg: d.reg.name })}>
      {d.fields.map((f) => (
        <div key={f.bits.join(':')} className={`regmap-seg ${f.undescribed ? 'undescribed' : ''}`} style={{ flexGrow: f.bits[0] - f.bits[1] + 1 }}>
          <div className="regmap-seg-name mono">{f.undescribed ? '—' : f.name}</div>
          <div className="regmap-seg-bits">
            {Array.from({ length: f.bits[0] - f.bits[1] + 1 }, (_, i) => {
              const bit = f.bits[0] - i;
              return (
                <span key={bit} className={`mono ${(byte >> bit) & 1 ? 'one' : ''}`} title={t('bit {n}', { n: bit })}>
                  {(byte >> bit) & 1}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The register map in a dialog, opened from the part card. Rendered on the page body so it sits above every panel. */
export function RegisterMapDialog({ partId, onClose }: { partId: string; onClose: () => void }) {
  const sp = useScene((s) => s.scene.parts.find((p) => p.id === partId));
  const def = sp ? PARTS[sp.partId] : undefined;
  return createPortal(
    <div className="modal-back" role="dialog" aria-modal onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="modal regmap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>{t('Registers of {name}', { name: sp?.label ?? def?.name ?? partId })}</h2>
          <button className="btn small ghost" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
        <RegisterMap partId={partId} />
      </div>
    </div>,
    document.body,
  );
}
