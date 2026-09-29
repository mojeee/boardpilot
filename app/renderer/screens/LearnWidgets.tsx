// Diagrams and small interactive demos for the Learn screen. Colors come from tokens.css:
// pin role colors are reused so a "timer" or "I2C" looks the same here as on the 3D board.

import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import type { WidgetId } from '@shared/lessons';
import { t } from '@shared/i18n';

type Tone = 'cpu' | 'mem' | 'io' | 'in' | 'out' | 'ok' | 'err' | 'warn' | 'spi';
const TONE: Record<Tone, string> = {
  cpu: 'var(--ai)',
  mem: 'var(--pin-sda)',
  io: 'var(--pin-uart)',
  in: 'var(--pin-ground)',
  out: 'var(--pin-power)',
  ok: 'var(--ok)',
  err: 'var(--err)',
  warn: 'var(--warn)',
  spi: 'var(--pin-spi)',
};
const fill = (tone: Tone, pct = 13) => `color-mix(in srgb, ${TONE[tone]} ${pct}%, var(--panel))`;
const HOT = 'var(--warn)';

const MarkerId = createContext('');

function Figure({ h, label, children }: { h: number; label: string; children: ReactNode }) {
  const id = `lf${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <figure className="learn-fig">
      <svg viewBox={`0 0 680 ${h}`} role="img" aria-label={label}>
        <defs>
          <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        <MarkerId.Provider value={id}>{children}</MarkerId.Provider>
      </svg>
    </figure>
  );
}

function Arrow({ d, color = 'var(--dim)' }: { d: string; color?: string }) {
  const id = useContext(MarkerId);
  return <path d={d} fill="none" stroke={color} strokeWidth={1.4} markerEnd={`url(#${id})`} />;
}

function Box(p: { x: number; y: number; w: number; h: number; title: string; sub?: string; tone: Tone; mono?: boolean }) {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  return (
    <g>
      <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={8} fill={fill(p.tone)} stroke={TONE[p.tone]} strokeOpacity={0.75} />
      <text x={cx} y={p.sub ? cy - 9 : cy} className={`lf-t ${p.mono ? 'mono' : ''}`} textAnchor="middle" dominantBaseline="central">
        {p.title}
      </text>
      {p.sub && (
        <text x={cx} y={cy + 10} className="lf-s" textAnchor="middle" dominantBaseline="central">
          {p.sub}
        </text>
      )}
    </g>
  );
}

const Label = ({ x, y, children, anchor = 'start', mono }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; mono?: boolean }) => (
  <text x={x} y={y} className={`lf-l ${mono ? 'mono' : ''}`} textAnchor={anchor} dominantBaseline="central">
    {children}
  </text>
);

// ---------- lesson 1 ----------

function McuAnatomy() {
  return (
    <Figure h={380} label={t('Inside a microcontroller')}>
      <rect x={190} y={40} width={300} height={300} rx={18} fill={fill('cpu', 6)} stroke="var(--ai-line)" />
      <text x={340} y={62} className="lf-t" textAnchor="middle" dominantBaseline="central">{t('Microcontroller (MCU)')}</text>
      <text x={340} y={82} className="lf-s" textAnchor="middle" dominantBaseline="central">{t('One chip, a whole computer')}</text>
      <Box x={208} y={100} w={122} h={56} tone="cpu" title={t('CPU core')} sub={t('Runs your code')} />
      <Box x={348} y={100} w={122} h={56} tone="mem" title={t('Flash')} sub={t('Stores the program')} />
      <Box x={208} y={170} w={122} h={56} tone="mem" title={t('RAM')} sub={t('Live variables')} />
      <Box x={348} y={170} w={122} h={56} tone="mem" title={t('Timers')} sub={t('Precise timing')} />
      <Box x={208} y={240} w={262} h={80} tone="io" title={t('Peripherals')} sub={t('GPIO, ADC, UART, I2C, SPI')} />
      <Box x={40} y={242} w={120} h={36} tone="in" title={t('Temp sensor')} />
      <Box x={40} y={286} w={120} h={36} tone="in" title={t('Button')} />
      <Box x={520} y={242} w={120} h={36} tone="out" title={t('LED')} />
      <Box x={520} y={286} w={120} h={36} tone="out" title={t('Motor')} />
      <Arrow d="M160 260 L204 260" />
      <Arrow d="M160 304 L204 304" />
      <Arrow d="M470 260 L516 260" />
      <Arrow d="M470 304 L516 304" />
    </Figure>
  );
}

function MemoryMap() {
  const rows: [number, string, string, Tone, string, string][] = [
    [40, '0x4000 0000', t('Peripherals'), 'io', t('GPIO, UART, timers'), t('Write 1 here: the LED turns on')],
    [130, '0x2000 0000', t('RAM'), 'mem', t('Variables, stack'), t('int counter lives here')],
    [220, '0x0800 0000', t('Flash'), 'cpu', t('Your program'), t('The compiled main() lives here')],
  ];
  return (
    <Figure h={300} label={t('Memory map of an STM32')}>
      {rows.map(([y, addr, title, tone, sub, note]) => (
        <g key={addr}>
          <Label x={185} y={y + 28} anchor="end" mono>{addr}</Label>
          <Box x={200} y={y} w={200} h={56} tone={tone} title={title} sub={sub} />
          <line x1={400} y1={y + 28} x2={430} y2={y + 28} stroke="var(--dim)" strokeDasharray="3 3" />
          <Label x={436} y={y + 28}>{note}</Label>
        </g>
      ))}
    </Figure>
  );
}

// ---------- lesson 2 ----------

function RegisterPlayground() {
  const [reg, setReg] = useState(0);
  const [n, setN] = useState(5);
  const [line, setLine] = useState<{ code: string; note: string } | null>(null);
  const bit = (v: number) => (v >> n) & 1;
  const run = (op: 'set' | 'clear' | 'toggle' | 'read' | 'reset') => {
    const m = 1 << n;
    let next = reg;
    let code = '';
    if (op === 'set') [next, code] = [reg | m, `REG |= (1 << ${n});`];
    if (op === 'clear') [next, code] = [reg & ~m, `REG &= ~(1 << ${n});`];
    if (op === 'toggle') [next, code] = [reg ^ m, `REG ^= (1 << ${n});`];
    if (op === 'read') code = `if (REG & (1 << ${n}))`;
    if (op === 'reset') [next, code] = [0, 'REG = 0;'];
    next &= 0xffff;
    setReg(next);
    const note =
      op === 'read' ? t('Bit {n} is {v}.', { n, v: bit(reg) }) : op === 'reset' ? t('All bits are 0.') : t('Bit {n} is now {v}. The other bits did not change.', { n, v: (next >> n) & 1 });
    setLine({ code, note });
  };
  return (
    <div className="learn-widget">
      <div className="reg-grid">
        {Array.from({ length: 16 }, (_, k) => 15 - k).map((i) => (
          <button key={i} className={`reg-cell mono ${(reg >> i) & 1 ? 'on' : ''} ${i === n ? 'sel' : ''}`} onClick={() => setN(i)} aria-label={t('Select bit {n}', { n: i })}>
            <span className="reg-idx">{i}</span>
            {(reg >> i) & 1}
          </button>
        ))}
      </div>
      <div className="learn-controls">
        <span className="dim">{t('Bit {n} selected', { n })}</span>
        <button className="btn small" onClick={() => run('set')}>{t('Set bit')}</button>
        <button className="btn small" onClick={() => run('clear')}>{t('Clear bit')}</button>
        <button className="btn small" onClick={() => run('toggle')}>{t('Flip bit')}</button>
        <button className="btn small" onClick={() => run('read')}>{t('Read bit')}</button>
        <button className="btn small ghost" onClick={() => run('reset')}>{t('All to 0')}</button>
      </div>
      <div className="learn-out">
        {line ? <div className="mono">{line.code}</div> : <div className="muted-text">{t('Pick a bit, then run one line of C.')}</div>}
        <div className="mono dim">REG = 0x{reg.toString(16).toUpperCase().padStart(4, '0')}</div>
        {line && <div className="muted-text">{line.note}</div>}
      </div>
    </div>
  );
}

// ---------- lesson 3 ----------

function GpioDemo() {
  const [odr, setOdr] = useState(0);
  const [pressed, setPressed] = useState(false);
  const outWire = odr ? HOT : 'var(--dim)';
  const inWire = pressed ? 'var(--dim)' : HOT;
  const Ground = ({ x }: { x: number }) => (
    <g stroke="var(--dim)" strokeWidth={2}>
      <line x1={x - 14} y1={236} x2={x + 14} y2={236} />
      <line x1={x - 9} y1={242} x2={x + 9} y2={242} strokeWidth={1.5} />
    </g>
  );
  return (
    <div className="learn-widget">
      <Figure h={280} label={t('An output pin drives an LED, an input pin reads a button')}>
        <Box x={30} y={60} w={90} h={180} tone="cpu" title="MCU" />
        <Label x={110} y={150} anchor="end" mono>PA5</Label>
        <line x1={120} y1={150} x2={170} y2={150} stroke={outWire} strokeWidth={2} />
        <rect x={170} y={142} width={40} height={16} rx={3} fill="none" stroke="var(--muted)" />
        <Label x={190} y={128} anchor="middle">{t('Resistor')}</Label>
        <line x1={210} y1={150} x2={241} y2={150} stroke={outWire} strokeWidth={2} />
        <circle cx={255} cy={150} r={14} fill={odr ? 'var(--warn)' : 'none'} stroke={odr ? 'var(--warn)' : 'var(--muted)'} strokeWidth={1.5} />
        <Label x={255} y={186} anchor="middle">{t('LED')}</Label>
        <path d="M269 150 L300 150 L300 236" fill="none" stroke="var(--dim)" strokeWidth={2} />
        <Ground x={300} />
        <Label x={300} y={262} anchor="middle" mono>GND</Label>
        <Label x={145} y={172} anchor="middle" mono>{odr ? '3.3 V' : '0 V'}</Label>

        <line x1={340} y1={40} x2={340} y2={270} stroke="var(--line)" strokeDasharray="4 4" />

        <Label x={430} y={40} anchor="middle" mono>3.3 V</Label>
        <line x1={430} y1={50} x2={430} y2={70} stroke={HOT} strokeWidth={2} />
        <rect x={422} y={70} width={16} height={40} rx={3} fill="none" stroke="var(--muted)" />
        <Label x={446} y={90}>{t('Pull-up')}</Label>
        <line x1={430} y1={110} x2={430} y2={150} stroke={inWire} strokeWidth={2} />
        <circle cx={430} cy={150} r={3} fill="var(--muted)" />
        <line x1={430} y1={150} x2={560} y2={150} stroke={inWire} strokeWidth={2} />
        <line x1={430} y1={150} x2={430} y2={185} stroke={inWire} strokeWidth={2} />
        <line x1={430} y1={185} x2={pressed ? 430 : 452} y2={pressed ? 210 : 206} stroke="var(--text)" strokeWidth={2} strokeLinecap="round" />
        <Label x={466} y={198}>{t('Button')}</Label>
        <line x1={430} y1={210} x2={430} y2={236} stroke="var(--dim)" strokeWidth={2} />
        <Ground x={430} />
        <Label x={430} y={262} anchor="middle" mono>GND</Label>
        <Label x={500} y={136} anchor="middle" mono>{pressed ? '0 V' : '3.3 V'}</Label>
        <Box x={560} y={60} w={90} h={180} tone="cpu" title="MCU" />
        <Label x={570} y={150} mono>PC13</Label>
      </Figure>
      <div className="learn-two">
        <div>
          <button className="btn small" onClick={() => setOdr((v) => v ^ 1)}>{t('Toggle the output bit')}</button>
          <div className="learn-out">
            <div className="mono">{odr ? 'GPIOA->ODR |= (1 << 5);' : 'GPIOA->ODR &= ~(1 << 5);'}</div>
            <div className="muted-text">{odr ? t('Output bit 5 = 1, the LED is on') : t('Output bit 5 = 0, the LED is off')}</div>
          </div>
        </div>
        <div>
          <button className="btn small" onClick={() => setPressed((v) => !v)}>{pressed ? t('Release the button') : t('Press the button')}</button>
          <div className="learn-out">
            <div className="mono">GPIOC-&gt;IDR &amp; (1 &lt;&lt; 13)</div>
            <div className="muted-text">{pressed ? t('Input bit 13 = 0, pressed') : t('Input bit 13 = 1, released')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- lesson 4 ----------

function fmtHz(v: number) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} MHz`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)} kHz`;
  return `${v.toFixed(2)} Hz`;
}

function TimerCalc() {
  const [clk, setClk] = useState(16e6);
  const [psc, setPsc] = useState('15999');
  const [arr, setArr] = useState('999');
  const [on, setOn] = useState(false);
  const p = Number(psc);
  const a = Number(arr);
  const valid = [p, a].every((v) => psc !== '' && arr !== '' && Number.isInteger(v) && v >= 0 && v <= 65535);
  const tick = valid ? clk / (p + 1) : 0;
  const freq = valid ? tick / (a + 1) : 0;
  const visible = valid && freq <= 10;
  useEffect(() => {
    if (!visible || freq <= 0) return;
    const id = setInterval(() => setOn((v) => !v), 1000 / freq);
    return () => clearInterval(id);
  }, [visible, freq]);
  const teeth = [60, 200, 340, 480, 620];
  return (
    <div className="learn-widget">
      <Figure h={150} label={t('The timer counts up to ARR, then starts again from 0')}>
        <line x1={60} y1={120} x2={640} y2={120} stroke="var(--line)" />
        <line x1={60} y1={30} x2={640} y2={30} stroke="var(--line)" strokeDasharray="4 4" />
        <Label x={52} y={30} anchor="end" mono>ARR</Label>
        <Label x={52} y={120} anchor="end" mono>0</Label>
        <polyline fill="none" stroke="var(--ai)" strokeWidth={2} points={teeth.slice(0, -1).map((x, i) => `${x},120 ${teeth[i + 1]},30 ${teeth[i + 1]},120`).join(' ')} />
        {teeth.slice(1).map((x) => (
          <circle key={x} cx={x} cy={30} r={4} fill="var(--warn)" />
        ))}
        <Label x={340} y={142} anchor="middle">{t('Orange dot: update event, the interrupt fires')}</Label>
      </Figure>
      <div className="learn-controls">
        <label>
          {t('Clock')}{' '}
          <select value={clk} onChange={(e) => setClk(Number(e.target.value))}>
            <option value={16e6}>{t('16 MHz (after reset)')}</option>
            <option value={84e6}>{t('84 MHz (maximum)')}</option>
          </select>
        </label>
        <label className="mono">
          PSC <input className="num" inputMode="numeric" value={psc} onChange={(e) => setPsc(e.target.value.trim())} />
        </label>
        <label className="mono">
          ARR <input className="num" inputMode="numeric" value={arr} onChange={(e) => setArr(e.target.value.trim())} />
        </label>
      </div>
      {!valid && <p className="err-text small">{t('Use whole numbers from 0 to 65535.')}</p>}
      <div className="learn-stats">
        <div>
          <span className="label">{t('Tick rate')}</span>
          <b className="mono">{valid ? fmtHz(tick) : '–'}</b>
        </div>
        <div>
          <span className="label">{t('Update events per second')}</span>
          <b className="mono">{valid ? fmtHz(freq) : '–'}</b>
        </div>
        <div className="led-stat">
          <i className={`led ${visible ? (on ? 'on' : '') : valid ? 'blur' : ''}`} />
          <span>
            <span className="label">{t('LED, toggled on each event')}</span>
            <span className="small dim">{!valid ? '–' : visible ? t('{s} s between toggles', { s: (1 / freq).toFixed(2) }) : t('Too fast for your eyes')}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function InterruptTimeline() {
  return (
    <Figure h={210} label={t('An interrupt pauses the main loop, runs the ISR, then returns')}>
      <Box x={40} y={120} w={220} h={36} tone="cpu" title={t('Main loop')} />
      <Box x={280} y={50} w={110} h={36} tone="out" title="ISR" />
      <Box x={410} y={120} w={230} h={36} tone="cpu" title={t('Main loop continues')} />
      <Arrow d="M262 120 L278 88" />
      <Arrow d="M392 88 L408 120" />
      <Arrow d="M40 172 L636 172" />
      <Label x={262} y={192} anchor="middle">{t('Timer overflow')}</Label>
      <Label x={636} y={192} anchor="end">{t('Time')}</Label>
    </Figure>
  );
}

// ---------- lesson 5 ----------

function Protocols() {
  const dev = [
    [240, t('Temp sensor'), '0x48'],
    [380, t('Screen'), '0x3C'],
    [520, t('Motion sensor'), '0x68'],
  ] as const;
  return (
    <Figure h={520} label={t('UART, I2C and SPI wiring')}>
      <text x={40} y={24} className="lf-t" dominantBaseline="central">{t('UART: a private call between two devices')}</text>
      <Box x={60} y={46} w={120} h={56} tone="cpu" title="MCU" />
      <Box x={500} y={46} w={140} h={56} tone="io" title={t('Computer or module')} />
      <Arrow d="M180 64 L496 64" color="var(--pin-uart)" />
      <Arrow d="M500 86 L184 86" color="var(--pin-uart)" />
      <Label x={340} y={52} anchor="middle">{t('TX to RX')}</Label>
      <Label x={340} y={98} anchor="middle">{t('RX from TX')}</Label>

      <text x={40} y={146} className="lf-t" dominantBaseline="central">{t('I2C: a group chat, everyone has an address')}</text>
      <Box x={60} y={172} w={120} h={56} tone="cpu" title="MCU" />
      <line x1={180} y1={192} x2={640} y2={192} stroke="var(--pin-sda)" strokeWidth={2} />
      <line x1={180} y1={214} x2={640} y2={214} stroke="var(--pin-scl)" strokeWidth={2} />
      <Label x={192} y={182}>{t('SDA (data)')}</Label>
      <Label x={192} y={226}>{t('SCL (clock)')}</Label>
      {dev.map(([x, name, addr]) => (
        <g key={addr}>
          <line x1={x + 40} y1={192} x2={x + 40} y2={246} stroke="var(--pin-sda)" />
          <line x1={x + 80} y1={214} x2={x + 80} y2={246} stroke="var(--pin-scl)" />
          <Box x={x} y={246} w={120} h={56} tone="mem" title={name} sub={t('Address {a}', { a: addr })} />
        </g>
      ))}

      <text x={40} y={334} className="lf-t" dominantBaseline="central">{t('SPI: the boss taps one worker at a time, very fast')}</text>
      <Box x={60} y={348} w={120} h={142} tone="cpu" title="MCU" />
      <Arrow d="M180 360 L496 360" color="var(--pin-spi)" />
      <Label x={195} y={350}>{t('Select {n}', { n: 1 })}</Label>
      <line x1={180} y1={392} x2={496} y2={392} stroke="var(--muted)" strokeWidth={2} />
      <Label x={195} y={382}>{t('Data and clock, shared')}</Label>
      <path d="M440 392 L440 444 L496 444" fill="none" stroke="var(--muted)" strokeWidth={2} />
      <Arrow d="M180 474 L496 474" color="var(--pin-spi)" />
      <Label x={195} y={464}>{t('Select {n}', { n: 2 })}</Label>
      <Box x={500} y={348} w={140} h={56} tone="spi" title={t('SD card')} />
      <Box x={500} y={430} w={140} h={56} tone="spi" title={t('Display')} />
    </Figure>
  );
}

// ---------- lesson 6 ----------

const signal = (x: number) => 1.65 + 1.1 * Math.sin(2 * Math.PI * 1.5 * x) + 0.35 * Math.sin(2 * Math.PI * 4 * x);

function AdcDemo() {
  const [bits, setBits] = useState(3);
  const [samples, setSamples] = useState(30);
  const [volts, setVolts] = useState(1.65);
  const max = 2 ** bits - 1;
  const y = (v: number) => 190 - (v / 3.3) * 170;
  let analog = '';
  for (let i = 0; i <= 300; i++) analog += `${i ? 'L' : 'M'}${(50 + (i / 300) * 600).toFixed(1)} ${y(signal(i / 300)).toFixed(1)}`;
  let digital = '';
  for (let i = 0; i < samples; i++) {
    const q = (Math.round((signal(i / samples) / 3.3) * max) * 3.3) / max;
    const yy = y(q).toFixed(1);
    digital += `${i ? 'L' : 'M'}${(50 + (i / samples) * 600).toFixed(1)} ${yy}L${(50 + ((i + 1) / samples) * 600).toFixed(1)} ${yy}`;
  }
  return (
    <div className="learn-widget">
      <Figure h={215} label={t('A smooth signal and the steps the ADC sees')}>
        <line x1={50} y1={190} x2={650} y2={190} stroke="var(--line)" />
        <line x1={50} y1={20} x2={50} y2={190} stroke="var(--line)" />
        <Label x={42} y={20} anchor="end" mono>3.3 V</Label>
        <Label x={42} y={190} anchor="end" mono>0 V</Label>
        <path d={analog} fill="none" stroke="var(--muted)" strokeWidth={1.5} opacity={0.55} />
        <path d={digital} fill="none" stroke="var(--pin-adc)" strokeWidth={2} />
        <Label x={650} y={206} anchor="end">{t('Time')}</Label>
      </Figure>
      <div className="learn-legend small">
        <span><i style={{ background: 'var(--muted)' }} />{t('Real signal')}</span>
        <span><i style={{ background: 'var(--pin-adc)' }} />{t('What the ADC sees')}</span>
      </div>
      <Slider label={t('Resolution')} min={1} max={12} step={1} value={bits} onChange={setBits} out={t('{b} bit, {s} steps', { b: bits, s: max + 1 })} />
      <Slider label={t('Samples')} min={5} max={80} step={1} value={samples} onChange={setSamples} out={t('{n} per window', { n: samples })} />
      <Slider label={t('Sensor voltage')} min={0} max={3.3} step={0.01} value={volts} onChange={setVolts} out={`${volts.toFixed(2)} V`} />
      <div className="learn-stats">
        <div>
          <span className="label">{t('Number your code receives')}</span>
          <b className="mono">{t('{r} out of {max}', { r: Math.round((volts / 3.3) * max), max })}</b>
        </div>
      </div>
    </div>
  );
}

function Slider(p: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; out: string }) {
  return (
    <label className="learn-slider">
      <span className="dim">{p.label}</span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.onChange(Number(e.target.value))} />
      <b className="mono">{p.out}</b>
    </label>
  );
}

// ---------- lesson 7 ----------

function RtosTimeline() {
  const bar = (x: number, y: number, w: number, tone: Tone, h = 30) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx={4} fill={fill(tone, 45)} stroke={TONE[tone]} />;
  return (
    <Figure h={370} label={t('A simple loop makes the sensor late; an RTOS runs it on time')}>
      <text x={40} y={26} className="lf-t" dominantBaseline="central">{t('Simple loop: one job after another')}</text>
      <Label x={110} y={68} anchor="end">{t('CPU')}</Label>
      {bar(120, 50, 40, 'ok', 36)}
      {bar(160, 50, 250, 'cpu', 36)}
      {bar(410, 50, 60, 'io', 36)}
      {bar(470, 50, 40, 'ok', 36)}
      {bar(510, 50, 130, 'cpu', 36)}
      <line x1={270} y1={42} x2={270} y2={94} stroke="var(--err)" strokeWidth={1.5} strokeDasharray="4 3" />
      <Label x={270} y={108} anchor="middle">{t('The sensor was needed here, it runs late')}</Label>

      <text x={40} y={146} className="lf-t" dominantBaseline="central">{t('RTOS: the scheduler switches by priority')}</text>
      <Label x={110} y={185} anchor="end">{t('Sensor (high)')}</Label>
      <Label x={110} y={225} anchor="end">{t('UART (medium)')}</Label>
      <Label x={110} y={265} anchor="end">{t('Display (low)')}</Label>
      {[120, 270, 420, 570].map((x) => bar(x, 170, 40, 'ok'))}
      {bar(380, 210, 40, 'io')}
      {bar(610, 210, 30, 'io')}
      {bar(160, 250, 110, 'cpu')}
      {bar(310, 250, 70, 'cpu')}
      {bar(460, 250, 110, 'cpu')}
      <line x1={120} y1={298} x2={640} y2={298} stroke="var(--line)" />
      <Label x={380} y={314} anchor="middle">{t('The sensor runs on time. The display is paused and resumed.')}</Label>
      {(
        [
          [160, 'ok', t('Sensor')],
          [280, 'io', 'UART'],
          [390, 'cpu', t('Display')],
        ] as const
      ).map(([x, tone, name]) => (
        <g key={x}>
          <rect x={x} y={340} width={14} height={14} rx={3} fill={fill(tone, 45)} stroke={TONE[tone]} />
          <Label x={x + 20} y={347}>{name}</Label>
        </g>
      ))}
    </Figure>
  );
}

// ---------- lesson 8 ----------

function PwmDemo() {
  const [duty, setDuty] = useState(25);
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const step = () => {
      setAngle((a) => (a + duty * 0.15) % 360);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [duty]);
  const P = 118;
  let wave = 'M50 120';
  for (let k = 0; k < 5; k++) {
    const s = 50 + k * P;
    const on = (P * duty) / 100;
    if (duty > 0) wave += ` L${s} 30 L${s + on} 30 L${s + on} 120`;
    wave += ` L${s + P} 120`;
  }
  const avgY = 120 - (90 * duty) / 100;
  return (
    <div className="learn-widget">
      <Figure h={150} label={t('PWM wave and its average voltage')}>
        <line x1={50} y1={120} x2={640} y2={120} stroke="var(--line)" />
        <Label x={42} y={30} anchor="end" mono>3.3 V</Label>
        <Label x={42} y={120} anchor="end" mono>0 V</Label>
        <path d={wave} fill="none" stroke="var(--pin-gpio)" strokeWidth={2} />
        <line x1={50} x2={640} y1={avgY} y2={avgY} stroke="var(--warn)" strokeWidth={1.5} strokeDasharray="6 4" />
        <Label x={640} y={Math.max(avgY - 10, 12)} anchor="end" mono>{t('Average {v} V', { v: ((3.3 * duty) / 100).toFixed(2) })}</Label>
      </Figure>
      <Slider label={t('Duty cycle')} min={0} max={100} step={1} value={duty} onChange={setDuty} out={`${duty}%`} />
      <div className="learn-stats">
        <div className="led-stat">
          <i className="led on" style={{ opacity: 0.08 + (0.92 * duty) / 100 }} />
          <span>
            <span className="label">{t('LED brightness')}</span>
            <b className="mono">{duty}%</b>
          </span>
        </div>
        <div className="led-stat">
          <svg width={34} height={34} viewBox="0 0 36 36" aria-hidden>
            <circle cx={18} cy={18} r={16} fill="none" stroke="var(--line)" strokeWidth={1.5} />
            <g transform={`rotate(${angle} 18 18)`} stroke="var(--text)" strokeWidth={3} strokeLinecap="round">
              <line x1={18} y1={5} x2={18} y2={31} />
              <line x1={5} y1={18} x2={31} y2={18} />
            </g>
          </svg>
          <span>
            <span className="label">{t('Motor speed')}</span>
            <b className="mono">{duty}%</b>
          </span>
        </div>
      </div>
    </div>
  );
}

function StateMachine() {
  return (
    <Figure h={290} label={t('Thermostat state machine')}>
      <Box x={60} y={60} w={160} h={56} tone="in" title={t('Idle')} sub={t('Heater off')} />
      <Box x={460} y={60} w={160} h={56} tone="warn" title={t('Heating')} sub={t('Heater on')} />
      <Box x={260} y={210} w={160} h={56} tone="err" title={t('Error')} sub={t('Heater off, LED blinks')} />
      <Arrow d="M220 76 L456 76" />
      <Label x={340} y={64} anchor="middle">{t('Too cold')}</Label>
      <Arrow d="M460 100 L224 100" />
      <Label x={340} y={114} anchor="middle">{t('Target reached')}</Label>
      <Arrow d="M140 116 L140 238 L256 238" />
      <Label x={132} y={180} anchor="end">{t('Sensor fails')}</Label>
      <Arrow d="M540 116 L540 238 L424 238" />
      <Label x={548} y={180}>{t('Sensor fails')}</Label>
      <Arrow d="M260 222 L180 222 L180 120" />
      <Label x={188} y={180}>{t('Reset')}</Label>
    </Figure>
  );
}

// ---------- road to senior ----------

function Roadmap() {
  const stages: [string, string, string, Tone][] = [
    [t('Months 1 to 3'), t('Hands-on core'), t('Registers, peripherals, hardware basics'), 'ok'],
    [t('Months 3 to 6'), t('Firmware architecture'), t('Drivers, RTOS in depth, memory, bootloader'), 'ok'],
    [t('Months 6 to 9'), t('Professional practice'), t('Testing, CI, crash analysis, MISRA C'), 'cpu'],
    [t('Months 9 to 15'), t('Senior system skills'), t('Security, updates, reliability, CAN, Linux'), 'cpu'],
    [t('From month 9'), t('Edge AI'), t('Machine learning on microcontrollers'), 'warn'],
  ];
  return (
    <Figure h={420} label={t('Five stages from beginner to senior')}>
      {stages.map(([when, title, sub, tone], i) => {
        const y = 20 + i * 80;
        return (
          <g key={title}>
            <Label x={130} y={y + 28} anchor="end">{when}</Label>
            <Box x={140} y={y} w={400} h={56} tone={tone} title={`${i + 1}. ${title}`} sub={sub} />
            {i < stages.length - 1 && <Arrow d={`M340 ${y + 56} L340 ${y + 76}`} />}
          </g>
        );
      })}
    </Figure>
  );
}

const WIDGETS: Record<WidgetId, () => ReactNode> = {
  'mcu-anatomy': McuAnatomy,
  'memory-map': MemoryMap,
  register: RegisterPlayground,
  gpio: GpioDemo,
  timer: TimerCalc,
  interrupt: InterruptTimeline,
  protocols: Protocols,
  adc: AdcDemo,
  rtos: RtosTimeline,
  pwm: PwmDemo,
  'state-machine': StateMachine,
  roadmap: Roadmap,
};

export function LessonWidget({ id }: { id: WidgetId }) {
  const W = WIDGETS[id];
  return <W />;
}
