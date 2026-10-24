// "How BoardPilot works": the technical page for engineers (/how-it-works/, /it/how-it-works/).
// It explains, from the code, how boards and parts are described, how pins are chosen, what the
// wiring checker checks, how the AI builds a project, how measurements, the simulator and Display
// Studio work, and how all of it is tested. Every claim names the source file it comes from; keep
// it in step with the code when those files change.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Source links: [label, repo path]. */
const src = (repo, items) =>
  `<p class="hiw-src">${items.map(([label, path]) => `<a href="${repo}/blob/main/${path}"><code>${esc(label ?? path)}</code></a>`).join(' · ')}</p>`;

const ul = (items) => `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
const ol = (items) => `<ol>${items.map((x) => `<li>${x}</li>`).join('')}</ol>`;
const table = (head, rows) =>
  `<div class="hiw-table"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;

/* ---------------- English ---------------- */

function en(repo) {
  const S = (items) => src(repo, items);
  return {
    title: 'How BoardPilot works: boards, pins, wiring checks, AI and simulation | BoardPilot',
    description:
      'A technical look inside BoardPilot: board and part files with datasheet sources, how safe pins are chosen, every wiring rule, how the AI builds a project that passes the checks, measurements, the simulator and Display Studio.',
    crumbs: 'How it works',
    h1: 'How BoardPilot works',
    lead: 'For engineers who want to know what happens under the hood, and how to check it. Everything below is how the code works today, with a link to the file that does it. The project is source-available on GitHub.',
    toc: 'On this page',
    sections: [
      {
        id: 'architecture',
        h: 'The architecture in one minute',
        body: [
          `<p>BoardPilot is an Electron desktop app written in TypeScript. The <b>main process</b> owns everything that touches the outside world: USB serial ports, the chip tools (esptool, avrdude, picotool, STM32CubeProgrammer, nrfjprog, Teensy Loader), files, API keys and the AI calls. The <b>renderer</b> is the React interface and the three.js 3D view. They talk through a small typed API (the preload bridge); the interface never sees a key, a file path it did not pick, or a serial port.</p>`,
          `<p>Almost everything the app knows is <b>data, not code</b>: 13 board files, 383 part files, wizard flows and project templates. The same pure functions (pin choice, wiring checks, code checks, the shopping list, the display renderer) run in the app, in the tests and in the browser demo.</p>`,
          S([[null, 'CLAUDE.md'], [null, 'shared/api.ts'], [null, 'app/main/ipc.ts']]),
        ],
      },
      {
        id: 'boards',
        h: 'A board is a file, written from its datasheet',
        body: [
          `<p>Each board (<code>boards/&lt;id&gt;.json</code>) lists every header pin: its id and printed label, its GPIO number, its functions (ADC channel, UART, SPI, I2C…), the highest voltage it accepts, and <b>flags</b> that the rules rely on:</p>`,
          ul([
            '<code>flash</code>: wired to the flash memory (ESP32 GPIO 6 to 11), never usable;',
            '<code>input_only</code>: cannot drive an output, often no internal pull-up (ESP32 GPIO 34 to 39);',
            '<code>strapping</code> / <code>strapping_critical</code>: the level at reset changes how the chip boots (ESP32 GPIO 0, 2, 5, 12, 15);',
            '<code>adc1</code> / <code>adc2</code>: ADC channels; on the ESP32, ADC2 stops working while Wi-Fi is on;',
            '<code>uart0</code>, <code>usb</code>, <code>swd</code>, <code>reserved</code>: used by the board itself;',
            '<code>five_volt_tolerant</code>: accepts 5 V inputs although the chip runs at 3.3 V.',
          ]),
          `<p>The board also carries its <b>rules</b>: the default I2C pins (and whether they can be moved), the hardware SPI bus pins, an ordered list of <b>safe pins</b> for general use (output-capable, no side effects at boot, not used by USB or the debugger), the ADC pins in order of preference, and the power pins with the voltage each one supplies. Every fact has a datasheet section in <code>boards/&lt;id&gt;.sources.md</code>, and <code>scripts/check-boards.mjs</code> refuses a board file with a missing pin, a duplicate, or a rule that points at a pin that does not exist.</p>`,
          S([[null, 'boards/esp32-devkitc-30.json'], [null, 'boards/esp32-devkitc-30.sources.md'], [null, 'scripts/check-boards.mjs']]),
        ],
      },
      {
        id: 'parts',
        h: 'A part is a file too',
        body: [
          `<p>Each part (<code>parts/&lt;id&gt;.json</code>) lists its pins in the order printed on the module, and a <b>role</b> for each: <code>power</code>, <code>ground</code>, <code>i2c_sda</code>, <code>i2c_scl</code>, <code>spi_mosi</code>, <code>spi_miso</code>, <code>spi_sck</code>, <code>spi_cs</code>, <code>digital_in</code> (the board drives it), <code>digital_out</code> (the part drives it), <code>analog_out</code>, <code>onewire</code>, <code>int</code> and <code>passive</code> (not for the board: a load, a module's own supply). It also gives the supply voltage range, every I2C address and which pin selects it, whether the module has its own pull-ups, the chip-ID register and the value to expect, known traps (each with its source) and, where a datasheet gives them, the currents. Pin notes carry wiring facts such as “through 10 kΩ to GND” or “add a flyback diode across the coil”.</p>`,
          S([[null, 'parts/bme280-gy.json'], [null, 'shared/partSchema.ts']]),
        ],
      },
      {
        id: 'pins',
        h: 'How the pins are chosen',
        body: [
          `<p>“Assign safe pins”, the templates and the AI proposals all use one function. It walks the parts in order and, for every part pin that has no wire yet, picks a board pin by the pin's role. Pins already wired, by you or by the assistant, are never moved.</p>`,
          table(
            ['Part pin role', 'Board pin picked'],
            [
              ['<code>power</code>', 'A supply pin whose voltage fits the part’s range, the board’s logic voltage first (3V3 for a 3.3–5 V sensor on an ESP32; 5V for a 5 V-only part).'],
              ['<code>ground</code>', 'A GND pin; several parts are spread over the board’s GND pins.'],
              ['<code>i2c_sda</code>, <code>i2c_scl</code>', 'The board’s default I2C pins. All I2C parts share that one bus, and those pins are kept free for it.'],
              ['<code>spi_mosi</code>, <code>spi_miso</code>, <code>spi_sck</code>', 'The board’s hardware SPI pins, shared by every SPI part.'],
              ['<code>spi_cs</code>', 'The bus’s own CS pin for the first SPI part, the next free safe pin for each other one.'],
              ['<code>analog_out</code>', 'The next free ADC pin, in the board’s order of preference (on the ESP32, ADC1 first, because ADC2 stops with Wi-Fi).'],
              ['<code>int</code>', 'An input-only pin first (they are fine for interrupts and otherwise hard to use), then a safe pin.'],
              ['other signals', 'The next free pin from the board’s safe-pin list.'],
              ['<code>passive</code>', 'Not wired to the board: a load or a module supply is wired part to part, or by hand.'],
            ],
          ),
          `<p>The result is deterministic: the same drawing on the same board always gets the same pins. If the board runs out of pins, the pin stays unwired and the app says so.</p>`,
          S([[null, 'shared/assign.ts'], [null, 'shared/board.ts']]),
        ],
      },
      {
        id: 'checks',
        h: 'What the wiring checker checks',
        body: [
          `<p>A pure function runs on <b>every change</b> to the drawing, whether you drew the wire, a template did, or the AI proposed it. Each finding is placed on the pin or wire in 3D, written to the log with its source (the board file or the part file), and shown in the warnings banner with a fix where one exists.</p>`,
          table(
            ['Rule', 'What it catches'],
            [
              ['<code>unknown_pin</code>', 'A wire to a pin the board does not have.'],
              ['<code>flash_pin</code>', 'Anything wired to a flash pin.'],
              ['<code>voltage_mismatch</code>', 'A part supplied above its voltage (5 V into a 3.3 V sensor), below it, or a ground wire on a power pin (a short).'],
              ['<code>wrong_pin_type</code>', 'A part powered from a GPIO, a signal wired to a power or ground pin.'],
              ['<code>missing_power</code>, <code>missing_ground</code>', 'A part with a supply or ground pin that is not connected.'],
              ['<code>output_on_input_only</code>', 'A pin the board must drive (an LED, SDA, a chip select) on an input-only pin.'],
              ['<code>not_adc</code>', 'An analog output wired to a pin with no ADC.'],
              ['<code>adc2_wifi</code>', 'An analog reading on an ESP32 ADC2 pin, which fails while Wi-Fi is on.'],
              ['<code>strapping_pin</code>', 'A part that can pull a strapping pin at reset and stop the board from booting.'],
              ['<code>reserved_pin</code>, <code>uart0_pin</code>', 'Pins used by the board itself: the USB serial link, native USB, the debug port.'],
              ['<code>shared_pin_conflict</code>', 'Two parts driving the same board pin (buses and power excepted).'],
              ['<code>i2c_swapped</code>', 'SDA and SCL crossed against the board’s I2C pins.'],
              ['<code>logic_level</code>', 'A 3.3 V part on a 5 V board, or a 5 V output into a pin that is not 5 V tolerant.'],
              ['<code>i2c_address_conflict</code>', 'Two parts on one bus at the same address: a warning when one can move (it names the address pin), an error when neither can.'],
            ],
          ),
          `<p>The same rules imply a <b>shopping list</b>: two 4.7 kΩ pull-ups when no I2C module has its own, a 1-Wire pull-up when the part’s notes ask for one, a 1 kΩ + 2 kΩ divider for each 5 V output into a 3.3 V pin, a level shifter for lines that go both ways, and, from the parts’ own notes, flyback diodes across coils and divider resistors for bare sensors such as an LDR.</p>`,
          S([[null, 'shared/wiring.ts'], [null, 'shared/bom.ts'], [null, 'tests/wiring.test.ts']]),
        ],
      },
      {
        id: 'ai',
        h: 'How the AI builds a project',
        body: [
          `<p>The assistant does not wire anything itself. It is a language model with a set of <b>tools</b>, and the app does the real work behind each tool:</p>`,
          ol([
            '<b>Context.</b> With every question the model gets the board’s facts and pins (with their flags), your drawing, the library entries of the parts in it, your project code, recent app events and the last log lines.',
            '<b>Choosing parts.</b> <code>search_parts</code> searches the 383-part library and returns, for each match, what tells parts apart: what it measures, bus, supply voltage, how it fits this board’s logic level, pin notes, known traps, current. <code>offer_choices</code> shows you 2 to 4 cards; you pick.',
            '<b>Proposing.</b> <code>propose_project</code> sends a list of library part ids, optionally the wires the model wants and part-to-part links (a pump on a MOSFET module, an RFID reader through a level shifter). The app refuses unknown part ids (and suggests the closest real ones), checks every requested wire against the board and the part, places the links first, then lets the safe-pin rules wire everything else, then runs the wiring checker.',
            '<b>Fixing.</b> The checker’s errors, the pins left unwired and the extras to buy go back to the model, which must fix errors and call again before it answers.',
            '<b>Answering.</b> The final answer is structured: the message, a confidence label (measured, from documentation, suggestion), its sources and the pins or parts to highlight. The code enforces the honesty rules: “measured” is allowed only if a measurement ran this turn or is in the session log; highlights that do not exist in the drawing are dropped.',
            '<b>Applying.</b> Nothing changes until you press Apply. A new project opens in its own tab if the open one has parts; Undo brings the previous drawing back. Writing to the board is never possible from the chat: the model can only ask, and the app shows its confirmation dialog.',
          ]),
          `<p>The model also has tools to run the app’s own actions (back up the board, open the monitor, change a setting), to ask for code in the Code panel, to search your project memory, and to design what a display shows.</p>`,
          S([[null, 'app/main/ai/tools.ts'], [null, 'shared/projectBuilder.ts'], [null, 'app/main/ai/prompt.ts'], [null, 'app/main/ai/assistant.ts']]),
        ],
      },
      {
        id: 'code',
        h: 'Code that matches the drawing',
        body: [
          `<p>Starter code is generated from the drawing: each pin becomes a <code>#define</code> with the board pin it is wired to, buses start on the wired pins, and the Pico SDK, ESP-IDF and STM32 HAL starter projects read each part’s chip ID at start-up when the library has one. The <b>code checker</b> compares any sketch (generated, pasted or written by the AI) with the drawing: <code>Wire.begin()</code> pins that do not match the wiring, <code>pinMode(…, OUTPUT)</code> on an input-only pin, <code>analogRead</code> on a pin with no ADC or on ADC2 while the sketch starts Wi-Fi, an LED wired to one pin while the code drives another, a serial speed that does not match the monitor. Findings point at the code line and the pin in 3D.</p>`,
          S([[null, 'shared/sketch.ts'], [null, 'shared/codeCheck.ts'], [null, 'shared/starter/index.ts']]),
        ],
      },
      {
        id: 'measure',
        h: 'Measurements, not guesses',
        body: [
          `<p>To see a real board, BoardPilot installs a small <b>diagnostic agent</b> firmware (after a confirmation and a full backup of the flash). The app talks to it over serial with one JSON line per request and reply: read every pin, check for external pull-ups (internal pulls off, then read the level), scan the I2C bus, read registers, read an ADC pin, drive a pin (only after your confirmation). The agent itself refuses flash pins and outputs on input-only pins.</p>`,
          `<p>The classic debugging trick is the <b>swap test</b>: on chips where I2C pins can be moved in software, the bus is scanned once as wired and once with SDA and SCL exchanged. If a device answers only when exchanged, the wires are crossed, and the app says which ones. A chip-ID read then tells a real BME280 (0x60) from a BMP280 sold as one (0x58). The board can measure voltage only on ADC pins; elsewhere the app reports a digital level and never shows a voltage it did not measure.</p>`,
          S([[null, 'firmware/agent'], [null, 'shared/protocol.ts'], [null, 'flows/debug-sensor-not-responding.ts']]),
        ],
      },
      {
        id: 'sim',
        h: 'How the simulator works',
        body: [
          `<p>The simulated board implements the <b>same driver interface</b> as the real one, so every screen, flow and AI tool runs unchanged without hardware. A simulator scenario holds two things: the drawing you see, and the <b>physical truth</b> on the bench, which can differ, for example with SDA and SCL crossed at the sensor, a BMP280 where a BME280 is drawn, a sensor without power, a busy port or a wrong baud rate. The simulated agent answers commands from the physical truth with the same rules as the real firmware, so the debugging flows find the fault the way they would on a real bench.</p>`,
          `<p>Template projects also run as a <b>step-by-step simulation</b> of the program: pins change, values move, displays show text, and each step is linked to the code line. Everything simulated is labelled so, and never mixed with measured data.</p>`,
          S([[null, 'app/main/sim/simDriver.ts'], [null, 'app/main/sim/simWorld.ts'], [null, 'app/main/sim/scenarios/weather-station-swapped.json'], [null, 'shared/templates.ts']]),
        ],
      },
      {
        id: 'display',
        h: 'Display Studio: pixel for pixel',
        body: [
          `<p>A display design is data: screens of text, values, bars, graphs, gauges, icons and test patterns, with timed or conditional changes and simulated values. The app draws it into a framebuffer at the panel’s real resolution and colour depth (RGB565 on colour TFTs, one bit on OLEDs and e-paper), with Adafruit GFX’s own line and circle algorithms, a 5×7 font and integer pattern maths. The generated Arduino sketch carries the same font, icons and maths and draws with Adafruit GFX.</p>`,
          `<p>To prove they match, a test builds the real Adafruit GFX library on the computer with the generated drawing code and compares <b>every pixel</b> of its frames with the app’s, on four panels and two rotations; the live AI evaluation does the same for each design the AI writes. The sketches also compile for ESP32, ESP32-S3, Arduino Uno and Raspberry Pi Pico.</p>`,
          S([[null, 'shared/displayRender.ts'], [null, 'shared/displayCode.ts'], [null, 'tests/display.test.ts']]),
        ],
      },
      {
        id: 'tests',
        h: 'How it is tested',
        body: [
          ul([
            '<b>3,200+ unit tests</b> (Vitest): board and part files, pin choice and wiring rules on every template on every board, the code checker, the flows against the simulator, the agent protocol, the display renderer and code generator.',
            '<b>End-to-end tests</b> (Playwright) drive the built app in simulator mode through every scenario: connect, new project, flash with backup, each debug flow, monitor, test hardware, report, PDF export, an AI action, a recorded conversation.',
            '<b>A live AI evaluation</b> sends 26 requests through the real assistant with a small model playing the user, grades every conversation with the app’s own rules, builds the AI’s display designs natively for the pixel comparison, and has a second model read each conversation for unsafe advice. The latest round passed 26 of 26 on Claude Sonnet 5.5; every round, with what it found and what was fixed, is published.',
          ]),
          `<p><a href="${repo}/blob/main/docs/ai-evals/README.md">Read the AI evaluation reports</a> · <a href="${repo}">Source on GitHub</a></p>`,
        ],
      },
    ],
  };
}

/* ---------------- Italiano ---------------- */

function it(repo) {
  const S = (items) => src(repo, items);
  return {
    title: 'Come funziona BoardPilot: schede, pin, controlli di cablaggio, IA e simulazione | BoardPilot',
    description:
      'Uno sguardo tecnico dentro BoardPilot: file di schede e componenti con le fonti dei datasheet, come si scelgono i pin sicuri, ogni regola di cablaggio, come l’IA costruisce un progetto che supera i controlli, misure, simulatore e Display Studio.',
    crumbs: 'Come funziona',
    h1: 'Come funziona BoardPilot',
    lead: 'Per chi vuole sapere cosa succede dentro, e come verificarlo. Tutto quello che segue è come funziona il codice oggi, con il link al file che lo fa. Il progetto è source-available su GitHub.',
    toc: 'In questa pagina',
    sections: [
      {
        id: 'architecture',
        h: 'L’architettura in un minuto',
        body: [
          `<p>BoardPilot è un’app desktop Electron scritta in TypeScript. Il <b>processo principale</b> gestisce tutto ciò che tocca il mondo esterno: porte seriali USB, gli strumenti dei chip (esptool, avrdude, picotool, STM32CubeProgrammer, nrfjprog, Teensy Loader), i file, le chiavi API e le chiamate all’IA. Il <b>renderer</b> è l’interfaccia React con la vista 3D three.js. Si parlano attraverso una piccola API tipizzata (il bridge di preload); l’interfaccia non vede mai una chiave, un percorso che non hai scelto o una porta seriale.</p>`,
          `<p>Quasi tutto ciò che l’app sa sono <b>dati, non codice</b>: 13 file di schede, 383 file di componenti, i flussi guidati e i modelli di progetto. Le stesse funzioni pure (scelta dei pin, controlli di cablaggio e del codice, lista della spesa, renderer dei display) girano nell’app, nei test e nella demo nel browser.</p>`,
          S([[null, 'CLAUDE.md'], [null, 'shared/api.ts'], [null, 'app/main/ipc.ts']]),
        ],
      },
      {
        id: 'boards',
        h: 'Una scheda è un file, scritto dal suo datasheet',
        body: [
          `<p>Ogni scheda (<code>boards/&lt;id&gt;.json</code>) elenca ogni pin dei connettori: id ed etichetta stampata, numero GPIO, funzioni (canale ADC, UART, SPI, I2C…), la tensione massima che accetta e i <b>flag</b> su cui si basano le regole:</p>`,
          ul([
            '<code>flash</code>: collegato alla memoria flash (ESP32 GPIO da 6 a 11), mai utilizzabile;',
            '<code>input_only</code>: non può pilotare un’uscita, spesso senza pull-up interno (ESP32 GPIO da 34 a 39);',
            '<code>strapping</code> / <code>strapping_critical</code>: il livello al reset cambia l’avvio del chip (ESP32 GPIO 0, 2, 5, 12, 15);',
            '<code>adc1</code> / <code>adc2</code>: canali ADC; sull’ESP32 l’ADC2 smette di funzionare con il Wi-Fi acceso;',
            '<code>uart0</code>, <code>usb</code>, <code>swd</code>, <code>reserved</code>: usati dalla scheda stessa;',
            '<code>five_volt_tolerant</code>: accetta ingressi a 5 V anche se il chip lavora a 3,3 V.',
          ]),
          `<p>La scheda contiene anche le sue <b>regole</b>: i pin I2C predefiniti (e se si possono spostare), i pin del bus SPI hardware, un elenco ordinato di <b>pin sicuri</b> per uso generale (capaci di uscita, senza effetti all’avvio, non usati da USB o dal debugger), i pin ADC in ordine di preferenza e i pin di alimentazione con la tensione che forniscono. Ogni dato ha la sua sezione di datasheet in <code>boards/&lt;id&gt;.sources.md</code>, e <code>scripts/check-boards.mjs</code> rifiuta un file di scheda con un pin mancante, un duplicato o una regola che punta a un pin inesistente.</p>`,
          S([[null, 'boards/esp32-devkitc-30.json'], [null, 'boards/esp32-devkitc-30.sources.md'], [null, 'scripts/check-boards.mjs']]),
        ],
      },
      {
        id: 'parts',
        h: 'Anche un componente è un file',
        body: [
          `<p>Ogni componente (<code>parts/&lt;id&gt;.json</code>) elenca i suoi pin nell’ordine stampato sul modulo, con un <b>ruolo</b> per ciascuno: <code>power</code>, <code>ground</code>, <code>i2c_sda</code>, <code>i2c_scl</code>, <code>spi_mosi</code>, <code>spi_miso</code>, <code>spi_sck</code>, <code>spi_cs</code>, <code>digital_in</code> (lo pilota la scheda), <code>digital_out</code> (lo pilota il componente), <code>analog_out</code>, <code>onewire</code>, <code>int</code> e <code>passive</code> (non va alla scheda: un carico, l’alimentazione propria di un modulo). Indica anche l’intervallo di alimentazione, ogni indirizzo I2C e il pin che lo seleziona, se il modulo ha i suoi pull-up, il registro dell’ID del chip e il valore atteso, le trappole note (ognuna con la sua fonte) e, quando un datasheet le riporta, le correnti. Le note dei pin portano dati di cablaggio come “tramite 10 kΩ verso GND” o “aggiungi un diodo di ricircolo sulla bobina”.</p>`,
          S([[null, 'parts/bme280-gy.json'], [null, 'shared/partSchema.ts']]),
        ],
      },
      {
        id: 'pins',
        h: 'Come si scelgono i pin',
        body: [
          `<p>“Assegna pin sicuri”, i modelli di progetto e le proposte dell’IA usano tutti la stessa funzione. Scorre i componenti in ordine e, per ogni pin di componente ancora senza filo, sceglie un pin della scheda in base al ruolo. I pin già collegati, da te o dall’assistente, non vengono mai spostati.</p>`,
          table(
            ['Ruolo del pin del componente', 'Pin della scheda scelto'],
            [
              ['<code>power</code>', 'Un pin di alimentazione la cui tensione rientra nell’intervallo del componente, prima la tensione logica della scheda (3V3 per un sensore 3,3–5 V su un ESP32; 5V per un componente solo a 5 V).'],
              ['<code>ground</code>', 'Un pin GND; più componenti vengono distribuiti sui pin GND della scheda.'],
              ['<code>i2c_sda</code>, <code>i2c_scl</code>', 'I pin I2C predefiniti della scheda. Tutti i componenti I2C condividono quel bus, e quei pin restano liberi per lui.'],
              ['<code>spi_mosi</code>, <code>spi_miso</code>, <code>spi_sck</code>', 'I pin SPI hardware della scheda, condivisi da tutti i componenti SPI.'],
              ['<code>spi_cs</code>', 'Il pin CS del bus per il primo componente SPI, il primo pin sicuro libero per ognuno degli altri.'],
              ['<code>analog_out</code>', 'Il primo pin ADC libero, nell’ordine di preferenza della scheda (sull’ESP32 prima l’ADC1, perché l’ADC2 si ferma con il Wi-Fi).'],
              ['<code>int</code>', 'Prima un pin solo ingresso (vanno bene per gli interrupt e altrimenti sono difficili da usare), poi un pin sicuro.'],
              ['altri segnali', 'Il primo pin libero dell’elenco dei pin sicuri della scheda.'],
              ['<code>passive</code>', 'Non va alla scheda: un carico o l’alimentazione di un modulo si collegano tra componenti, o a mano.'],
            ],
          ),
          `<p>Il risultato è deterministico: lo stesso disegno sulla stessa scheda ottiene sempre gli stessi pin. Se la scheda finisce i pin, il pin resta scollegato e l’app lo dice.</p>`,
          S([[null, 'shared/assign.ts'], [null, 'shared/board.ts']]),
        ],
      },
      {
        id: 'checks',
        h: 'Cosa controlla il verificatore di cablaggio',
        body: [
          `<p>Una funzione pura gira a <b>ogni modifica</b> del disegno, che il filo l’abbia disegnato tu, un modello di progetto o l’IA. Ogni risultato appare sul pin o sul filo in 3D, nel registro con la sua fonte (il file della scheda o del componente) e nel banner degli avvisi, con una correzione quando esiste.</p>`,
          table(
            ['Regola', 'Cosa trova'],
            [
              ['<code>unknown_pin</code>', 'Un filo verso un pin che la scheda non ha.'],
              ['<code>flash_pin</code>', 'Qualsiasi cosa collegata a un pin della flash.'],
              ['<code>voltage_mismatch</code>', 'Un componente alimentato sopra la sua tensione (5 V su un sensore a 3,3 V), sotto, o un filo di massa su un pin di alimentazione (un cortocircuito).'],
              ['<code>wrong_pin_type</code>', 'Un componente alimentato da un GPIO, un segnale su un pin di alimentazione o di massa.'],
              ['<code>missing_power</code>, <code>missing_ground</code>', 'Un componente con il pin di alimentazione o di massa scollegato.'],
              ['<code>output_on_input_only</code>', 'Un pin che la scheda deve pilotare (un LED, SDA, un chip select) su un pin solo ingresso.'],
              ['<code>not_adc</code>', 'Un’uscita analogica collegata a un pin senza ADC.'],
              ['<code>adc2_wifi</code>', 'Una lettura analogica su un pin ADC2 dell’ESP32, che fallisce con il Wi-Fi acceso.'],
              ['<code>strapping_pin</code>', 'Un componente che può tirare un pin di strapping al reset e impedire l’avvio.'],
              ['<code>reserved_pin</code>, <code>uart0_pin</code>', 'Pin usati dalla scheda stessa: il collegamento seriale USB, l’USB nativo, la porta di debug.'],
              ['<code>shared_pin_conflict</code>', 'Due componenti che pilotano lo stesso pin (bus e alimentazione esclusi).'],
              ['<code>i2c_swapped</code>', 'SDA e SCL invertiti rispetto ai pin I2C della scheda.'],
              ['<code>logic_level</code>', 'Un componente a 3,3 V su una scheda a 5 V, o un’uscita a 5 V su un pin che non tollera 5 V.'],
              ['<code>i2c_address_conflict</code>', 'Due componenti sullo stesso bus allo stesso indirizzo: un avviso quando uno si può spostare (indica il pin dell’indirizzo), un errore quando nessuno può.'],
            ],
          ),
          `<p>Le stesse regole producono una <b>lista della spesa</b>: due pull-up da 4,7 kΩ quando nessun modulo I2C ha i suoi, un pull-up 1-Wire quando le note del componente lo chiedono, un partitore da 1 kΩ + 2 kΩ per ogni uscita a 5 V su un pin a 3,3 V, un traslatore di livello per le linee bidirezionali e, dalle note dei componenti, diodi di ricircolo sulle bobine e resistenze di partitore per sensori nudi come un LDR.</p>`,
          S([[null, 'shared/wiring.ts'], [null, 'shared/bom.ts'], [null, 'tests/wiring.test.ts']]),
        ],
      },
      {
        id: 'ai',
        h: 'Come l’IA costruisce un progetto',
        body: [
          `<p>L’assistente non collega niente da solo. È un modello linguistico con un insieme di <b>strumenti</b>, e dietro ogni strumento il lavoro vero lo fa l’app:</p>`,
          ol([
            '<b>Contesto.</b> A ogni domanda il modello riceve i dati e i pin della scheda (con i loro flag), il tuo disegno, le schede della libreria dei componenti presenti, il codice del progetto, gli eventi recenti dell’app e le ultime righe del registro.',
            '<b>Scelta dei componenti.</b> <code>search_parts</code> cerca nella libreria di 383 componenti e restituisce, per ognuno, ciò che li distingue: cosa misura, bus, alimentazione, come si adatta alla logica della scheda, note dei pin, trappole note, corrente. <code>offer_choices</code> ti mostra da 2 a 4 schede; scegli tu.',
            '<b>Proposta.</b> <code>propose_project</code> invia una lista di id della libreria, eventualmente i fili che il modello vuole e i collegamenti tra componenti (una pompa su un modulo MOSFET, un lettore RFID tramite un traslatore di livello). L’app rifiuta gli id sconosciuti (e suggerisce quelli reali più vicini), verifica ogni filo richiesto rispetto alla scheda e al componente, mette prima i collegamenti tra componenti, poi lascia che le regole dei pin sicuri colleghino il resto, infine esegue il verificatore.',
            '<b>Correzione.</b> Gli errori del verificatore, i pin rimasti scollegati e gli extra da comprare tornano al modello, che deve correggere gli errori e richiamare lo strumento prima di rispondere.',
            '<b>Risposta.</b> La risposta finale è strutturata: il messaggio, un’etichetta di affidabilità (misurato, dalla documentazione, suggerimento), le fonti e i pin o componenti da evidenziare. Il codice fa rispettare le regole di onestà: “misurato” è permesso solo se una misura è stata fatta in questo turno o è nel registro; le evidenziazioni che non esistono nel disegno vengono scartate.',
            '<b>Applicazione.</b> Non cambia nulla finché non premi Applica. Un nuovo progetto si apre nella sua scheda se quello aperto ha già componenti; Annulla riporta il disegno di prima. Scrivere sulla scheda dalla chat non è mai possibile: il modello può solo chiedere, e l’app mostra la sua finestra di conferma.',
          ]),
          `<p>Il modello ha anche strumenti per eseguire le azioni dell’app (backup della scheda, aprire il monitor, cambiare un’impostazione), chiedere codice nel pannello Codice, cercare nella memoria dei tuoi progetti e progettare cosa mostra un display.</p>`,
          S([[null, 'app/main/ai/tools.ts'], [null, 'shared/projectBuilder.ts'], [null, 'app/main/ai/prompt.ts'], [null, 'app/main/ai/assistant.ts']]),
        ],
      },
      {
        id: 'code',
        h: 'Codice che corrisponde al disegno',
        body: [
          `<p>Il codice di partenza nasce dal disegno: ogni pin diventa un <code>#define</code> con il pin della scheda a cui è collegato, i bus partono sui pin collegati e i progetti di partenza Pico SDK, ESP-IDF e STM32 HAL leggono all’avvio l’ID del chip di ogni componente che nella libreria ne ha uno. Il <b>verificatore del codice</b> confronta qualsiasi sketch (generato, incollato o scritto dall’IA) con il disegno: pin di <code>Wire.begin()</code> diversi dal cablaggio, <code>pinMode(…, OUTPUT)</code> su un pin solo ingresso, <code>analogRead</code> su un pin senza ADC o sull’ADC2 mentre lo sketch avvia il Wi-Fi, un LED collegato a un pin mentre il codice ne pilota un altro, una velocità seriale diversa da quella del monitor. I risultati indicano la riga di codice e il pin in 3D.</p>`,
          S([[null, 'shared/sketch.ts'], [null, 'shared/codeCheck.ts'], [null, 'shared/starter/index.ts']]),
        ],
      },
      {
        id: 'measure',
        h: 'Misure, non supposizioni',
        body: [
          `<p>Per vedere una scheda reale, BoardPilot installa un piccolo firmware, l’<b>agente diagnostico</b> (dopo una conferma e un backup completo della flash). L’app gli parla in seriale con una riga JSON per richiesta e risposta: leggere tutti i pin, verificare i pull-up esterni (pull interni spenti, poi lettura del livello), scansionare il bus I2C, leggere registri, leggere un pin ADC, pilotare un pin (solo dopo la tua conferma). L’agente stesso rifiuta i pin della flash e le uscite sui pin solo ingresso.</p>`,
          `<p>Il trucco classico è il <b>test di scambio</b>: sui chip in cui i pin I2C si possono spostare via software, il bus viene scansionato una volta come cablato e una volta con SDA e SCL scambiati. Se un dispositivo risponde solo con lo scambio, i fili sono invertiti, e l’app dice quali. Una lettura dell’ID del chip distingue poi un vero BME280 (0x60) da un BMP280 venduto come tale (0x58). La scheda misura la tensione solo sui pin ADC; altrove l’app riporta un livello digitale e non mostra mai una tensione che non ha misurato.</p>`,
          S([[null, 'firmware/agent'], [null, 'shared/protocol.ts'], [null, 'flows/debug-sensor-not-responding.ts']]),
        ],
      },
      {
        id: 'sim',
        h: 'Come funziona il simulatore',
        body: [
          `<p>La scheda simulata implementa la <b>stessa interfaccia</b> di quella reale, quindi ogni schermata, flusso e strumento dell’IA funziona uguale senza hardware. Uno scenario del simulatore contiene due cose: il disegno che vedi e la <b>verità fisica</b> sul banco, che può essere diversa, per esempio con SDA e SCL invertiti sul sensore, un BMP280 dove è disegnato un BME280, un sensore senza alimentazione, una porta occupata o una velocità seriale sbagliata. L’agente simulato risponde ai comandi dalla verità fisica, con le stesse regole del firmware reale, così i flussi di debug trovano il guasto come farebbero su un banco vero.</p>`,
          `<p>I modelli di progetto girano anche come <b>simulazione passo per passo</b> del programma: i pin cambiano, i valori si muovono, i display mostrano testo e ogni passo è collegato alla sua riga di codice. Tutto ciò che è simulato è etichettato come tale e mai mescolato ai dati misurati.</p>`,
          S([[null, 'app/main/sim/simDriver.ts'], [null, 'app/main/sim/simWorld.ts'], [null, 'app/main/sim/scenarios/weather-station-swapped.json'], [null, 'shared/templates.ts']]),
        ],
      },
      {
        id: 'display',
        h: 'Display Studio: pixel per pixel',
        body: [
          `<p>Il progetto di un display è un dato: schermate di testi, valori, barre, grafici, indicatori a lancetta, icone e pattern di prova, con cambi a tempo o a condizione e valori simulati. L’app lo disegna in un framebuffer alla risoluzione e profondità di colore reali del pannello (RGB565 sui TFT a colori, un bit su OLED ed e-paper), con gli algoritmi di linea e cerchio di Adafruit GFX, un font 5×7 e calcoli dei pattern a interi. Lo sketch Arduino generato porta lo stesso font, le stesse icone e gli stessi calcoli e disegna con Adafruit GFX.</p>`,
          `<p>Per dimostrare che coincidono, un test compila sul computer la vera libreria Adafruit GFX con il codice di disegno generato e confronta <b>ogni pixel</b> dei suoi fotogrammi con quelli dell’app, su quattro pannelli e due rotazioni; la valutazione dal vivo dell’IA fa lo stesso per ogni display che l’IA progetta. Gli sketch si compilano anche per ESP32, ESP32-S3, Arduino Uno e Raspberry Pi Pico.</p>`,
          S([[null, 'shared/displayRender.ts'], [null, 'shared/displayCode.ts'], [null, 'tests/display.test.ts']]),
        ],
      },
      {
        id: 'tests',
        h: 'Come viene verificato',
        body: [
          ul([
            '<b>Oltre 3.200 test unitari</b> (Vitest): file di schede e componenti, scelta dei pin e regole di cablaggio su ogni modello di progetto su ogni scheda, il verificatore del codice, i flussi contro il simulatore, il protocollo dell’agente, il renderer e il generatore di codice dei display.',
            '<b>Test end-to-end</b> (Playwright) guidano l’app compilata in modalità simulatore attraverso ogni scenario: collegamento, nuovo progetto, flash con backup, ogni flusso di debug, monitor, test hardware, report, esportazione PDF, un’azione dell’IA, una conversazione registrata.',
            '<b>Una valutazione dal vivo dell’IA</b> invia 26 richieste all’assistente vero con un modello piccolo che fa l’utente, valuta ogni conversazione con le regole dell’app stessa, compila i display progettati dall’IA per il confronto dei pixel e fa rileggere ogni conversazione a un secondo modello per i consigli pericolosi. L’ultimo giro ha superato 26 su 26 con Claude Sonnet 5.5; ogni giro, con cosa ha trovato e cosa è stato corretto, è pubblicato.',
          ]),
          `<p><a href="${repo}/blob/main/docs/ai-evals/README.md">Leggi i report della valutazione dell’IA</a> · <a href="${repo}">Codice su GitHub</a></p>`,
        ],
      },
    ],
  };
}

export const howItWorksPath = (lang) => `${lang === 'it' ? '/it' : ''}/how-it-works/`;

/** The page in one language: { rel, html } plus its sitemap entry (English only, with the alternate). */
export function buildHowItWorks({ lang, site, repo, head, header, footer }) {
  const t = lang === 'it' ? it(repo) : en(repo);
  const paths = { en: howItWorksPath('en'), it: howItWorksPath('it') };
  const home = lang === 'it' ? '/it/' : '/';
  const url = `${site}${paths[lang]}`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: t.h1,
    description: t.description,
    inLanguage: lang,
    url,
    publisher: { '@type': 'Organization', name: 'BoardPilot', url: site },
  };
  const toc = `<nav class="hiw-toc" aria-label="${esc(t.toc)}"><b>${esc(t.toc)}</b>${t.sections.map((s) => `<a href="#${s.id}">${esc(s.h)}</a>`).join('')}</nav>`;
  const body = `    <main class="article hiw">
      <div class="wrap narrow">
        <nav class="crumbs"><a href="${home}">BoardPilot</a> › <span>${esc(t.crumbs)}</span></nav>
        <h1>${esc(t.h1)}</h1>
        <p class="lead">${esc(t.lead)}</p>
        ${toc}
        ${t.sections.map((s) => `<section id="${s.id}">\n          <h2>${esc(s.h)}</h2>\n          ${s.body.join('\n          ')}\n        </section>`).join('\n        ')}
      </div>
    </main>`;
  const rel = `${lang === 'it' ? 'it/' : ''}how-it-works/index.html`;
  return {
    rel,
    html: head({ lang, title: t.title, description: t.description, url, alt: paths, ld, image: '/img/workspace.jpg', body: `${header}\n${body}\n${footer}` }),
    sitemap: { en: paths.en, it: paths.it, priority: '0.8' },
  };
}
