// "How BoardPilot fits with the tools you already use": the comparison table on the landing page.
//
// Rules for this table: every cell about another product comes from that product's own pages
// (vendor site, official docs, official GitHub repository), listed in SOURCES and printed as an
// HTML comment next to the table. A cell we could not confirm there stays empty (null), which the
// legend explains as "not stated on its website", never as "no". No logos. Checked on CHECKED.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const CHECKED = '2026-10-24';

export const TOOLS = [
  { id: 'boardpilot', name: 'BoardPilot' },
  { id: 'arduino', name: 'Arduino IDE 2' },
  { id: 'platformio', name: 'PlatformIO' },
  { id: 'wokwi', name: 'Wokwi' },
  { id: 'fritzing', name: 'Fritzing' },
  { id: 'chatbot', name: { en: 'AI chatbot (ChatGPT)', it: 'Chatbot AI (ChatGPT)' } },
];

/** Official pages each fact comes from (printed in the page as an HTML comment). */
export const SOURCES = {
  arduino: [
    'https://www.arduino.cc/en/software (open source, autocompletion, debugger)',
    'https://github.com/arduino/arduino-ide (upload through arduino-cli, AGPL-3.0)',
    'https://github.com/arduino/arduino-ide/releases (Windows, macOS, Linux builds)',
    'https://raw.githubusercontent.com/arduino/docs-content/main/content/software/ide-v2/tutorials/ide-v2-serial-plotter/ide-v2-serial-plotter.md (Serial Plotter)',
    'https://raw.githubusercontent.com/arduino/docs-content/main/content/software/ide-v2/tutorials/ide-v2-serial-monitor/ide-v2-serial-monitor.md (Serial Monitor)',
    'https://raw.githubusercontent.com/arduino/docs-content/main/content/software/ide-v2/tutorials/ide-v2-debugger/ide-v2-debugger.md (debugger: SAMD boards, usually an external probe)',
    'https://raw.githubusercontent.com/arduino/docs-content/main/content/software/ide-v2/tutorials/ide-v2-installing-a-library/ide-v2-installing-a-library.md (Library Manager)',
    'https://blog.arduino.cc/2025/04/17/code-faster-with-the-new-arduino-ai-assistant/ (AI Assistant in the Cloud Editor)',
    'https://docs.arduino.cc/built-in-examples/ (tutorials)',
  ],
  platformio: [
    'https://docs.platformio.org/en/latest/what-is-platformio.html (no license fees; macOS, Windows, Linux, FreeBSD)',
    'https://docs.platformio.org/en/latest/integration/ide/vscode.html (VS Code, upload, serial port monitor)',
    'https://docs.platformio.org/en/latest/plus/debugging.html (debugging with a probe or on-board debugger)',
    'https://docs.platformio.org/en/latest/librarymanager/index.html (Library Manager)',
    'https://github.com/platformio/platformio-core (Apache 2.0)',
  ],
  wokwi: [
    'https://wokwi.com/ (simulator in the browser; VS Code and JetBrains)',
    'https://wokwi.com/pricing (free Community plan, paid plans)',
    'https://docs.wokwi.com/ (Arduino, ESP32, STM32 and other boards simulated)',
    'https://docs.wokwi.com/diagram-format (2D diagram of parts and wires)',
    'https://docs.wokwi.com/guides/serial-monitor (serial monitor and plotter in the simulation)',
    'https://docs.wokwi.com/gdb-debugging (GDB debugging of the simulated chip)',
    'https://docs.wokwi.com/guides/libraries (Library Manager)',
    'https://docs.wokwi.com/wokwi-ci/mcp-support (experimental MCP server in wokwi-cli)',
    'https://github.com/wokwi/wokwi-cli (lint of diagram.json, MIT)',
  ],
  fritzing: [
    'https://github.com/fritzing/fritzing-app (breadboard view, PCB layouts, GPL v3)',
    'https://github.com/fritzing/fritzing-app/wiki/2.1-Part-file-format (breadboard, schematic and PCB views)',
    'https://github.com/fritzing/fritzing-app/wiki/2.3-Adding-a-platform-to-Code-view (Code view: compile and upload, serial monitor)',
    'https://blog.fritzing.org/2023/06/15/fritzing-1-0-0 (Windows, macOS, Linux; circuit simulator)',
    'https://blog.fritzing.org/2012/10/16/new-design-rules-check-drc (design rules check for the PCB)',
  ],
  chatbot: [
    'https://learn.chatgpt.com/docs/pricing (free and paid plans; web, desktop and mobile apps)',
    'https://developers.openai.com/api/docs/mcp (connects to custom MCP servers as a client)',
  ],
};

// Cell helpers: y = yes, p = partly, n = no; each with a short note in both languages. null = not stated.
const y = (en, it) => ({ v: 'yes', en, it });
const p = (en, it) => ({ v: 'part', en, it });
const n = (en, it) => ({ v: 'no', en, it });
const t = (en, it) => ({ v: 'text', en, it });

/** Rows: [label en, label it, boardpilot, arduino, platformio, wokwi, fritzing, chatbot]. */
export const ROWS = [
  {
    group: { en: 'Getting started', it: 'Per iniziare' },
    rows: [
      [
        'Price',
        'Prezzo',
        t('30-day free trial, then a license', 'Prova gratuita di 30 giorni, poi una licenza'),
        t('Free', 'Gratis'),
        t('Free', 'Gratis'),
        t('Free plan and paid plans', 'Piano gratuito e piani a pagamento'),
        null,
        t('Free plan and paid plans', 'Piano gratuito e piani a pagamento'),
      ],
      [
        'Where it runs',
        'Dove funziona',
        t('Mac and Windows app; demo in the browser', 'App per Mac e Windows; demo nel browser'),
        t('Windows, macOS, Linux', 'Windows, macOS, Linux'),
        t('VS Code on macOS, Windows, Linux, FreeBSD', 'VS Code su macOS, Windows, Linux, FreeBSD'),
        t('Browser, plus VS Code and JetBrains plugins', 'Browser, più plugin per VS Code e JetBrains'),
        t('Windows, macOS, Linux', 'Windows, macOS, Linux'),
        t('Web, desktop and mobile apps', 'Web, app desktop e mobile'),
      ],
      [
        'Lessons for beginners',
        'Lezioni per principianti',
        y('{{LESSONS}} lessons, labs checked on the board', '{{LESSONS}} lezioni, laboratori verificati sulla scheda'),
        p('Tutorials in the documentation', 'Tutorial nella documentazione'),
        null,
        null,
        null,
        null,
      ],
      [
        'Source code',
        'Codice sorgente',
        t('Public, source-available license', 'Pubblico, licenza source-available'),
        t('Open source (AGPL-3.0)', 'Open source (AGPL-3.0)'),
        t('Open source (Apache 2.0)', 'Open source (Apache 2.0)'),
        p('The command-line tool is MIT', 'Lo strumento a riga di comando è MIT'),
        t('Open source (GPL v3)', 'Open source (GPL v3)'),
        null,
      ],
    ],
  },
  {
    group: { en: 'Design and wiring', it: 'Progetto e collegamenti' },
    rows: [
      [
        'Simulate a board and parts without hardware',
        'Simula scheda e componenti senza hardware',
        y('13 boards, with realistic faults', '13 schede, con guasti realistici'),
        null,
        null,
        y('Arduino, ESP32, STM32, Pico and more', 'Arduino, ESP32, STM32, Pico e altre'),
        p('Circuit simulator; microcontrollers not mentioned', 'Simulatore di circuiti; microcontrollori non citati'),
        null,
      ],
      [
        'Wiring view',
        'Vista dei collegamenti',
        y('3D board, 2D pinout, wiring diagram', 'Scheda 3D, piedinatura 2D, schema dei collegamenti'),
        null,
        null,
        y('2D diagram', 'Schema 2D'),
        y('2D breadboard view', 'Vista breadboard 2D'),
        null,
      ],
      [
        'Schematic',
        'Schema elettrico',
        y('Drawn from the project', 'Disegnato dal progetto'),
        null,
        null,
        null,
        y('Schematic view', 'Vista schema elettrico'),
        null,
      ],
      ['PCB design', 'Progettazione PCB', n('Not a PCB tool', 'Non è uno strumento per PCB'), null, null, null, y('PCB layouts for production', 'Layout PCB per la produzione'), null],
      [
        'Checks your wiring for mistakes',
        'Controlla gli errori di collegamento',
        y('Pin rules, voltage, crossed buses, missing ground', 'Regole dei pin, tensione, bus invertiti, massa mancante'),
        null,
        null,
        p('A command-line lint of the diagram file', 'Un controllo a riga di comando del file dello schema'),
        p('Design rules check for the PCB', 'Controllo delle regole di progetto per il PCB'),
        null,
      ],
      [
        'Proposes parts and wiring checked against the board’s pin rules',
        'Propone componenti e collegamenti verificati con le regole dei pin della scheda',
        y('Checked by the wiring rules before you Apply', 'Verificati dalle regole di cablaggio prima di Applica'),
        null,
        null,
        null,
        null,
        null,
      ],
    ],
  },
  {
    group: { en: 'Code and flashing', it: 'Codice e programmazione' },
    rows: [
      [
        'Code editor with autocompletion and library manager',
        'Editor di codice con completamento e gestore librerie',
        p('Code panel checked against the wiring; no library manager', 'Pannello del codice verificato con i collegamenti; nessun gestore librerie'),
        y('Autocompletion, Library Manager', 'Completamento, Library Manager'),
        y('Library Manager, code index', 'Library Manager, indice del codice'),
        p('Library Manager; completion for #include', 'Library Manager; completamento per #include'),
        p('Code view with syntax colouring', 'Vista codice con colori della sintassi'),
        null,
      ],
      [
        'Uploads firmware to a real board',
        'Carica il firmware su una scheda vera',
        y('After a full flash backup and your OK', 'Dopo un backup completo della flash e il tuo OK'),
        y('Through arduino-cli', 'Tramite arduino-cli'),
        y('Upload from VS Code', 'Caricamento da VS Code'),
        null,
        y('From Code view', 'Dalla vista codice'),
        null,
      ],
      [
        'Backs up the board before writing',
        'Salva la scheda prima di scrivere',
        y('Whole flash, restored with one click', 'Tutta la flash, ripristino con un clic'),
        null,
        null,
        null,
        null,
        null,
      ],
      [
        'Step-through debugger on the chip',
        'Debugger passo passo sul chip',
        n('Steps templates in the simulator only', 'Passo passo solo sui modelli nel simulatore'),
        p('SAMD boards, usually with a probe', 'Schede SAMD, di solito con una sonda'),
        y('With a probe or on-board debugger', 'Con una sonda o un debugger sulla scheda'),
        p('GDB on the simulated chip', 'GDB sul chip simulato'),
        null,
        null,
      ],
    ],
  },
  {
    group: { en: 'Debugging the board', it: 'Debug della scheda' },
    rows: [
      [
        'Serial monitor and plots',
        'Monitor seriale e grafici',
        y('Serial console, live plots, memory', 'Console seriale, grafici dal vivo, memoria'),
        y('Serial Monitor and Serial Plotter', 'Serial Monitor e Serial Plotter'),
        p('Monitor; plots through an extension', 'Monitor; grafici con un’estensione'),
        y('In the simulation', 'Nella simulazione'),
        p('Serial monitor in Code view', 'Monitor seriale nella vista codice'),
        null,
      ],
      [
        'Measures the real board (pins, bus scan, swap test)',
        'Misura la scheda vera (pin, scansione del bus, test di scambio)',
        y('Through a small diagnostic agent', 'Tramite un piccolo agente diagnostico'),
        null,
        null,
        null,
        null,
        null,
      ],
      [
        'Decoded I2C transactions',
        'Transazioni I2C decodificate',
        y('Start, address, ACK and data, from the board', 'Start, indirizzo, ACK e dati, dalla scheda'),
        null,
        null,
        null,
        null,
        null,
      ],
    ],
  },
  {
    group: { en: 'AI', it: 'AI' },
    rows: [
      [
        'Built-in AI assistant',
        'Assistente AI integrato',
        y('Optional: Claude, GPT, Gemini or a free demo; says what it measured', 'Facoltativo: Claude, GPT, Gemini o una demo gratuita; dice cosa ha misurato'),
        p('AI Assistant in the Cloud Editor', 'AI Assistant nel Cloud Editor'),
        null,
        null,
        null,
        y('It is the assistant', 'È l’assistente'),
      ],
      [
        'MCP for AI coding agents',
        'MCP per agenti AI',
        y('MCP server for the real board', 'Server MCP per la scheda vera'),
        null,
        null,
        p('Experimental MCP server in wokwi-cli', 'Server MCP sperimentale in wokwi-cli'),
        null,
        p('Connects to MCP servers (as a client)', 'Si collega a server MCP (come client)'),
      ],
    ],
  },
];

const T = {
  en: {
    caption: 'BoardPilot compared with other tools for beginners and small embedded teams',
    feature: 'What you need',
    yes: 'Yes',
    part: 'Partly',
    no: 'No',
    empty: 'Not stated on its website',
    legendYes: 'Yes',
    legendPart: 'Partly, see the note',
    legendNo: 'No',
    legendEmpty: 'Empty: not stated on the product’s own website (not the same as “no”)',
    swipe: 'Swipe sideways to see every tool →',
    better: 'Where the others are the better choice',
    betterItems: [
      ['Writing code', 'The Arduino IDE and PlatformIO are full code editors with autocompletion, library managers and, on supported chips, a step-through debugger. BoardPilot’s code panel checks your sketch against the wiring, but it is not a full IDE: keep your editor and use both.'],
      ['Simulating in the browser', 'Wokwi runs your code on simulated boards right in the browser, with nothing to install, and has plugins for VS Code and JetBrains.'],
      ['Designing a PCB', 'Fritzing goes from a breadboard view to a schematic to a PCB layout for production. BoardPilot does not design PCBs.'],
      ['Any question', 'A general chatbot can talk about almost anything. BoardPilot’s assistant is narrower: it works on your project, with the measurements from your board and the datasheet sections, and says which is which.'],
    ],
    fine: 'Facts about other products come only from their official websites, documentation and GitHub pages, checked on 24 October 2026. Product names are trademarks of their owners. Something wrong or out of date?',
    fix: 'Tell us on GitHub',
  },
  it: {
    caption: 'BoardPilot a confronto con altri strumenti per principianti e piccoli team embedded',
    feature: 'Cosa ti serve',
    yes: 'Sì',
    part: 'In parte',
    no: 'No',
    empty: 'Non indicato sul suo sito',
    legendYes: 'Sì',
    legendPart: 'In parte, vedi la nota',
    legendNo: 'No',
    legendEmpty: 'Vuoto: non indicato sul sito ufficiale del prodotto (non vuol dire “no”)',
    swipe: 'Scorri di lato per vedere tutti gli strumenti →',
    better: 'Dove gli altri sono la scelta migliore',
    betterItems: [
      ['Scrivere codice', 'Arduino IDE e PlatformIO sono editor di codice completi, con completamento automatico, gestore delle librerie e, sui chip supportati, un debugger passo passo. Il pannello del codice di BoardPilot verifica il tuo sketch con i collegamenti, ma non è un IDE completo: tieni il tuo editor e usali insieme.'],
      ['Simulare nel browser', 'Wokwi fa girare il tuo codice su schede simulate direttamente nel browser, senza installare niente, e ha plugin per VS Code e JetBrains.'],
      ['Progettare un PCB', 'Fritzing va dalla vista breadboard allo schema elettrico fino al layout del PCB per la produzione. BoardPilot non progetta PCB.'],
      ['Qualsiasi domanda', 'Un chatbot generico può parlare di quasi tutto. L’assistente di BoardPilot è più mirato: lavora sul tuo progetto, con le misure della tua scheda e le sezioni dei datasheet, e dice quale è quale.'],
    ],
    fine: 'I dati sugli altri prodotti vengono solo dai loro siti ufficiali, dalla documentazione e dalle pagine GitHub, controllati il 24 ottobre 2026. I nomi dei prodotti sono marchi dei rispettivi proprietari. Qualcosa è sbagliato o non aggiornato?',
    fix: 'Diccelo su GitHub',
  },
};

const ICON = {
  yes: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  part: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/></svg>',
  no: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 8h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

/** The comparison section's body: legend, table (with its sources as an HTML comment) and the fair-play notes. */
export function compareTable(lang, { lessons = '{{LESSONS_COUNT}}', issues = 'https://github.com/mojeee/boardpilot/issues/new?title=Comparison%20table' } = {}) {
  const l = lang === 'it' ? 'it' : 'en';
  const tt = T[l];
  const name = (tool) => (typeof tool.name === 'string' ? tool.name : tool.name[l]);
  const cell = (c, i) => {
    const bp = i === 0 ? ' class="bp"' : '';
    if (!c) return `<td${bp}><span class="cmp-empty" title="${esc(tt.empty)}"><span class="sr">${esc(tt.empty)}</span></span></td>`;
    const note = esc(c[l].replace('{{LESSONS}}', lessons));
    if (c.v === 'text') return `<td${bp}><span class="cmp-note">${note}</span></td>`;
    return `<td${bp}><span class="cmp-v v-${c.v}">${ICON[c.v]}${esc(tt[c.v])}</span><span class="cmp-note">${note}</span></td>`;
  };
  const head = `<tr><th scope="col" class="cmp-feat">${esc(tt.feature)}</th>${TOOLS.map((tool, i) => `<th scope="col"${i === 0 ? ' class="bp"' : ''}>${esc(name(tool))}</th>`).join('')}</tr>`;
  const body = ROWS.map(
    (g) =>
      `<tbody><tr class="cmp-group"><th scope="rowgroup" colspan="${TOOLS.length + 1}">${esc(g.group[l])}</th></tr>\n` +
      g.rows
        .map((r) => {
          const [en, it, ...cells] = r;
          return `<tr><th scope="row" class="cmp-feat">${esc(l === 'it' ? it : en)}</th>${cells.map(cell).join('')}</tr>`;
        })
        .join('\n') +
      '</tbody>',
  ).join('\n');
  const sources = Object.entries(SOURCES)
    .map(([id, list]) => `  ${TOOLS.find((x) => x.id === id).id}:\n${list.map((s) => `    ${s}`).join('\n')}`)
    .join('\n');
  const better = tt.betterItems.map(([h, d]) => `<li><b>${esc(h)}</b><span>${esc(d)}</span></li>`).join('\n            ');
  return `<ul class="cmp-legend">
            <li><span class="cmp-v v-yes">${ICON.yes}${esc(tt.legendYes)}</span></li>
            <li><span class="cmp-v v-part">${ICON.part}${esc(tt.legendPart)}</span></li>
            <li><span class="cmp-v v-no">${ICON.no}${esc(tt.legendNo)}</span></li>
            <li><span class="cmp-empty"></span>${esc(tt.legendEmpty)}</li>
          </ul>
          <p class="cmp-swipe">${esc(tt.swipe)}</p>
          <!-- Comparison sources (official pages only, checked ${CHECKED}); an empty cell means the fact was not found there:
${sources.replace(/--/g, '- -')}
          -->
          <div class="cmp-wrap" tabindex="0" role="region" aria-label="${esc(tt.caption)}">
            <table class="cmp">
              <caption class="sr">${esc(tt.caption)}</caption>
              <thead>${head}</thead>
              ${body}
            </table>
          </div>
          <h3 class="cmp-better-h">${esc(tt.better)}</h3>
          <ul class="cmp-better">
            ${better}
          </ul>
          <p class="fine cmp-fine">${esc(tt.fine)} <a href="${esc(issues)}">${esc(tt.fix)}</a>.</p>`;
}
