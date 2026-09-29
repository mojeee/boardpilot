// Free calculators on the website (/tools/ and /it/tools/): LED resistor, voltage divider, I2C
// pull-up, UART baud rate, PWM timer and ADC sample rate. Each page has the calculator (site/tools/
// calc.js, built from the app's own shared/electronics.ts and shared/clocks.ts by
// vite.tools.config.ts), a plain explanation, the formula with its source, a worked example and a
// FAQ, in English and Italian. Without JavaScript the formula and the example still carry the page.

import { divider, dividerR2, e12Above, e12Nearest, fmtOhms, i2cPullup, ledResistor } from '../../shared/electronics.ts';
import { demoUrl } from './demo.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
/** Numbers the way each language writes them (3.3 V / 3,3 V). */
const dec = (lang, s) => (lang === 'it' ? String(s).replace(/(\d)\.(\d)/g, '$1,$2') : String(s));
const n = (lang, v, d) => dec(lang, v.toFixed(d));
const ohm = (lang, v) => dec(lang, fmtOhms(v));
/** Big integers with a thin grouping, as each language writes them (16 000 000). */
const big = (v) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export const toolsPath = (lang, slug = '') => `${lang === 'it' ? '/it' : ''}/tools/${slug ? `${slug}/` : ''}`;
const learnPath = (lang, id) => `${lang === 'it' ? '/it' : ''}/learn/${id}/`;

/** Same rule as suggestPullup() in scripts/site/tools-client/calc.ts (tests check they agree). */
function suggestPullup(min, max) {
  if (!(min > 0) || !(max >= min)) return 0;
  let r = e12Nearest(Math.sqrt(min * max));
  if (r < min) r = e12Above(min);
  return r <= max ? r : 0;
}

/* ------------------------------------------------------------------ shared texts */

const L = {
  en: {
    crumbs: 'Calculators',
    formula: 'The formula',
    source: 'Source',
    example: 'Worked example',
    faq: 'Questions and answers',
    learn: 'Learn the background',
    learnLead: 'Free lessons of the BoardPilot course that explain the ideas behind this calculator:',
    others: 'Other calculators',
    noscript: 'This calculator needs JavaScript. The formula and a worked example are below, so you can also work it out by hand.',
    honest: 'Results are arithmetic on published formulas, not measurements. Check them on your hardware.',
    ctaTitle: 'See it on a real board',
    ctaText: 'BoardPilot uses these same calculations inside the app, next to a live 3D view of your board, its pins and wires, with guided debugging when something does not work. Try it in your browser, or download it for macOS and Windows.',
    demo: 'Try it in your browser',
    download: 'Download BoardPilot',
    open: 'Open the calculator',
    board: 'Board',
    result: 'Result',
    appName: 'BoardPilot calculators',
    free: 'Free, no sign-up',
  },
  it: {
    crumbs: 'Calcolatori',
    formula: 'La formula',
    source: 'Fonte',
    example: 'Esempio svolto',
    faq: 'Domande e risposte',
    learn: 'Impara le basi',
    learnLead: 'Lezioni gratuite del corso di BoardPilot che spiegano le idee dietro questo calcolatore:',
    others: 'Altri calcolatori',
    noscript: 'Questo calcolatore richiede JavaScript. Qui sotto trovi la formula e un esempio svolto, così puoi fare il calcolo anche a mano.',
    honest: 'I risultati sono calcoli su formule pubblicate, non misure. Verificali sul tuo hardware.',
    ctaTitle: 'Guardalo su una scheda vera',
    ctaText: 'BoardPilot usa questi stessi calcoli dentro l’app, accanto a una vista 3D dal vivo della tua scheda, dei pin e dei fili, con un debug guidato quando qualcosa non funziona. Provalo nel browser o scaricalo per macOS e Windows.',
    demo: 'Provalo nel browser',
    download: 'Scarica BoardPilot',
    open: 'Apri il calcolatore',
    board: 'Scheda',
    result: 'Risultato',
    appName: 'Calcolatori di BoardPilot',
    free: 'Gratis, senza registrazione',
  },
};

/** Lesson titles for the links to /learn/<id>/ (the lessons are in shared/lessons.ts). */
const LESSONS = {
  'hardware-basics': { en: 'Hardware basics for software developers', it: 'Basi di hardware per chi viene dal software' },
  gpio: { en: 'GPIO: pins in and out', it: 'GPIO: pin in ingresso e in uscita' },
  'timers-interrupts': { en: 'Timers and interrupts', it: 'Timer e interrupt' },
  buses: { en: 'UART, I2C and SPI', it: 'UART, I2C e SPI' },
  adc: { en: 'ADC: reading the analog world', it: 'ADC: leggere il mondo analogico' },
  essentials: { en: 'PWM, state machines and more', it: 'PWM, macchine a stati e altro' },
};

/* ------------------------------------------------------------------ form pieces */

const field = (label, input, extra = '') => `<label class="calc-field"${extra}><span>${esc(label)}</span>${input}</label>`;
const numIn = (name, value, attrs = '') => `<input type="number" name="${name}" value="${value}" step="any" inputmode="decimal" ${attrs}/>`;
const outRow = (label, key, cls = '') => `<div class="calc-row${cls ? ` ${cls}` : ''}"><dt>${esc(label)}</dt><dd class="mono" data-out="${key}">—</dd></div>`;
const noscript = (lang) => `<noscript><p class="calc-noscript">${esc(L[lang].noscript)}</p></noscript>`;

function boardSelect(lang, boards, def) {
  const opts = boards.map((b) => `<option value="${esc(b.id)}"${b.id === def ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
  return field(L[lang].board, `<select name="board">${opts}</select>`);
}

/* ------------------------------------------------------------------ the calculators */

const LED_COLORS = [
  // Typical forward voltages, the same presets as the app's lesson widget (LearnWidgets.tsx).
  { vf: 2.0, en: 'Red (2.0 V)', it: 'Rosso (2,0 V)' },
  { vf: 2.1, en: 'Yellow (2.1 V)', it: 'Giallo (2,1 V)' },
  { vf: 2.2, en: 'Green (2.2 V)', it: 'Verde (2,2 V)' },
  { vf: 3.1, en: 'Blue or white (3.1 V)', it: 'Blu o bianco (3,1 V)' },
];

const I2C_LABELS = {
  standard: { en: 'Standard mode (100 kHz)', it: 'Standard (100 kHz)' },
  fast: { en: 'Fast mode (400 kHz)', it: 'Fast mode (400 kHz)' },
  fastPlus: { en: 'Fast mode plus (1 MHz)', it: 'Fast mode plus (1 MHz)' },
};

function ledExamples(lang) {
  const a = ledResistor(3.3, 2.0, 10);
  const b = ledResistor(5, 2.0, 10);
  const T = {
    en: [
      'A red LED (forward voltage about 2.0 V) on a 3.3 V pin of an ESP32 or Raspberry Pi Pico, at 10 mA: R = (3.3 − 2.0) V / 0.010 A = <b>{ex}</b>. The next E12 value up is <b>{std}</b>, which gives {ma} mA and about {mw} mW of heat, so any small 1/4 W resistor is fine.',
      'The same LED on a 5 V Arduino Uno pin: R = (5 − 2.0) V / 0.010 A = {ex2}, so buy <b>{std2}</b>: {ma2} mA and {mw2} mW.',
    ],
    it: [
      'Un LED rosso (tensione di soglia circa 2,0 V) su un pin a 3,3 V di un ESP32 o di un Raspberry Pi Pico, a 10 mA: R = (3,3 − 2,0) V / 0,010 A = <b>{ex}</b>. Il valore E12 successivo è <b>{std}</b>, che dà {ma} mA e circa {mw} mW di calore: basta una comune resistenza da 1/4 W.',
      'Lo stesso LED su un pin a 5 V di un Arduino Uno: R = (5 − 2,0) V / 0,010 A = {ex2}, quindi compra <b>{std2}</b>: {ma2} mA e {mw2} mW.',
    ],
  }[lang];
  const v = { ex: ohm(lang, a.exact), std: ohm(lang, a.standard), ma: n(lang, a.actualMa, 2), mw: n(lang, a.powerMw, 1), ex2: ohm(lang, b.exact), std2: ohm(lang, b.standard), ma2: n(lang, b.actualMa, 2), mw2: n(lang, b.powerMw, 1) };
  return T.map((s) => `<p>${fill(s, v)}</p>`).join('\n');
}

function dividerExamples(lang) {
  const r2 = dividerR2(5, 3.3, 10000);
  const std = e12Nearest(r2);
  const d = divider(5, 10000, std);
  const classic = divider(5, 1000, 2000);
  const T = {
    en: [
      '5 V down to about 3.3 V for an ESP32 input, with R1 = 10 kΩ: R2 = 10 kΩ × 3.3 V / (5 − 3.3) V = <b>{r2}</b>. The nearest E12 value is <b>{std}</b>, which gives <b>{vout} V</b> and draws {ma} mA from the 5 V line.',
      'The popular 1 kΩ / 2 kΩ pair for an HC-SR04 echo pin gives 5 × 2 / (1 + 2) = {classic} V and draws {cma} mA.',
    ],
    it: [
      'Da 5 V a circa 3,3 V per un ingresso di un ESP32, con R1 = 10 kΩ: R2 = 10 kΩ × 3,3 V / (5 − 3,3) V = <b>{r2}</b>. Il valore E12 più vicino è <b>{std}</b>, che dà <b>{vout} V</b> e assorbe {ma} mA dalla linea a 5 V.',
      'La classica coppia 1 kΩ / 2 kΩ per il pin echo di un HC-SR04 dà 5 × 2 / (1 + 2) = {classic} V e assorbe {cma} mA.',
    ],
  }[lang];
  const v = { r2: ohm(lang, r2), std: ohm(lang, std), vout: n(lang, d.vout, 2), ma: n(lang, d.currentMa, 3), classic: n(lang, classic.vout, 2), cma: n(lang, classic.currentMa, 2) };
  return T.map((s) => `<p>${fill(s, v)}</p>`).join('\n');
}

function pullupExamples(lang) {
  const fast = i2cPullup(3.3, 100, 'fast');
  const s = suggestPullup(fast.minOhms, fast.maxOhms);
  const sRise = i2cPullup(3.3, 100, 'fast', s).riseNs;
  const ten = i2cPullup(3.3, 100, 'fast', 10000);
  const std = i2cPullup(3.3, 100, 'standard', 10000);
  const T = {
    en: [
      'An ESP32 at 3.3 V with a sensor and a display on short wires, about 100 pF, at 400 kHz: Rp(min) = (3.3 − 0.4) V / 3 mA = <b>{min}</b>, Rp(max) = 300 ns / (0.8473 × 100 pF) = <b>{max}</b>. The calculator suggests <b>{s}</b> (rise time {sr} ns).',
      'A 10 kΩ pull-up would give a {tr} ns rise time: too slow for 400 kHz, but fine at 100 kHz, where up to {smax} is allowed.',
    ],
    it: [
      'Un ESP32 a 3,3 V con un sensore e un display su fili corti, circa 100 pF, a 400 kHz: Rp(min) = (3,3 − 0,4) V / 3 mA = <b>{min}</b>, Rp(max) = 300 ns / (0,8473 × 100 pF) = <b>{max}</b>. Il calcolatore suggerisce <b>{s}</b> (tempo di salita {sr} ns).',
      'Una pull-up da 10 kΩ darebbe un tempo di salita di {tr} ns: troppo lento per 400 kHz, ma va bene a 100 kHz, dove è ammesso fino a {smax}.',
    ],
  }[lang];
  const v = { min: ohm(lang, fast.minOhms), max: ohm(lang, fast.maxOhms), s: ohm(lang, s), sr: Math.round(sRise), tr: Math.round(ten.riseNs), smax: ohm(lang, std.maxOhms) };
  return T.map((x) => `<p>${fill(x, v)}</p>`).join('\n');
}

/** The tools, in the order of the hub page. */
function tools(boards) {
  const B = boards.length;
  return [
    {
      slug: 'led-resistor-calculator',
      color: 'var(--err)',
      lessons: ['hardware-basics', 'gpio'],
      form: (lang) => `<form class="calc-form" data-tool="led" autocomplete="off">
          <div class="calc-fields">
            ${field(lang === 'it' ? 'Tensione di alimentazione (V)' : 'Supply voltage (V)', numIn('supply', 5, 'min="0"'))}
            ${field(lang === 'it' ? 'Colore del LED' : 'LED colour', `<select name="color">${LED_COLORS.map((c, i) => `<option value="${c.vf}"${i === 0 ? ' selected' : ''}>${esc(c[lang])}</option>`).join('')}</select>`)}
            ${field(lang === 'it' ? 'Tensione di soglia Vf (V)' : 'Forward voltage Vf (V)', numIn('vf', 2, 'min="0"'))}
            ${field(lang === 'it' ? 'Corrente (mA)' : 'Current (mA)', numIn('ma', 10, 'min="0"'))}
          </div>
          <dl class="calc-outs">
            ${outRow(lang === 'it' ? 'Resistenza esatta' : 'Exact resistor', 'exact', 'big')}
            <p class="calc-formula mono" data-out="formula"></p>
            ${outRow(lang === 'it' ? 'Resistenza da comprare (E12, valore successivo)' : 'Resistor to buy (E12, next value up)', 'standard', 'big')}
            ${outRow(lang === 'it' ? 'Corrente con quella resistenza' : 'Current with that resistor', 'actual')}
            ${outRow(lang === 'it' ? 'Calore nella resistenza' : 'Heat in the resistor', 'power')}
          </dl>
          <p class="calc-note" data-out="note" aria-live="polite"></p>
        </form>`,
      en: {
        title: 'LED resistor calculator (with E12 value) | BoardPilot',
        description: 'Find the series resistor for an LED from the supply voltage, forward voltage and current: the exact value, the standard E12 resistor to buy, the real current and the heat. Free, with the formula.',
        h1: 'LED resistor calculator',
        card: 'Series resistor for an LED, the E12 value to buy, the real current and the heat.',
        lead: 'Enter the supply voltage, the LED’s forward voltage and the current you want. You get the exact resistor, the standard (E12) value to buy, and the current that really flows with it.',
        explain: [
          ['Why an LED needs a resistor', [
            'An LED is a diode. Below its forward voltage almost no current flows; just above it, the current climbs very steeply with every extra millivolt. Connected straight to a supply, the LED takes as much current as the supply or the pin can give, and the LED, the pin or both burn out.',
            'A resistor in series fixes this. The LED keeps roughly its forward voltage, the resistor takes the rest, and Ohm’s law sets the current: the leftover voltage divided by the resistance.',
          ]],
          ['Choosing the values', [
            '<b>Forward voltage (Vf)</b> depends mostly on the colour. Typical values: red about 1.8 to 2.2 V, yellow and orange about 2.0 to 2.2 V, classic yellow-green about 2.1 to 2.2 V, bright (true) green, blue and white about 2.8 to 3.4 V. The LED’s datasheet gives the exact figure at a stated current.',
            '<b>Current:</b> common 3 mm and 5 mm indicator LEDs are rated about 20 mA maximum. Modern LEDs are already bright at 2 to 10 mA, which is also kinder to a microcontroller pin.',
            '<b>Standard value:</b> resistors are sold in fixed series. This calculator rounds up to the next E12 value, so the real current ends up a little under your target, never over.',
          ]],
        ],
        formula: 'R = (Vsupply − Vf) / I\nI(real) = (Vsupply − Vf) / R(standard)\nP = (Vsupply − Vf)² / R(standard)',
        source: 'Ohm’s law. Standard values: E12 series, IEC 60063.',
        example: ledExamples('en'),
        faq: [
          ['Why does an LED need a resistor?', 'Once the voltage passes an LED’s forward voltage, its current rises very steeply, so without something to limit it the LED draws far too much current and fails, and it can damage the pin that drives it. A series resistor takes the extra voltage and sets the current by Ohm’s law.'],
          ['Does the resistor go before or after the LED?', 'Either side works. In a series circuit the same current flows through every part, so the resistor can sit between the supply and the LED’s anode (the long leg) or between its cathode (the short leg, flat side) and ground.'],
          ['Can several LEDs share one resistor?', 'Not when the LEDs are in parallel: their forward voltages differ slightly, so the LED with the lowest one takes most of the current. Give each LED its own resistor. LEDs in series can share one resistor, as long as the supply is higher than the sum of their forward voltages.'],
          ['What wattage should the resistor be?', 'Work out the heat with P = (Vsupply − Vf)² / R and pick a resistor rated for at least twice that. For indicator LEDs this is a few tens of milliwatts, so the common 1/4 W (250 mW) resistor is plenty.'],
          ['How much current can a microcontroller pin give an LED?', 'It depends on the chip, so check its datasheet. The ATmega328P on an Arduino Uno allows at most 40 mA per pin (absolute maximum), so 20 mA or less is a sensible target. RP2040 pins on a Raspberry Pi Pico are set to 4 mA drive strength by default (2 to 12 mA can be chosen); ask for more and the pin voltage drops. For bright LEDs or many LEDs, switch them with a transistor.'],
          ['Can I run a blue or white LED from 3.3 V?', 'Only just. With a forward voltage around 3 V, only a few tenths of a volt are left for the resistor, so the current depends strongly on the exact LED and its temperature. It is fine for a dim indicator; for steady brightness use 5 V with a transistor, or a constant-current LED driver.'],
        ],
      },
      it: {
        title: 'Calcolo resistenza per LED (con valore E12) | BoardPilot',
        description: 'Calcola la resistenza in serie per un LED da tensione di alimentazione, tensione di soglia e corrente: valore esatto, resistenza E12 da comprare, corrente reale e calore. Gratis, con la formula.',
        h1: 'Calcolo della resistenza per LED',
        card: 'Resistenza in serie per un LED, il valore E12 da comprare, la corrente reale e il calore.',
        lead: 'Inserisci la tensione di alimentazione, la tensione di soglia del LED e la corrente che vuoi. Ottieni la resistenza esatta, il valore standard (E12) da comprare e la corrente che scorre davvero.',
        explain: [
          ['Perché un LED ha bisogno di una resistenza', [
            'Un LED è un diodo. Sotto la sua tensione di soglia non passa quasi corrente; appena sopra, la corrente sale molto in fretta a ogni millivolt in più. Collegato direttamente all’alimentazione, il LED prende tutta la corrente che l’alimentatore o il pin riescono a dare, e si bruciano il LED, il pin o entrambi.',
            'Una resistenza in serie risolve il problema. Il LED tiene più o meno la sua tensione di soglia, la resistenza prende il resto e la legge di Ohm fissa la corrente: la tensione rimasta divisa per la resistenza.',
          ]],
          ['Come scegliere i valori', [
            '<b>La tensione di soglia (Vf)</b> dipende soprattutto dal colore. Valori tipici: rosso circa 1,8–2,2 V, giallo e arancione circa 2,0–2,2 V, verde classico (giallo-verde) circa 2,1–2,2 V, verde brillante, blu e bianco circa 2,8–3,4 V. Il datasheet del LED dà il valore esatto a una corrente indicata.',
            '<b>Corrente:</b> i comuni LED spia da 3 mm e 5 mm reggono circa 20 mA al massimo. I LED moderni sono già luminosi a 2–10 mA, e così il pin del microcontrollore lavora meno.',
            '<b>Valore standard:</b> le resistenze si vendono in serie di valori fissi. Il calcolatore arrotonda al valore E12 successivo, così la corrente reale resta un po’ sotto quella voluta, mai sopra.',
          ]],
        ],
        formula: 'R = (Valim − Vf) / I\nI(reale) = (Valim − Vf) / R(standard)\nP = (Valim − Vf)² / R(standard)',
        source: 'Legge di Ohm. Valori standard: serie E12, IEC 60063.',
        example: ledExamples('it'),
        faq: [
          ['Perché un LED ha bisogno di una resistenza?', 'Appena la tensione supera la soglia del LED, la corrente sale molto in fretta: senza qualcosa che la limiti, il LED assorbe troppa corrente e si rompe, e può danneggiare il pin che lo comanda. Una resistenza in serie prende la tensione in più e fissa la corrente con la legge di Ohm.'],
          ['La resistenza va prima o dopo il LED?', 'Va bene da entrambi i lati. In un circuito in serie la stessa corrente passa in ogni componente, quindi la resistenza può stare tra l’alimentazione e l’anodo del LED (la gamba lunga) oppure tra il catodo (la gamba corta, lato piatto) e la massa.'],
          ['Più LED possono usare una sola resistenza?', 'Non se i LED sono in parallelo: le loro tensioni di soglia sono un po’ diverse e il LED con la soglia più bassa si prende quasi tutta la corrente. Metti una resistenza per ogni LED. I LED in serie possono condividere una resistenza, se l’alimentazione supera la somma delle loro tensioni di soglia.'],
          ['Di che potenza deve essere la resistenza?', 'Calcola il calore con P = (Valim − Vf)² / R e scegli una resistenza che regga almeno il doppio. Per i LED spia sono poche decine di milliwatt, quindi basta la comune resistenza da 1/4 W (250 mW).'],
          ['Quanta corrente può dare un pin del microcontrollore a un LED?', 'Dipende dal chip: controlla il suo datasheet. L’ATmega328P di un Arduino Uno ammette al massimo 40 mA per pin (valore massimo assoluto), quindi è sensato restare a 20 mA o meno. I pin dell’RP2040 di un Raspberry Pi Pico sono impostati a 4 mA di forza di pilotaggio (si può scegliere da 2 a 12 mA); se chiedi di più, la tensione del pin cala. Per LED molto luminosi o per tanti LED, usa un transistor.'],
          ['Posso alimentare un LED blu o bianco a 3,3 V?', 'Appena appena. Con una tensione di soglia intorno ai 3 V, alla resistenza restano pochi decimi di volt, quindi la corrente dipende molto dal LED preciso e dalla sua temperatura. Va bene per una spia debole; per una luminosità stabile usa 5 V con un transistor, oppure un driver per LED a corrente costante.'],
        ],
      },
    },
    {
      slug: 'voltage-divider-calculator',
      color: 'var(--adc)',
      lessons: ['hardware-basics', 'adc'],
      form: (lang) => `<form class="calc-form" data-tool="divider" autocomplete="off">
          <div class="calc-fields">
            ${field(lang === 'it' ? 'Tensione di ingresso Vin (V)' : 'Input voltage Vin (V)', numIn('vin', 5, 'min="0"'))}
            ${field(lang === 'it' ? 'R1, verso Vin (Ω)' : 'R1, to Vin (Ω)', numIn('r1', 10000, 'min="0"'))}
            ${field(lang === 'it' ? 'R2, verso massa (Ω)' : 'R2, to ground (Ω)', numIn('r2', 20000, 'min="0"'))}
            ${field(lang === 'it' ? 'Carico sull’uscita (Ω, facoltativo)' : 'Load on the output (Ω, optional)', numIn('load', '', `min="0" placeholder="${lang === 'it' ? 'nessuno' : 'none'}"`))}
          </div>
          <dl class="calc-outs">
            ${outRow(lang === 'it' ? 'Tensione di uscita Vout' : 'Output voltage Vout', 'vout', 'big')}
            <p class="calc-formula mono" data-out="formula"></p>
            <p class="calc-formula" data-out="loadnote"></p>
            ${outRow(lang === 'it' ? 'Corrente presa da Vin' : 'Current drawn from Vin', 'current')}
          </dl>
          <p class="calc-note" data-out="note" aria-live="polite"></p>
        </form>
      </div>
      <h2 id="r2">${lang === 'it' ? 'Trova R2 per una tensione voluta' : 'Find R2 for a target voltage'}</h2>
      <div class="calc">
        <form class="calc-form" data-tool="divr2" autocomplete="off">
          <div class="calc-fields">
            ${field(lang === 'it' ? 'Tensione di ingresso Vin (V)' : 'Input voltage Vin (V)', numIn('vin', 5, 'min="0"'))}
            ${field(lang === 'it' ? 'Uscita voluta (V)' : 'Target output (V)', numIn('target', 3.3, 'min="0"'))}
            ${field('R1 (Ω)', numIn('r1', 10000, 'min="0"'))}
          </div>
          <dl class="calc-outs">
            ${outRow(lang === 'it' ? 'R2 esatta' : 'Exact R2', 'r2exact')}
            ${outRow(lang === 'it' ? 'Valore standard più vicino (E12)' : 'Nearest standard value (E12)', 'r2std', 'big')}
            ${outRow(lang === 'it' ? 'Uscita e corrente con quel valore' : 'Output and current with it', 'r2vout')}
          </dl>
          <p class="calc-note" data-out="note" aria-live="polite"></p>
        </form>`,
      en: {
        title: 'Voltage divider calculator (Vout, R2 for 3.3 V) | BoardPilot',
        description: 'Calculate a voltage divider’s output from Vin, R1 and R2, with an optional load, or find R2 for a target voltage such as 5 V to 3.3 V for an ESP32 or Raspberry Pi Pico input. Free, with the formula.',
        h1: 'Voltage divider calculator',
        card: 'Output of two resistors, with a load, and R2 for a target such as 5 V to 3.3 V.',
        lead: 'Two resistors in series make a smaller voltage out of a bigger one. Enter Vin, R1 and R2 to get the output, or let the calculator find R2 for the voltage you need.',
        explain: [
          ['How a voltage divider works', [
            'The same current flows through R1 and R2, so each one takes a share of the voltage in proportion to its resistance. The output is taken across R2, the resistor to ground: the bigger R2 is compared with R1, the higher the output.',
          ]],
          ['Good uses and bad uses', [
            '<b>Good:</b> bringing a slow 5 V signal down to 3.3 V for an ESP32 or Raspberry Pi Pico input (the echo pin of an HC-SR04 ultrasonic sensor, for example), and scaling a battery or supply voltage into the range of an ADC pin.',
            '<b>Bad:</b> powering a module. As soon as the load draws current the output drops, and the divider wastes current all the time. Use a voltage regulator instead.',
            '<b>Not for two-way lines</b> such as I2C: a divider only works in one direction. Use a level shifter.',
          ]],
          ['Choosing resistor sizes', [
            'The ratio sets the voltage; the size sets the current. Small values (hundreds of ohms) waste current. Very large values (megaohms) make the output weak: whatever it feeds, even an ADC input, pulls on it and the reading drops. For signals and ADC inputs, values between about 10 kΩ and 100 kΩ are a common compromise.',
          ]],
        ],
        formula: 'Vout = Vin × R2 / (R1 + R2)\nI    = Vin / (R1 + R2)\nR2   = R1 × Vout / (Vin − Vout)\nWith a load RL on the output, use R2 × RL / (R2 + RL) in place of R2.',
        source: 'Ohm’s law; resistors in series and in parallel. Standard values: E12 series, IEC 60063.',
        example: dividerExamples('en'),
        faq: [
          ['Can I power a sensor or module from a voltage divider?', 'No. The output voltage drops as soon as the module draws current, and it changes whenever that current changes. Dividers are for signals and measurements; for power, use a voltage regulator.'],
          ['Can I use a divider to connect a 5 V output to a 3.3 V input?', 'Yes, for one-way signals that are not too fast, such as an ultrasonic sensor’s echo pin or a 5 V device’s serial TX at usual baud rates. Put the divider on the line going into the 3.3 V board. For two-way lines such as I2C, use a level shifter instead.'],
          ['Why is my measured output lower than calculated?', 'Whatever is connected to the output (a multimeter, an ADC input, a module) sits in parallel with R2 and lowers it. Resistor tolerance (±1 % or ±5 %) adds a small error too. Use the load field to see the effect, or pick smaller resistors so the load matters less.'],
          ['Which resistor is R1 and which is R2?', 'R1 goes from the input voltage to the output point; R2 goes from the output point to ground. The output is the voltage across R2.'],
          ['What resistor values are best for an ADC input?', 'The ADC sees R1 and R2 in parallel as its source, and its sampling capacitor must charge through them. Keep that resistance low: the ATmega328P datasheet, for example, is written for sources of about 10 kΩ or less. With larger resistors, add a small capacitor (for example 100 nF) from the ADC pin to ground for slow signals, or give the ADC a longer sample time.'],
        ],
      },
      it: {
        title: 'Calcolo partitore di tensione (Vout, R2 per 3,3 V) | BoardPilot',
        description: 'Calcola l’uscita di un partitore di tensione da Vin, R1 e R2, anche con un carico, oppure trova R2 per una tensione voluta, come da 5 V a 3,3 V per un ingresso di ESP32 o Raspberry Pi Pico. Gratis, con la formula.',
        h1: 'Calcolo del partitore di tensione',
        card: 'Uscita di due resistenze, anche con carico, e R2 per una tensione voluta, come da 5 V a 3,3 V.',
        lead: 'Due resistenze in serie ricavano una tensione più piccola da una più grande. Inserisci Vin, R1 e R2 per avere l’uscita, oppure lascia che il calcolatore trovi R2 per la tensione che ti serve.',
        explain: [
          ['Come funziona un partitore di tensione', [
            'In R1 e R2 passa la stessa corrente, quindi ognuna prende una parte della tensione in proporzione alla sua resistenza. L’uscita si prende ai capi di R2, la resistenza verso massa: più R2 è grande rispetto a R1, più alta è l’uscita.',
          ]],
          ['Usi giusti e usi sbagliati', [
            '<b>Giusto:</b> abbassare un segnale lento da 5 V a 3,3 V per un ingresso di un ESP32 o di un Raspberry Pi Pico (per esempio il pin echo di un sensore a ultrasuoni HC-SR04), e ridurre la tensione di una batteria o di un’alimentazione nel campo di un pin ADC.',
            '<b>Sbagliato:</b> alimentare un modulo. Appena il carico assorbe corrente l’uscita cala, e il partitore spreca corrente di continuo. Usa un regolatore di tensione.',
            '<b>Non per linee bidirezionali</b> come l’I2C: un partitore funziona in un solo verso. Usa un traslatore di livello.',
          ]],
          ['Come scegliere la grandezza delle resistenze', [
            'Il rapporto fissa la tensione; la grandezza fissa la corrente. Valori piccoli (centinaia di ohm) sprecano corrente. Valori molto grandi (megaohm) rendono l’uscita debole: qualunque cosa colleghi, anche un ingresso ADC, la carica e la lettura scende. Per segnali e ingressi ADC, valori tra circa 10 kΩ e 100 kΩ sono un compromesso comune.',
          ]],
        ],
        formula: 'Vout = Vin × R2 / (R1 + R2)\nI    = Vin / (R1 + R2)\nR2   = R1 × Vout / (Vin − Vout)\nCon un carico RL sull’uscita, al posto di R2 usa R2 × RL / (R2 + RL).',
        source: 'Legge di Ohm; resistenze in serie e in parallelo. Valori standard: serie E12, IEC 60063.',
        example: dividerExamples('it'),
        faq: [
          ['Posso alimentare un sensore o un modulo con un partitore di tensione?', 'No. La tensione di uscita cala appena il modulo assorbe corrente, e cambia ogni volta che quella corrente cambia. I partitori servono per segnali e misure; per l’alimentazione usa un regolatore di tensione.'],
          ['Posso usare un partitore per collegare un’uscita a 5 V a un ingresso a 3,3 V?', 'Sì, per segnali in un solo verso e non troppo veloci, come il pin echo di un sensore a ultrasuoni o il TX seriale di un dispositivo a 5 V alle velocità più comuni. Metti il partitore sulla linea che entra nella scheda a 3,3 V. Per linee bidirezionali come l’I2C usa invece un traslatore di livello.'],
          ['Perché l’uscita che misuro è più bassa di quella calcolata?', 'Qualunque cosa colleghi all’uscita (un multimetro, un ingresso ADC, un modulo) è in parallelo a R2 e la abbassa. Anche la tolleranza delle resistenze (±1 % o ±5 %) aggiunge un piccolo errore. Usa il campo del carico per vederne l’effetto, oppure scegli resistenze più piccole, così il carico conta meno.'],
          ['Quale resistenza è R1 e quale R2?', 'R1 va dalla tensione di ingresso al punto di uscita; R2 va dal punto di uscita a massa. L’uscita è la tensione ai capi di R2.'],
          ['Quali valori di resistenza sono migliori per un ingresso ADC?', 'L’ADC vede R1 e R2 in parallelo come sorgente, e il suo condensatore di campionamento deve caricarsi attraverso di loro. Tieni bassa quella resistenza: il datasheet dell’ATmega328P, per esempio, è pensato per sorgenti di circa 10 kΩ o meno. Con resistenze più grandi, per segnali lenti aggiungi un piccolo condensatore (per esempio 100 nF) tra il pin ADC e massa, oppure dai all’ADC un tempo di campionamento più lungo.'],
        ],
      },
    },
    {
      slug: 'i2c-pull-up-calculator',
      color: 'var(--sda)',
      lessons: ['buses', 'hardware-basics'],
      form: (lang) => `<form class="calc-form" data-tool="pullup" autocomplete="off">
          <div class="calc-fields">
            ${field(lang === 'it' ? 'Velocità del bus' : 'Bus speed', `<select name="mode">${Object.entries(I2C_LABELS).map(([k, v]) => `<option value="${k}"${k === 'fast' ? ' selected' : ''}>${esc(v[lang])}</option>`).join('')}</select>`)}
            ${field(lang === 'it' ? 'Tensione del bus VDD (V)' : 'Bus voltage VDD (V)', numIn('vdd', 3.3, 'min="0"'))}
            ${field(lang === 'it' ? 'Capacità del bus (pF)' : 'Bus capacitance (pF)', numIn('pf', 100, 'min="0"'))}
            ${field(lang === 'it' ? 'Verifica una tua resistenza (Ω, facoltativo)' : 'Check a resistor you have (Ω, optional)', numIn('mine', 4700, 'min="0"'))}
          </div>
          <dl class="calc-outs">
            ${outRow(lang === 'it' ? 'Valore minimo ammesso' : 'Smallest allowed', 'min')}
            ${outRow(lang === 'it' ? 'Valore massimo ammesso' : 'Largest allowed', 'max')}
            ${outRow(lang === 'it' ? 'Valore standard suggerito (tempo di salita)' : 'Suggested standard value (rise time)', 'suggest', 'big')}
            <p class="calc-formula">${esc(lang === 'it' ? 'Un suggerimento: qualsiasi valore standard dentro l’intervallo rispetta la specifica.' : 'A suggestion: any standard value inside the range meets the specification.')}</p>
            ${outRow(lang === 'it' ? 'Tempo di salita con la tua resistenza' : 'Rise time with your resistor', 'rise')}
            ${outRow(lang === 'it' ? 'Limite per questa velocità' : 'Limit for this speed', 'limit')}
            ${outRow(lang === 'it' ? 'Giudizio' : 'Verdict', 'verdict')}
          </dl>
          <p class="calc-note" data-out="note" aria-live="polite"></p>
        </form>`,
      en: {
        title: 'I2C pull-up resistor calculator (NXP UM10204) | BoardPilot',
        description: 'Find the allowed I2C pull-up resistor range for 100 kHz, 400 kHz or 1 MHz from the bus voltage and capacitance, as in the NXP I2C-bus specification (UM10204), with a suggested standard value and the rise time.',
        h1: 'I2C pull-up resistor calculator',
        card: 'Allowed pull-up range for 100 kHz, 400 kHz and 1 MHz from the bus capacitance (NXP UM10204).',
        lead: 'I2C needs a pull-up resistor on SDA and one on SCL. Too small and the chips cannot pull the lines low; too big and the lines rise too slowly. Enter the speed, the voltage and the bus capacitance to get the range that works.',
        explain: [
          ['What is a pull-up resistor?', [
            'I2C chips never drive SDA and SCL high. Their outputs are open-drain: they can only connect the line to ground, or let go of it. A pull-up resistor to the supply brings the line back up whenever no chip is holding it low. Every I2C bus needs one on SDA and one on SCL.',
          ]],
          ['Why there is a minimum and a maximum', [
            '<b>Minimum:</b> when a chip pulls the line low, current flows through the pull-up into that chip. The specification only guarantees that a chip can sink 3 mA while keeping the line at 0.4 V or less (20 mA in Fast-mode Plus), so a smaller resistor would ask for more current than the chip can take.',
            '<b>Maximum:</b> every wire and every chip pin adds capacitance, and the resistor has to charge it. The line must rise from 30 % to 70 % of VDD within the rise time the speed allows: 1000 ns at 100 kHz, 300 ns at 400 kHz, 120 ns at 1 MHz.',
          ]],
          ['Estimating the bus capacitance', [
            'Each chip pin adds up to 10 pF (the limit in the specification) and wiring adds more: short breadboard wires a few tens of picofarads, a metre of cable often around 100 pF. For a small hobby setup, 50 to 200 pF is a reasonable guess. The specification allows at most 400 pF (550 pF in Fast-mode Plus).',
          ]],
          ['Pull-ups that are already there', [
            'Many breakout boards (BME280 sensors, SSD1306 displays, MPU6050 modules) already carry pull-ups, often 4.7 kΩ or 10 kΩ. Several modules on one bus put their pull-ups in parallel: two 4.7 kΩ make about 2.35 kΩ. Check the result against the smallest allowed value.',
          ]],
        ],
        formula: 'Rp(min) = (VDD − VOL(max)) / IOL     VOL(max) = 0.4 V, IOL = 3 mA (20 mA in Fast-mode Plus)\nRp(max) = tr / (0.8473 × Cb)         tr = 1000 ns, 300 ns or 120 ns; Cb = bus capacitance\ntr      = 0.8473 × Rp × Cb          0.8473 = ln(0.7 / 0.3): the time to rise from 30 % to 70 % of VDD',
        source: 'NXP UM10204, I2C-bus specification and user manual, section 7.1 “Pull-up resistor sizing” and table 10 (rise time limits).',
        example: pullupExamples('en'),
        faq: [
          ['Is 4.7 kΩ always right for I2C?', 'It is a common choice for 100 kHz at 3.3 V or 5 V with short wires, and there it usually works. At 400 kHz, or with long wires and many devices, it can be too weak: check it against the largest allowed value for your bus.'],
          ['Do I need pull-ups if my module already has them?', 'Usually not. Most breakout boards include pull-ups on SDA and SCL. Check the module’s schematic, or measure the resistance between SDA and VCC with the power off. With many modules on one bus, their pull-ups add up in parallel and can become too strong.'],
          ['Can I use the microcontroller’s internal pull-ups?', 'Only for short, slow buses. Internal pull-ups are weak, typically 20 to 80 kΩ depending on the chip, so the lines rise slowly. They can do for a quick test at 100 kHz with one sensor on short wires; use external resistors for anything else.'],
          ['What happens if the pull-up is wrong?', 'Too strong (too small) and a chip cannot pull the line low enough, so bits are misread. Too weak (too large) and the edges become slow ramps; at higher speeds the bits blur, devices stop answering or the bus hangs. Both can look like a “device not found” error.'],
          ['Should I pull up to 3.3 V or 5 V?', 'To the supply of the chips on the bus. If a 3.3 V board such as an ESP32 or a Raspberry Pi Pico is on the bus, pull up to 3.3 V: pulling its pins up to 5 V can damage it. To mix 3.3 V and 5 V devices, use an I2C level shifter.'],
        ],
      },
      it: {
        title: 'Calcolo resistenze di pull-up I2C (NXP UM10204) | BoardPilot',
        description: 'Trova l’intervallo ammesso per le resistenze di pull-up I2C a 100 kHz, 400 kHz o 1 MHz da tensione e capacità del bus, come nella specifica NXP del bus I2C (UM10204), con un valore standard suggerito e il tempo di salita.',
        h1: 'Calcolo delle resistenze di pull-up I2C',
        card: 'Intervallo ammesso per le pull-up a 100 kHz, 400 kHz e 1 MHz dalla capacità del bus (NXP UM10204).',
        lead: 'L’I2C ha bisogno di una resistenza di pull-up su SDA e di una su SCL. Troppo piccole e i chip non riescono a portare le linee in basso; troppo grandi e le linee salgono troppo lentamente. Inserisci velocità, tensione e capacità del bus per avere l’intervallo che funziona.',
        explain: [
          ['Cos’è una resistenza di pull-up?', [
            'I chip I2C non portano mai SDA e SCL in alto. Le loro uscite sono open-drain: possono solo collegare la linea a massa, oppure lasciarla libera. Una resistenza di pull-up verso l’alimentazione riporta su la linea ogni volta che nessun chip la tiene in basso. Ogni bus I2C ne ha bisogno di una su SDA e di una su SCL.',
          ]],
          ['Perché ci sono un minimo e un massimo', [
            '<b>Minimo:</b> quando un chip porta la linea in basso, la corrente passa dalla pull-up dentro quel chip. La specifica garantisce solo che un chip assorba 3 mA tenendo la linea a 0,4 V o meno (20 mA in Fast-mode Plus), quindi una resistenza più piccola chiederebbe più corrente di quella che il chip regge.',
            '<b>Massimo:</b> ogni filo e ogni pin di un chip aggiungono capacità, e la resistenza la deve caricare. La linea deve salire dal 30 % al 70 % di VDD entro il tempo di salita ammesso per quella velocità: 1000 ns a 100 kHz, 300 ns a 400 kHz, 120 ns a 1 MHz.',
          ]],
          ['Come stimare la capacità del bus', [
            'Ogni pin di un chip aggiunge fino a 10 pF (il limite della specifica) e i collegamenti aggiungono altro: fili corti su breadboard qualche decina di picofarad, un metro di cavo spesso circa 100 pF. Per un piccolo montaggio hobbistico, da 50 a 200 pF è una stima ragionevole. La specifica ammette al massimo 400 pF (550 pF in Fast-mode Plus).',
          ]],
          ['Pull-up che ci sono già', [
            'Molte schedine (sensori BME280, display SSD1306, moduli MPU6050) hanno già le pull-up, spesso da 4,7 kΩ o 10 kΩ. Più moduli sullo stesso bus mettono le loro pull-up in parallelo: due da 4,7 kΩ fanno circa 2,35 kΩ. Confronta il risultato con il valore minimo ammesso.',
          ]],
        ],
        formula: 'Rp(min) = (VDD − VOL(max)) / IOL     VOL(max) = 0,4 V, IOL = 3 mA (20 mA in Fast-mode Plus)\nRp(max) = tr / (0,8473 × Cb)         tr = 1000 ns, 300 ns o 120 ns; Cb = capacità del bus\ntr      = 0,8473 × Rp × Cb          0,8473 = ln(0,7 / 0,3): il tempo per salire dal 30 % al 70 % di VDD',
        source: 'NXP UM10204, specifica e manuale del bus I2C, sezione 7.1 “Pull-up resistor sizing” e tabella 10 (limiti del tempo di salita).',
        example: pullupExamples('it'),
        faq: [
          ['4,7 kΩ va sempre bene per l’I2C?', 'È una scelta comune a 100 kHz, a 3,3 V o 5 V con fili corti, e lì di solito funziona. A 400 kHz, o con fili lunghi e tanti dispositivi, può essere troppo debole: confrontala con il valore massimo ammesso per il tuo bus.'],
          ['Servono le pull-up se il modulo le ha già?', 'Di solito no. La maggior parte delle schedine ha già le pull-up su SDA e SCL. Controlla lo schema del modulo, oppure misura la resistenza tra SDA e VCC a circuito spento. Con tanti moduli sullo stesso bus, le loro pull-up si sommano in parallelo e possono diventare troppo forti.'],
          ['Posso usare le pull-up interne del microcontrollore?', 'Solo per bus corti e lenti. Le pull-up interne sono deboli, di solito da 20 a 80 kΩ a seconda del chip, quindi le linee salgono lentamente. Possono bastare per una prova veloce a 100 kHz con un solo sensore su fili corti; per tutto il resto usa resistenze esterne.'],
          ['Cosa succede se la pull-up è sbagliata?', 'Troppo forte (troppo piccola) e un chip non riesce a portare la linea abbastanza in basso, quindi i bit vengono letti male. Troppo debole (troppo grande) e i fronti diventano rampe lente; alle velocità più alte i bit si confondono, i dispositivi smettono di rispondere o il bus si blocca. In entrambi i casi può sembrare un errore “dispositivo non trovato”.'],
          ['Devo collegare le pull-up a 3,3 V o a 5 V?', 'All’alimentazione dei chip sul bus. Se sul bus c’è una scheda a 3,3 V come un ESP32 o un Raspberry Pi Pico, collega le pull-up a 3,3 V: portare i suoi pin a 5 V può danneggiarla. Per mescolare dispositivi a 3,3 V e a 5 V usa un traslatore di livello I2C.'],
        ],
      },
    },
    {
      slug: 'uart-baud-rate-calculator',
      color: 'var(--warn)',
      lessons: ['buses', 'timers-interrupts'],
      board: 'arduino-uno-r3',
      form: (lang, boards) => `<form class="calc-form" data-tool="uart" autocomplete="off">
          <div class="calc-fields">
            ${boardSelect(lang, boards, 'arduino-uno-r3')}
            ${field(lang === 'it' ? 'Clock della UART (Hz)' : 'UART clock (Hz)', `${numIn('clock', 16000000, 'min="1"')}<small class="mono" data-out="clockHz"></small>`, ' data-needs-calc')}
            ${field(lang === 'it' ? 'Velocità (baud)' : 'Baud rate', `${numIn('baud', 115200, 'min="1" list="bauds"')}<datalist id="bauds">${[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 250000, 460800, 921600, 1000000].map((b) => `<option value="${b}"></option>`).join('')}</datalist>`, ' data-needs-calc')}
          </div>
          <div class="calc-result" data-out="result" aria-live="polite"></div>
          <div data-out="extra"></div>
        </form>`,
      en: {
        title: 'UART baud rate calculator (divider and error %) | BoardPilot',
        description: `Choose a board and a baud rate to get the UART divider registers, the real baud rate and the error %, for ${B} boards: Arduino Uno, Nano and Mega, ESP32, STM32, Raspberry Pi Pico and nRF52. Plain verdict and ready code.`,
        h1: 'UART baud rate calculator',
        card: `Divider registers, real baud rate and error % for ${B} boards, with a plain verdict.`,
        lead: 'A UART makes its baud rate by dividing a clock, so many speeds come out slightly off. Pick your board and a speed to see the divider registers, the real rate, the error and whether it will work.',
        explain: [
          ['Why the baud rate error matters', [
            'UART has no clock wire. The receiver only knows when the start bit began; then it samples each following bit at the moment it expects it, timed by its own clock. If the two sides run at slightly different speeds, the sampling point drifts a little further on every bit of the character.',
            'Over a 10-bit character (start bit, 8 data bits, stop bit: “8N1”) the last bit must still be sampled inside its own bit time. In theory that allows about 5 % of mismatch between the two sides together; real receivers need part of that for their own sampling. That is why this calculator calls up to 1 % fine, up to 2 % usually fine if the other side is accurate, and more than 2 % risky.',
          ]],
          ['Why some speeds are exact and others are not', [
            'The divider can only take certain values, so the real rate is the clock divided by the nearest one. An Arduino Uno at 16 MHz makes 250000, 500000 and 1000000 baud exactly, but 115200 comes out as 117647 (+2.1 %). An ESP32 divides its 80 MHz clock with a fractional divider and lands very close to every common speed. The nRF52 only offers a fixed list of rates, each with its own small error.',
          ]],
        ],
        formula: 'AVR (ATmega328P, ATmega2560):  UBRR = fclk / (16 × baud) − 1     double speed (U2X = 1): fclk / (8 × baud) − 1\nSTM32:            USARTDIV = fck / (16 × baud), BRR = 12-bit mantissa + 4-bit fraction\nESP32, S3, C3:    baud = APB_CLK / (CLKDIV + FRAG / 16)\nRP2040, RP2350:   baud = 4 × clk_peri / (64 × IBRD + FBRD)\nnRF52840:         fixed BAUDRATE values, each with its real rate in the register table\nerror = (real rate − wanted rate) / wanted rate × 100 %',
        source: 'ATmega328P datasheet, USART0 “Baud Rate Generation” and “Examples of UBRRn Settings”; RM0368 / RM0383 “Fractional baud rate generation”; ESP32 Technical Reference Manual, UART Controller; RP2040 Datasheet 4.2.7.1 “Baud Rate Calculation” and Pico SDK uart_set_baudrate(); nRF52840 Product Specification, UARTE BAUDRATE register.',
        example: `<p>Arduino Uno, 16 MHz, 115200 baud. Normal speed: UBRR = ${big(16000000)} / (16 × 115200) − 1 = 7.68, rounded to 8, so the real rate is ${big(16000000)} / (16 × 9) = 111111 baud (−3.5 %). Double speed (U2X0 = 1): UBRR = 16, real rate ${big(16000000)} / (8 × 17) = <b>117647 baud, +2.12 %</b>: the better of the two, but still risky.</p>\n<p>At 9600 baud the same chip gets UBRR = 103 and 9615 baud, only 0.16 % off. An ESP32 at 115200 baud gets CLKDIV 694 and FRAG 7, practically exact.</p>`,
        faq: [
          ['What baud rate error is acceptable?', 'As a rule of thumb, keep each side within about 2 % and the total mismatch between both sides well under 5 %; within 1 % is always fine. The receiver resynchronises on every start bit, so the error only has to hold across one character, not the whole message.'],
          ['Why does 115200 baud give errors on an Arduino Uno?', 'At 16 MHz the nearest divider gives 117647 baud, 2.1 % fast. It often still works over the Uno’s own USB connection, because the USB-to-serial chip on the board (an ATmega16U2) also runs at 16 MHz and makes the same error. Talking to another device at an exact 115200 is where it fails. 38400 (0.2 % off) or 250000 (exact) are safer choices.'],
          ['Which baud rates are exact at 16 MHz?', '250000, 500000 and 1000000 baud are exact at 16 MHz, and 9600, 19200 and 38400 are within 0.2 %. 115200 and 230400 are more than 2 % off on a 16 MHz AVR.'],
          ['Do both devices need the same settings?', 'Yes: the same baud rate and the same frame format, usually 8N1 (8 data bits, no parity, 1 stop bit). TX of one side goes to RX of the other, and the grounds must be connected. The voltage levels must match too: a 5 V TX into a 3.3 V RX needs a divider or a level shifter.'],
          ['How many bytes per second does a baud rate give?', 'With 8N1 each byte takes 10 bits (start bit, 8 data bits, stop bit), so divide the baud rate by 10: 115200 baud carries at most 11520 bytes per second, 9600 baud carries 960.'],
        ],
      },
      it: {
        title: 'Calcolo baud rate UART (divisore ed errore %) | BoardPilot',
        description: `Scegli una scheda e una velocità per avere i registri del divisore UART, il baud rate reale e l’errore %, per ${B} schede: Arduino Uno, Nano e Mega, ESP32, STM32, Raspberry Pi Pico e nRF52. Giudizio chiaro e codice pronto.`,
        h1: 'Calcolo del baud rate UART',
        card: `Registri del divisore, baud rate reale ed errore % per ${B} schede, con un giudizio chiaro.`,
        lead: 'Una UART ottiene il baud rate dividendo un clock, quindi molte velocità risultano un po’ sbagliate. Scegli la tua scheda e una velocità per vedere i registri del divisore, la velocità reale, l’errore e se funzionerà.',
        explain: [
          ['Perché l’errore del baud rate conta', [
            'La UART non ha un filo di clock. Il ricevitore sa solo quando è iniziato il bit di start; poi legge ogni bit successivo nel momento in cui se lo aspetta, contando con il proprio clock. Se i due lati vanno a velocità un po’ diverse, il punto di lettura si sposta un po’ di più a ogni bit del carattere.',
            'In un carattere di 10 bit (bit di start, 8 bit di dati, bit di stop: “8N1”) anche l’ultimo bit deve essere letto dentro il suo tempo. In teoria questo lascia circa il 5 % di differenza tra i due lati insieme; i ricevitori reali ne usano una parte per il proprio campionamento. Per questo il calcolatore considera fino all’1 % a posto, fino al 2 % di solito a posto se l’altro lato è preciso, e oltre il 2 % rischioso.',
          ]],
          ['Perché alcune velocità sono esatte e altre no', [
            'Il divisore può avere solo certi valori, quindi la velocità reale è il clock diviso per il valore più vicino. Un Arduino Uno a 16 MHz fa esattamente 250000, 500000 e 1000000 baud, ma 115200 diventa 117647 (+2,1 %). Un ESP32 divide il suo clock da 80 MHz con un divisore frazionario e arriva molto vicino a tutte le velocità comuni. L’nRF52 offre solo un elenco fisso di velocità, ognuna con il suo piccolo errore.',
          ]],
        ],
        formula: 'AVR (ATmega328P, ATmega2560):  UBRR = fclk / (16 × baud) − 1     doppia velocità (U2X = 1): fclk / (8 × baud) − 1\nSTM32:            USARTDIV = fck / (16 × baud), BRR = mantissa a 12 bit + frazione a 4 bit\nESP32, S3, C3:    baud = APB_CLK / (CLKDIV + FRAG / 16)\nRP2040, RP2350:   baud = 4 × clk_peri / (64 × IBRD + FBRD)\nnRF52840:         valori fissi di BAUDRATE, ognuno con la sua velocità reale nella tabella del registro\nerrore = (velocità reale − velocità voluta) / velocità voluta × 100 %',
        source: 'Datasheet ATmega328P, USART0 “Baud Rate Generation” ed “Examples of UBRRn Settings”; RM0368 / RM0383 “Fractional baud rate generation”; ESP32 Technical Reference Manual, UART Controller; RP2040 Datasheet 4.2.7.1 “Baud Rate Calculation” e uart_set_baudrate() del Pico SDK; nRF52840 Product Specification, registro UARTE BAUDRATE.',
        example: `<p>Arduino Uno, 16 MHz, 115200 baud. Velocità normale: UBRR = ${big(16000000)} / (16 × 115200) − 1 = 7,68, arrotondato a 8, quindi la velocità reale è ${big(16000000)} / (16 × 9) = 111111 baud (−3,5 %). Doppia velocità (U2X0 = 1): UBRR = 16, velocità reale ${big(16000000)} / (8 × 17) = <b>117647 baud, +2,12 %</b>: la migliore delle due, ma ancora rischiosa.</p>\n<p>A 9600 baud lo stesso chip ha UBRR = 103 e 9615 baud, solo lo 0,16 % di errore. Un ESP32 a 115200 baud ha CLKDIV 694 e FRAG 7, praticamente esatto.</p>`,
        faq: [
          ['Quale errore di baud rate è accettabile?', 'Come regola pratica, tieni ogni lato entro circa il 2 % e la differenza totale tra i due lati ben sotto il 5 %; entro l’1 % va sempre bene. Il ricevitore si risincronizza a ogni bit di start, quindi l’errore deve reggere solo per un carattere, non per tutto il messaggio.'],
          ['Perché 115200 baud dà errori su un Arduino Uno?', 'A 16 MHz il divisore più vicino dà 117647 baud, il 2,1 % più veloce. Spesso funziona lo stesso con la connessione USB dell’Uno, perché il chip USB-seriale sulla scheda (un ATmega16U2) va anche lui a 16 MHz e fa lo stesso errore. I problemi arrivano parlando con un altro dispositivo che va esattamente a 115200. 38400 (errore dello 0,2 %) o 250000 (esatto) sono scelte più sicure.'],
          ['Quali baud rate sono esatti a 16 MHz?', '250000, 500000 e 1000000 baud sono esatti a 16 MHz, e 9600, 19200 e 38400 sono entro lo 0,2 %. 115200 e 230400 sbagliano di più del 2 % su un AVR a 16 MHz.'],
          ['I due dispositivi devono avere le stesse impostazioni?', 'Sì: lo stesso baud rate e lo stesso formato, di solito 8N1 (8 bit di dati, nessuna parità, 1 bit di stop). Il TX di un lato va all’RX dell’altro e le masse devono essere collegate. Anche i livelli di tensione devono coincidere: un TX a 5 V verso un RX a 3,3 V ha bisogno di un partitore o di un traslatore di livello.'],
          ['Quanti byte al secondo dà un baud rate?', 'Con 8N1 ogni byte occupa 10 bit (start, 8 bit di dati, stop), quindi dividi il baud rate per 10: 115200 baud portano al massimo 11520 byte al secondo, 9600 baud ne portano 960.'],
        ],
      },
    },
    {
      slug: 'pwm-timer-calculator',
      color: 'var(--ok)',
      lessons: ['timers-interrupts', 'essentials'],
      board: 'esp32-devkitc-30',
      form: (lang, boards) => `<form class="calc-form" data-tool="pwm" autocomplete="off">
          <div class="calc-fields">
            ${boardSelect(lang, boards, 'esp32-devkitc-30')}
            ${field(lang === 'it' ? 'Clock del timer (Hz)' : 'Timer clock (Hz)', `${numIn('clock', 80000000, 'min="1"')}<small class="mono" data-out="clockHz"></small>`, ' data-needs-calc')}
            ${field(lang === 'it' ? 'Frequenza (Hz)' : 'Frequency (Hz)', numIn('freq', 5000, 'min="0"'), ' data-needs-calc')}
            ${field(lang === 'it' ? 'Duty cycle (%)' : 'Duty cycle (%)', numIn('duty', 50, 'min="0" max="100"'), ' data-needs-calc')}
          </div>
          <div class="calc-result" data-out="result" aria-live="polite"></div>
        </form>`,
      en: {
        title: 'PWM timer calculator (prescaler, period, duty) | BoardPilot',
        description: 'Get the prescaler, period (TOP, ARR) and compare values for a PWM frequency and duty cycle on Arduino (AVR Timer1), ESP32 LEDC, STM32, Raspberry Pi Pico and nRF52, with the real frequency, the resolution and ready-to-paste code.',
        h1: 'PWM and timer calculator',
        card: 'Prescaler, period and compare values, the real frequency, the resolution and code for your board.',
        lead: 'Choose a board, a frequency and a duty cycle. You get the register values for its timer, the frequency it really makes, how many duty steps you have, and code for its toolchain.',
        explain: [
          ['What PWM is', [
            'Pulse-width modulation switches a pin fully on and off, quickly and over and over. The frequency is how many on-off cycles happen each second; the duty cycle is the share of each cycle the pin spends on. An LED at 25 % duty looks dimmer and a motor at 25 % runs slower, because both respond to the average.',
          ]],
          ['How a timer makes PWM', [
            'A hardware timer counts clock ticks, usually after a prescaler that divides the clock down. When the count reaches the period value (TOP on AVR, ARR on STM32, the wrap value on the RP2040) it starts again: that sets the frequency. A compare value sets where in the count the pin switches: that sets the duty cycle.',
          ]],
          ['Frequency against resolution', [
            'The number of duty steps is the timer clock divided by the PWM frequency. A higher frequency means fewer steps: from its 80 MHz clock the ESP32 LEDC gets 13 bits at 5 kHz, but only 8 bits at 312 kHz. Pick the lowest frequency that suits the load.',
            '<b>LEDs:</b> a few hundred hertz or more so the eye sees no flicker; 1 to 5 kHz is common. <b>DC motors</b> through a driver: often 20 kHz or more, above what people can hear. <b>Hobby servos:</b> 50 Hz, with a pulse of about 1 to 2 ms setting the angle.',
          ]],
        ],
        formula: 'f      = fclk / (prescaler × (TOP + 1))\nduty   = compare / (TOP + 1)\nsteps  = TOP + 1, resolution = log2(steps) bits\nESP32 LEDC:  f = fclk / (divider × 2^bits)\nnRF52840:    f = 16 MHz / (2^PRESCALER × COUNTERTOP)',
        source: 'ATmega328P / ATmega2560 datasheet, Timer/Counter1 Fast PWM (mode 14, TOP = ICR1); RM0368 / RM0383, general-purpose timers; ESP32 and ESP32-S3/C3 Technical Reference Manuals, LED PWM Controller; RP2040 Datasheet 4.5.2.6 “Configuring PWM Period”; nRF52840 Product Specification, PWM.',
        example: `<p>A servo signal on an Arduino Uno: 50 Hz at 7.5 % duty (a 1.5 ms pulse, the centre position). Timer1 with prescaler 8 counts at 2 MHz; TOP = ${big(2000000)} / 50 − 1 = <b>39999</b>, so the frequency is exactly 50 Hz, and OCR1A = 0.075 × 40000 = <b>3000</b>.</p>\n<p>An ESP32 at 5 kHz: 80 MHz / 5 kHz = 16000 ticks per period, so the LEDC gets <b>13 bits</b> (8192 steps) with a divider of 1.953125, exactly 5 kHz; 50 % duty is 4096.</p>`,
        faq: [
          ['What PWM frequency should I use?', 'LEDs: 1 to 5 kHz avoids visible flicker. DC motors: 20 kHz or more to stay above hearing, if the motor driver can switch that fast. Servos: 50 Hz, with pulses of 1 to 2 ms. Buzzers: the pitch you want to hear.'],
          ['Why do I get fewer duty steps at a higher frequency?', 'Each PWM period is counted in timer ticks. At a higher frequency the period is shorter, so it holds fewer ticks, and each tick is one duty step. Halving the frequency doubles the steps, up to the width of the timer.'],
          ['Can changing a timer break other things?', 'Yes. On an Arduino Uno, Timer0 runs millis() and delay(), Timer1 is used by the Servo library and Timer2 by tone(). Reconfiguring one of them changes those functions and the analogWrite() pins on that timer. Pick a timer your sketch does not already use.'],
          ['What frequency does analogWrite() use?', 'It depends on the board and its core. On an Arduino Uno it is about 490 Hz on pins 3, 9, 10 and 11 and about 980 Hz on pins 5 and 6, with 8-bit duty (0 to 255). To choose the frequency yourself, set the timer registers as this calculator shows.'],
          ['Is the frequency shown here measured?', 'No. It is calculated from the register formulas in the datasheets, for the clock shown. If your board runs its clock at another speed, change the clock field. To check the real signal, use an oscilloscope or a logic analyser.'],
        ],
      },
      it: {
        title: 'Calcolo timer PWM (prescaler, periodo, duty) | BoardPilot',
        description: 'Ottieni prescaler, periodo (TOP, ARR) e valori di confronto per una frequenza PWM e un duty cycle su Arduino (Timer1 AVR), ESP32 LEDC, STM32, Raspberry Pi Pico e nRF52, con la frequenza reale, la risoluzione e codice pronto da incollare.',
        h1: 'Calcolo di PWM e timer',
        card: 'Prescaler, periodo e valori di confronto, la frequenza reale, la risoluzione e il codice per la tua scheda.',
        lead: 'Scegli una scheda, una frequenza e un duty cycle. Ottieni i valori dei registri del suo timer, la frequenza che fa davvero, quanti passi di duty hai e il codice per la sua toolchain.',
        explain: [
          ['Cos’è il PWM', [
            'La modulazione a larghezza di impulso (PWM) accende e spegne del tutto un pin, velocemente e di continuo. La frequenza è quanti cicli acceso-spento avvengono in un secondo; il duty cycle è la parte di ogni ciclo in cui il pin è acceso. Un LED al 25 % sembra meno luminoso e un motore al 25 % gira più piano, perché entrambi rispondono alla media.',
          ]],
          ['Come un timer genera il PWM', [
            'Un timer hardware conta i colpi di clock, di solito dopo un prescaler che divide il clock. Quando il conteggio arriva al valore del periodo (TOP sugli AVR, ARR sugli STM32, il valore di wrap sull’RP2040) ricomincia: questo fissa la frequenza. Un valore di confronto decide in che punto del conteggio il pin cambia: questo fissa il duty cycle.',
          ]],
          ['Frequenza contro risoluzione', [
            'Il numero di passi di duty è il clock del timer diviso per la frequenza PWM. Frequenza più alta vuol dire meno passi: con il suo clock da 80 MHz, il LEDC dell’ESP32 ha 13 bit a 5 kHz, ma solo 8 bit a 312 kHz. Scegli la frequenza più bassa adatta al carico.',
            '<b>LED:</b> qualche centinaio di hertz o più, così l’occhio non vede sfarfallio; da 1 a 5 kHz è comune. <b>Motori in corrente continua</b> con un driver: spesso 20 kHz o più, sopra quello che si sente. <b>Servo da modellismo:</b> 50 Hz, con un impulso di circa 1–2 ms che fissa l’angolo.',
          ]],
        ],
        formula: 'f      = fclk / (prescaler × (TOP + 1))\nduty   = confronto / (TOP + 1)\npassi  = TOP + 1, risoluzione = log2(passi) bit\nESP32 LEDC:  f = fclk / (divisore × 2^bit)\nnRF52840:    f = 16 MHz / (2^PRESCALER × COUNTERTOP)',
        source: 'Datasheet ATmega328P / ATmega2560, Timer/Counter1 Fast PWM (modo 14, TOP = ICR1); RM0368 / RM0383, timer general-purpose; ESP32 e ESP32-S3/C3 Technical Reference Manual, LED PWM Controller; RP2040 Datasheet 4.5.2.6 “Configuring PWM Period”; nRF52840 Product Specification, PWM.',
        example: `<p>Un segnale per servo su un Arduino Uno: 50 Hz al 7,5 % di duty (un impulso di 1,5 ms, la posizione centrale). Il Timer1 con prescaler 8 conta a 2 MHz; TOP = ${big(2000000)} / 50 − 1 = <b>39999</b>, quindi la frequenza è esattamente 50 Hz, e OCR1A = 0,075 × 40000 = <b>3000</b>.</p>\n<p>Un ESP32 a 5 kHz: 80 MHz / 5 kHz = 16000 colpi per periodo, quindi il LEDC ha <b>13 bit</b> (8192 passi) con un divisore di 1,953125, esattamente 5 kHz; il 50 % di duty è 4096.</p>`,
        faq: [
          ['Che frequenza PWM devo usare?', 'LED: da 1 a 5 kHz evita lo sfarfallio visibile. Motori in corrente continua: 20 kHz o più per restare sopra l’udito, se il driver riesce a commutare così veloce. Servo: 50 Hz, con impulsi da 1 a 2 ms. Buzzer: la nota che vuoi sentire.'],
          ['Perché ho meno passi di duty a frequenza più alta?', 'Ogni periodo PWM si conta in colpi del timer. A frequenza più alta il periodo è più corto, quindi contiene meno colpi, e ogni colpo è un passo di duty. Dimezzando la frequenza i passi raddoppiano, fino alla larghezza del timer.'],
          ['Cambiare un timer può rompere altre cose?', 'Sì. Su un Arduino Uno, il Timer0 fa funzionare millis() e delay(), il Timer1 è usato dalla libreria Servo e il Timer2 da tone(). Riconfigurarne uno cambia quelle funzioni e i pin analogWrite() di quel timer. Scegli un timer che il tuo sketch non usa già.'],
          ['Che frequenza usa analogWrite()?', 'Dipende dalla scheda e dal suo core. Su un Arduino Uno è circa 490 Hz sui pin 3, 9, 10 e 11 e circa 980 Hz sui pin 5 e 6, con duty a 8 bit (da 0 a 255). Per scegliere tu la frequenza, imposta i registri del timer come mostra questo calcolatore.'],
          ['La frequenza mostrata qui è misurata?', 'No. È calcolata con le formule dei registri nei datasheet, per il clock indicato. Se la tua scheda usa un clock diverso, cambia il campo del clock. Per controllare il segnale reale usa un oscilloscopio o un analizzatore logico.'],
        ],
      },
    },
    {
      slug: 'adc-sample-rate-calculator',
      color: 'var(--adc)',
      lessons: ['adc', 'timers-interrupts'],
      board: 'arduino-uno-r3',
      form: (lang, boards) => `<form class="calc-form" data-tool="adc" autocomplete="off">
          <div class="calc-fields">
            ${boardSelect(lang, boards, 'arduino-uno-r3')}
            ${field(lang === 'it' ? 'Clock di ingresso dell’ADC (Hz)' : 'ADC input clock (Hz)', `${numIn('clock', 16000000, 'min="1"')}<small class="mono" data-out="clockHz"></small>`, ' data-needs-calc')}
            ${field(lang === 'it' ? 'Impostazione' : 'Setting', '<select name="setting"><option value="128">Prescaler 128</option></select>', ' data-needs-calc')}
          </div>
          <div class="calc-result" data-out="result" aria-live="polite"></div>
        </form>`,
      en: {
        title: 'ADC sample rate calculator (conversion time) | BoardPilot',
        description: 'How many ADC readings per second can your board take? Conversion time and maximum sample rate for Arduino (ATmega), STM32, Raspberry Pi Pico (RP2040, RP2350) and nRF52 from the ADC clock and sample time, from the datasheets.',
        h1: 'ADC sample rate calculator',
        card: 'Conversion time and the most readings per second, from the ADC clock and sample time.',
        lead: 'Every ADC reading takes a fixed number of ADC clock cycles. Pick your board and its ADC setting to see how long one conversion takes and how many readings per second the hardware can make.',
        explain: [
          ['Why an ADC conversion takes time', [
            'An ADC first samples: it connects a small internal capacitor to the pin and lets it charge to the input voltage. Then it converts: it compares that stored voltage bit by bit. Both steps run on the ADC clock, which the chip makes from its main clock through a prescaler, so the conversion time is a fixed number of ADC clock cycles.',
          ]],
          ['Sample rate is not the same as analogRead() speed', [
            'This calculator gives the hardware limit. A call such as analogRead() adds its own work (selecting the channel, starting, waiting, returning) and your loop adds more. Reading at the full rate usually needs the ADC’s free-running mode, DMA or a FIFO.',
          ]],
          ['How fast do you need?', [
            'To capture a signal, sample at more than twice its highest frequency (the Nyquist rate); five to ten times is more comfortable. A temperature changes over seconds and needs a few readings per second; audio needs tens of thousands.',
          ]],
          ['What about the ESP32?', [
            'Espressif does not publish a fixed conversion time for analogRead() on the ESP32, ESP32-S3 or ESP32-C3, so this calculator does not guess one. Measure it in your sketch: time a few hundred analogRead() calls with micros() and divide.',
          ]],
        ],
        formula: 'rate = fADC / cycles per conversion\nAVR (ATmega328P, ATmega2560):  fADC = fCPU / prescaler, 13 cycles (25 for the first conversion)\nSTM32F4:          Tconv = sampling time + 12 cycles, fADC at most 36 MHz\nRP2040, RP2350:   96 cycles at 48 MHz, at most 500000 samples per second\nnRF52840 SAADC:   one sample = TACQ + tCONV (under 2 µs)',
        source: 'ATmega328P datasheet, ADC “Prescaling and Conversion Timing”; RM0368 11.5 “Channel-wise programmable sampling time” and the STM32F401 datasheet (fADC); RP2040 Datasheet 4.9 ADC; nRF52840 Product Specification, SAADC.',
        example: `<p>Arduino Uno with the Arduino default prescaler of 128: the ADC clock is 16 MHz / 128 = 125 kHz, a conversion takes 13 cycles = <b>104 µs</b>, so the hardware can make about <b>9615 readings per second</b>.</p>\n<p>Prescaler 16 would give a 1 MHz ADC clock and about 76900 readings per second, but the datasheet asks for 50 to 200 kHz for full 10-bit accuracy. A Raspberry Pi Pico converts in 96 cycles of 48 MHz: 2 µs, 500000 readings per second.</p>`,
        faq: [
          ['How fast is analogRead() on an Arduino Uno?', 'A conversion takes 104 µs at the default prescaler of 128 (13 ADC clocks at 125 kHz), so the hardware makes at most about 9600 readings per second. With the overhead of analogRead() itself, a little over 100 µs per call is typical, so roughly 9000 readings per second in a tight loop.'],
          ['Can I make the Arduino ADC faster?', 'Yes, with a smaller prescaler (the ADPS bits in the ADCSRA register). Prescaler 64 gives a 250 kHz ADC clock and about 19200 readings per second; smaller prescalers are faster still. Above 200 kHz the datasheet no longer promises full 10-bit accuracy, so the last bits get noisier.'],
          ['Why is there no number for the ESP32?', 'Espressif does not publish a fixed conversion time for analogRead() on the ESP32 family, and the time depends on the core version and settings. Rather than guess, measure it: call analogRead() a few hundred times, time the loop with micros() and divide.'],
          ['What sample rate do I need?', 'More than twice the highest frequency in the signal (the Nyquist rate), and preferably five to ten times. Slow things such as temperature or a potentiometer need only a few readings per second; audio needs tens of thousands.'],
          ['Why are my ADC readings wrong or noisy at high speed?', 'At high sample rates the internal capacitor has less time to charge. If the source has a high resistance, for example a divider made of 100 kΩ resistors, it cannot charge fully and readings come out low or noisy. Use a lower source resistance (the ATmega328P datasheet is written for about 10 kΩ or less), a longer sample time where the chip has one (STM32, nRF52), or a small capacitor on the pin for slow signals.'],
        ],
      },
      it: {
        title: 'Calcolo frequenza di campionamento ADC (tempo di conversione) | BoardPilot',
        description: 'Quante letture ADC al secondo può fare la tua scheda? Tempo di conversione e frequenza di campionamento massima per Arduino (ATmega), STM32, Raspberry Pi Pico (RP2040, RP2350) e nRF52 da clock dell’ADC e tempo di campionamento, dai datasheet.',
        h1: 'Calcolo della frequenza di campionamento ADC',
        card: 'Tempo di conversione e numero massimo di letture al secondo, da clock dell’ADC e tempo di campionamento.',
        lead: 'Ogni lettura ADC richiede un numero fisso di cicli del clock dell’ADC. Scegli la tua scheda e l’impostazione dell’ADC per vedere quanto dura una conversione e quante letture al secondo può fare l’hardware.',
        explain: [
          ['Perché una conversione ADC richiede tempo', [
            'Prima l’ADC campiona: collega al pin un piccolo condensatore interno e lo lascia caricare alla tensione di ingresso. Poi converte: confronta quella tensione memorizzata un bit alla volta. Entrambe le fasi usano il clock dell’ADC, che il chip ricava dal clock principale con un prescaler, quindi il tempo di conversione è un numero fisso di cicli di clock dell’ADC.',
          ]],
          ['La frequenza di campionamento non è la velocità di analogRead()', [
            'Questo calcolatore dà il limite dell’hardware. Una chiamata come analogRead() aggiunge il suo lavoro (scegliere il canale, avviare, aspettare, restituire) e il tuo loop ne aggiunge altro. Leggere alla velocità piena di solito richiede la modalità continua dell’ADC, il DMA o una FIFO.',
          ]],
          ['Quanto veloce ti serve?', [
            'Per catturare un segnale, campiona a più del doppio della sua frequenza più alta (la frequenza di Nyquist); da cinque a dieci volte è più comodo. Una temperatura cambia in secondi e bastano poche letture al secondo; l’audio ne richiede decine di migliaia.',
          ]],
          ['E l’ESP32?', [
            'Espressif non pubblica un tempo di conversione fisso per analogRead() su ESP32, ESP32-S3 o ESP32-C3, quindi questo calcolatore non ne inventa uno. Misuralo nel tuo sketch: cronometra qualche centinaio di chiamate a analogRead() con micros() e dividi.',
          ]],
        ],
        formula: 'frequenza = fADC / cicli per conversione\nAVR (ATmega328P, ATmega2560):  fADC = fCPU / prescaler, 13 cicli (25 per la prima conversione)\nSTM32F4:          Tconv = tempo di campionamento + 12 cicli, fADC al massimo 36 MHz\nRP2040, RP2350:   96 cicli a 48 MHz, al massimo 500000 campioni al secondo\nnRF52840 SAADC:   un campione = TACQ + tCONV (meno di 2 µs)',
        source: 'Datasheet ATmega328P, ADC “Prescaling and Conversion Timing”; RM0368 11.5 “Channel-wise programmable sampling time” e datasheet STM32F401 (fADC); RP2040 Datasheet 4.9 ADC; nRF52840 Product Specification, SAADC.',
        example: `<p>Arduino Uno con il prescaler predefinito di Arduino, 128: il clock dell’ADC è 16 MHz / 128 = 125 kHz, una conversione dura 13 cicli = <b>104 µs</b>, quindi l’hardware può fare circa <b>9615 letture al secondo</b>.</p>\n<p>Con prescaler 16 il clock dell’ADC sarebbe 1 MHz, circa 76900 letture al secondo, ma il datasheet chiede da 50 a 200 kHz per la piena precisione a 10 bit. Un Raspberry Pi Pico converte in 96 cicli a 48 MHz: 2 µs, 500000 letture al secondo.</p>`,
        faq: [
          ['Quanto è veloce analogRead() su un Arduino Uno?', 'Una conversione dura 104 µs con il prescaler predefinito di 128 (13 cicli di clock dell’ADC a 125 kHz), quindi l’hardware fa al massimo circa 9600 letture al secondo. Con il lavoro in più di analogRead() stessa, di solito una chiamata dura poco più di 100 µs, cioè circa 9000 letture al secondo in un loop stretto.'],
          ['Posso rendere più veloce l’ADC di Arduino?', 'Sì, con un prescaler più piccolo (i bit ADPS nel registro ADCSRA). Il prescaler 64 dà un clock dell’ADC di 250 kHz e circa 19200 letture al secondo; prescaler più piccoli sono ancora più veloci. Sopra i 200 kHz il datasheet non garantisce più la piena precisione a 10 bit, quindi gli ultimi bit diventano più rumorosi.'],
          ['Perché non c’è un numero per l’ESP32?', 'Espressif non pubblica un tempo di conversione fisso per analogRead() sulla famiglia ESP32, e il tempo dipende dalla versione del core e dalle impostazioni. Invece di tirare a indovinare, misuralo: chiama analogRead() qualche centinaio di volte, cronometra il loop con micros() e dividi.'],
          ['Che frequenza di campionamento mi serve?', 'Più del doppio della frequenza più alta nel segnale (la frequenza di Nyquist), e meglio da cinque a dieci volte. Cose lente come una temperatura o un potenziometro richiedono solo poche letture al secondo; l’audio decine di migliaia.'],
          ['Perché le letture ADC sono sbagliate o rumorose ad alta velocità?', 'A frequenze di campionamento alte il condensatore interno ha meno tempo per caricarsi. Se la sorgente ha una resistenza alta, per esempio un partitore fatto con resistenze da 100 kΩ, non si carica del tutto e le letture escono basse o rumorose. Usa una resistenza di sorgente più bassa (il datasheet dell’ATmega328P è pensato per circa 10 kΩ o meno), un tempo di campionamento più lungo dove il chip lo permette (STM32, nRF52), oppure un piccolo condensatore sul pin per segnali lenti.'],
        ],
      },
    },
  ];
}

/* ------------------------------------------------------------------ pages */

const HUB = {
  en: {
    title: 'Free embedded electronics calculators | BoardPilot',
    description: 'Free online calculators for embedded electronics: LED resistor, voltage divider, I2C pull-up, UART baud rate error, PWM timer registers and ADC sample rate, for Arduino, ESP32, STM32, Raspberry Pi Pico and nRF52.',
    h1: 'Free embedded electronics calculators',
    lead: 'Small calculators for everyday microcontroller work, each with the formula, its source and a worked example. They run the same tested code as the BoardPilot app, so the numbers match.',
    electronics: 'Parts and wiring',
    clocks: 'Clocks and registers, for your board',
  },
  it: {
    title: 'Calcolatori gratuiti di elettronica embedded | BoardPilot',
    description: 'Calcolatori online gratuiti per l’elettronica embedded: resistenza per LED, partitore di tensione, pull-up I2C, errore del baud rate UART, registri dei timer PWM e frequenza di campionamento ADC, per Arduino, ESP32, STM32, Raspberry Pi Pico e nRF52.',
    h1: 'Calcolatori gratuiti di elettronica embedded',
    lead: 'Piccoli calcolatori per il lavoro di tutti i giorni con i microcontrollori, ognuno con la formula, la sua fonte e un esempio svolto. Usano lo stesso codice testato dell’app BoardPilot, quindi i numeri coincidono.',
    electronics: 'Componenti e collegamenti',
    clocks: 'Clock e registri, per la tua scheda',
  },
};

const CLOCK_TOOLS = new Set(['uart-baud-rate-calculator', 'pwm-timer-calculator', 'adc-sample-rate-calculator']);

/** The fields of each board the clock calculators read (see ToolBoard in tools-client/calc.ts). */
export function toolBoards(boards) {
  return boards
    .filter((b) => b.clocks)
    .map((b) => ({ id: b.id, name: b.name, family: b.family, module: b.module, clocks: b.clocks }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Build every calculator page for one language. `head` and `chromeFor` come from build-site.mjs
 * (the shared <head> and the landing page's header and footer, with the language switch pointing
 * at the given paths). Returns { pages: { 'tools/…/index.html': html }, sitemap: [{ en, it }] }.
 */
export function buildTools({ lang, boards, site, head, chromeFor }) {
  const l = L[lang];
  const pre = lang === 'it' ? '/it' : '';
  const home = lang === 'it' ? '/it/' : '/';
  const list = tools(boards);
  const tb = toolBoards(boards);
  const boardsJson = JSON.stringify(tb).replace(/</g, '\\u003c');
  const pages = {};
  const sitemap = [];
  const addCss = (html) => html.replace('<link rel="stylesheet" href="/style.css" />', '<link rel="stylesheet" href="/style.css" />\n    <link rel="stylesheet" href="/tools.css" />');
  const crumbLd = (items) => ({
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${site}${path}` })),
  });
  const author = { '@type': 'Person', name: 'Mojtaba Amini', url: 'https://github.com/mojeee' };
  const cta = (boardId = 'esp32-devkitc-30') => `<div class="cta-box">
          <h2>${esc(l.ctaTitle)}</h2>
          <p>${esc(l.ctaText)}</p>
          <div class="cta"><a class="btn primary" href="${esc(demoUrl(lang, boardId))}">${esc(l.demo)}</a><a class="btn" href="${home}#download">${esc(l.download)}</a></div>
        </div>`;

  /* hub */
  {
    const h = HUB[lang];
    const url = `${site}${toolsPath(lang)}`;
    const { header, footer } = chromeFor({ en: toolsPath('en'), it: toolsPath('it') });
    const card = (t) => `<a class="tool-card" href="${toolsPath(lang, t.slug)}"><span class="tool-dot" style="background:${t.color}"></span><b>${esc(t[lang].h1)}</b><span class="small">${esc(t[lang].card)}</span><span class="meta">${esc(l.open)} →</span></a>`;
    const group = (title, items) => `<h2>${esc(title)}</h2>\n        <div class="tool-cards">${items.map(card).join('')}</div>`;
    pages[`${lang === 'it' ? 'it/' : ''}tools/index.html`] = addCss(
      head({
        lang,
        title: h.title,
        description: h.description,
        url,
        alt: { en: toolsPath('en'), it: toolsPath('it') },
        ld: {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'CollectionPage',
              '@id': `${url}#page`,
              url,
              name: h.h1,
              description: h.description,
              inLanguage: lang,
              isPartOf: { '@id': `${site}/#website` },
              mainEntity: {
                '@type': 'ItemList',
                itemListElement: list.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t[lang].h1, url: `${site}${toolsPath(lang, t.slug)}` })),
              },
            },
            crumbLd([['BoardPilot', home], [l.crumbs, toolsPath(lang)]]),
          ],
        },
        body: `${header}
    <main class="article tools-page">
      <div class="wrap narrow">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="${home}">BoardPilot</a> / <span>${esc(l.crumbs)}</span></nav>
        <h1>${esc(h.h1)}</h1>
        <p class="lead">${esc(h.lead)}</p>
        ${group(h.electronics, list.filter((t) => !CLOCK_TOOLS.has(t.slug)))}
        ${group(h.clocks, list.filter((t) => CLOCK_TOOLS.has(t.slug)))}
        <p class="fine calc-honest">${esc(l.honest)}</p>
        ${cta()}
      </div>
    </main>
${footer}`,
      }),
    );
    sitemap.push({ en: toolsPath('en'), it: toolsPath('it'), priority: '0.8' });
  }

  /* one page per calculator */
  for (const t of list) {
    const c = t[lang];
    const path = toolsPath(lang, t.slug);
    const url = `${site}${path}`;
    const { header, footer } = chromeFor({ en: toolsPath('en', t.slug), it: toolsPath('it', t.slug) });
    const faqHtml = c.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n        ');
    const explain = c.explain
      .map(([h2, paras]) => `<h2>${esc(h2)}</h2>\n        ${paras.map((p) => `<p>${p}</p>`).join('\n        ')}`)
      .join('\n        ');
    const lessons = t.lessons.map((id) => `<a href="${learnPath(lang, id)}">${esc(LESSONS[id][lang])}</a>`).join('');
    const others = list.filter((o) => o.slug !== t.slug).map((o) => `<a href="${toolsPath(lang, o.slug)}">${esc(o[lang].h1)}</a>`).join('');
    const isClock = CLOCK_TOOLS.has(t.slug);
    pages[`${lang === 'it' ? 'it/' : ''}tools/${t.slug}/index.html`] = addCss(
      head({
        lang,
        title: c.title,
        description: c.description,
        url,
        alt: { en: toolsPath('en', t.slug), it: toolsPath('it', t.slug) },
        ld: {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebApplication',
              '@id': `${url}#app`,
              name: c.h1,
              url,
              description: c.description,
              applicationCategory: 'UtilitiesApplication',
              operatingSystem: 'Any',
              browserRequirements: 'Requires JavaScript',
              inLanguage: lang,
              isAccessibleForFree: true,
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
              author,
              isPartOf: { '@id': `${site}/#website` },
            },
            crumbLd([['BoardPilot', home], [l.crumbs, toolsPath(lang)], [c.h1, path]]),
            { '@type': 'FAQPage', mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: strip(q), acceptedAnswer: { '@type': 'Answer', text: strip(a) } })) },
          ],
        },
        body: `${header}
    <main class="article tools-page">
      <div class="wrap narrow">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="${home}">BoardPilot</a> / <a href="${toolsPath(lang)}">${esc(l.crumbs)}</a> / <span>${esc(c.h1)}</span></nav>
        <h1>${esc(c.h1)}</h1>
        <p class="lead">${esc(c.lead)}</p>
        <div class="calc">
        ${t.form(lang, tb)}
        ${noscript(lang)}
        </div>
        <p class="fine calc-honest">${esc(l.honest)} <span class="free">${esc(l.free)}</span></p>
        ${explain}
        <h2>${esc(l.formula)}</h2>
        <pre class="formula">${esc(c.formula)}</pre>
        <p class="fine">${esc(l.source)}: ${esc(c.source)}</p>
        <h2>${esc(l.example)}</h2>
        ${c.example}
        <h2>${esc(l.faq)}</h2>
        <div class="faq">
        ${faqHtml}
        </div>
        <h2>${esc(l.learn)}</h2>
        <p>${esc(l.learnLead)}</p>
        <p class="link-cloud">${lessons}</p>
        <h2>${esc(l.others)}</h2>
        <p class="link-cloud">${others}</p>
        ${cta(t.board)}
      </div>
    </main>
${footer}
    ${isClock ? `<script type="application/json" id="bp-boards">${boardsJson}</script>\n    ` : ''}<script src="/tools/calc.js" defer></script>`,
      }),
    );
    sitemap.push({ en: toolsPath('en', t.slug), it: toolsPath('it', t.slug), priority: '0.7' });
  }
  return { pages, sitemap: lang === 'en' ? sitemap : [] };
}
