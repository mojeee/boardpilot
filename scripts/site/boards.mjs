// Board pages: /boards/ (all supported boards) and /boards/<id>/ (pinout, pins to avoid, default
// pins, flashing), generated from boards/*.json, the same files the app uses. English and Italian.
// The ESP32 DevKit keeps its hand-written page at /esp32-pinout/.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const ESP32_PAGE = 'esp32-devkitc-30';
export const boardPath = (lang, id) => `${lang === 'it' ? '/it' : ''}${id === ESP32_PAGE ? '/esp32-pinout/' : `/boards/${id}/`}`;

const FAMILY = {
  esp32: 'ESP32', esp32s3: 'ESP32-S3', esp32c3: 'ESP32-C3', rp2040: 'Raspberry Pi RP2040', rp2350: 'Raspberry Pi RP2350',
  avr: 'Arduino (AVR)', stm32: 'STM32', nrf52: 'Nordic nRF52', imxrt: 'Teensy (i.MX RT)',
};
const ORDER = Object.keys(FAMILY);
const TOOL = { esptool: 'esptool', picotool: 'picotool (UF2)', avrdude: 'avrdude', stm32: 'STM32CubeProgrammer, stlink or dfu-util', nrfjprog: 'nrfjprog (J-Link)', teensy: 'Teensy Loader' };

const T = {
  en: {
    indexTitle: 'Development board pinouts: ESP32, Raspberry Pi Pico, Arduino, STM32, nRF52, Teensy',
    indexDesc: 'Pinouts for {n} popular development boards, with the pins to avoid, default I2C and SPI pins, 5 V tolerance and how to flash each board. Generated from open board files.',
    indexH1: 'Board pinouts',
    indexLead: 'Every board BoardPilot supports, drawn from the same data file the app uses to check your wiring. Pick a board to see which pins are safe, which to avoid and the default pins in Arduino.',
    title: '{name} pinout: which pins are safe to use',
    desc: '{name} pinout ({chip}): all {n} pins with functions, the pins to avoid, default I2C/SPI pins and how to flash it. {v} V logic.',
    h1: '{name} pinout',
    caption: 'Top view, USB connector on the left. Colors: red power, grey ground, green GPIO, yellow analog, orange USB serial, blue I2C.',
    glance: 'At a glance',
    chip: 'Chip', cpu: 'Processor', logic: 'Logic level', flashTool: 'Flashing tool', fqbn: 'Arduino board (FQBN)', agent: 'Live pin view in BoardPilot',
    yes: 'Yes (diagnostic agent available)', no: 'Wiring checks, flashing and serial monitor; live pin view coming later',
    logic3: '3.3 V. Not 5 V tolerant unless marked below.', logic5: '5 V. 3.3 V-only sensors need a level shifter.',
    avoidTitle: 'Pins to avoid or use with care',
    avoid: {
      flash: ['Flash memory', 'Wired to the flash memory. Never use them.'],
      strapping_critical: ['Boot-critical strapping pins', 'A wrong level at reset stops the board from booting.'],
      strapping: ['Strapping pins', 'Their level at reset changes how the board boots. Usually fine after boot.'],
      input_only: ['Input only', 'Cannot drive outputs, and have no internal pull-up.'],
      uart0: ['USB serial', 'Used for uploading and the serial monitor. Anything connected here can break uploads.'],
      usb: ['Native USB', 'The USB data lines. Using them breaks USB uploads and the serial monitor.'],
      swd: ['Debug port', 'SWD/JTAG. Using them can stop a debugger from reaching the chip.'],
      reserved: ['Used on the board', 'Already connected to something on the board (see the notes in the table).'],
    },
    none: 'None on the header.',
    defaultsTitle: 'Default pins in Arduino',
    i2c: 'I2C', spi: 'SPI', adc: 'Analog inputs', fiveV: '5 V tolerant pins',
    i2cFixed: 'Only these pins work with the Wire library defaults.', i2cRemap: 'Any output-capable pins work with Wire.begin(sda, scl).',
    safeTitle: 'Good pins for LEDs, buttons and signals',
    tableTitle: 'All {n} pins',
    cols: ['Pin', 'GPIO', 'Chip pin', 'Functions', 'Notes'],
    flashTitle: 'How to flash it',
    ctaTitle: 'Check your wiring with BoardPilot',
    cta: 'BoardPilot shows this board in 3D, flags risky pins as you wire, and flashes it safely with a backup first.',
    ctaBtn: 'Download BoardPilot',
    sources: 'Sources',
    dataLink: 'Board data file and source notes on GitHub',
    all: 'All boards',
    pins: '{n} pins',
    view: 'Pinout',
  },
  it: {
    indexTitle: 'Piedinature delle schede di sviluppo: ESP32, Raspberry Pi Pico, Arduino, STM32, nRF52, Teensy',
    indexDesc: 'Piedinature di {n} schede di sviluppo diffuse, con i pin da evitare, i pin I2C e SPI predefiniti, la tolleranza ai 5 V e come programmare ogni scheda. Generate da file aperti.',
    indexH1: 'Piedinature delle schede',
    indexLead: 'Tutte le schede supportate da BoardPilot, disegnate dallo stesso file di dati che l’app usa per controllare il tuo cablaggio. Scegli una scheda per vedere quali pin sono sicuri, quali evitare e i pin predefiniti in Arduino.',
    title: 'Piedinatura {name}: quali pin si possono usare',
    desc: 'Piedinatura {name} ({chip}): tutti i {n} pin con le funzioni, i pin da evitare, i pin I2C/SPI predefiniti e come programmarla. Logica a {v} V.',
    h1: 'Piedinatura {name}',
    caption: 'Vista dall’alto, connettore USB a sinistra. Colori: rosso alimentazione, grigio massa, verde GPIO, giallo analogici, arancione seriale USB, blu I2C.',
    glance: 'In breve',
    chip: 'Chip', cpu: 'Processore', logic: 'Livello logico', flashTool: 'Strumento di programmazione', fqbn: 'Scheda Arduino (FQBN)', agent: 'Vista dei pin dal vivo in BoardPilot',
    yes: 'Sì (agente diagnostico disponibile)', no: 'Controllo del cablaggio, programmazione e monitor seriale; vista dal vivo in arrivo',
    logic3: '3,3 V. Non tollera i 5 V, salvo i pin indicati sotto.', logic5: '5 V. I sensori solo a 3,3 V richiedono un traslatore di livello.',
    avoidTitle: 'Pin da evitare o da usare con attenzione',
    avoid: {
      flash: ['Memoria flash', 'Collegati alla memoria flash. Non usarli mai.'],
      strapping_critical: ['Pin di strapping critici', 'Un livello sbagliato al reset impedisce l’avvio della scheda.'],
      strapping: ['Pin di strapping', 'Il loro livello al reset cambia il modo di avvio. Di solito vanno bene dopo l’avvio.'],
      input_only: ['Sola lettura', 'Non possono pilotare uscite e non hanno pull-up interna.'],
      uart0: ['Seriale USB', 'Usati per il caricamento e il monitor seriale. Qualsiasi cosa collegata qui può impedire il caricamento.'],
      usb: ['USB nativa', 'Le linee dati USB. Usarle blocca il caricamento via USB e il monitor seriale.'],
      swd: ['Porta di debug', 'SWD/JTAG. Usarli può impedire al debugger di raggiungere il chip.'],
      reserved: ['Usati sulla scheda', 'Già collegati a qualcosa sulla scheda (vedi le note nella tabella).'],
    },
    none: 'Nessuno sul connettore.',
    defaultsTitle: 'Pin predefiniti in Arduino',
    i2c: 'I2C', spi: 'SPI', adc: 'Ingressi analogici', fiveV: 'Pin che tollerano 5 V',
    i2cFixed: 'Con le impostazioni predefinite della libreria Wire funzionano solo questi pin.', i2cRemap: 'Qualsiasi coppia di pin di uscita funziona con Wire.begin(sda, scl).',
    safeTitle: 'Pin adatti a LED, pulsanti e segnali',
    tableTitle: 'Tutti i {n} pin',
    cols: ['Pin', 'GPIO', 'Pin del chip', 'Funzioni', 'Note'],
    flashTitle: 'Come programmarla',
    ctaTitle: 'Controlla il cablaggio con BoardPilot',
    cta: 'BoardPilot mostra questa scheda in 3D, segnala i pin rischiosi mentre colleghi e la programma in sicurezza, con un backup prima.',
    ctaBtn: 'Scarica BoardPilot',
    sources: 'Fonti',
    dataLink: 'File dei dati della scheda e note sulle fonti su GitHub',
    all: 'Tutte le schede',
    pins: '{n} pin',
    view: 'Piedinatura',
  },
};
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/* ---------- geometry (same maths as shared/board.ts) ---------- */

function pos(b, p) {
  const { length, width } = b.pcbMm;
  if (p.posMm) return [p.posMm[0] - length / 2, p.posMm[1] - width / 2];
  const h = b.header;
  return [h.firstPinOffsetMm - p.index * h.pitchMm - length / 2, (p.row === 'front' ? 1 : -1) * (h.rowSpacingMm / 2)];
}
function outward(b, p) {
  const { length, width } = b.pcbMm;
  const [x, z] = pos(b, p);
  const edges = [
    { d: [0, -1], dist: z + width / 2 - 0.6 },
    { d: [0, 1], dist: width / 2 - z - 0.6 },
    { d: [-1, 0], dist: x + length / 2 },
    { d: [1, 0], dist: length / 2 - x },
  ].sort((a, c) => a.dist - c.dist);
  const d = edges[0].dist > 6 ? [1, 0] : edges[0].d;
  const blocked = b.pins.some((q) => {
    if (q === p) return false;
    const [qx, qz] = pos(b, q);
    const along = (qx - x) * d[0] + (qz - z) * d[1];
    const across = Math.abs((qx - x) * d[1] - (qz - z) * d[0]);
    return along > 1.5 && along < 3.5 && across < 0.8;
  });
  return blocked ? [-d[0], -d[1]] : d;
}
function color(p) {
  if (p.kind === 'power') return '#FF6B5E';
  if (p.kind === 'ground') return '#8A96A3';
  if (p.kind === 'enable') return '#7D8997';
  if (p.functions.some((f) => /I2C_S(DA|CL)_default/.test(f))) return '#3FB6E8';
  if (p.flags.includes('uart0')) return '#F2A93B';
  if (p.flags.includes('input_only') || (p.flags.includes('adc') && /^A\d/.test(p.label))) return '#E8D24A';
  return '#5CCB8F';
}

export function thumb(b, width = 220) {
  const { length, width: w } = b.pcbMm;
  const pad = 2;
  const h = Math.round((width * (w + pad * 2)) / (length + pad * 2));
  const parts = [`<svg viewBox="${-length / 2 - pad} ${-w / 2 - pad} ${length + pad * 2} ${w + pad * 2}" width="${width}" height="${h}" aria-hidden="true">`];
  parts.push(`<rect x="${-length / 2}" y="${-w / 2}" width="${length}" height="${w}" rx="1.5" fill="${b.pcbColor ?? '#1F3A5F'}" stroke="rgba(255,255,255,.15)" stroke-width=".3"/>`);
  for (const c of b.components) {
    const [x, y, cw, ch] = c.rect.map((v) => v / b.layoutPxPerMm);
    const f = c.color ?? (['usb', 'crystal', 'module'].includes(c.type) ? '#C9CED4' : c.type === 'antenna' ? '#D9B45A' : c.type === 'led' ? '#ff6b5e' : '#15181c');
    parts.push(`<rect x="${(x - length / 2).toFixed(2)}" y="${(y - w / 2).toFixed(2)}" width="${cw.toFixed(2)}" height="${ch.toFixed(2)}" rx=".4" fill="${f}" opacity=".9"/>`);
  }
  for (const p of b.pins) {
    const [x, z] = pos(b, p);
    parts.push(`<circle cx="${x.toFixed(2)}" cy="${z.toFixed(2)}" r=".75" fill="${color(p)}"/>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

function diagram(b, lang) {
  const S = 12;
  const PAD = 170;
  const { length, width } = b.pcbMm;
  const sides = { l: false, r: false, t: false, b: false };
  for (const p of b.pins) {
    const [dx, dz] = outward(b, p);
    if (dx < 0) sides.l = true;
    if (dx > 0) sides.r = true;
    if (dz < 0) sides.t = true;
    if (dz > 0) sides.b = true;
  }
  const pl = sides.l ? PAD : 30, pr = sides.r ? PAD : 30, pt = sides.t ? PAD : 30, pb = sides.b ? PAD : 30;
  const W = length * S + pl + pr;
  const H = width * S + pt + pb;
  const X = (mm) => pl + (mm + length / 2) * S;
  const Y = (mm) => pt + (mm + width / 2) * S;
  const out = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="pinout-title" class="pinout-svg"><title id="pinout-title">${esc(fill(T[lang].h1, { name: b.name }))}</title>`];
  out.push(`<rect x="${pl}" y="${pt}" width="${length * S}" height="${width * S}" rx="10" fill="${b.pcbColor ?? '#1F3A5F'}" stroke="#3d5a80"/>`);
  for (const c of b.components) {
    const [x, y, cw, ch] = c.rect.map((v) => v / b.layoutPxPerMm);
    const f = c.color ?? (['usb', 'crystal'].includes(c.type) ? '#C9CED4' : c.type === 'module' ? '#2a3a2e' : c.type === 'antenna' ? '#D9B45A' : c.type === 'led' ? '#ff6b5e' : '#15181c');
    out.push(`<rect x="${X(x - length / 2)}" y="${Y(y - width / 2)}" width="${cw * S}" height="${ch * S}" rx="3" fill="${f}"/>`);
    if (c.label && (c.type === 'module' || c.type === 'mcu') && cw * S > 60) out.push(`<text x="${X(x + cw / 2 - length / 2)}" y="${Y(y + ch / 2 - width / 2) + 5}" text-anchor="middle" class="svg-mod">${esc(c.label)}</text>`);
  }
  for (const p of b.pins) {
    const [x, z] = pos(b, p);
    const [dx, dz] = outward(b, p);
    const vertical = dz !== 0;
    const o = vertical ? dz : dx;
    const cx = X(x);
    const cy = Y(z);
    const suffix = p.chipPin && p.chipPin !== p.label && p.chipPin.length <= 6 ? p.chipPin : p.gpio !== null && !new RegExp(`(^|\\D)${p.gpio}$`).test(p.label) ? String(p.gpio) : '';
    const label = suffix ? `${p.label} · ${suffix}` : p.label;
    const fn = (p.functions.filter((f) => f !== 'GPIO')[0] ?? '').replace(/_default$/, '');
    out.push(`<circle cx="${cx}" cy="${cy}" r="10" fill="#12171C" stroke="${color(p)}" stroke-width="3"/>`);
    const anchor = vertical ? (o === 1 ? 'end' : 'start') : o === 1 ? 'start' : 'end';
    out.push(
      `<g transform="${vertical ? `translate(${cx},${cy + o * 20}) rotate(-90)` : `translate(${cx + o * 20},${cy})`}"><text x="${vertical ? (o === 1 ? -4 : 4) : 0}" y="5" text-anchor="${anchor}" class="svg-pin">${esc(label)}</text>` +
        (fn ? `<text x="${vertical ? (o === 1 ? -84 : 84) : o * 84}" y="5" text-anchor="${anchor}" class="svg-fn">${esc(fn)}</text>` : '') +
        '</g>',
    );
  }
  out.push('</svg>');
  return out.join('');
}

/* ---------- pages ---------- */

export function sortBoards(boards) {
  return [...boards].sort((a, b) => ORDER.indexOf(a.family) - ORDER.indexOf(b.family) || a.name.localeCompare(b.name));
}

export function boardCards(lang, boards, IT = {}) {
  const t = T[lang];
  const tr = (s) => (lang === 'it' && s && IT[s]) || s;
  return sortBoards(boards)
    .map(
      (b) => `<a class="board-card" href="${boardPath(lang, b.id)}">${thumb(b)}<span class="fam">${esc(FAMILY[b.family])}</span><b>${esc(b.name)}</b><span class="small">${esc(tr(b.summary))}</span><span class="meta">${b.logicVolt} V · ${fill(t.pins, { n: b.pins.length })}</span></a>`,
    )
    .join('\n');
}

export function buildBoards({ lang, boards, site, repo, head, header, footer, IT = {} }) {
  const t = T[lang];
  const tr = (s) => (lang === 'it' && s && IT[s]) || s;
  const pre = lang === 'it' ? '/it' : '';
  const home = lang === 'it' ? '/it/' : '/';
  const pages = {};

  const indexUrl = `${site}${pre}/boards/`;
  pages[`${pre.slice(1) ? 'it/' : ''}boards/index.html`] = head({
    lang,
    title: t.indexTitle,
    description: fill(t.indexDesc, { n: boards.length }),
    url: indexUrl,
    alt: { en: '/boards/', it: '/it/boards/' },
    ld: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: t.indexH1,
      url: indexUrl,
      inLanguage: lang,
      hasPart: sortBoards(boards).map((b) => ({ '@type': 'TechArticle', headline: fill(t.h1, { name: b.name }), url: `${site}${boardPath(lang, b.id)}` })),
    },
    body: `${header}
    <main class="article">
      <div class="wrap narrow">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="${home}">BoardPilot</a> / <span>${esc(t.indexH1)}</span></nav>
        <h1>${esc(t.indexH1)}</h1>
        <p class="lead">${esc(t.indexLead)}</p>
      </div>
      <div class="wrap"><div class="board-cards">
${boardCards(lang, boards, IT)}
      </div></div>
    </main>
${footer}`,
  });

  for (const b of boards) {
    if (b.id === ESP32_PAGE) continue;
    const url = `${site}${boardPath(lang, b.id)}`;
    const pin = (id) => b.pins.find((p) => p.id === id);
    const lbl = (id) => pin(id)?.label ?? id;
    const list = (arr) => arr.map((p) => (p.chipPin && p.chipPin !== p.label ? `${p.label} (${p.chipPin})` : p.label)).join(', ');
    const byFlag = (f) => b.pins.filter((p) => p.flags.includes(f) && !p.sameAs);
    const avoid = Object.entries(t.avoid)
      .map(([flag, [h, text]]) => {
        const ps = byFlag(flag).filter((p) => flag !== 'strapping' || !p.flags.includes('strapping_critical'));
        return ps.length ? `<div class="fact"><h3>${esc(h)}: ${esc(list(ps))}</h3><p>${esc(text)}</p></div>` : '';
      })
      .join('');
    const r = b.rules;
    const fiveV = byFlag('five_volt_tolerant');
    const defaults = [
      [t.i2c, `SDA = ${lbl(r.i2c.sda)}, SCL = ${lbl(r.i2c.scl)}. ${r.i2c.remappable ? t.i2cRemap : t.i2cFixed}${r.i2c.note ? ' ' + tr(r.i2c.note) : ''}`],
      ...(r.spi ? [[t.spi, `MOSI = ${lbl(r.spi.mosi)}, MISO = ${lbl(r.spi.miso)}, SCK = ${lbl(r.spi.sck)}, CS = ${lbl(r.spi.cs)}.`]] : []),
      [t.adc, r.adcPins.map(lbl).join(', ') + ` (0–${r.adcMaxMv / 1000} V)`],
      ...(fiveV.length ? [[t.fiveV, list(fiveV)]] : []),
    ];
    const rows = b.pins
      .map((p) => {
        const fns = p.functions.map((f) => f.replace(/_default$/, lang === 'it' ? ' (predef.)' : ' (default)')).join(', ');
        return `<tr><td class="mono"><span class="dot" style="background:${color(p)}"></span>${esc(p.label)}</td><td class="mono">${p.gpio ?? '—'}</td><td class="mono">${esc(p.chipPin ?? '')}</td><td class="mono small">${esc(fns)}</td><td>${esc(tr(p.notes ?? ''))}</td></tr>`;
      })
      .join('\n');
    const title = fill(t.title, { name: b.name });
    const description = fill(t.desc, { name: b.name, chip: b.chip, n: b.pins.length, v: b.logicVolt });
    const sourcesHtml = b.sources
      .map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" rel="nofollow noopener">${esc(s.title)}</a>` : esc(s.title)}${s.section ? `, ${esc(s.section)}` : ''}</li>`)
      .join('');
    pages[`${pre.slice(1) ? 'it/' : ''}boards/${b.id}/index.html`] = head({
      lang,
      title,
      description,
      url,
      alt: { en: `/boards/${b.id}/`, it: `/it/boards/${b.id}/` },
      ld: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'TechArticle',
            headline: fill(t.h1, { name: b.name }),
            description,
            inLanguage: lang,
            url,
            image: `${site}/img/og.jpg`,
            author: { '@type': 'Person', name: 'Mojtaba Amini', url: 'https://github.com/mojeee' },
            publisher: { '@type': 'Organization', name: 'BoardPilot', url: site },
            about: { '@type': 'Product', name: b.name, brand: b.vendor, description: b.summary },
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'BoardPilot', item: `${site}${home}` },
              { '@type': 'ListItem', position: 2, name: t.indexH1, item: indexUrl },
              { '@type': 'ListItem', position: 3, name: b.name, item: url },
            ],
          },
        ],
      },
      body: `${header}
    <main class="article">
      <div class="wrap narrow">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="${home}">BoardPilot</a> / <a href="${pre}/boards/">${esc(t.indexH1)}</a> / <span>${esc(b.name)}</span></nav>
        <h1>${esc(fill(t.h1, { name: b.name }))}</h1>
        <p class="lead">${esc(tr(b.summary))}</p>
      </div>
      <figure class="wrap pinout-fig">
        ${diagram(b, lang)}
        <figcaption>${esc(t.caption)}</figcaption>
      </figure>
      <div class="wrap narrow">
        <h2>${esc(t.glance)}</h2>
        <dl class="defaults">
          <dt>${esc(t.chip)}</dt><dd>${esc(b.module === b.chip ? b.chip : `${b.chip} (${b.module})`)}</dd>
          <dt>${esc(t.cpu)}</dt><dd>${esc(b.cpu)}</dd>
          <dt>${esc(t.logic)}</dt><dd>${esc(b.logicVolt >= 5 ? t.logic5 : t.logic3)}</dd>
          <dt>${esc(t.flashTool)}</dt><dd>${esc(TOOL[b.toolchain.flasher])}</dd>
          <dt>${esc(t.fqbn)}</dt><dd class="mono">${esc(b.toolchain.fqbn)}</dd>
          <dt>${esc(t.agent)}</dt><dd>${esc(b.toolchain.agent ? t.yes : t.no)}</dd>
        </dl>
        <h2>${esc(t.avoidTitle)}</h2>
        <div class="facts">${avoid || `<p>${esc(t.none)}</p>`}</div>
        <h2>${esc(t.safeTitle)}</h2>
        <p class="mono">${esc(r.safeIo.map(lbl).join(', '))}</p>
        <h2>${esc(t.defaultsTitle)}</h2>
        <dl class="defaults">${defaults.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        ${b.toolchain.uploadNote ? `<h2>${esc(t.flashTitle)}</h2><p>${esc(tr(b.toolchain.uploadNote))}</p>` : ''}
        <h2>${esc(fill(t.tableTitle, { n: b.pins.length }))}</h2>
        <div class="table-wrap"><table class="pin-table">
          <thead><tr>${t.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>
${rows}
          </tbody>
        </table></div>
        <div class="cta-box">
          <h2>${esc(t.ctaTitle)}</h2>
          <p>${esc(t.cta)}</p>
          <a class="btn primary" href="${home}#download">${esc(t.ctaBtn)}</a>
        </div>
        <h2>${esc(t.sources)}</h2>
        <ul class="fine">${sourcesHtml}<li><a href="${repo}/blob/main/boards/${b.id}.sources.md">${esc(t.dataLink)}</a></li></ul>
        <p><a href="${pre}/boards/">← ${esc(t.all)}</a></p>
      </div>
    </main>
${footer}`,
    });
  }
  return pages;
}
