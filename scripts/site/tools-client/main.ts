// The website calculators (/tools/ and /it/tools/): plain DOM code on top of calc.ts, bundled by
// vite.tools.config.ts into site/tools/calc.js. The page (scripts/site/tools.mjs) carries the form,
// the labels in its language and, for the clock calculators, the board data as JSON.

import {
  I2C_MODES,
  adcCalc,
  adcOptions,
  asBoard,
  calculatorsFor,
  defaultAdcOption,
  defaultClock,
  divider,
  dividerR2,
  e12Above,
  e12Nearest,
  fmtHz,
  fmtOhms,
  i2cPullup,
  ledResistor,
  pwmCalc,
  setLanguage,
  suggestPullup,
  t,
  uartCalc,
  uartTable,
  type CalcResult,
  type I2cMode,
  type ToolBoard,
} from './calc';

const lang: 'en' | 'it' = document.documentElement.lang === 'it' ? 'it' : 'en';
setLanguage(lang);

const UI = {
  en: {
    ledDark: 'The supply is not higher than the LED’s forward voltage, so the LED stays dark. Use a higher supply voltage.',
    ledLow: 'Only {v} V is left for the resistor, so the current changes a lot from one LED to the next. Fine for a dim indicator; for steady brightness use a higher supply.',
    ledHigh: 'Above 20 mA: more than most small LEDs and many microcontroller pins are made for. Check both datasheets.',
    rating14: 'a 1/4 W resistor is plenty',
    rating12: 'use a 1/2 W resistor (rule of thumb: rated for at least twice the heat)',
    rating1: 'use a 1 W resistor, or lower the current',
    ratingBig: 'that is a lot of heat: lower the current or use an LED driver',
    divSafe: 'Safe for a 3.3 V input pin.',
    divHigh: 'Above 3.3 V: too high for a 3.3 V input pin (ESP32, Raspberry Pi Pico, most STM32 pins).',
    divBad: 'The target must be above 0 V and below the input voltage.',
    divLoad: 'With the load, R2 behaves like {r}.',
    pullNone: 'No resistor works: the bus has too much capacitance for this speed. Use shorter wires, fewer devices, a lower speed or a bus buffer.',
    pullFits: 'Fits the I2C specification.',
    pullStrong: 'Too strong: the chips cannot pull the line low enough.',
    pullWeak: 'Too weak: the line rises too slowly for this speed.',
    none: 'none',
    fine: 'Fine',
    ok: 'Usually works',
    risky: 'Risky',
    fail: 'Not possible',
    noCalc: 'This calculator does not cover this board yet.',
    baud: 'Baud',
    real: 'Real rate',
    error: 'Error',
    verdict: 'Verdict',
    common: 'Error at common speeds with this clock',
    copied: 'Copied',
    invalid: 'Enter numbers above 0.',
  },
  it: {
    ledDark: 'L’alimentazione non supera la tensione di soglia del LED, quindi il LED resta spento. Usa una tensione più alta.',
    ledLow: 'Alla resistenza restano solo {v} V, quindi la corrente cambia molto da un LED all’altro. Va bene per una spia debole; per una luminosità stabile usa un’alimentazione più alta.',
    ledHigh: 'Sopra i 20 mA: più di quanto reggono molti LED piccoli e molti pin dei microcontrollori. Controlla entrambi i datasheet.',
    rating14: 'basta una resistenza da 1/4 W',
    rating12: 'usa una resistenza da 1/2 W (regola pratica: almeno il doppio del calore)',
    rating1: 'usa una resistenza da 1 W, o abbassa la corrente',
    ratingBig: 'è molto calore: abbassa la corrente o usa un driver per LED',
    divSafe: 'Sicura per un pin di ingresso a 3,3 V.',
    divHigh: 'Sopra 3,3 V: troppo alta per un pin di ingresso a 3,3 V (ESP32, Raspberry Pi Pico, la maggior parte dei pin STM32).',
    divBad: 'Il valore voluto deve essere sopra 0 V e sotto la tensione di ingresso.',
    divLoad: 'Con il carico, R2 si comporta come {r}.',
    pullNone: 'Nessuna resistenza va bene: il bus ha troppa capacità per questa velocità. Usa fili più corti, meno dispositivi, una velocità più bassa o un buffer di bus.',
    pullFits: 'Rispetta la specifica I2C.',
    pullStrong: 'Troppo forte: i chip non riescono a portare la linea abbastanza in basso.',
    pullWeak: 'Troppo debole: la linea sale troppo lentamente per questa velocità.',
    none: 'nessuno',
    fine: 'Va bene',
    ok: 'Di solito funziona',
    risky: 'Rischioso',
    fail: 'Non possibile',
    noCalc: 'Questo calcolatore non copre ancora questa scheda.',
    baud: 'Baud',
    real: 'Velocità reale',
    error: 'Errore',
    verdict: 'Giudizio',
    common: 'Errore alle velocità più comuni con questo clock',
    copied: 'Copiato',
    invalid: 'Inserisci numeri maggiori di 0.',
  },
}[lang];

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const dec = (s: string) => (lang === 'it' ? s.replace(/(\d)\.(\d)/g, '$1,$2') : s);
/** A number with a fixed count of decimals, written the way the page language writes it. */
const num = (v: number, d = 2) => dec(v.toFixed(d));
const ohms = (v: number) => dec(fmtOhms(v));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Read a number field; NaN when empty or not a number. */
function val(form: HTMLFormElement, name: string): number {
  const f = form.elements.namedItem(name);
  if (!(f instanceof HTMLInputElement || f instanceof HTMLSelectElement)) return NaN;
  if (f.value.trim() === '') return NaN;
  return Number(f.value.replace(',', '.'));
}
function str(form: HTMLFormElement, name: string): string {
  const f = form.elements.namedItem(name);
  return f instanceof HTMLInputElement || f instanceof HTMLSelectElement ? f.value : '';
}
function setField(form: HTMLFormElement, name: string, value: string) {
  const f = form.elements.namedItem(name);
  if (f instanceof HTMLInputElement || f instanceof HTMLSelectElement) f.value = value;
}

/** Write outputs: data-out="key" elements get their text; a missing key clears the element. */
function out(form: HTMLFormElement, values: Record<string, string>) {
  const scope = form.closest('.calc') ?? form;
  for (const o of scope.querySelectorAll<HTMLElement>('[data-out]')) {
    const k = o.dataset.out ?? '';
    if (k in values) o.textContent = values[k];
  }
}
function state(form: HTMLFormElement, s: 'good' | 'warn' | 'bad' | '') {
  const box = form.closest('.calc') ?? form;
  box.classList.remove('is-good', 'is-warn', 'is-bad');
  if (s) box.classList.add(`is-${s}`);
}

/* ------------------------------------------------------------------ electronics */

function led(form: HTMLFormElement) {
  const supply = val(form, 'supply');
  const vf = val(form, 'vf');
  const ma = val(form, 'ma');
  if (![supply, vf, ma].every((n) => n > 0)) {
    out(form, { exact: '—', standard: '—', actual: '—', power: '—', note: UI.invalid });
    return state(form, 'bad');
  }
  const r = ledResistor(supply, vf, ma);
  if (!r.ok) {
    out(form, { exact: '—', standard: '—', actual: '—', power: '—', note: UI.ledDark });
    return state(form, 'bad');
  }
  const heat = r.powerMw;
  const rating = heat * 2 <= 250 ? UI.rating14 : heat * 2 <= 500 ? UI.rating12 : heat * 2 <= 1000 ? UI.rating1 : UI.ratingBig;
  const notes = [r.drop < 0.5 ? fill(UI.ledLow, { v: num(r.drop, 2) }) : '', ma > 20 ? UI.ledHigh : ''].filter(Boolean);
  out(form, {
    exact: ohms(r.exact),
    standard: ohms(r.standard),
    actual: `${num(r.actualMa, 2)} mA`,
    power: `${num(heat, 1)} mW: ${rating}`,
    formula: dec(`(${supply} V − ${vf} V) / ${ma} mA = ${fmtOhms(r.exact)}`),
    note: notes.join(' '),
  });
  state(form, notes.length ? 'warn' : 'good');
}

function dividerTool(form: HTMLFormElement) {
  const vin = val(form, 'vin');
  const r1 = val(form, 'r1');
  const r2 = val(form, 'r2');
  const load = val(form, 'load');
  if (![vin, r1, r2].every((n) => n > 0)) {
    out(form, { vout: '—', current: '—', note: UI.invalid, loadnote: '' });
    return state(form, 'bad');
  }
  const d = divider(vin, r1, r2, load > 0 ? load : Infinity);
  const high = d.vout > 3.3 + 0.05;
  out(form, {
    vout: `${num(d.vout, 2)} V`,
    current: `${num(d.currentMa, 3)} mA`,
    formula: dec(`${vin} V × ${fmtOhms(r2)} / (${fmtOhms(r1)} + ${fmtOhms(r2)})`) + (load > 0 ? '' : ` = ${num(d.vout, 2)} V`),
    loadnote: load > 0 ? fill(UI.divLoad, { r: ohms((r2 * load) / (r2 + load)) }) : '',
    note: high ? UI.divHigh : UI.divSafe,
  });
  state(form, high ? 'warn' : 'good');
}

function dividerR2Tool(form: HTMLFormElement) {
  const vin = val(form, 'vin');
  const target = val(form, 'target');
  const r1 = val(form, 'r1');
  const r2 = dividerR2(vin, target, r1);
  if (!(r1 > 0) || !Number.isFinite(r2)) {
    out(form, { r2exact: '—', r2std: '—', r2vout: '—', note: UI.divBad });
    return state(form, 'bad');
  }
  const std = e12Nearest(r2);
  const d = divider(vin, r1, std);
  out(form, { r2exact: ohms(r2), r2std: ohms(std), r2vout: `${num(d.vout, 2)} V · ${num(d.currentMa, 3)} mA`, note: '' });
  state(form, 'good');
}

function pullup(form: HTMLFormElement) {
  const mode = str(form, 'mode') as I2cMode;
  const vdd = val(form, 'vdd');
  const pf = val(form, 'pf');
  const mine = val(form, 'mine');
  if (!(mode in I2C_MODES) || !(vdd > 0.4) || !(pf > 0)) {
    out(form, { min: '—', max: '—', suggest: '—', rise: '—', verdict: '', note: UI.invalid });
    return state(form, 'bad');
  }
  const r = i2cPullup(vdd, pf, mode, mine > 0 ? mine : undefined);
  const s = suggestPullup(r.minOhms, r.maxOhms);
  const sRise = s ? i2cPullup(vdd, pf, mode, s).riseNs ?? 0 : 0;
  const values: Record<string, string> = {
    min: ohms(r.minOhms),
    max: ohms(r.maxOhms),
    suggest: s ? `${ohms(s)} (${num(sRise, 0)} ns)` : UI.none,
    limit: `${I2C_MODES[mode].riseNs} ns`,
    note: r.possible ? '' : UI.pullNone,
  };
  if (mine > 0 && r.riseNs !== undefined) {
    values.rise = `${num(r.riseNs, 0)} ns`;
    values.verdict = r.fits ? UI.pullFits : mine < r.minOhms ? UI.pullStrong : UI.pullWeak;
  } else {
    values.rise = '—';
    values.verdict = '';
  }
  out(form, values);
  state(form, !r.possible ? 'bad' : mine > 0 && !r.fits ? 'warn' : 'good');
}

/* ------------------------------------------------------------------ clock calculators */

let boardsCache: ToolBoard[] | null = null;
function boards(): ToolBoard[] {
  if (!boardsCache) {
    const s = document.getElementById('bp-boards');
    try {
      boardsCache = s ? (JSON.parse(s.textContent ?? '[]') as ToolBoard[]) : [];
    } catch {
      boardsCache = [];
    }
  }
  return boardsCache;
}

function copyButton(code: string): HTMLButtonElement {
  const b = el('button', 'calc-copy', t('Copy'));
  b.type = 'button';
  b.addEventListener('click', () => {
    void navigator.clipboard?.writeText(code).then(() => {
      b.textContent = UI.copied;
      setTimeout(() => (b.textContent = t('Copy')), 1500);
    });
  });
  return b;
}

function renderResult(box: HTMLElement, r: CalcResult | null, b: ToolBoard | undefined, message?: string, withVerdict = false) {
  box.replaceChildren();
  const v = r ? (r.ok ? r.verdict ?? 'fine' : 'risky') : 'risky';
  box.className = `calc-result v-${v}`;
  // Only the UART verdict (fine, usually works, risky) is worth a label; the others are always 'fine'.
  if (withVerdict && r?.ok && r.verdict) {
    box.append(el('span', `verdict v-${r.verdict}`, UI[r.verdict]));
  }
  box.append(el('p', 'calc-summary', r ? r.summary : message ?? ''));
  if (r && r.values.length) {
    const dl = el('dl', 'calc-values');
    for (const [k, value] of r.values) {
      const d = el('div');
      d.append(el('dt', '', k), el('dd', 'mono', value));
      dl.append(d);
    }
    box.append(dl);
  }
  for (const c of r?.code ?? []) {
    const wrap = el('div', 'calc-code');
    const bar = el('div', 'calc-code-bar');
    bar.append(el('span', '', c.label), copyButton(c.code));
    const pre = el('pre');
    pre.append(el('code', '', c.code));
    wrap.append(bar, pre);
    box.append(wrap);
  }
  if (r?.source) box.append(el('p', 'calc-source', t('Source: {source}', { source: r.source })));
  const c = b?.clocks;
  if (r && c) box.append(el('p', 'calc-source', `${t(c.note)} ${t('Clock source: {source}.', { source: `${c.source.title}${c.source.section ? `, ${c.source.section}` : ''}` })} ${t('Calculated from documented formulas, not measured.')}`));
}

function uartTableEl(b: ToolBoard, clock: number): HTMLElement {
  const wrap = el('div', 'calc-table');
  wrap.append(el('h3', '', UI.common));
  const scroll = el('div', 'table-wrap');
  const table = el('table', 'pin-table');
  const head = el('tr');
  for (const h of [UI.baud, UI.real, UI.error, UI.verdict]) head.append(el('th', '', h));
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  for (const row of uartTable(b, clock)) {
    const tr = el('tr');
    const err = row.errorPct ?? NaN;
    tr.append(
      el('td', 'mono', String(row.baud)),
      el('td', 'mono', row.ok && row.actual !== undefined ? String(Math.round(row.actual)) : '—'),
      el('td', 'mono', row.ok ? `${err > 0 ? '+' : ''}${num(err, 2)}%` : '—'),
    );
    const td = el('td');
    td.append(el('span', `verdict v-${row.ok ? row.verdict ?? 'fine' : 'risky'}`, row.ok ? UI[row.verdict ?? 'fine'] : UI.fail));
    tr.append(td);
    body.append(tr);
  }
  table.append(thead, body);
  scroll.append(table);
  wrap.append(scroll);
  return wrap;
}

function clockTool(form: HTMLFormElement, kind: 'uart' | 'pwm' | 'adc', boardChanged: boolean) {
  const b = boards().find((x) => x.id === str(form, 'board'));
  const box = form.closest('.calc')?.querySelector<HTMLElement>('[data-out="result"]');
  if (!box) return;
  const extra = form.closest('.calc')?.querySelector<HTMLElement>('[data-out="extra"]');
  extra?.replaceChildren();
  if (!b) return renderResult(box, null, undefined, UI.noCalc);
  const bd = asBoard(b);
  if (boardChanged) {
    setField(form, 'clock', String(defaultClock(b, kind)));
    if (kind === 'adc') {
      const sel = form.elements.namedItem('setting');
      if (sel instanceof HTMLSelectElement) {
        sel.replaceChildren(...adcOptions(bd).map((o) => new Option(o.label, o.id)));
        sel.value = defaultAdcOption(b);
      }
    }
  }
  const has = calculatorsFor(bd);
  const covered = !!b.clocks && b.family !== 'imxrt' && (kind === 'adc' || has[kind]);
  const withOptions = kind !== 'adc' || adcOptions(bd).length > 0;
  for (const f of form.querySelectorAll<HTMLElement>('[data-needs-calc]')) f.hidden = !covered || !withOptions;
  const clock = val(form, 'clock');
  const hz = form.querySelector<HTMLElement>('[data-out="clockHz"]');
  if (hz) hz.textContent = clock > 0 ? fmtHz(clock) : '';
  if (!covered) return renderResult(box, null, b, b.clocks ? `${t(b.clocks.note)} ${UI.noCalc}` : t('There are no clock data for this board yet.'));
  let r: CalcResult;
  if (kind === 'uart') r = uartCalc(bd, clock, val(form, 'baud'));
  else if (kind === 'pwm') r = pwmCalc(bd, clock, val(form, 'freq'), val(form, 'duty'));
  else r = adcCalc(bd, clock, str(form, 'setting'));
  renderResult(box, r, b, undefined, kind === 'uart');
  if (kind === 'uart' && extra && clock > 0) extra.append(uartTableEl(b, clock));
}

/* ------------------------------------------------------------------ wiring */

const TOOLS: Record<string, (f: HTMLFormElement, boardChanged: boolean) => void> = {
  led: (f) => led(f),
  divider: (f) => dividerTool(f),
  divr2: (f) => dividerR2Tool(f),
  pullup: (f) => pullup(f),
  uart: (f, c) => clockTool(f, 'uart', c),
  pwm: (f, c) => clockTool(f, 'pwm', c),
  adc: (f, c) => clockTool(f, 'adc', c),
};

function init() {
  const params = new URLSearchParams(location.search);
  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-tool]')) {
    const run = TOOLS[form.dataset.tool ?? ''];
    if (!run) continue;
    form.addEventListener('submit', (e) => e.preventDefault());
    // LED colour presets fill in the forward voltage.
    const preset = form.elements.namedItem('color');
    if (preset instanceof HTMLSelectElement) preset.addEventListener('change', () => preset.value && setField(form, 'vf', preset.value));
    const board = form.elements.namedItem('board');
    const wanted = params.get('board');
    if (board instanceof HTMLSelectElement && wanted && [...board.options].some((o) => o.value === wanted)) board.value = wanted;
    form.addEventListener('input', (e) => run(form, e.target === board));
    form.addEventListener('change', (e) => e.target === board && run(form, true));
    form.closest('.calc')?.classList.add('live');
    run(form, true);
  }
}

// For tests and the browser console: the same functions the page uses.
Object.assign(window, { BPCalc: { ledResistor, divider, dividerR2, e12Above, e12Nearest, fmtOhms, i2cPullup, suggestPullup, uartCalc, pwmCalc, adcCalc, adcOptions, asBoard, setLanguage } });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
