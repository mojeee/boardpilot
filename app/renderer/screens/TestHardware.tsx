// Test hardware: I2C scan grid, bus wiring diagram, decoded bus view, pin checks, GPIO and ADC tests.

import { useMemo, useState } from 'react';
import type { I2cTraceStep, PinDef, TargetRef } from '@shared/types';
import { PARTS, boardPinFor, getBoard, pinById, pinByGpio } from '@shared/board';
import { currentBoard, useApp, useLive, useScene, log } from '../state/store';
import { agent, confirmGpioWrite, confirmInstallAgent } from '../state/hw';
import { openTask } from '../components/TaskRail';
import { t } from '@shared/i18n';

function Gate() {
  const conn = useApp((s) => s.conn);
  if (!conn.chip)
    return (
      <div className="gate">
        <b>{t('Connect the board first.')}</b>
        <span className="dim">{t('The tests talk to the board through USB.')}</span>
        <button className="btn primary" onClick={() => openTask('connect')}>
          {t('Connect and identify')}
        </button>
      </div>
    );
  if (!conn.agent)
    return (
      <div className="gate">
        <b>{t('These tests need the diagnostic agent on the board.')}</b>
        <span className="dim">{t('The app backs up your program first, and asks before writing anything.')}</span>
        <div className="row gap">
          <button className="btn primary" onClick={() => confirmInstallAgent()}>
            {t('Install the agent…')}
          </button>
          <button className="btn" onClick={() => window.bp.hw.connectAgent()}>
            {t('The agent is already on it')}
          </button>
        </div>
      </div>
    );
  return null;
}

/* ---------------- I2C ---------------- */

function useBus() {
  const scene = useScene((s) => s.scene);
  const board = getBoard(scene.board);
  return useMemo(() => {
    const i2c = scene.parts.filter((p) => PARTS[p.partId]?.bus === 'i2c');
    const first = i2c[0];
    const sdaPin = (first && boardPinFor(scene, first.id, 'SDA')) || board.rules.i2c.sda;
    const sclPin = (first && boardPinFor(scene, first.id, 'SCL')) || board.rules.i2c.scl;
    return {
      board,
      parts: i2c,
      sdaPin,
      sclPin,
      sda: pinById(board, sdaPin)?.gpio ?? pinById(board, board.rules.i2c.sda)?.gpio ?? 0,
      scl: pinById(board, sclPin)?.gpio ?? pinById(board, board.rules.i2c.scl)?.gpio ?? 0,
      expected: i2c.flatMap((p) => PARTS[p.partId].addresses ?? []).map((a) => a.toLowerCase()),
    };
  }, [scene, board]);
}

function I2cCard({ onPullups }: { onPullups: (p: Record<string, boolean>) => void }) {
  const bus = useBus();
  const [found, setFound] = useState<string[] | null>(null);
  const [swapped, setSwapped] = useState<string[] | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const agentOn = useApp((s) => !!s.conn.agent);
  const targets: TargetRef[] = [`pin:${bus.sdaPin}`, `pin:${bus.sclPin}`];

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    useScene.getState().focusOn(targets);
    await fn();
    setBusy(false);
  };
  const scan = () =>
    run(async () => {
      const pu = await agent({ cmd: 'pullup_check', pins: [bus.sda, bus.scl] });
      if (pu.ok) onPullups(pu.value.external);
      const r = await agent({ cmd: 'i2c_scan', sda: bus.sda, scl: bus.scl, hz: 100000 });
      if (!r.ok) return void log('failed', `${r.error.humanMessage} ${r.error.hint}`);
      setFound(r.value.found);
      log(
        r.value.found.length ? 'found' : 'warning',
        r.value.found.length
          ? t('I2C scan on {sda}/{scl}: {list}', { sda: bus.sdaPin, scl: bus.sclPin, list: r.value.found.join(', ') })
          : t('I2C scan on {sda}/{scl}: no device', { sda: bus.sdaPin, scl: bus.sclPin }),
        { source: 'measured: i2c_scan', target: targets[0] },
      );
    });
  const swap = () =>
    run(async () => {
      const r = await agent({ cmd: 'i2c_scan', sda: bus.scl, scl: bus.sda, hz: 100000 });
      if (!r.ok) return void log('failed', `${r.error.humanMessage} ${r.error.hint}`);
      setSwapped(r.value.found);
      log(
        r.value.found.length ? 'warning' : 'check',
        r.value.found.length
          ? t('Swap test (SDA {sda}, SCL {scl}): {list}: the lines are crossed', { sda: bus.sclPin, scl: bus.sdaPin, list: r.value.found.join(', ') })
          : t('Swap test (SDA {sda}, SCL {scl}): no device', { sda: bus.sclPin, scl: bus.sdaPin }),
        {
          source: 'measured: i2c_scan (swapped)',
          target: targets[0],
        },
      );
    });
  const readId = () =>
    run(async () => {
      const addr = found?.[0];
      const part = bus.parts.find((p) => PARTS[p.partId].addresses?.map((a) => a.toLowerCase()).includes(addr?.toLowerCase() ?? ''));
      const check = part && PARTS[part.partId].idCheck;
      if (!addr || !check) return void log('info', t('Scan first; the ID check needs a device that answered and has a known ID register.'));
      const r = await agent({ cmd: 'i2c_read', sda: bus.sda, scl: bus.scl, addr, reg: check.register, len: 1 });
      if (!r.ok) return void log('failed', `${r.error.humanMessage} ${r.error.hint}`);
      const v = r.value.data[0];
      setId(v);
      const other = check.otherValues?.[v];
      const idText = t('ID register {reg} at {addr} = {value} (expected {expect})', { reg: check.register, addr, value: v ?? '—', expect: check.expect });
      log(v?.toLowerCase() === check.expect.toLowerCase() ? 'found' : 'warning', other ? `${idText}. ${t(other)}` : idText, {
        source: `measured: i2c_read ${check.register}`,
        target: `part:${part.id}`,
      });
    });

  const cell = (a: number) => {
    const hex = '0x' + a.toString(16).toUpperCase().padStart(2, '0');
    const low = hex.toLowerCase();
    const hit = found?.some((f) => f.toLowerCase() === low);
    const swapHit = swapped?.some((f) => f.toLowerCase() === low);
    const exp = bus.expected.includes(low);
    const reserved = a < 0x08 || a > 0x77;
    return (
      <div key={a} className={`addr ${hit ? 'hit' : ''} ${swapHit ? 'swap' : ''} ${exp ? 'exp' : ''} ${reserved ? 'res' : ''}`} title={hex}>
        {a.toString(16).toUpperCase().padStart(2, '0')}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="card-title">
        {t('I2C bus')} <span className="mono dim">SDA {bus.sdaPin} · SCL {bus.sclPin}</span>
      </div>
      <div className="addr-grid">{Array.from({ length: 128 }, (_, a) => cell(a))}</div>
      <div className="grid-legend small">
        <span>
          <i className="hit" /> {t('answered')}
        </span>
        <span>
          <i className="swap" /> {t('answered only when swapped')}
        </span>
        <span>
          <i className="exp" /> {t('expected from your parts')}
        </span>
      </div>
      <div className="row gap wrap">
        <button className="btn primary small" disabled={!agentOn || busy} onClick={scan}>
          {t('Scan')}
        </button>
        <button className="btn small" disabled={!agentOn || busy} onClick={swap}>
          {t('Swap test')}
        </button>
        <button className="btn small" disabled={!agentOn || busy || !found?.length} onClick={readId}>
          {t('Read chip ID')}
        </button>
        {id && <span className="mono">ID = {id}</span>}
      </div>
    </div>
  );
}

function BusDiagram({ pullups }: { pullups: Record<string, boolean> | null }) {
  const bus = useBus();
  const W = 520;
  const H = 70 + Math.max(1, bus.parts.length) * 0 + 150;
  const partW = 120;
  return (
    <div className="card">
      <div className="card-title">{t('Bus wiring (from your project)')}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="bus-svg">
        <rect x={10} y={30} width={90} height={80} rx={6} fill="var(--pcb)" />
        <text x={55} y={24} textAnchor="middle" className="svg-small">
          {bus.board.chip}
        </text>
        {[
          { y: 55, pin: bus.sdaPin, g: bus.sda, color: 'var(--pin-sda)', name: 'SDA' },
          { y: 85, pin: bus.sclPin, g: bus.scl, color: 'var(--pin-scl)', name: 'SCL' },
        ].map((l) => (
          <g key={l.name} className="clickable" onClick={() => useScene.getState().focusOn([`pin:${l.pin}`])}>
            <text x={20} y={l.y + 4} className="svg-mono">
              {l.pin}
            </text>
            <line x1={100} y1={l.y} x2={W - 10} y2={l.y} stroke={l.color} strokeWidth={3} />
            <text x={108} y={l.y - 6} className="svg-small" fill={l.color}>
              {l.name}
              {pullups ? ` · ${pullups[String(l.g)] ? t('pulled up ✓ (measured)') : t('no pull-up ✗ (measured)')}` : ''}
            </text>
          </g>
        ))}
        {bus.parts.length === 0 && (
          <text x={260} y={150} textAnchor="middle" className="svg-small">
            {t('No I2C parts in your project. Add them in New project.')}
          </text>
        )}
        {bus.parts.map((p, i) => {
          const x = 150 + i * (partW + 20);
          const def = PARTS[p.partId];
          const sdaTo = boardPinFor(useScene.getState().scene, p.id, 'SDA');
          const crossed = sdaTo && sdaTo !== bus.sdaPin;
          return (
            <g key={p.id} className="clickable" onClick={() => useScene.getState().focusOn([`part:${p.id}`])}>
              <line x1={x + 30} y1={55} x2={x + 30} y2={130} stroke="var(--pin-sda)" strokeWidth={2} />
              <line x1={x + 70} y1={85} x2={x + 70} y2={130} stroke="var(--pin-scl)" strokeWidth={2} />
              <rect x={x} y={130} width={partW} height={60} rx={6} fill="var(--raised)" stroke={crossed ? 'var(--warn)' : 'var(--line)'} />
              <text x={x + 10} y={152} className="svg-label">
                {p.label ?? def.name}
              </text>
              <text x={x + 10} y={172} className="svg-mono">
                {(def.addresses ?? []).join(' / ')}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------------- decoded bus view ---------------- */

function bitsOf(v: string | undefined): number[] {
  const n = parseInt(v ?? '0', 16);
  return Array.from({ length: 8 }, (_, i) => (n >> (7 - i)) & 1);
}

export function DecodedBus() {
  const trace = useLive((s) => s.trace);
  const steps: I2cTraceStep[] = trace?.trace ?? [];
  const BIT = 20;
  // Build segments: each byte = 8 data bits + 1 ack bit.
  type Seg = { kind: 'start' | 'stop' | 'byte'; label?: string; bits?: number[]; ack?: boolean; x: number; w: number };
  const segs: Seg[] = [];
  let x = 20;
  for (const s of steps) {
    if (s.t === 'start' || s.t === 'restart') {
      segs.push({ kind: 'start', label: s.t === 'restart' ? 'Sr' : 'S', x, w: BIT * 1.5 });
      x += BIT * 1.5;
    } else if (s.t === 'stop') {
      segs.push({ kind: 'stop', label: 'P', x, w: BIT * 1.5 });
      x += BIT * 1.5;
    } else {
      const byte = s.t === 'addr' ? ((parseInt(s.v ?? '0', 16) << 1) | (s.rw === 'r' ? 1 : 0)).toString(16) : s.v?.replace(/^0x/i, '');
      const label = s.t === 'addr' ? `${s.v} ${s.rw === 'r' ? t('Read') : t('Write')}` : `${s.v}`;
      segs.push({ kind: 'byte', label, bits: bitsOf('0x' + byte), ack: s.ack, x, w: BIT * 9 });
      x += BIT * 9 + 4;
    }
  }
  const W = Math.max(600, x + 20);
  const sdaY = (b: number) => (b ? 60 : 84);
  const sclY = (b: number) => (b ? 118 : 142);
  let sdaPath = `M 0 ${sdaY(1)}`;
  let sclPath = `M 0 ${sclY(1)}`;
  for (const s of segs) {
    if (s.kind === 'start') {
      sdaPath += ` L ${s.x + s.w * 0.4} ${sdaY(1)} L ${s.x + s.w * 0.5} ${sdaY(0)} L ${s.x + s.w} ${sdaY(0)}`;
      sclPath += ` L ${s.x + s.w * 0.8} ${sclY(1)} L ${s.x + s.w * 0.85} ${sclY(0)} L ${s.x + s.w} ${sclY(0)}`;
    } else if (s.kind === 'stop') {
      sdaPath += ` L ${s.x} ${sdaY(0)} L ${s.x + s.w * 0.5} ${sdaY(0)} L ${s.x + s.w * 0.6} ${sdaY(1)} L ${s.x + s.w} ${sdaY(1)}`;
      sclPath += ` L ${s.x + s.w * 0.15} ${sclY(0)} L ${s.x + s.w * 0.2} ${sclY(1)} L ${s.x + s.w} ${sclY(1)}`;
    } else {
      const all = [...(s.bits ?? []), s.ack ? 0 : 1];
      all.forEach((b, i) => {
        const bx = s.x + i * BIT;
        sdaPath += ` L ${bx + 1} ${sdaY(b)} L ${bx + BIT} ${sdaY(b)}`;
        sclPath += ` L ${bx + BIT * 0.3} ${sclY(0)} L ${bx + BIT * 0.35} ${sclY(1)} L ${bx + BIT * 0.75} ${sclY(1)} L ${bx + BIT * 0.8} ${sclY(0)} L ${bx + BIT} ${sclY(0)}`;
      });
      sdaPath += ` L ${s.x + s.w + 4} ${sdaY(all[all.length - 1])}`;
      sclPath += ` L ${s.x + s.w + 4} ${sclY(0)}`;
    }
  }
  const board = currentBoard();
  const sdaPin = trace ? pinByGpio(board, trace.sda)?.label : '';
  const sclPin = trace ? pinByGpio(board, trace.scl)?.label : '';

  return (
    <div className="card wide">
      <div className="card-title">
        {t('Decoded bus')}{' '}
        {trace && (
          <span className="mono dim">
            {trace.cmd === 'i2c_scan' ? t('last scan') : t('last read')} · SDA {sdaPin} · SCL {sclPin}
          </span>
        )}
      </div>
      {!trace ? (
        <div className="empty">{t('Run a scan or an ID read to see the bus transaction, bit by bit.')}</div>
      ) : (
        <div className="decode-scroll">
          <svg viewBox={`0 0 ${W} 190`} width={W} height={190} className="decode-svg">
            <text x={2} y={56} className="svg-mono" fill="var(--pin-sda)">
              SDA
            </text>
            <text x={2} y={114} className="svg-mono" fill="var(--pin-scl)">
              SCL
            </text>
            <path d={sdaPath} stroke="var(--pin-sda)" strokeWidth={2} fill="none" transform="translate(0,0)" />
            <path d={sclPath} stroke="var(--pin-scl)" strokeWidth={2} fill="none" />
            {segs.map((s, i) =>
              s.kind === 'byte' ? (
                <g key={i}>
                  <rect x={s.x} y={14} width={BIT * 8} height={20} rx={4} fill="var(--raised)" />
                  <text x={s.x + BIT * 4} y={28} textAnchor="middle" className="svg-mono">
                    {s.label}
                  </text>
                  <rect x={s.x + BIT * 8 + 1} y={14} width={BIT - 2} height={20} rx={3} fill={s.ack ? 'var(--ok)' : 'var(--err)'} opacity={0.85} />
                  <text x={s.x + BIT * 8.5} y={28} textAnchor="middle" className="svg-tiny" fill="#111">
                    {s.ack ? 'A' : 'N'}
                  </text>
                  {s.bits?.map((b, j) => (
                    <text key={j} x={s.x + j * BIT + BIT / 2} y={170} textAnchor="middle" className="svg-mono dim">
                      {b}
                    </text>
                  ))}
                  <text x={s.x + BIT * 8.5} y={170} textAnchor="middle" className="svg-mono" fill={s.ack ? 'var(--ok)' : 'var(--err)'}>
                    {s.ack ? 'ack' : 'nack'}
                  </text>
                </g>
              ) : (
                <g key={i}>
                  <text x={s.x + s.w / 2} y={28} textAnchor="middle" className="svg-mono" fill="var(--ai)">
                    {s.label}
                  </text>
                </g>
              ),
            )}
          </svg>
        </div>
      )}
      <div className="small dim">
        {t('S = start, Sr = repeated start, P = stop. A = the receiver acknowledged the byte, N = no acknowledge. The last byte of a read is not acknowledged by design.')}
      </div>
    </div>
  );
}

/* ---------------- pin checks, GPIO and ADC tests ---------------- */

interface PinRow {
  pin: PinDef;
  role: string;
  partName: string;
}

function PinChecks({ onPullups }: { onPullups: (p: Record<string, boolean>) => void }) {
  const scene = useScene((s) => s.scene);
  const board = getBoard(scene.board);
  const agentOn = useApp((s) => !!s.conn.agent);
  const [results, setResults] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const rows: PinRow[] = [];
  for (const w of scene.wires) {
    const boardEnd = w.from.part === 'board' ? w.from : w.to.part === 'board' ? w.to : null;
    const partEnd = w.from.part === 'board' ? w.to : w.from;
    const pin = boardEnd ? pinById(board, boardEnd.pin) : undefined;
    const inst = scene.parts.find((p) => p.id === partEnd.part);
    if (!pin || pin.gpio === null || !inst) continue;
    const role = PARTS[inst.partId]?.pins.find((p) => p.name === partEnd.pin)?.role ?? '';
    rows.push({ pin, role, partName: `${inst.label ?? PARTS[inst.partId]?.name} ${partEnd.pin}` });
  }

  const runAll = async () => {
    setBusy(true);
    const out: Record<string, string> = {};
    const inputs = rows.filter((r) => r.role !== 'digital_in' && r.role !== 'analog_out').map((r) => r.pin.gpio!);
    if (inputs.length) {
      const pu = await agent({ cmd: 'pullup_check', pins: inputs });
      if (pu.ok) {
        onPullups(pu.value.external);
        for (const [g, v] of Object.entries(pu.value.external)) {
          const p = pinByGpio(board, Number(g));
          out[g] = v ? t('HIGH with nothing driving it: external pull-up') : t('LOW: no pull-up');
          log('check', `${p?.label ?? g}: ${out[g]}`, { target: p ? (`pin:${p.id}` as TargetRef) : undefined, source: 'measured: pullup_check' });
        }
      }
    }
    for (const r of rows.filter((x) => x.role === 'analog_out')) {
      const a = await agent({ cmd: 'adc', pin: r.pin.gpio! });
      if (a.ok) {
        out[String(r.pin.gpio)] = `${a.value.mv} mV`;
        log('check', `${r.pin.label}: ${a.value.mv} mV`, { target: `pin:${r.pin.id}`, source: 'measured: adc' });
      }
    }
    const s = await agent({ cmd: 'strapping' });
    if (s.ok) {
      for (const [g, v] of Object.entries(s.value.strapping)) {
        const p = pinByGpio(board, Number(g));
        if (rows.some((r) => r.pin.gpio === Number(g))) {
          const atReset = t('level at reset: {level}', { level: v });
          out[g] = out[g] ? `${out[g]}; ${atReset}` : atReset;
          if (Number(g) === 12 && v === 1)
            log('warning', t('D12 (GPIO 12) was HIGH at reset. That selects 1.8 V flash and can stop the board from booting.'), { target: 'pin:D12', source: 'measured: agent boot report' });
          else if (p) log('check', t('{pin} level at reset: {level}', { pin: p.label, level: v }), { target: `pin:${p.id}`, source: 'measured: agent boot report' });
        }
      }
    }
    setResults(out);
    setBusy(false);
  };

  return (
    <div className="card">
      <div className="card-title">{t('Pin checks')}</div>
      {rows.length === 0 ? (
        <div className="empty">{t('No wired pins in your project yet.')}</div>
      ) : (
        <table className="pin-table">
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.pin.id}-${r.partName}`} className="clickable" onClick={() => useScene.getState().focusOn([`pin:${r.pin.id}`])}>
                <td className="mono">{r.pin.label}</td>
                <td className="dim">{r.partName}</td>
                <td className="mono small">{results[String(r.pin.gpio)] ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="btn small primary" disabled={!agentOn || busy || !rows.length} onClick={runAll}>
        {t('Run pin checks')}
      </button>
    </div>
  );
}

function OutputTests() {
  const scene = useScene((s) => s.scene);
  const board = getBoard(scene.board);
  const agentOn = useApp((s) => !!s.conn.agent);
  const mode = useApp((s) => s.conn.mode);
  const [ask, setAsk] = useState<{ q: string; pin: string; step: 'on' | 'off' } | null>(null);
  const [sweep, setSweep] = useState<{ min: number; max: number; running: boolean; pin: string } | null>(null);

  const leds = scene.parts.filter((p) => PARTS[p.partId]?.model.shape === 'led');
  const pots = scene.parts.filter((p) => PARTS[p.partId]?.bus === 'analog');

  const blink = async (pinId: string) => {
    const g = pinById(board, pinId)?.gpio;
    if (g === null || g === undefined) return;
    if (await confirmGpioWrite(g, 1, t('Turns {pin} on so you can check the LED lights up.', { pin: pinId })))
      setAsk({ q: t('Is the LED on {pin} on now?', { pin: pinId }), pin: pinId, step: 'on' });
  };
  const answer = async (yes: boolean) => {
    if (!ask) return;
    const target: TargetRef = `pin:${ask.pin}`;
    if (ask.step === 'on') {
      log(
        yes ? 'found' : 'failed',
        yes ? t('LED on {pin} lights up when the pin is HIGH.', { pin: ask.pin }) : t('LED on {pin} does not light up when the pin is HIGH.', { pin: ask.pin }),
        { target, source: 'user: confirmed by looking' },
      );
      if (!yes) log('info', t('Check the LED direction (long leg to the pin side) and the resistor.'), { target });
      const g = pinById(board, ask.pin)?.gpio;
      if (g !== null && g !== undefined && (await confirmGpioWrite(g, 0, t('Turns {pin} off again.', { pin: ask.pin }))))
        setAsk({ q: t('Is it off now?'), pin: ask.pin, step: 'off' });
      else setAsk(null);
    } else {
      log(
        yes ? 'found' : 'warning',
        yes ? t('LED on {pin} turns off when the pin is LOW.', { pin: ask.pin }) : t('LED on {pin} stays on when the pin is LOW.', { pin: ask.pin }),
        { target, source: 'user: confirmed by looking' },
      );
      setAsk(null);
    }
  };

  const runSweep = async (pinId: string) => {
    const g = pinById(board, pinId)?.gpio;
    if (g === null || g === undefined) return;
    let min = 4000;
    let max = -1;
    setSweep({ min: 0, max: 0, running: true, pin: pinId });
    log('action', t('ADC sweep on {pin}: turn the knob slowly from one end to the other (8 s).', { pin: pinId }), { target: `pin:${pinId}` });
    if (mode === 'sim') await window.bp.sim.control('turnKnob');
    const end = Date.now() + 8500;
    while (Date.now() < end) {
      const r = await agent({ cmd: 'adc', pin: g });
      if (r.ok) {
        min = Math.min(min, r.value.mv);
        max = Math.max(max, r.value.mv);
        setSweep({ min, max, running: true, pin: pinId });
      }
      await new Promise((res) => setTimeout(res, 100));
    }
    setSweep({ min, max, running: false, pin: pinId });
    const full = min < 150 && max > 3100;
    const sweepText = full
      ? t('ADC sweep on {pin}: {min} to {max} mV. The full range works.', { pin: pinId, min, max })
      : t('ADC sweep on {pin}: {min} to {max} mV. The full range was not reached: turn it all the way both ways, or check the outer pins go to 3V3 and GND.', { pin: pinId, min, max });
    log(full ? 'found' : 'warning', sweepText, {
      target: `pin:${pinId}`,
      source: 'measured: adc (repeated)',
    });
  };

  return (
    <div className="card">
      <div className="card-title">{t('Output and input tests')}</div>
      {leds.length === 0 && pots.length === 0 && <div className="empty">{t('Add an LED or a potentiometer to your project to test them here.')}</div>}
      {leds.map((l) => {
        const pinId = boardPinFor(scene, l.id, 'A');
        return pinId ? (
          <div key={l.id} className="test-row">
            <span>
              {t('{name} on', { name: l.label ?? 'LED' })} <b className="mono">{pinId}</b>
            </span>
            <button className="btn small" disabled={!agentOn} onClick={() => blink(pinId)}>
              {t('Turn on and check…')}
            </button>
          </div>
        ) : null;
      })}
      {ask && (
        <div className="ask-user">
          <b>{ask.q}</b>
          <div className="row gap">
            <button className="btn small primary" onClick={() => answer(true)}>
              {t('Yes')}
            </button>
            <button className="btn small" onClick={() => answer(false)}>
              {t('No')}
            </button>
          </div>
        </div>
      )}
      {pots.map((p) => {
        const pinId = boardPinFor(scene, p.id, 'OUT');
        return pinId ? (
          <div key={p.id} className="test-row">
            <span>
              {t('{name} on', { name: p.label ?? t('Knob') })} <b className="mono">{pinId}</b>
            </span>
            <button className="btn small" disabled={!agentOn || sweep?.running} onClick={() => runSweep(pinId)}>
              {t('Sweep test')}
            </button>
          </div>
        ) : null;
      })}
      {sweep && (
        <div className="sweep">
          <div className="sweep-bar">
            <i style={{ left: `${(sweep.min / 3300) * 100}%`, width: `${(Math.max(0, sweep.max - sweep.min) / 3300) * 100}%` }} />
          </div>
          <div className="mono small">
            {sweep.min} – {sweep.max} mV {sweep.running ? t('(turn the knob…)') : ''}
          </div>
        </div>
      )}
    </div>
  );
}

export function TestHardware() {
  const [pullups, setPullups] = useState<Record<string, boolean> | null>(null);
  const merge = (p: Record<string, boolean>) => setPullups((old) => ({ ...(old ?? {}), ...p }));
  return (
    <div className="screen-scroll">
      <div className="screen-head">
        <h2>{t('Test hardware')}</h2>
        <p className="dim">{t('Measure the real wires. Every result below comes from the board.')}</p>
      </div>
      <Gate />
      <div className="test-grid">
        <I2cCard onPullups={merge} />
        <BusDiagram pullups={pullups} />
        <DecodedBus />
        <PinChecks onPullups={merge} />
        <OutputTests />
      </div>
    </div>
  );
}
