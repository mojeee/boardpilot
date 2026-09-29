// Learn pages: /learn/ (the course hub), /learn/<lesson>/ for every lesson, /learn/glossary/ and
// /learn/interview-questions/, in English and Italian. Lessons come from shared/lessons.ts, the same
// data the app's Learn screen shows (Italian from shared/i18n/it/lessons.ts). These pages are the
// readable version: the interactive widgets, the 3D previews and the hands-on labs live in the app
// (and, for widgets and previews, in the browser demo at /demo/).

import { GLOSSARY } from './glossary.mjs';
import { boardPath } from './boards.mjs';
import { tryLive } from './demo.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));

export const learnPath = (lang, id = '') => `${lang === 'it' ? '/it' : ''}/learn/${id ? `${id}/` : ''}`;

/** Search-friendly titles and descriptions: the question a beginner types, not the app's short title. */
const SEO = {
  'what-is-mcu': {
    en: ['What is a microcontroller? Embedded systems from zero', 'What a microcontroller (MCU) is, how it differs from a microprocessor, where code and variables live, and what happens at power on. A free lesson for beginners.'],
    it: ['Che cos’è un microcontrollore? Sistemi embedded da zero', 'Che cos’è un microcontrollore (MCU), in cosa è diverso da un microprocessore, dove stanno codice e variabili e cosa succede all’accensione. Lezione gratuita per principianti.'],
  },
  'hardware-basics': {
    en: ['Electronics basics for programmers: Ohm’s law, LED resistors, pull-ups', 'Voltage, current and resistance for software developers: Ohm’s law, the LED resistor, pull-ups, voltage dividers, 3.3 V vs 5 V and how to read a datasheet.'],
    it: ['Elettronica di base per programmatori: legge di Ohm, resistenze, pull-up', 'Tensione, corrente e resistenza per chi scrive software: legge di Ohm, resistenza del LED, pull-up, partitori, 3,3 V e 5 V e come leggere un datasheet.'],
  },
  'c-bits': {
    en: ['Embedded C for beginners: bit manipulation, uint8_t and volatile', 'How C talks to hardware: exact-size types like uint8_t and uint32_t, how to set, clear and toggle one bit in a register, and when volatile is required.'],
    it: ['C per embedded da zero: operazioni sui bit, uint8_t e volatile', 'Come il C parla con l’hardware: tipi a dimensione fissa come uint8_t e uint32_t, come accendere, spegnere e invertire un bit in un registro, e quando serve volatile.'],
  },
  gpio: {
    en: ['GPIO explained for beginners: pins in and out', 'What GPIO is, how an output pin lights an LED and an input pin reads a button, why buttons need a pull-up and debouncing, with register code for an STM32.'],
    it: ['GPIO spiegato ai principianti: pin di ingresso e di uscita', 'Che cos’è il GPIO, come un pin di uscita accende un LED e uno di ingresso legge un pulsante, perché servono pull-up e debounce, con il codice dei registri di un STM32.'],
  },
  'timers-interrupts': {
    en: ['Timers and interrupts explained: prescaler, ARR and ISR', 'How a microcontroller timer counts by itself, how to choose the prescaler (PSC) and reload value (ARR), and how interrupts and ISRs work, compared with polling.'],
    it: ['Timer e interrupt spiegati: prescaler, ARR e ISR', 'Come conta da solo il timer di un microcontrollore, come scegliere prescaler (PSC) e valore di reload (ARR) e come funzionano interrupt e ISR, a confronto con il polling.'],
  },
  buses: {
    en: ['UART vs I2C vs SPI explained for beginners', 'How microcontrollers talk to sensors, screens and computers: UART, I2C and SPI compared by wires, devices, speed and typical use, and the three most common I2C problems.'],
    it: ['UART, I2C e SPI spiegati ai principianti: le differenze', 'Come un microcontrollore parla con sensori, display e computer: UART, I2C e SPI a confronto per fili, dispositivi, velocità e usi tipici, più i tre problemi I2C più comuni.'],
  },
  adc: {
    en: ['ADC explained: how a microcontroller reads an analog voltage', 'What an analog-to-digital converter does, what resolution and sample rate mean, and how to turn a raw 12-bit ADC reading into volts.'],
    it: ['ADC spiegato: come un microcontrollore legge una tensione analogica', 'Cosa fa un convertitore analogico-digitale, cosa significano risoluzione e frequenza di campionamento e come trasformare una lettura grezza a 12 bit in volt.'],
  },
  rtos: {
    en: ['What is an RTOS? Tasks, priorities and queues explained', 'Why embedded devices use a real-time operating system: tasks, the scheduler, priorities, queues and mutexes, and priority inversion, with a FreeRTOS example.'],
    it: ['Che cos’è un RTOS? Task, priorità e code spiegati', 'Perché i dispositivi embedded usano un sistema operativo real-time: task, scheduler, priorità, code e mutex, e l’inversione di priorità, con un esempio FreeRTOS.'],
  },
  essentials: {
    en: ['PWM, state machines, DMA and watchdog explained', 'Five ideas every firmware engineer uses: PWM and duty cycle, state machines in C, DMA, the watchdog timer and low-power sleep, explained for beginners.'],
    it: ['PWM, macchine a stati, DMA e watchdog spiegati', 'Cinque idee che ogni sviluppatore firmware usa: PWM e duty cycle, macchine a stati in C, DMA, watchdog e basso consumo, spiegate ai principianti.'],
  },
  'full-picture': {
    en: ['How an embedded system works, from power on to the first reading', 'Follow one thermostat cycle from power on to sleep, see how every embedded idea fits together, and how your code gets from the computer into the chip.'],
    it: ['Come funziona un sistema embedded, dall’accensione alla prima lettura', 'Segui un ciclo di un termostato dall’accensione al riposo, guarda come si incastrano tutte le idee dell’embedded e come il codice passa dal computer al chip.'],
  },
  'road-to-senior': {
    en: ['Embedded software engineer roadmap: from beginner to senior', 'A five-stage embedded roadmap, from registers and peripherals to RTOS, testing, security and Edge AI, plus three portfolio projects that show you are ready.'],
    it: ['Roadmap per sviluppatore software embedded: da principiante a senior', 'Una roadmap embedded in cinque tappe, dai registri e periferiche a RTOS, test, sicurezza ed Edge AI, più tre progetti da portfolio che mostrano che sei pronto.'],
  },
};

/** What each widget shows in the app, for readers of the static page. */
const WIDGET = {
  'mcu-anatomy': {
    en: ['Inside a microcontroller', 'A diagram of one chip holding a whole computer: the CPU core runs your code, flash stores the program, RAM holds the live variables, timers keep precise time, and peripherals (GPIO, ADC, UART, I2C, SPI) connect inputs such as a temperature sensor and a button to outputs such as an LED and a motor.'],
    it: ['Dentro un microcontrollore', 'Uno schema di un solo chip che contiene un computer intero: il core della CPU esegue il tuo codice, la flash conserva il programma, la RAM tiene le variabili, i timer misurano il tempo con precisione e le periferiche (GPIO, ADC, UART, I2C, SPI) collegano ingressi come un sensore di temperatura e un pulsante a uscite come un LED e un motore.'],
  },
  'memory-map': {
    en: ['Memory map of an STM32', 'Flash starts at 0x0800 0000 (the compiled main() lives here), RAM at 0x2000 0000 (variables and the stack) and the peripherals at 0x4000 0000 (GPIO, UART, timers: writing 1 in the right place turns the LED on).'],
    it: ['Mappa di memoria di un STM32', 'La flash parte da 0x0800 0000 (qui c’è il main() compilato), la RAM da 0x2000 0000 (variabili e stack) e le periferiche da 0x4000 0000 (GPIO, UART, timer: scrivere 1 nel punto giusto accende il LED).'],
  },
  register: {
    en: ['Register playground', 'A 16-bit register you can change: pick a bit and set, clear, toggle or read it. Each click shows the C line that does it and confirms that the other bits did not change.'],
    it: ['Laboratorio sui registri', 'Un registro a 16 bit da modificare: scegli un bit e portalo a 1, a 0, invertilo o leggilo. Ogni clic mostra la riga di C che lo fa e conferma che gli altri bit non sono cambiati.'],
  },
  gpio: {
    en: ['An output pin and an input pin', 'PA5 drives an LED through a resistor; PC13 reads a button with a pull-up. Toggle the output bit to light the LED, press the button to see the input bit go from 1 (released) to 0 (pressed), with the register code for each.'],
    it: ['Un pin di uscita e un pin di ingresso', 'PA5 comanda un LED attraverso una resistenza; PC13 legge un pulsante con una pull-up. Inverti il bit di uscita per accendere il LED, premi il pulsante per vedere il bit di ingresso passare da 1 (rilasciato) a 0 (premuto), con il codice dei registri per ciascuno.'],
  },
  timer: {
    en: ['Timer calculator', 'Pick the clock (16 MHz after reset or 84 MHz), type PSC and ARR, and see the tick rate and the update events per second. Slow settings blink an LED at the real rate.'],
    it: ['Calcolatore del timer', 'Scegli il clock (16 MHz dopo il reset o 84 MHz), scrivi PSC e ARR e vedi la frequenza dei tick e gli eventi di aggiornamento al secondo. Con valori lenti un LED lampeggia alla frequenza reale.'],
  },
  interrupt: {
    en: ['An interrupt on a timeline', 'The main loop runs, a timer overflow pauses it, the ISR runs, and the main loop continues exactly where it stopped.'],
    it: ['Un interrupt su una linea del tempo', 'Il ciclo principale gira, l’overflow di un timer lo mette in pausa, viene eseguita la ISR e il ciclo principale riprende esattamente da dove si era fermato.'],
  },
  protocols: {
    en: ['UART, I2C and SPI wiring', 'UART is a private call between two devices (TX to RX). I2C is a group chat where everyone has an address: a temperature sensor at 0x48, a screen at 0x3C and a motion sensor at 0x68 share SDA and SCL. SPI is a boss that taps one worker at a time with a select wire, very fast.'],
    it: ['Collegamenti UART, I2C e SPI', 'La UART è una telefonata privata tra due dispositivi (TX verso RX). L’I2C è una chat di gruppo dove ognuno ha un indirizzo: un sensore di temperatura a 0x48, un display a 0x3C e un sensore di movimento a 0x68 condividono SDA e SCL. L’SPI è un capo che chiama un collaboratore alla volta con un filo di selezione, molto velocemente.'],
  },
  adc: {
    en: ['What the ADC sees', 'A smooth signal and the stepped copy the ADC produces. Change the resolution from 1 to 12 bits and the number of samples, and watch the copy get closer to the real signal; move the sensor voltage to see the number your code receives.'],
    it: ['Cosa vede l’ADC', 'Un segnale continuo e la copia a gradini che produce l’ADC. Cambia la risoluzione da 1 a 12 bit e il numero di campioni e guarda la copia avvicinarsi al segnale reale; muovi la tensione del sensore per vedere il numero che riceve il tuo codice.'],
  },
  rtos: {
    en: ['Simple loop vs RTOS', 'In a simple loop the sensor job waits behind a slow screen update and runs late. With an RTOS the scheduler switches by priority: the sensor task runs on time, and the display task is paused and resumed.'],
    it: ['Ciclo semplice e RTOS', 'In un ciclo semplice la lettura del sensore aspetta dietro un lento aggiornamento del display e arriva in ritardo. Con un RTOS lo scheduler sceglie per priorità: il task del sensore gira in orario e quello del display viene messo in pausa e ripreso.'],
  },
  pwm: {
    en: ['PWM and its average', 'Move the duty cycle from 0 to 100% and watch the square wave, its average voltage, the LED brightness and the motor speed follow.'],
    it: ['Il PWM e la sua media', 'Sposta il duty cycle da 0 a 100% e guarda seguire l’onda quadra, la tensione media, la luminosità del LED e la velocità del motore.'],
  },
  'state-machine': {
    en: ['A thermostat state machine', 'Idle (heater off) moves to Heating when it is too cold and back to Idle when the target is reached. From either state a sensor failure leads to Error (heater off, LED blinks), and a reset returns to Idle.'],
    it: ['La macchina a stati di un termostato', 'Da Inattivo (riscaldamento spento) si passa a Riscaldamento quando fa troppo freddo e si torna a Inattivo quando si raggiunge la temperatura. Da entrambi gli stati un guasto del sensore porta a Errore (riscaldamento spento, LED lampeggiante) e un reset riporta a Inattivo.'],
  },
  roadmap: {
    en: ['Five stages from beginner to senior', 'Months 1 to 3: hands-on core. Months 3 to 6: firmware architecture. Months 6 to 9: professional practice. Months 9 to 15: senior system skills. From month 9: Edge AI.'],
    it: ['Cinque tappe da principiante a senior', 'Mesi 1–3: basi pratiche. Mesi 3–6: architettura del firmware. Mesi 6–9: pratica professionale. Mesi 9–15: competenze di sistema da senior. Dal mese 9: Edge AI.'],
  },
  'led-resistor': {
    en: ['LED resistor calculator', 'Choose the LED colour, a 3.3 V or 5 V supply and the current, and get the resistor from Ohm’s law, the standard value to buy, the real current and the heat in the resistor.'],
    it: ['Calcolatore della resistenza per LED', 'Scegli il colore del LED, l’alimentazione a 3,3 V o 5 V e la corrente, e ottieni la resistenza dalla legge di Ohm, il valore standard da comprare, la corrente reale e il calore nella resistenza.'],
  },
  divider: {
    en: ['Voltage divider calculator', 'Set the input voltage, R1 and R2, and see the output voltage, the current through the divider, whether the output is safe for a 3.3 V pin, and the R2 that gives 3.3 V.'],
    it: ['Calcolatore del partitore', 'Imposta la tensione di ingresso, R1 e R2 e vedi la tensione di uscita, la corrente nel partitore, se l’uscita è sicura per un pin a 3,3 V e quale R2 dà 3,3 V.'],
  },
  pullup: {
    en: ['I2C pull-up calculator', 'Set the bus voltage, the bus capacitance, the I2C speed and the pull-up value, and see how fast the line rises, the allowed resistor range and whether it fits the I2C limit.'],
    it: ['Calcolatore delle pull-up I2C', 'Imposta la tensione del bus, la capacità del bus, la velocità I2C e il valore della pull-up, e vedi quanto velocemente sale la linea, l’intervallo di resistenze ammesso e se rientra nel limite dell’I2C.'],
  },
};

const T = {
  en: {
    learn: 'Learn',
    hubTitle: 'Learn embedded systems from zero: free lessons',
    hubDesc: 'Free beginner lessons on embedded systems and microcontrollers: GPIO, timers, interrupts, UART, I2C, SPI, ADC, RTOS and a roadmap to senior. In English and Italian.',
    hubH1: 'Learn embedded systems from zero',
    hubLead: 'Short lessons in plain words for people who have never touched a microcontroller, and for software developers moving into embedded. They are the same lessons as in the BoardPilot app.',
    whoH: 'Who it is for',
    who: [
      ['Complete beginners', 'You have never wired a sensor. Each lesson starts from what you already know and explains every new word.'],
      ['Software developers', 'You can code but hardware feels like magic. You get registers, interrupts and buses explained as events, callbacks and memory.'],
      ['Students and job seekers', 'Every lesson ends with the questions real embedded interviews ask, and the last lesson is a roadmap to senior.'],
    ],
    pathH: 'The path',
    lessonN: 'Lesson {n}',
    min: '{m} min',
    lessonOf: 'Lesson {n} of {total}',
    aboutMin: 'about {m} min',
    moreH: 'Keep going',
    glossaryCard: ['Glossary', '{n} embedded and electronics terms, each in two or three plain sentences.'],
    interviewCard: ['Interview questions', '{n} questions real embedded interviews ask, grouped by topic.'],
    appH: 'In the app, the lessons come alive',
    appP: 'The lessons have interactive demos and hands-on labs checked on your board in the app. These pages are the readable version: the demos are described in words, and the labs need the app.',
    download: 'Download BoardPilot',
    tryBrowser: 'Try the lessons in your browser',
    crumbsHome: 'BoardPilot',
    tocH: 'In this lesson',
    widgetH: 'Interactive demo',
    widgetTry: 'Try it in the browser demo',
    widgetApp: 'Try it in the BoardPilot app',
    boardH: 'On the 3D board',
    boardPins: 'Pins',
    boardNote: 'In the app this opens a 3D preview of the {board} with these pins highlighted. Your own project is never touched.',
    previewAlt: 'The BoardPilot Learn screen: a lesson with its 3D board preview',
    previewNote: 'The real app, running in your browser: this lesson with its 3D preview on a simulated {board}. No install, nothing to plug in.',
    tip: 'In real products',
    labH: 'Hands-on lab (in the app)',
    labNote: 'Labs run in the BoardPilot app on your own board, or on the simulated one: the app checks each step with live readings. They cannot run on this page.',
    interviewH: 'Interview questions',
    interviewNote: 'No answers here on purpose: try answering out loud first. In the BoardPilot app, the interview coach reads your own answer and tells you what was right, what is missing and what a senior interviewer would ask next (it uses the AI provider you choose in the app).',
    termsH: 'Key terms',
    prev: 'Previous',
    next: 'Next',
    allLessons: 'All lessons',
    glossTitle: 'Embedded systems glossary: {n} terms explained simply',
    glossDesc: 'Plain-language definitions of embedded and electronics terms: microcontroller, GPIO, pull-up, I2C, SPI, UART, ADC, PWM, interrupt, RTOS, watchdog, bootloader and more.',
    glossH1: 'Embedded systems glossary',
    glossLead: '{n} words you meet when you start with microcontrollers, each explained in two or three plain sentences, with the lesson that covers it.',
    glossName: 'BoardPilot embedded systems glossary',
    lessonLink: 'Lesson: {title}',
    ivTitle: 'Embedded systems interview questions, by topic',
    ivDesc: '{n} questions that embedded software interviews ask, grouped by topic: microcontrollers, electronics, C, GPIO, interrupts, UART, I2C, SPI, ADC, RTOS and senior design.',
    ivH1: 'Embedded systems interview questions',
    ivLead: '{n} questions that real embedded software interviews ask, grouped by the lesson that teaches the topic. Read the lesson, then answer out loud.',
    ivNote: 'This page lists the questions only, without model answers. In the BoardPilot app, the interview coach gives feedback on your own answers: what was right, what is missing and what a senior interviewer would ask next.',
    ivReadLesson: 'Read the lesson',
    basicsH: 'Learn the basics',
    courseName: 'Embedded systems from zero',
  },
  it: {
    learn: 'Impara',
    hubTitle: 'Impara i sistemi embedded da zero: lezioni gratuite',
    hubDesc: 'Lezioni gratuite per principianti su sistemi embedded e microcontrollori: GPIO, timer, interrupt, UART, I2C, SPI, ADC, RTOS e una roadmap verso senior. In italiano e in inglese.',
    hubH1: 'Impara i sistemi embedded da zero',
    hubLead: 'Lezioni brevi e con parole semplici per chi non ha mai toccato un microcontrollore e per chi scrive software e vuole passare all’embedded. Sono le stesse lezioni dell’app BoardPilot.',
    whoH: 'Per chi è',
    who: [
      ['Chi parte da zero', 'Non hai mai collegato un sensore. Ogni lezione parte da quello che sai già e spiega ogni parola nuova.'],
      ['Chi scrive software', 'Sai programmare ma l’hardware ti sembra magia. Registri, interrupt e bus ti vengono spiegati come eventi, callback e memoria.'],
      ['Studenti e chi cerca lavoro', 'Ogni lezione finisce con le domande che fanno davvero ai colloqui embedded, e l’ultima lezione è una roadmap verso senior.'],
    ],
    pathH: 'Il percorso',
    lessonN: 'Lezione {n}',
    min: '{m} min',
    lessonOf: 'Lezione {n} di {total}',
    aboutMin: 'circa {m} min',
    moreH: 'Per continuare',
    glossaryCard: ['Glossario', '{n} termini di embedded ed elettronica, ognuno in due o tre frasi semplici.'],
    interviewCard: ['Domande da colloquio', '{n} domande che fanno davvero ai colloqui embedded, divise per argomento.'],
    appH: 'Nell’app le lezioni prendono vita',
    appP: 'Nell’app le lezioni hanno demo interattive ed esercitazioni pratiche verificate sulla tua scheda. Queste pagine sono la versione da leggere: le demo sono descritte a parole e le esercitazioni richiedono l’app.',
    download: 'Scarica BoardPilot',
    tryBrowser: 'Prova le lezioni nel browser',
    crumbsHome: 'BoardPilot',
    tocH: 'In questa lezione',
    widgetH: 'Demo interattiva',
    widgetTry: 'Provala nella demo nel browser',
    widgetApp: 'Provala nell’app BoardPilot',
    boardH: 'Sulla scheda 3D',
    boardPins: 'Pin',
    boardNote: 'Nell’app questo apre un’anteprima 3D della scheda {board} con questi pin evidenziati. Il tuo progetto non viene mai toccato.',
    previewAlt: 'La schermata Impara di BoardPilot: una lezione con l’anteprima della scheda in 3D',
    previewNote: 'La vera app, nel tuo browser: questa lezione con la sua anteprima 3D su una scheda {board} simulata. Niente da installare, niente da collegare.',
    tip: 'Nei prodotti reali',
    labH: 'Esercitazione pratica (nell’app)',
    labNote: 'Le esercitazioni girano nell’app BoardPilot sulla tua scheda, o su quella simulata: l’app verifica ogni passo con letture dal vivo. Non possono girare in questa pagina.',
    interviewH: 'Domande da colloquio',
    interviewNote: 'Qui non ci sono le risposte, apposta: prova prima a rispondere ad alta voce. Nell’app BoardPilot l’allenatore per i colloqui legge la tua risposta e ti dice cosa era giusto, cosa manca e cosa chiederebbe dopo un intervistatore senior (usa il fornitore di IA che scegli nell’app).',
    termsH: 'Parole chiave',
    prev: 'Precedente',
    next: 'Successiva',
    allLessons: 'Tutte le lezioni',
    glossTitle: 'Glossario dei sistemi embedded: {n} termini spiegati semplici',
    glossDesc: 'Definizioni semplici dei termini di embedded ed elettronica: microcontrollore, GPIO, pull-up, I2C, SPI, UART, ADC, PWM, interrupt, RTOS, watchdog, bootloader e altri.',
    glossH1: 'Glossario dei sistemi embedded',
    glossLead: '{n} parole che incontri quando inizi con i microcontrollori, ognuna spiegata in due o tre frasi semplici, con la lezione che ne parla.',
    glossName: 'Glossario dei sistemi embedded di BoardPilot',
    lessonLink: 'Lezione: {title}',
    ivTitle: 'Domande da colloquio sui sistemi embedded, per argomento',
    ivDesc: '{n} domande dei colloqui per sviluppatori software embedded, divise per argomento: microcontrollori, elettronica, C, GPIO, interrupt, UART, I2C, SPI, ADC, RTOS e progettazione senior.',
    ivH1: 'Domande da colloquio sui sistemi embedded',
    ivLead: '{n} domande che fanno davvero ai colloqui per sviluppatori software embedded, divise per la lezione che spiega l’argomento. Leggi la lezione, poi rispondi ad alta voce.',
    ivNote: 'Questa pagina elenca solo le domande, senza risposte modello. Nell’app BoardPilot l’allenatore per i colloqui commenta le tue risposte: cosa era giusto, cosa manca e cosa chiederebbe dopo un intervistatore senior.',
    ivReadLesson: 'Leggi la lezione',
    basicsH: 'Le basi, spiegate',
    courseName: 'Sistemi embedded da zero',
  },
};

const PUBLISHER = (site) => ({ '@type': 'Organization', name: 'BoardPilot', url: `${site}/`, logo: { '@type': 'ImageObject', url: `${site}/icon-512.png` } });
const AUTHOR = { '@type': 'Person', name: 'Mojtaba Amini', url: 'https://github.com/mojeee' };

/** A heading's anchor: plain ASCII, unique on the page. */
function slugger() {
  const used = new Set();
  return (s) => {
    let base = s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'section';
    let id = base;
    for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
    used.add(id);
    return id;
  };
}

/** Translator for lesson texts: every English text is a key in shared/i18n/it/lessons.ts. */
function translator(lang, IT) {
  return (s) => {
    if (lang !== 'it' || !s) return s;
    if (!(s in IT)) throw new Error(`Missing Italian lesson text: ${s}`);
    return IT[s];
  };
}

const demoLesson = (lang, id, preview) =>
  `/demo/#${preview ? `demo=lesson-preview&lesson=${encodeURIComponent(id)}` : `screen=learn&lesson=${encodeURIComponent(id)}`}&lang=${lang === 'it' ? 'it' : 'en'}`;

function termsFor(lessonId) {
  return GLOSSARY.filter((g) => g.lessons.includes(lessonId));
}

function glossaryLink(lang, id) {
  const g = GLOSSARY.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown glossary term: ${id}`);
  return `<a href="${learnPath(lang, 'glossary')}#${g.id}">${esc(g[lang][0])}</a>`;
}

/**
 * Builds all learn pages for one language. `chrome(paths)` returns the shared { header, footer } with
 * the language switch pointing at `paths.en` / `paths.it`. `demo` says whether the browser demo is built.
 */
export function buildLearn({ lang, lessons, tracks, IT = {}, site, head, chrome, boards = [], demo = false }) {
  const t = T[lang];
  const tr = translator(lang, IT);
  const home = lang === 'it' ? '/it/' : '/';
  const pre = lang === 'it' ? 'it/' : '';
  const pages = {};
  const sitemap = [];
  const hubUrl = `${site}${learnPath(lang)}`;
  const courseId = `${site}${learnPath('en')}#course`;
  const totalQ = lessons.reduce((n, l) => n + l.interview.length, 0);
  const boardName = (id) => boards.find((b) => b.id === id)?.name ?? id;
  const page = (rel, paths, opts) => {
    const { header, footer } = chrome(paths);
    pages[`${pre}${rel}`] = head({ lang, css: 'learn.css', image: '/img/learn.jpg', alt: paths, ...opts, body: `${header}\n${opts.body}\n${footer}` });
    if (lang === 'en') sitemap.push({ en: paths.en, it: paths.it, priority: opts.priority ?? '0.7' });
  };
  const crumbs = (items) =>
    `<nav class="crumbs" aria-label="Breadcrumb"><a href="${home}">${esc(t.crumbsHome)}</a> / ${items
      .map(([name, href]) => (href ? `<a href="${href}">${esc(name)}</a>` : `<span>${esc(name)}</span>`))
      .join(' / ')}</nav>`;
  const crumbsLd = (items) => ({
    '@type': 'BreadcrumbList',
    itemListElement: [[t.crumbsHome, `${site}${home}`], ...items].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  });
  const ctaBox = () => `<div class="cta-box">
          <h2>${esc(t.appH)}</h2>
          <p>${esc(t.appP)}</p>
          <p class="learn-cta-btns"><a class="btn primary" href="${home}#download">${esc(t.download)}</a>${demo ? ` <a class="btn" href="${demoLesson(lang, lessons[0].id, false)}" target="_blank" rel="noopener">${esc(t.tryBrowser)}</a>` : ''}</p>
        </div>`;

  /* ---------- hub ---------- */
  {
    const paths = { en: learnPath('en'), it: learnPath('it') };
    const totalMin = lessons.reduce((n, l) => n + l.minutes, 0);
    const trackHtml = tracks
      .map((tk) => {
        const list = lessons.filter((l) => l.track === tk.id);
        return `<h3 id="${tk.id}" class="learn-track">${esc(tr(tk.label))}</h3>
        <p class="learn-track-hint">${esc(tr(tk.hint))}</p>
        <ol class="learn-cards">${list
          .map((l) => {
            const n = lessons.indexOf(l) + 1;
            return `<li><a class="learn-card" href="${learnPath(lang, l.id)}"><span class="learn-num">${n}</span><span class="learn-card-body"><b>${esc(tr(l.title))}</b><span>${esc(tr(l.summary))}</span></span><span class="learn-min">${esc(fill(t.min, { m: l.minutes }))}</span></a></li>`;
          })
          .join('')}</ol>`;
      })
      .join('\n        ');
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Course',
          '@id': courseId,
          name: t.courseName,
          description: t.hubDesc,
          url: hubUrl,
          inLanguage: lang,
          isAccessibleForFree: true,
          educationalLevel: 'Beginner',
          provider: PUBLISHER(site),
          author: AUTHOR,
          image: `${site}/img/learn.jpg`,
          teaches: lessons.map((l) => tr(l.title)),
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', category: 'Free' },
          hasCourseInstance: {
            '@type': 'CourseInstance',
            courseMode: 'Online',
            inLanguage: lang,
            courseWorkload: `PT${totalMin}M`,
          },
          hasPart: lessons.map((l) => ({ '@type': 'LearningResource', name: tr(l.title), url: `${site}${learnPath(lang, l.id)}` })),
        },
        {
          '@type': 'ItemList',
          itemListElement: lessons.map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site}${learnPath(lang, l.id)}`, name: tr(l.title) })),
        },
        crumbsLd([[t.learn, hubUrl]]),
      ],
    };
    page('learn/index.html', paths, {
      title: `${t.hubTitle} | BoardPilot`,
      description: t.hubDesc,
      url: hubUrl,
      ld,
      priority: '0.9',
      body: `    <main class="article learn">
      <div class="wrap narrow">
        ${crumbs([[t.learn]])}
        <h1>${esc(t.hubH1)}</h1>
        <p class="lead">${esc(t.hubLead)}</p>
        <h2>${esc(t.whoH)}</h2>
        <div class="learn-who">${t.who.map(([h, p]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('')}</div>
        <h2>${esc(t.pathH)}</h2>
        ${trackHtml}
        <h2>${esc(t.moreH)}</h2>
        <div class="learn-who two-up">
          <a class="card" href="${learnPath(lang, 'glossary')}"><h3>${esc(t.glossaryCard[0])}</h3><p>${esc(fill(t.glossaryCard[1], { n: GLOSSARY.length }))}</p></a>
          <a class="card" href="${learnPath(lang, 'interview-questions')}"><h3>${esc(t.interviewCard[0])}</h3><p>${esc(fill(t.interviewCard[1], { n: totalQ }))}</p></a>
        </div>
        ${ctaBox()}
      </div>
    </main>`,
    });
  }

  /* ---------- one page per lesson ---------- */
  lessons.forEach((l, idx) => {
    const paths = { en: learnPath('en', l.id), it: learnPath('it', l.id) };
    const url = `${site}${learnPath(lang, l.id)}`;
    const slug = slugger();
    const [seoTitle, seoDesc] = SEO[l.id]?.[lang] ?? [tr(l.title), tr(l.summary)];
    const track = tracks.find((x) => x.id === l.track);
    const toc = [];
    let previewShown = false;
    const blocks = l.blocks
      .map((b) => {
        switch (b.kind) {
          case 'p':
            return `<p>${esc(tr(b.text))}</p>`;
          case 'h': {
            const id = slug(tr(b.text));
            toc.push([id, tr(b.text)]);
            return `<h2 id="${id}">${esc(tr(b.text))}</h2>`;
          }
          case 'list': {
            const tag = b.ordered ? 'ol' : 'ul';
            return `<${tag} class="learn-list">${b.items.map((i) => `<li>${esc(tr(i))}</li>`).join('')}</${tag}>`;
          }
          case 'code':
            return `<pre class="code"><code>${esc(b.code)}</code></pre>`;
          case 'table': {
            const cell = (c, i) => (b.monoCols?.includes(i) ? `<code>${esc(c)}</code>` : esc(tr(c)));
            return `<div class="table-wrap"><table class="pin-table learn-table"><thead><tr>${b.head.map((h) => `<th scope="col">${esc(tr(h))}</th>`).join('')}</tr></thead><tbody>${b.rows
              .map((r) => `<tr>${r.map((c, i) => `<td>${cell(c, i)}</td>`).join('')}</tr>`)
              .join('')}</tbody></table></div>`;
          }
          case 'widget': {
            const w = WIDGET[b.id]?.[lang];
            if (!w) throw new Error(`No static description for widget ${b.id}`);
            const link = demo
              ? `<a href="${demoLesson(lang, l.id, false)}" target="_blank" rel="noopener">${esc(t.widgetTry)} →</a>`
              : `<a href="${home}#download">${esc(t.widgetApp)} →</a>`;
            return `<aside class="learn-box learn-demo"><p class="learn-box-h">${esc(t.widgetH)}</p><p><b>${esc(w[0])}.</b> ${esc(w[1])}</p><p class="learn-box-link">${link}</p></aside>`;
          }
          case 'tip':
            return `<aside class="learn-box learn-tip"><p class="learn-box-h">${esc(t.tip)}</p><p>${esc(tr(b.text))}</p></aside>`;
          case 'lab':
            return `<aside class="learn-box learn-lab"><p class="learn-box-h">${esc(t.labH)}</p><p><b>${esc(tr(b.text))}</b></p><p class="fine">${esc(t.labNote)}</p><p class="learn-box-link"><a href="${home}#download">${esc(t.download)} →</a></p></aside>`;
          case 'board': {
            const bn = boardName(b.board);
            const known = boards.some((x) => x.id === b.board);
            const embed =
              demo && !previewShown
                ? tryLive({
                    lang,
                    boardId: b.board,
                    boardName: bn,
                    image: '/img/learn.jpg',
                    url: demoLesson(lang, l.id, true),
                    alt: t.previewAlt,
                    note: fill(t.previewNote, { board: bn }),
                  })
                : '';
            previewShown = true;
            return `<aside class="learn-box learn-board"><p class="learn-box-h">${esc(t.boardH)}</p><p><b>${esc(tr(b.label))}</b></p><p class="fine">${esc(t.boardPins)}: <span class="mono">${esc(b.pins.join(', '))}</span> · ${
              known ? `<a href="${boardPath(lang, b.board)}">${esc(bn)}</a>` : esc(bn)
            }</p><p class="fine">${esc(fill(t.boardNote, { board: bn }))}</p></aside>${
              // the demo needs the full width: step out of the narrow text column and back in
              embed ? `\n      </div>\n      <div class="wrap try-wrap learn-try">${embed}</div>\n      <div class="wrap narrow">` : ''
            }`;
          }
          default:
            throw new Error(`Unknown lesson block ${b.kind} in ${l.id}`);
        }
      })
      .join('\n        ');
    const ivId = 'interview';
    toc.push([ivId, t.interviewH]);
    const terms = termsFor(l.id);
    const prev = lessons[idx - 1];
    const next = lessons[idx + 1];
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': ['Article', 'LearningResource'],
          '@id': `${url}#lesson`,
          headline: tr(l.title),
          name: tr(l.title),
          description: seoDesc,
          url,
          inLanguage: lang,
          image: `${site}/img/learn.jpg`,
          author: AUTHOR,
          publisher: PUBLISHER(site),
          isAccessibleForFree: true,
          educationalLevel: l.track === 'senior' ? 'Intermediate' : 'Beginner',
          learningResourceType: 'Lesson',
          timeRequired: `PT${l.minutes}M`,
          position: idx + 1,
          isPartOf: { '@type': 'Course', '@id': courseId, name: T[lang].courseName, url: hubUrl },
          ...(terms.length ? { teaches: terms.map((g) => g[lang][0]) } : {}),
        },
        crumbsLd([
          [t.learn, hubUrl],
          [tr(l.title), url],
        ]),
      ],
    };
    const tocHtml =
      toc.length > 2
        ? `<nav class="learn-toc" aria-label="${esc(t.tocH)}"><p class="learn-box-h">${esc(t.tocH)}</p><ol>${toc.map(([id, text]) => `<li><a href="#${id}">${esc(text)}</a></li>`).join('')}</ol></nav>`
        : '';
    page(`learn/${l.id}/index.html`, paths, {
      title: `${seoTitle} | BoardPilot`,
      description: seoDesc,
      url,
      ld,
      body: `    <main class="article learn">
      <div class="wrap narrow">
        ${crumbs([[t.learn, learnPath(lang)], [tr(l.title)]])}
        <p class="learn-kicker">${esc(tr(track?.label ?? ''))} · ${esc(fill(t.lessonOf, { n: idx + 1, total: lessons.length }))} · ${esc(fill(t.aboutMin, { m: l.minutes }))}</p>
        <h1>${esc(tr(l.title))}</h1>
        <p class="lead">${esc(tr(l.summary))}</p>
        ${tocHtml}
        ${blocks}
        <h2 id="${ivId}">${esc(t.interviewH)}</h2>
        <ol class="learn-list learn-questions">${l.interview.map((q) => `<li>${esc(tr(q))}</li>`).join('')}</ol>
        <p class="fine">${esc(t.interviewNote)} <a href="${learnPath(lang, 'interview-questions')}">${esc(t.ivH1)} →</a></p>
        ${terms.length ? `<h2>${esc(t.termsH)}</h2>\n        <p class="link-cloud">${terms.map((g) => glossaryLink(lang, g.id)).join(' ')}</p>` : ''}
        ${ctaBox()}
        <nav class="learn-pager" aria-label="${esc(t.allLessons)}">
          ${prev ? `<a class="learn-prev" href="${learnPath(lang, prev.id)}" rel="prev"><span>← ${esc(t.prev)}</span><b>${esc(tr(prev.title))}</b></a>` : '<span></span>'}
          <a class="learn-all" href="${learnPath(lang)}">${esc(t.allLessons)}</a>
          ${next ? `<a class="learn-next" href="${learnPath(lang, next.id)}" rel="next"><span>${esc(t.next)} →</span><b>${esc(tr(next.title))}</b></a>` : '<span></span>'}
        </nav>
      </div>
    </main>`,
    });
  });

  /* ---------- glossary ---------- */
  {
    const paths = { en: learnPath('en', 'glossary'), it: learnPath('it', 'glossary') };
    const url = `${site}${learnPath(lang, 'glossary')}`;
    const initial = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^[^A-Za-z0-9]+/, '').charAt(0).toUpperCase();
    const sorted = [...GLOSSARY].sort((a, b) => a[lang][0].localeCompare(b[lang][0], lang, { sensitivity: 'base' }));
    const groups = new Map();
    for (const g of sorted) {
      const k = initial(g[lang][0]);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(g);
    }
    const lessonTitle = (id) => tr(lessons.find((x) => x.id === id)?.title ?? id);
    const entry = (g) => {
      const [term, def] = g[lang];
      const links = [
        ...g.lessons.filter((id) => lessons.some((x) => x.id === id)).map((id) => `<a href="${learnPath(lang, id)}">${esc(fill(t.lessonLink, { title: lessonTitle(id) }))}</a>`),
        ...(g.see ?? []).map((s) => `<a href="${lang === 'it' ? '/it' : ''}${s.path}">${esc(s[lang])}</a>`),
      ];
      return `<dt id="${g.id}"><a class="learn-anchor" href="#${g.id}">${esc(term)}</a></dt><dd><p>${esc(def)}</p>${links.length ? `<p class="learn-see">${links.join(' · ')}</p>` : ''}</dd>`;
    };
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'DefinedTermSet',
          '@id': `${url}#glossary`,
          name: t.glossName,
          description: t.glossDesc,
          url,
          inLanguage: lang,
          hasDefinedTerm: sorted.map((g) => ({ '@type': 'DefinedTerm', '@id': `${url}#${g.id}`, name: g[lang][0], description: g[lang][1], url: `${url}#${g.id}`, inDefinedTermSet: `${url}#glossary` })),
        },
        crumbsLd([
          [t.learn, hubUrl],
          [t.glossH1, url],
        ]),
      ],
    };
    page('learn/glossary/index.html', paths, {
      title: `${fill(t.glossTitle, { n: GLOSSARY.length })} | BoardPilot`,
      description: t.glossDesc,
      url,
      ld,
      priority: '0.8',
      body: `    <main class="article learn">
      <div class="wrap narrow">
        ${crumbs([[t.learn, learnPath(lang)], [t.glossH1]])}
        <h1>${esc(t.glossH1)}</h1>
        <p class="lead">${esc(fill(t.glossLead, { n: GLOSSARY.length }))}</p>
        <nav class="learn-letters" aria-label="A–Z">${[...groups.keys()].map((k) => `<a href="#letter-${k.toLowerCase()}">${esc(k)}</a>`).join('')}</nav>
        ${[...groups.entries()].map(([k, list]) => `<h2 id="letter-${k.toLowerCase()}" class="learn-letter">${esc(k)}</h2>\n        <dl class="learn-glossary">${list.map(entry).join('')}</dl>`).join('\n        ')}
        ${ctaBox()}
        <p><a href="${learnPath(lang)}">← ${esc(t.allLessons)}</a></p>
      </div>
    </main>`,
    });
  }

  /* ---------- interview questions ---------- */
  {
    const paths = { en: learnPath('en', 'interview-questions'), it: learnPath('it', 'interview-questions') };
    const url = `${site}${learnPath(lang, 'interview-questions')}`;
    const lessonIv = (l) => `${learnPath(lang, l.id)}#interview`;
    const sections = lessons
      .map(
        (l) => `<h2 id="${l.id}"><a href="${learnPath(lang, l.id)}">${esc(tr(l.title))}</a></h2>
        <ol class="learn-list learn-questions">${l.interview.map((q) => `<li>${esc(tr(q))}</li>`).join('')}</ol>
        <p class="fine"><a href="${learnPath(lang, l.id)}">${esc(t.ivReadLesson)}: ${esc(tr(l.title))} →</a></p>`,
      )
      .join('\n        ');
    let pos = 0;
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'ItemList',
          name: t.ivH1,
          description: fill(t.ivDesc, { n: totalQ }),
          url,
          inLanguage: lang,
          numberOfItems: totalQ,
          itemListElement: lessons.flatMap((l) => l.interview.map((q) => ({ '@type': 'ListItem', position: ++pos, name: tr(q), url: `${site}${lessonIv(l)}` }))),
        },
        crumbsLd([
          [t.learn, hubUrl],
          [t.ivH1, url],
        ]),
      ],
    };
    page('learn/interview-questions/index.html', paths, {
      title: `${t.ivTitle} | BoardPilot`,
      description: fill(t.ivDesc, { n: totalQ }),
      url,
      ld,
      body: `    <main class="article learn">
      <div class="wrap narrow">
        ${crumbs([[t.learn, learnPath(lang)], [t.ivH1]])}
        <h1>${esc(t.ivH1)}</h1>
        <p class="lead">${esc(fill(t.ivLead, { n: totalQ }))}</p>
        <aside class="learn-box learn-tip"><p>${esc(t.ivNote)}</p></aside>
        ${sections}
        ${ctaBox()}
        <p><a href="${learnPath(lang)}">← ${esc(t.allLessons)}</a></p>
      </div>
    </main>`,
    });
  }

  return { pages, sitemap };
}

/* ---------- links from part, board and guide pages ---------- */

/** Lessons and glossary terms that explain a part's bus and pins. */
export function partTopics(p) {
  const lessons = new Set();
  const terms = new Set();
  const roles = new Set((p.pins ?? []).map((q) => q.role));
  const words = String(p.id).split('-');
  if (p.bus === 'i2c' || roles.has('i2c_sda')) {
    lessons.add('buses');
    ['i2c', 'i2c-address', 'sda-scl', 'pull-up'].forEach((x) => terms.add(x));
  }
  if (p.bus === 'spi' || roles.has('spi_cs')) {
    lessons.add('buses');
    ['spi', 'chip-select'].forEach((x) => terms.add(x));
  }
  if ((p.pins ?? []).some((q) => /^(TXD?|RXD?)$/i.test(q.name))) {
    lessons.add('buses');
    ['uart', 'baud-rate'].forEach((x) => terms.add(x));
  }
  if (p.bus === 'analog' || roles.has('analog_out')) {
    lessons.add('adc');
    terms.add('adc');
  }
  if (p.bus === 'onewire') {
    lessons.add('gpio');
    ['gpio', 'pull-up'].forEach((x) => terms.add(x));
  }
  if (roles.has('digital_in') || roles.has('digital_out')) {
    lessons.add('gpio');
    terms.add('gpio');
  }
  if (roles.has('int')) {
    lessons.add('timers-interrupts');
    terms.add('interrupt');
  }
  if (words.some((w) => ['servo', 'motor', 'led', 'buzzer', 'fan'].includes(w))) {
    lessons.add('essentials');
    terms.add('pwm');
  }
  if (p.id === 'led-resistor') {
    lessons.add('hardware-basics');
    terms.add('led-resistor');
  }
  if (p.id === 'push-button' || p.id === 'tactile-button-12mm') {
    ['pull-up', 'debounce'].forEach((x) => terms.add(x));
  }
  if (words.includes('level') || /^5$/.test(String(p.voltage ?? ''))) {
    lessons.add('hardware-basics');
    ['level-shifter', 'logic-level'].forEach((x) => terms.add(x));
  }
  return { lessons: [...lessons].slice(0, 3), terms: [...terms].slice(0, 6) };
}

/** Lessons and glossary terms for a board page. */
export function boardTopics(b) {
  const terms = ['pinout', 'gpio', 'logic-level'];
  const fam = b.family ?? '';
  if (fam === 'esp32') terms.push('strapping-pin', 'esptool');
  else if (fam.startsWith('esp32')) terms.push('esptool');
  else if (fam.startsWith('rp2')) terms.push('uf2', 'bootloader');
  else if (fam === 'stm32' || fam === 'nrf52') terms.push('jtag-swd', 'debugger');
  else if (fam === 'avr') terms.push('arduino', 'bootloader');
  else terms.push('bootloader');
  return { lessons: ['what-is-mcu', 'hardware-basics', 'gpio'], terms };
}

/**
 * Returns renderers for the "Learn the basics" link cloud used on part, board and guide pages.
 * `lessons` and `IT` are the same data as buildLearn's.
 */
export function learnLinks({ lessons, IT = {} }) {
  const render = (lang, topics) => {
    const t = T[lang];
    const tr = translator(lang, IT);
    const ls = topics.lessons.map((id) => lessons.find((l) => l.id === id)).filter(Boolean);
    if (!ls.length && !topics.terms.length) return '';
    const links = [
      ...ls.map((l) => `<a href="${learnPath(lang, l.id)}">${esc(fill(t.lessonLink, { title: tr(l.title) }))}</a>`),
      ...topics.terms.map((id) => glossaryLink(lang, id)),
    ];
    return `<h2>${esc(t.basicsH)}</h2><p class="link-cloud">${links.join(' ')}</p>`;
  };
  return {
    part: (lang, p) => render(lang, partTopics(p)),
    board: (lang, b) => render(lang, boardTopics(b)),
  };
}

/** The "Learn" nav link text, for the shared header. */
export const learnNavLabel = (lang) => T[lang === 'it' ? 'it' : 'en'].learn;
