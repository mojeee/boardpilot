// ESP32 DevKit 30-pin pinout page, generated from boards/esp32-devkitc-30.json (the same data the
// app uses). One page per language. Facts cite the Espressif datasheet sections.

const T = {
  en: {
    title: 'ESP32 DevKit 30-pin pinout: which GPIO pins are safe to use',
    description: 'ESP32 DevKit V1 30-pin pinout: every GPIO with ADC, touch, SPI, UART and I2C functions, and the pins to avoid (strapping, input-only, flash).',
    h1: 'ESP32 DevKit pinout (30 pins, ESP32-WROOM-32)',
    lead: 'Every pin of the popular 30-pin ESP32 DevKit V1, what it can do, and which ones cause trouble. Generated from the same board file BoardPilot uses to check your wiring.',
    diagramCaption: 'Top view, USB connector on the left. Colors: red power, grey ground, green general GPIO, yellow input-only / ADC1, orange USB serial.',
    safeTitle: 'Which pins are safe to use?',
    safe: [
      ['Good general-purpose pins', 'D4, D13, D14, D16 (RX2), D17 (TX2), D18, D19, D21, D22, D23, D25, D26, D27, D32, D33. D14 outputs a short PWM signal at boot.'],
      ['Input only: GPIO 34, 35, 36 (VP), 39 (VN)', 'They can read a signal or a voltage, but cannot drive an LED or any output, and have no internal pull-up or pull-down resistors.'],
      ['Strapping pins: GPIO 0, 2, 5, 12, 15', 'Their level at reset selects how the chip boots. GPIO 12 HIGH at reset selects 1.8 V flash and the board may not boot. GPIO 2 must be LOW or floating to upload.'],
      ['Flash pins: GPIO 6 to 11', 'Wired to the flash memory inside the module. Never use them. The 30-pin DevKit does not break them out.'],
      ['USB serial: TX0 (GPIO 1), RX0 (GPIO 3)', 'Used for uploading and the serial monitor. Anything connected here can break uploads.'],
      ['ADC with Wi-Fi: use ADC1 (GPIO 32 to 39)', 'ADC2 pins (GPIO 0, 2, 4, 12 to 15, 25 to 27) stop measuring while Wi-Fi is on.'],
    ],
    defaultsTitle: 'Default pins in Arduino',
    defaults: [
      ['I2C', 'SDA = GPIO 21 (D21), SCL = GPIO 22 (D22). Any other output-capable pins work with Wire.begin(sda, scl).'],
      ['SPI (VSPI)', 'MOSI = GPIO 23, MISO = GPIO 19, SCK = GPIO 18, CS = GPIO 5.'],
      ['UART2', 'TX = GPIO 17 (TX2), RX = GPIO 16 (RX2).'],
      ['DAC', 'GPIO 25 and GPIO 26.'],
    ],
    tableTitle: 'All 30 pins',
    cols: ['Pin', 'GPIO', 'Side', 'Functions', 'Notes'],
    front: 'right',
    back: 'left',
    power: 'power',
    faqTitle: 'Questions',
    faq: [
      ['Which ESP32 pins should I avoid?', 'Avoid GPIO 6 to 11 (flash), be careful with the strapping pins 0, 2, 5, 12 and 15, keep TX0/RX0 free for uploads, and never use GPIO 34 to 39 as outputs.'],
      ['Which ESP32 pins are input only?', 'GPIO 34, 35, 36 (VP) and 39 (VN). They have no internal pull-ups, so a button on these pins needs an external resistor.'],
      ['What are the default I2C pins on the ESP32?', 'GPIO 21 is SDA and GPIO 22 is SCL. If a sensor answers only with the two swapped, the wires are crossed.'],
      ['Why does my ESP32 not boot when something is connected to GPIO 12?', 'GPIO 12 is a strapping pin: if it is HIGH at reset, the chip selects 1.8 V for the flash and may fail to boot. Move that connection to another pin.'],
      ['Which ADC pins work while Wi-Fi is on?', 'Only ADC1: GPIO 32, 33, 34, 35, 36 and 39. ADC2 is used by the Wi-Fi driver.'],
    ],
    ctaTitle: 'Let BoardPilot check your wiring',
    cta: 'BoardPilot shows this board in 3D, flags risky pins as you wire, and measures the real pins to find crossed or missing wires.',
    ctaBtn: 'Download BoardPilot',
    sources: 'Sources: Espressif ESP32 Series Datasheet (Pin Description, Strapping Pins), ESP32 Technical Reference Manual (IO_MUX and GPIO Matrix), ESP-IDF Programming Guide (ADC).',
    home: 'Home',
  },
  it: {
    title: 'Piedinatura ESP32 DevKit 30 pin: quali GPIO si possono usare',
    description: 'Piedinatura ESP32 DevKit V1 a 30 pin: ogni GPIO con funzioni ADC, touch, SPI, UART e I2C, e i pin da evitare (strapping, sola lettura, flash).',
    h1: 'Piedinatura ESP32 DevKit (30 pin, ESP32-WROOM-32)',
    lead: 'Tutti i pin del diffuso ESP32 DevKit V1 a 30 pin, cosa sanno fare e quali creano problemi. Generata dallo stesso file della scheda che BoardPilot usa per controllare il tuo cablaggio.',
    diagramCaption: 'Vista dall’alto, connettore USB a sinistra. Colori: rosso alimentazione, grigio massa, verde GPIO generici, giallo sola lettura / ADC1, arancione seriale USB.',
    safeTitle: 'Quali pin si possono usare?',
    safe: [
      ['Buoni pin di uso generale', 'D4, D13, D14, D16 (RX2), D17 (TX2), D18, D19, D21, D22, D23, D25, D26, D27, D32, D33. D14 emette un breve segnale PWM all’avvio.'],
      ['Sola lettura: GPIO 34, 35, 36 (VP), 39 (VN)', 'Possono leggere un segnale o una tensione, ma non pilotare un LED o un’uscita, e non hanno resistenze di pull-up o pull-down interne.'],
      ['Pin di strapping: GPIO 0, 2, 5, 12, 15', 'Il loro livello al reset decide come si avvia il chip. GPIO 12 ALTO al reset seleziona la flash a 1,8 V e la scheda può non avviarsi. GPIO 2 deve essere BASSO o scollegato per caricare il firmware.'],
      ['Pin della flash: GPIO 6–11', 'Collegati alla memoria flash dentro il modulo. Non usarli mai. Il DevKit a 30 pin non li porta fuori.'],
      ['Seriale USB: TX0 (GPIO 1), RX0 (GPIO 3)', 'Usati per il caricamento e il monitor seriale. Qualsiasi cosa collegata qui può impedire il caricamento.'],
      ['ADC con Wi-Fi: usa l’ADC1 (GPIO 32–39)', 'I pin ADC2 (GPIO 0, 2, 4, 12–15, 25–27) smettono di misurare quando il Wi-Fi è acceso.'],
    ],
    defaultsTitle: 'Pin predefiniti in Arduino',
    defaults: [
      ['I2C', 'SDA = GPIO 21 (D21), SCL = GPIO 22 (D22). Qualsiasi altra coppia di pin di uscita funziona con Wire.begin(sda, scl).'],
      ['SPI (VSPI)', 'MOSI = GPIO 23, MISO = GPIO 19, SCK = GPIO 18, CS = GPIO 5.'],
      ['UART2', 'TX = GPIO 17 (TX2), RX = GPIO 16 (RX2).'],
      ['DAC', 'GPIO 25 e GPIO 26.'],
    ],
    tableTitle: 'Tutti i 30 pin',
    cols: ['Pin', 'GPIO', 'Lato', 'Funzioni', 'Note'],
    front: 'destro',
    back: 'sinistro',
    power: 'alimentazione',
    faqTitle: 'Domande',
    faq: [
      ['Quali pin dell’ESP32 devo evitare?', 'Evita i GPIO 6–11 (flash), fai attenzione ai pin di strapping 0, 2, 5, 12 e 15, lascia liberi TX0/RX0 per il caricamento e non usare mai i GPIO 34–39 come uscite.'],
      ['Quali pin dell’ESP32 sono di sola lettura?', 'GPIO 34, 35, 36 (VP) e 39 (VN). Non hanno pull-up interne, quindi un pulsante su questi pin richiede una resistenza esterna.'],
      ['Quali sono i pin I2C predefiniti dell’ESP32?', 'GPIO 21 è SDA e GPIO 22 è SCL. Se un sensore risponde solo con i due scambiati, i fili sono invertiti.'],
      ['Perché il mio ESP32 non si avvia con qualcosa collegato al GPIO 12?', 'GPIO 12 è un pin di strapping: se è ALTO al reset, il chip seleziona 1,8 V per la flash e può non avviarsi. Sposta quel collegamento su un altro pin.'],
      ['Quali pin ADC funzionano con il Wi-Fi acceso?', 'Solo l’ADC1: GPIO 32, 33, 34, 35, 36 e 39. L’ADC2 è usato dal driver Wi-Fi.'],
    ],
    ctaTitle: 'Fai controllare il cablaggio a BoardPilot',
    cta: 'BoardPilot mostra questa scheda in 3D, segnala i pin rischiosi mentre colleghi e misura i pin reali per trovare fili invertiti o mancanti.',
    ctaBtn: 'Scarica BoardPilot',
    sources: 'Fonti: Espressif ESP32 Series Datasheet (Pin Description, Strapping Pins), ESP32 Technical Reference Manual (IO_MUX and GPIO Matrix), ESP-IDF Programming Guide (ADC).',
    home: 'Home',
  },
};

const PIN_NOTES_IT = {
  'USB serial TX. Used for uploading and the serial monitor.': 'TX della seriale USB. Usato per il caricamento e il monitor seriale.',
  'USB serial RX. Used for uploading and the serial monitor.': 'RX della seriale USB. Usato per il caricamento e il monitor seriale.',
  'Strapping pin (SDIO timing). Pulled up at reset. Fine to use after boot.': 'Pin di strapping (temporizzazione SDIO). Con pull-up al reset. Si può usare dopo l’avvio.',
  'Strapping pin: must be LOW or floating to enter download mode. Drives the blue on-board LED on most DevKit V1 boards.':
    'Pin di strapping: deve essere BASSO o scollegato per entrare in modalità download. Pilota il LED blu sulla scheda nella maggior parte dei DevKit V1.',
  'Strapping pin: LOW at reset silences the boot messages.': 'Pin di strapping: BASSO al reset silenzia i messaggi di avvio.',
  'Output of the on-board 3.3 V regulator (about 600 mA shared with the ESP32).': 'Uscita del regolatore da 3,3 V sulla scheda (circa 600 mA condivisi con l’ESP32).',
  'Reset. Pulling it LOW resets the chip (same as the EN button).': 'Reset. Portarlo BASSO resetta il chip (come il pulsante EN).',
  'Outputs a short PWM signal at boot.': 'Emette un breve segnale PWM all’avvio.',
  'Strapping pin: HIGH at reset selects 1.8 V flash voltage, so the board may not boot. Keep it LOW or floating at reset.':
    'Pin di strapping: ALTO al reset seleziona la flash a 1,8 V, quindi la scheda può non avviarsi. Tienilo BASSO o scollegato al reset.',
  '5 V from USB (or a 5 V input when USB is not connected).': '5 V dall’USB (o ingresso a 5 V quando l’USB non è collegato).',
};

const FLAG_NOTE = {
  en: { input_only: 'Input only, no internal pull-up.', strapping: '', adc2: 'ADC2: not usable with Wi-Fi on.' },
  it: { input_only: 'Sola lettura, senza pull-up interna.', strapping: '', adc2: 'ADC2: non utilizzabile con il Wi-Fi acceso.' },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function roleColor(p) {
  if (p.kind === 'power') return '#FF6B5E';
  if (p.kind === 'ground') return '#8A96A3';
  if (p.kind === 'enable') return '#7D8997';
  if (p.flags.includes('uart0')) return '#F2A93B';
  if (p.flags.includes('input_only')) return '#E8D24A';
  return '#5CCB8F';
}

function diagram(board) {
  const S = 12;
  const PX = 20;
  const PY = 175;
  const { length, width } = board.pcbMm;
  const W = length * S + PX * 2;
  const H = width * S + PY * 2;
  const toX = (mm) => PX + (mm + length / 2) * S;
  const toY = (mm) => PY + (mm + width / 2) * S;
  const out = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="pinout-title" class="pinout-svg"><title id="pinout-title">ESP32 DevKit 30-pin pinout diagram</title>`];
  out.push(`<rect x="${PX}" y="${PY}" width="${length * S}" height="${width * S}" rx="10" fill="#1F3A5F" stroke="#3d5a80"/>`);
  for (const c of board.components) {
    const [x, y, w, h] = c.rect.map((v) => v / board.layoutPxPerMm);
    const fill = c.type === 'module' ? '#2a3a2e' : c.type === 'usb' ? '#C9CED4' : c.type === 'led' ? (c.label === 'PWR' ? '#ff4d4d' : '#4da3ff') : '#15181c';
    out.push(`<rect x="${toX(x - length / 2)}" y="${toY(y - width / 2)}" width="${w * S}" height="${h * S}" rx="3" fill="${fill}"/>`);
    if (c.type === 'module') out.push(`<text x="${toX(x + w / 2 - length / 2)}" y="${toY(y + h / 2 - width / 2) + 5}" text-anchor="middle" class="svg-mod">ESP32-WROOM-32</text>`);
  }
  for (const p of board.pins) {
    const x = board.header.firstPinOffsetMm - p.index * board.header.pitchMm - length / 2;
    const z = (p.row === 'front' ? 1 : -1) * (board.header.rowSpacingMm / 2);
    const cx = toX(x);
    const cy = toY(z);
    const out1 = p.row === 'front' ? 1 : -1;
    const col = roleColor(p);
    const label = p.gpio !== null && p.label !== `D${p.gpio}` ? `${p.label} · ${p.gpio}` : p.label;
    const fn = p.functions.filter((f) => f !== 'GPIO')[0] ?? '';
    out.push(`<circle cx="${cx}" cy="${cy}" r="10" fill="#12171C" stroke="${col}" stroke-width="3"/>`);
    out.push(
      `<g transform="translate(${cx},${cy + out1 * 20}) rotate(-90)"><text x="${out1 === 1 ? -4 : 4}" y="5" text-anchor="${out1 === 1 ? 'end' : 'start'}" class="svg-pin">${esc(label)}</text>` +
        (fn ? `<text x="${out1 === 1 ? -82 : 82}" y="5" text-anchor="${out1 === 1 ? 'end' : 'start'}" class="svg-fn">${esc(fn.replace(/_default$/, ''))}</text>` : '') +
        '</g>',
    );
  }
  out.push('</svg>');
  return out.join('');
}

export function renderPinout({ lang, board, site, header, footer }) {
  const t = T[lang];
  const url = `${site}${lang === 'it' ? '/it' : ''}/esp32-pinout/`;
  const rows = board.pins
    .slice()
    .sort((a, b) => (a.row === b.row ? a.index - b.index : a.row === 'back' ? -1 : 1))
    .map((p) => {
      let note = p.notes ?? '';
      if (lang === 'it' && note) note = PIN_NOTES_IT[note] ?? note;
      const extra = ['input_only', 'adc2'].filter((f) => p.flags.includes(f)).map((f) => FLAG_NOTE[lang][f]);
      const fns = p.functions.map((f) => f.replace(/_default$/, lang === 'it' ? ' (predef.)' : ' (default)')).join(', ');
      return `<tr><td class="mono"><span class="dot" style="background:${roleColor(p)}"></span>${esc(p.label)}</td><td class="mono">${p.gpio ?? '—'}</td><td>${p.row === 'front' ? t.front : t.back}</td><td class="mono small">${esc(fns)}</td><td>${esc([note, ...extra].filter(Boolean).join(' '))}</td></tr>`;
    })
    .join('\n');
  const faqLd = {
    '@type': 'FAQPage',
    mainEntity: t.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        headline: t.h1,
        description: t.description,
        inLanguage: lang,
        url,
        image: `${site}/img/og.jpg`,
        author: { '@type': 'Person', name: 'Mojtaba Amini', url: 'https://github.com/mojeee' },
        publisher: { '@type': 'Organization', name: 'BoardPilot', url: site },
        about: 'ESP32 DevKit V1 30-pin pinout',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'BoardPilot', item: `${site}${lang === 'it' ? '/it/' : '/'}` },
          { '@type': 'ListItem', position: 2, name: t.h1, item: url },
        ],
      },
      faqLd,
    ],
  };
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(t.title)}</title>
    <meta name="description" content="${esc(t.description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" hreflang="en" href="${site}/esp32-pinout/" />
    <link rel="alternate" hreflang="it" href="${site}/it/esp32-pinout/" />
    <link rel="alternate" hreflang="x-default" href="${site}/esp32-pinout/" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="BoardPilot" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(t.title)}" />
    <meta property="og:description" content="${esc(t.description)}" />
    <meta property="og:image" content="${site}/img/og.jpg" />
    <meta property="og:locale" content="${lang === 'it' ? 'it_IT' : 'en_US'}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#12171C" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/style.css" />
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
  </head>
  <body>
${header}
    <main class="article">
      <div class="wrap narrow">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="${lang === 'it' ? '/it/' : '/'}">BoardPilot</a> / <span>${lang === 'it' ? 'Piedinatura ESP32' : 'ESP32 pinout'}</span></nav>
        <h1>${esc(t.h1)}</h1>
        <p class="lead">${esc(t.lead)}</p>
      </div>
      <figure class="wrap pinout-fig">
        ${diagram(board)}
        <figcaption>${esc(t.diagramCaption)}</figcaption>
      </figure>
      <div class="wrap narrow">
        <h2>${esc(t.safeTitle)}</h2>
        <div class="facts">${t.safe.map(([h, p]) => `<div class="fact"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('')}</div>
        <h2>${esc(t.defaultsTitle)}</h2>
        <dl class="defaults">${t.defaults.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <h2>${esc(t.tableTitle)}</h2>
        <div class="table-wrap"><table class="pin-table">
          <thead><tr>${t.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>
${rows}
          </tbody>
        </table></div>
        <h2>${esc(t.faqTitle)}</h2>
        ${t.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n        ')}
        <div class="cta-box">
          <h2>${esc(t.ctaTitle)}</h2>
          <p>${esc(t.cta)}</p>
          <a class="btn primary" href="${lang === 'it' ? '/it/' : '/'}#download">${esc(t.ctaBtn)}</a>
        </div>
        <p class="fine">${esc(t.sources)}</p>
      </div>
    </main>
${footer}
  </body>
</html>
`;
}
