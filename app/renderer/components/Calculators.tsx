// Clock-aware calculators (shared/clocks): timer/PWM, UART baud and ADC rate for the project's
// board, from its clock data, with the register values and code for its toolchain.

import { useEffect, useMemo, useState } from 'react';
import { getBoard } from '@shared/board';
import { adcCalc, adcOptions, calculatorsFor, fmtHz, pwmCalc, uartCalc, type CalcResult } from '@shared/clocks';
import { t } from '@shared/i18n';
import { log, useScene } from '../state/store';

type Tab = 'pwm' | 'uart' | 'adc';

export function Calculators() {
  const boardId = useScene((s) => s.scene.board);
  const board = getBoard(boardId);
  const clocks = board.clocks;
  const has = calculatorsFor(board);
  const [tab, setTab] = useState<Tab>('pwm');
  const [pwmClock, setPwmClock] = useState(clocks?.pwmHz ?? 0);
  const [uartClock, setUartClock] = useState(clocks?.uartHz ?? 0);
  const [adcClock, setAdcClock] = useState(clocks?.adcHz ?? clocks?.cpuHz ?? 0);
  const [freq, setFreq] = useState(1000);
  const [duty, setDuty] = useState(50);
  const [baud, setBaud] = useState(115200);
  const options = useMemo(() => adcOptions(board), [board]);
  const [adcOpt, setAdcOpt] = useState('');
  useEffect(() => {
    setPwmClock(clocks?.pwmHz ?? 0);
    setUartClock(clocks?.uartHz ?? 0);
    setAdcClock(clocks?.adcHz ?? clocks?.cpuHz ?? 0);
    const def = board.family === 'avr' ? '128' : board.family === 'stm32' ? '4:15' : options[0]?.id ?? '';
    setAdcOpt(def);
  }, [boardId]);

  if (!clocks || (!has.pwm && !has.uart && !has.adc))
    return <div className="small dim">{clocks ? t(clocks.note) : t('There are no clock data for this board yet.')}</div>;

  const result: CalcResult | null =
    tab === 'pwm' && has.pwm ? pwmCalc(board, pwmClock, freq, duty) : tab === 'uart' && has.uart ? uartCalc(board, uartClock, baud) : tab === 'adc' ? adcCalc(board, adcClock, adcOpt) : null;
  const num = (v: string, fb: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fb;
  };
  const copy = (code: string) => {
    void navigator.clipboard.writeText(code);
    log('info', t('Code copied.'));
  };
  const clockField = (value: number, set: (n: number) => void, label: string) => (
    <label>
      {label}
      <input type="number" min={1} value={value} onChange={(e) => set(num(e.target.value, value))} />
      <span className="small dim mono">{fmtHz(value)}</span>
    </label>
  );

  return (
    <div className="calc">
      <div className="seg">
        {has.pwm && (
          <button className={tab === 'pwm' ? 'on' : ''} onClick={() => setTab('pwm')}>
            {t('Timer / PWM')}
          </button>
        )}
        {has.uart && (
          <button className={tab === 'uart' ? 'on' : ''} onClick={() => setTab('uart')}>
            {t('UART baud')}
          </button>
        )}
        <button className={tab === 'adc' ? 'on' : ''} onClick={() => setTab('adc')}>
          {t('ADC rate')}
        </button>
      </div>
      <div className="calc-inputs">
        {tab === 'pwm' && (
          <>
            {clockField(pwmClock, setPwmClock, t('Timer clock (Hz)'))}
            <label>
              {t('Frequency (Hz)')}
              <input type="number" min={0} value={freq} onChange={(e) => setFreq(num(e.target.value, freq))} />
            </label>
            <label>
              {t('Duty (%)')}
              <input type="number" min={0} max={100} value={duty} onChange={(e) => setDuty(num(e.target.value, duty))} />
            </label>
          </>
        )}
        {tab === 'uart' && (
          <>
            {clockField(uartClock, setUartClock, t('UART clock (Hz)'))}
            <label>
              {t('Baud rate')}
              <input type="number" min={1} value={baud} list="calc-bauds" onChange={(e) => setBaud(num(e.target.value, baud))} />
              <datalist id="calc-bauds">
                {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1000000].map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>
          </>
        )}
        {tab === 'adc' && options.length > 0 && (
          <>
            {clockField(adcClock, setAdcClock, t('ADC input clock (Hz)'))}
            <label>
              {t('Setting')}
              <select value={adcOpt} onChange={(e) => setAdcOpt(e.target.value)}>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      {result && (
        <div className={`calc-result ${result.ok ? `v-${result.verdict ?? 'fine'}` : 'v-risky'}`}>
          <p>{result.summary}</p>
          {result.values.length > 0 && (
            <div className="calc-values">
              {result.values.map(([k, v]) => (
                <div key={k}>
                  <span className="dim small">{k}</span>
                  <b className="mono">{v}</b>
                </div>
              ))}
            </div>
          )}
          {result.code.map((c) => (
            <div key={c.label} className="calc-code">
              <div className="row between">
                <span className="small dim">{c.label}</span>
                <button className="btn small ghost" onClick={() => copy(c.code)}>
                  {t('Copy')}
                </button>
              </div>
              <pre className="mono">{c.code}</pre>
            </div>
          ))}
          {result.source && <div className="small dim">{t('Source: {source}', { source: result.source })}</div>}
        </div>
      )}
      <div className="small dim">
        {t(clocks.note)} {t('Clock source: {source}.', { source: `${clocks.source.title}${clocks.source.section ? `, ${clocks.source.section}` : ''}` })}{' '}
        {t('Calculated from documented formulas, not measured.')}
      </div>
    </div>
  );
}
