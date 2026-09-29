// Monitor: serial console for the user's firmware, the timing view (sampled pin levels and decoded
// I2C), live plots colored by source pin, memory panel.

import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { currentBoard, useApp, useLive, log, type Series } from '../state/store';
import { startStream, agent } from '../state/hw';
import { ROLE_HEX, getBoard, pinByGpio } from '@shared/board';
import { openTask } from '../components/TaskRail';
import { TimingPanel } from '../components/TimingPanel';
import { t } from '@shared/i18n';

const WINDOWS = [
  { label: '30 s', s: 30 },
  { label: '2 min', s: 120 },
  { label: '10 min', s: 600 },
];
const BAUDS = [9600, 57600, 74880, 115200, 230400];

/** Color of a series = color of the pin it comes from (plots match the 3D view). */
function seriesColor(s: Series): string {
  if (s.pin === undefined) return s.color;
  const p = pinByGpio(currentBoard(), s.pin);
  if (!p) return s.color;
  if (p.functions.includes('I2C_SDA_default')) return s.key.startsWith('probe:') ? s.color : ROLE_HEX.sda;
  if (p.flags.includes('adc1') || p.flags.includes('adc2')) return s.unit === 'mV' ? ROLE_HEX.adc : ROLE_HEX.gpio;
  return s.color;
}

function Plot({ skey, windowS }: { skey: string; windowS: number }) {
  const el = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const s = useLive.getState().series[skey];
  const color = s ? seriesColor(s) : '#5CCB8F';

  useEffect(() => {
    if (!el.current) return;
    const opts: uPlot.Options = {
      width: el.current.clientWidth,
      height: 120,
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      scales: { x: { time: true } },
      axes: [
        { stroke: '#7D8997', grid: { stroke: '#232b35', width: 1 }, ticks: { stroke: '#2C3540' }, font: '10px IBM Plex Mono' },
        { stroke: '#7D8997', grid: { stroke: '#232b35', width: 1 }, ticks: { stroke: '#2C3540' }, font: '10px IBM Plex Mono', size: 70 },
      ],
      series: [{}, { stroke: color, width: 1.6, fill: color + '18', points: { show: false } }],
    };
    plot.current = new uPlot(opts, [[], []], el.current);
    const ro = new ResizeObserver(() => el.current && plot.current?.setSize({ width: el.current.clientWidth, height: 120 }));
    ro.observe(el.current);
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 50) return; // 20 fps is plenty
      last = t;
      const st = useLive.getState();
      if (st.paused) return;
      const ser = st.series[skey];
      if (!ser || !ser.t.length) return;
      const tEnd = ser.t[ser.t.length - 1];
      let i = ser.t.length - 1;
      while (i > 0 && ser.t[i - 1] >= tEnd - windowS) i--;
      plot.current?.setData([ser.t.slice(i), ser.v.slice(i)]);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      plot.current?.destroy();
    };
  }, [skey, windowS, color]);

  const latest = s?.v[s.v.length - 1];
  return (
    <div className="plot-card">
      <div className="plot-head">
        <span className="swatch" style={{ background: color }} />
        <b>{s?.label ?? skey}</b>
        {s?.pin !== undefined && <span className="mono dim small">GPIO {s.pin}</span>}
        <span className="mono plot-val">
          {latest !== undefined ? `${Number.isInteger(latest) ? latest : latest.toFixed(2)} ${s?.unit === 'level' ? '' : s?.unit}` : '—'}
        </span>
        <span className="src">{t('measured')}</span>
      </div>
      <div ref={el} />
    </div>
  );
}

function MemoryPanel() {
  const mem = useLive((s) => s.mem);
  const agentHello = useApp((s) => s.conn.agent);
  const last = mem[mem.length - 1];
  if (!last && !agentHello) {
    return (
      <div className="card">
        <div className="card-title">{t('Memory')}</div>
        <div className="empty">{t('Your firmware reports memory when it uses the BoardPilotProbe library (firmware/probe).')}</div>
      </div>
    );
  }
  const heapFree = last?.heapFree ?? agentHello?.heapFree ?? 0;
  const size = last?.heapSize ?? 327680;
  const pts = mem.slice(-120).map((m) => m?.heapFree ?? 0);
  const min = Math.min(...pts, heapFree);
  const max = Math.max(...pts, heapFree);
  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / Math.max(1, pts.length - 1)) * 200} ${40 - ((v - min) / Math.max(1, max - min)) * 36}`).join(' ');
  return (
    <div className="card">
      <div className="card-title">
        {t('Memory')} <span className="src">{last ? 'measured: BoardPilotProbe' : 'measured: agent hello'}</span>
      </div>
      <div className="mem-row">
        <div>
          <div className="label">{t('Free heap')}</div>
          <div className="mono big">{Math.round(heapFree / 1024)} KB</div>
        </div>
        {last?.heapMin !== undefined && (
          <div>
            <div className="label">{t('Lowest since start')}</div>
            <div className="mono big">{Math.round(last.heapMin / 1024)} KB</div>
          </div>
        )}
        {last?.stackFree !== undefined && (
          <div>
            <div className="label">{t('Stack left (loop)')}</div>
            <div className="mono big">{(last.stackFree / 1024).toFixed(1)} KB</div>
          </div>
        )}
      </div>
      <div className="heap-bar">
        <i style={{ width: `${Math.min(100, ((size - heapFree) / size) * 100)}%` }} />
      </div>
      <div className="small dim">
        {t('{pct}% of {total} KB heap in use', { pct: Math.round(((size - heapFree) / size) * 100), total: Math.round(size / 1024) })}
      </div>
      {pts.length > 2 && (
        <svg viewBox="0 0 200 42" className="spark">
          <path d={path} stroke="var(--pin-gpio)" fill="none" strokeWidth={1.2} />
        </svg>
      )}
    </div>
  );
}

function Console() {
  const serial = useLive((s) => s.serial);
  const [send, setSend] = useState('');
  const [hideProbe, setHideProbe] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const lines = (hideProbe ? serial.filter((l) => !l.startsWith('@bp ')) : serial).slice(-400);
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight;
  }, [serial.length]);
  return (
    <div className="card console-card">
      <div className="card-title">
        {t('Serial console')}
        <label className="small dim check">
          <input type="checkbox" checked={hideProbe} onChange={(e) => setHideProbe(e.target.checked)} /> {t('hide probe lines')}
        </label>
        <button className="link small" onClick={() => useLive.getState().set({ serial: [] })}>
          {t('Clear')}
        </button>
      </div>
      <div className="console" ref={box}>
        {lines.length === 0 && <div className="dim">{t('Nothing yet. Open the serial port above.')}</div>}
        {lines.map((l, i) => (
          <div key={i} className={/error|fail|could not|brownout|guru/i.test(l) ? 'err-text' : ''}>
            {l}
          </div>
        ))}
      </div>
      <div className="row gap">
        <input className="text-in mono" value={send} onChange={(e) => setSend(e.target.value)} placeholder={t('Send text to the board…')} />
        <button
          className="btn small"
          disabled={!send}
          onClick={async () => {
            await window.bp.hw.writeSerial(send + '\n');
            setSend('');
          }}
        >
          {t('Send')}
        </button>
      </div>
    </div>
  );
}

export function Monitor() {
  const conn = useApp((s) => s.conn);
  const paused = useLive((s) => s.paused);
  const recording = useLive((s) => s.recording);
  const [windowS, setWindowS] = useState(30);
  const baud = useLive((st) => st.baud);
  const setBaud = (b: number) => useLive.getState().set({ baud: b });
  const [keys, setKeys] = useState<string[]>([]);

  // Pick up new series as they appear.
  useEffect(() => {
    const id = setInterval(() => {
      const k = Object.keys(useLive.getState().series).sort();
      setKeys((old) => (old.join() === k.join() ? old : k));
    }, 500);
    return () => clearInterval(id);
  }, []);

  const openSerial = async () => {
    const r = await window.bp.hw.openSerial(baud);
    if (!r.ok) log('failed', `${r.error.humanMessage} ${r.error.hint}`);
    else log('info', t('Serial monitor open at {baud} baud.', { baud }));
  };
  const toggleRecord = async () => {
    if (!recording) {
      useLive.getState().set({ recording: { startedAt: Date.now(), rows: ['time_s,kind,data'] } });
      return;
    }
    useLive.getState().set({ recording: null });
    const r = await window.bp.session.saveFile(`boardpilot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`, recording.rows.join('\n'));
    if (r.ok) log('info', t('Recording saved to {path}.', { path: r.value }));
  };

  if (!conn.chip) {
    return (
      <div className="screen-scroll">
        <div className="gate">
          <b>{t('Connect the board first.')}</b>
          <button className="btn primary" onClick={() => openTask('connect')}>
            {t('Connect and identify')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-scroll">
      <div className="monitor-bar">
        <div className="seg-group">
          <span className="label">{t('Your firmware')}</span>
          <select value={baud} onChange={(e) => setBaud(Number(e.target.value))} className="select mono">
            {BAUDS.map((b) => (
              <option key={b} value={b}>
                {b} baud
              </option>
            ))}
          </select>
          {conn.serialOpen ? (
            <button className="btn small" onClick={() => window.bp.hw.closeSerial()}>
              {t('Close serial')}
            </button>
          ) : (
            <button className="btn small primary" onClick={openSerial}>
              {t('Open serial')}
            </button>
          )}
        </div>
        <div className="seg-group">
          <span className="label">{t('Agent pins')}</span>
          {conn.agent ? (
            conn.streaming ? (
              <button className="btn small" onClick={() => agent({ cmd: 'stream_stop' })}>
                {t('Stop live pins')}
              </button>
            ) : (
              <button className="btn small primary" onClick={() => startStream(20)}>
                {t('Stream live pins')}
              </button>
            )
          ) : conn.serialOpen ? (
            <span className="small dim">{t('serial is open')}</span>
          ) : (
            <button className="btn small" onClick={() => window.bp.hw.connectAgent()}>
              {t('Connect to agent')}
            </button>
          )}
        </div>
        <div className="seg">
          {WINDOWS.map((w) => (
            <button key={w.s} className={windowS === w.s ? 'on' : ''} onClick={() => setWindowS(w.s)}>
              {t(w.label)}
            </button>
          ))}
        </div>
        <button className={`btn small ${paused ? 'on' : ''}`} onClick={() => useLive.getState().set({ paused: !paused })}>
          {paused ? t('Resume') : t('Pause')}
        </button>
        <button className={`btn small ${recording ? 'rec' : ''}`} onClick={toggleRecord}>
          {recording ? t('■ Stop and save CSV ({n})', { n: recording.rows.length - 1 }) : t('● Record CSV')}
        </button>
        <button className="link small" onClick={() => useLive.getState().resetSeries()}>
          {t('Reset plots')}
        </button>
      </div>
      <TimingPanel />
      <div className="monitor-grid">
        <div className="plots">
          {keys.length === 0 && (
            <div className="card empty">
              {t('No live values yet. Open serial (for a sketch using BoardPilotProbe), or stream the pins through the agent.')}
            </div>
          )}
          {keys.map((k) => (
            <Plot key={k} skey={k} windowS={windowS} />
          ))}
        </div>
        <div className="side">
          <Console />
          <MemoryPanel />
        </div>
      </div>
    </div>
  );
}
