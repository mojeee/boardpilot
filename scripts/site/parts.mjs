// Parts library pages: /parts/ (searchable index) and /parts/<id>/ for every built-in part, in English
// and Italian, plus the open dataset /parts.json. The data is CC BY 4.0 (see parts/LICENSE).

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const ROLE = {
  en: {
    power: 'Power', ground: 'Ground', i2c_sda: 'I2C data (SDA)', i2c_scl: 'I2C clock (SCL)', spi_mosi: 'SPI MOSI', spi_miso: 'SPI MISO',
    spi_sck: 'SPI clock', spi_cs: 'SPI chip select', digital_in: 'Input (the ESP32 drives it)', digital_out: 'Output (the part drives it)',
    analog_out: 'Analog output', onewire: 'One-wire data', int: 'Interrupt', passive: 'Not wired to the ESP32',
  },
  it: {
    power: 'Alimentazione', ground: 'Massa', i2c_sda: 'Dati I2C (SDA)', i2c_scl: 'Clock I2C (SCL)', spi_mosi: 'SPI MOSI', spi_miso: 'SPI MISO',
    spi_sck: 'Clock SPI', spi_cs: 'Chip select SPI', digital_in: 'Ingresso (lo pilota l’ESP32)', digital_out: 'Uscita (la pilota il componente)',
    analog_out: 'Uscita analogica', onewire: 'Dati one-wire', int: 'Interrupt', passive: 'Non collegato all’ESP32',
  },
};
const CAT = {
  en: { sensor: 'Sensors', display: 'Displays', output: 'Outputs and modules', input: 'Inputs' },
  it: { sensor: 'Sensori', display: 'Display', output: 'Uscite e moduli', input: 'Ingressi' },
};
const ROLE_COLOR = {
  power: '#FF6B5E', ground: '#8A96A3', i2c_sda: '#3FB6E8', i2c_scl: '#9ADCF7', spi_mosi: '#E07BD4', spi_miso: '#E07BD4', spi_sck: '#E07BD4',
  spi_cs: '#E07BD4', analog_out: '#E8D24A', digital_in: '#5CCB8F', digital_out: '#5CCB8F', onewire: '#5CCB8F', int: '#5CCB8F', passive: '#7D8997',
};

const T = {
  en: {
    idxTitle: (n) => `ESP32 parts library: ${n} sensors, displays and modules`,
    idxDesc: (n) => `Pinouts, I2C addresses and ESP32 wiring for ${n} hobby modules: sensors, displays, drivers and radios. Open data (CC BY 4.0).`,
    idxH1: 'ESP32 parts library',
    idxLead: (n) => `${n} sensors, displays, drivers and modules with their pins, supply voltage, I2C addresses and a safe way to wire each one to an ESP32 DevKit. The same data powers the 3D parts in BoardPilot.`,
    search: 'Search: BME280, OLED, 0x76, relay…',
    download: 'Download the dataset (JSON)',
    license: 'Part data: CC BY 4.0, free to reuse with credit to BoardPilot.',
    contribute: 'Missing a part? Suggest it on GitHub',
    title: (name) => `${name} + ESP32: pinout and wiring`,
    desc: (p, addr) => `How to wire the ${p.name} to an ESP32: pins, suggested GPIO, ${p.voltage} V supply${addr ? `, I2C address ${addr}` : ''}. Free part data from BoardPilot.`,
    h1: (name) => `${name} with ESP32`,
    crumbs: 'Parts library',
    bus: 'Bus', supply: 'Supply', addresses: 'I2C address', measures: 'Measures',
    pinsH: 'Pins and ESP32 wiring',
    cols: ['Pin', 'Role', 'ESP32 pin', 'Notes'],
    notWired: '—',
    wiringNote: 'Suggested wiring for the 30-pin ESP32 DevKit, avoiding flash, input-only and strapping pins. BoardPilot checks it for you as you wire.',
    idH: 'Check it is the real chip',
    id: (r, e) => `Read register ${r}: a genuine part answers ${e}. BoardPilot does this automatically in “Debug a problem”.`,
    fivev: 'This module is sold for 5 V. Its outputs may be 5 V: use a level shifter or a voltage divider on ESP32 inputs.',
    codeH: 'Starter code (Arduino)',
    sourcesH: 'Sources',
    related: 'Related parts',
    otherBoards: (name) => `${name} on other boards: wiring and code`,
    cta: 'Try it in 3D in BoardPilot',
    json: 'Part data (JSON)',
    home: 'BoardPilot',
  },
  it: {
    idxTitle: (n) => `Libreria componenti ESP32: ${n} sensori, display e moduli`,
    idxDesc: (n) => `Piedinature, indirizzi I2C e collegamenti all’ESP32 per ${n} moduli: sensori, display, driver e radio. Dati aperti (CC BY 4.0).`,
    idxH1: 'Libreria componenti per ESP32',
    idxLead: (n) => `${n} sensori, display, driver e moduli con pin, tensione, indirizzi I2C e un modo sicuro per collegarli a un ESP32 DevKit. Sono gli stessi dati dei componenti 3D di BoardPilot.`,
    search: 'Cerca: BME280, OLED, 0x76, relè…',
    download: 'Scarica il dataset (JSON)',
    license: 'Dati dei componenti: CC BY 4.0, riutilizzabili citando BoardPilot.',
    contribute: 'Manca un componente? Proponilo su GitHub',
    title: (name) => `${name} con ESP32: piedinatura e collegamenti`,
    desc: (p, addr) => `Come collegare ${p.name} a un ESP32: pin, GPIO consigliati, alimentazione ${p.voltage} V${addr ? `, indirizzo I2C ${addr}` : ''}. Dati gratuiti di BoardPilot.`,
    h1: (name) => `${name} con ESP32`,
    crumbs: 'Libreria componenti',
    bus: 'Bus', supply: 'Alimentazione', addresses: 'Indirizzo I2C', measures: 'Misura',
    pinsH: 'Pin e collegamento all’ESP32',
    cols: ['Pin', 'Ruolo', 'Pin ESP32', 'Note'],
    notWired: '—',
    wiringNote: 'Collegamento consigliato per l’ESP32 DevKit a 30 pin, evitando i pin della flash, di sola lettura e di strapping. BoardPilot lo controlla mentre colleghi.',
    idH: 'Verifica che sia il chip originale',
    id: (r, e) => `Leggi il registro ${r}: un componente originale risponde ${e}. BoardPilot lo fa da solo in “Risolvi un problema”.`,
    fivev: 'Questo modulo è venduto per 5 V. Le sue uscite possono essere a 5 V: usa un traslatore di livello o un partitore sugli ingressi dell’ESP32.',
    codeH: 'Codice di partenza (Arduino)',
    sourcesH: 'Fonti',
    related: 'Componenti simili',
    otherBoards: (name) => `${name} su altre schede: collegamenti e codice`,
    cta: 'Provalo in 3D in BoardPilot',
    json: 'Dati del componente (JSON)',
    home: 'BoardPilot',
  },
};

/** Same rules as shared/assign.ts: safe pins, default buses. */
function suggestWiring(p) {
  const SAFE = ['D25', 'D26', 'D27', 'D32', 'D33', 'D23', 'D19', 'D18', 'D4', 'D13', 'D14', 'RX2', 'TX2'];
  const ADC = ['D34', 'D35', 'VP', 'VN', 'D32', 'D33'];
  const INP = ['D35', 'VP', 'VN', 'D34'];
  const used = new Set();
  const take = (list) => {
    const x = list.find((q) => !used.has(q));
    if (x) used.add(x);
    return x;
  };
  const spi = { spi_mosi: 'D23', spi_miso: 'D19', spi_sck: 'D18', spi_cs: 'D5' };
  const isI2s = p.pins.some((q) => /I2S/i.test(q.notes ?? ''));
  const out = {};
  let g = 0;
  for (const q of p.pins) {
    let pin;
    if (q.role === 'power') pin = /^5$/.test(p.voltage) ? 'VIN' : '3V3';
    else if (q.role === 'ground') pin = g++ % 2 ? 'GND' : 'GND';
    else if (q.role === 'i2c_sda') pin = 'D21';
    else if (q.role === 'i2c_scl') pin = 'D22';
    else if (spi[q.role] && !isI2s) {
      pin = used.has(spi[q.role]) ? take(SAFE) : spi[q.role];
      used.add(pin);
    } else if (q.role === 'analog_out') pin = take(ADC);
    else if (q.role === 'int') pin = take([...INP, ...SAFE]);
    else if (q.role === 'passive') pin = null;
    else pin = take(SAFE);
    out[q.name] = pin ?? null;
  }
  return out;
}

function starterCode(p, wiring) {
  const gp = (name) => {
    const w = wiring[name];
    const m = /^D(\d+)$/.exec(w ?? '');
    return m ? m[1] : w === 'VP' ? '36' : w === 'VN' ? '39' : w === 'RX2' ? '16' : w === 'TX2' ? '17' : null;
  };
  if (p.bus === 'i2c') {
    const addr = (p.addresses ?? [])[0] ?? '0x3C';
    return `#include <Wire.h>

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);  // SDA = GPIO 21, SCL = GPIO 22
  Wire.beginTransmission(${addr});
  bool found = Wire.endTransmission() == 0;
  Serial.println(found ? "${esc(p.name)} found at ${addr}" : "Not found: check power, GND and SDA/SCL");
}

void loop() {}`;
  }
  const a = p.pins.find((q) => q.role === 'analog_out');
  if (a && gp(a.name)) {
    return `void setup() { Serial.begin(115200); }

void loop() {
  int mv = analogReadMilliVolts(${gp(a.name)});  // ${a.name} on GPIO ${gp(a.name)}
  Serial.println(mv);
  delay(200);
}`;
  }
  const o = p.pins.find((q) => q.role === 'digital_out');
  const i = p.pins.find((q) => q.role === 'digital_in');
  if (o && gp(o.name) && !i) {
    return `void setup() {
  Serial.begin(115200);
  pinMode(${gp(o.name)}, INPUT);  // ${o.name}
}

void loop() {
  Serial.println(digitalRead(${gp(o.name)}));
  delay(100);
}`;
  }
  if (i && gp(i.name) && p.pins.filter((q) => q.role === 'digital_in').length === 1 && !o) {
    return `void setup() { pinMode(${gp(i.name)}, OUTPUT); }  // ${i.name}

void loop() {
  digitalWrite(${gp(i.name)}, HIGH);
  delay(500);
  digitalWrite(${gp(i.name)}, LOW);
  delay(500);
}`;
  }
  return null;
}

function partSvg(p) {
  const n = p.pins.length;
  const pitch = 26;
  const w = Math.max(220, n * pitch + 60);
  const h = 170;
  const pins = p.pins
    .map((q, k) => {
      const x = w / 2 + (k - (n - 1) / 2) * pitch;
      const c = ROLE_COLOR[q.role] ?? '#7D8997';
      return `<g><rect x="${x - 4}" y="118" width="8" height="26" rx="2" fill="#D9B45A"/><circle cx="${x}" cy="118" r="7" fill="#12171C" stroke="${c}" stroke-width="3"/><text x="${x}" y="100" transform="rotate(-60 ${x} 100)" class="pp">${esc(q.name)}</text></g>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="part-svg" style="max-width:${Math.min(560, Math.round(w * 1.25))}px" role="img" aria-label="${esc(p.name)} pins"><rect x="20" y="16" width="${w - 40}" height="112" rx="10" fill="${esc(p.model.color)}" stroke="rgba(255,255,255,.18)"/><rect x="${w / 2 - 20}" y="36" width="40" height="30" rx="4" fill="#15181c" opacity=".85"/>${pins}</svg>`;
}

export function buildParts({ parts, lang, site, header, footer, IT_MEASURES, head, boardLinks = () => '' }) {
  const t = T[lang];
  const pre = lang === 'it' ? '/it' : '';
  const byId = new Map(parts.map((p) => [p.id, p]));
  const pages = {};
  const tr = (m) => (lang === 'it' ? IT_MEASURES[m] ?? m : m);

  /* index */
  const cats = ['sensor', 'display', 'output', 'input'];
  const cards = cats
    .map((c) => {
      const list = parts.filter((p) => p.category === c).sort((a, b) => a.name.localeCompare(b.name));
      if (!list.length) return '';
      return `<h2 id="${c}">${esc(CAT[lang][c])} <span class="count">${list.length}</span></h2><div class="part-grid">${list
        .map(
          (p) =>
            `<a class="part-card" href="${pre}/parts/${p.id}/" data-q="${esc([p.name, ...(p.keywords ?? []), p.bus ?? '', ...(p.addresses ?? [])].join(' ').toLowerCase())}"><span class="sw" style="background:${esc(p.model.color)}"></span><b>${esc(p.name)}</b><span class="meta">${esc([p.bus?.toUpperCase(), `${p.voltage} V`, (p.addresses ?? []).join(' / ')].filter(Boolean).join(' · '))}</span></a>`,
        )
        .join('')}</div>`;
    })
    .join('\n');
  const n = parts.length;
  const idxUrl = `${site}${pre}/parts/`;
  const idxLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Dataset',
        name: 'BoardPilot ESP32 parts library',
        description: t.idxDesc(n),
        url: idxUrl,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: { '@type': 'Person', name: 'Mojtaba Amini', url: 'https://github.com/mojeee' },
        isAccessibleForFree: true,
        keywords: ['ESP32', 'pinout', 'I2C address', 'sensor', 'Arduino', 'wiring'],
        distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${site}/parts.json` }],
        inLanguage: lang,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'BoardPilot', item: `${site}${pre}/` },
          { '@type': 'ListItem', position: 2, name: t.crumbs, item: idxUrl },
        ],
      },
    ],
  };
  pages[`${pre.slice(1) ? 'it/' : ''}parts/index.html`] = head({
    lang,
    title: t.idxTitle(n),
    description: t.idxDesc(n),
    url: idxUrl,
    alt: { en: '/parts/', it: '/it/parts/' },
    ld: idxLd,
    body: `${header}
    <main class="article">
      <div class="wrap">
        <nav class="crumbs"><a href="${pre}/">BoardPilot</a> / <span>${esc(t.crumbs)}</span></nav>
        <h1>${esc(t.idxH1)}</h1>
        <p class="lead">${esc(t.idxLead(n))}</p>
        <div class="lib-tools"><input id="part-search" type="search" placeholder="${esc(t.search)}" aria-label="${esc(t.search)}" />
          <a class="btn small" href="/parts.json" download>${esc(t.download)}</a>
          <a class="btn small" href="https://github.com/mojeee/boardpilot/issues/new?template=new-part.yml">${esc(t.contribute)}</a></div>
        <nav class="cat-links">${cats.map((c) => `<a href="#${c}">${esc(CAT[lang][c])}</a>`).join('')}</nav>
        ${cards}
        <p class="fine">${esc(t.license)}</p>
      </div>
    </main>
${footer}
    <script>
      const q = document.getElementById('part-search');
      q.addEventListener('input', () => {
        const v = q.value.trim().toLowerCase();
        document.querySelectorAll('.part-card').forEach((c) => (c.style.display = !v || c.dataset.q.includes(v) ? '' : 'none'));
      });
    </script>`,
  });

  /* one page per part */
  for (const p of parts) {
    const url = `${site}${pre}/parts/${p.id}/`;
    const wiring = suggestWiring(p);
    const addr = (p.addresses ?? [])[0];
    const short = p.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const titleName = short.length > 34 ? short.split(' ').slice(0, 3).join(' ') : short;
    let desc = t.desc(p, addr);
    if (desc.length > 158) desc = desc.slice(0, 155).replace(/\s+\S*$/, '') + '…';
    const rows = p.pins
      .map(
        (q) =>
          `<tr><td class="mono"><span class="dot" style="background:${ROLE_COLOR[q.role] ?? '#7D8997'}"></span>${esc(q.name)}</td><td>${esc(ROLE[lang][q.role] ?? q.role)}</td><td class="mono">${esc(wiring[q.name] ?? t.notWired)}</td><td>${esc(q.notes ?? '')}</td></tr>`,
      )
      .join('');
    const related = parts
      .filter((o) => o.id !== p.id && o.category === p.category && (o.bus ?? '') === (p.bus ?? ''))
      .slice(0, 6)
      .map((o) => `<a class="part-card" href="${pre}/parts/${o.id}/"><span class="sw" style="background:${esc(o.model.color)}"></span><b>${esc(o.name)}</b></a>`)
      .join('');
    const code = starterCode(p, wiring);
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'TechArticle',
          headline: t.h1(p.name),
          description: desc,
          inLanguage: lang,
          url,
          about: p.name,
          keywords: (p.keywords ?? []).join(', '),
          license: 'https://creativecommons.org/licenses/by/4.0/',
          author: { '@type': 'Person', name: 'Mojtaba Amini', url: 'https://github.com/mojeee' },
          publisher: { '@type': 'Organization', name: 'BoardPilot', url: site, logo: { '@type': 'ImageObject', url: `${site}/icon-512.png` } },
          isPartOf: { '@type': 'Dataset', name: 'BoardPilot ESP32 parts library', url: `${site}${pre}/parts/` },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'BoardPilot', item: `${site}${pre}/` },
            { '@type': 'ListItem', position: 2, name: t.crumbs, item: `${site}${pre}/parts/` },
            { '@type': 'ListItem', position: 3, name: p.name, item: url },
          ],
        },
      ],
    };
    const pageHeader = header
      .replace('href="/parts/" hreflang="en"', `href="/parts/${p.id}/" hreflang="en"`)
      .replace('href="/it/parts/" hreflang="it"', `href="/it/parts/${p.id}/" hreflang="it"`);
    pages[`${pre.slice(1) ? 'it/' : ''}parts/${p.id}/index.html`] = head({
      lang,
      title: t.title(titleName),
      description: desc,
      url,
      alt: { en: `/parts/${p.id}/`, it: `/it/parts/${p.id}/` },
      ld,
      body: `${pageHeader}
    <main class="article">
      <div class="wrap narrow">
        <nav class="crumbs"><a href="${pre}/">BoardPilot</a> / <a href="${pre}/parts/">${esc(t.crumbs)}</a> / <span>${esc(p.name)}</span></nav>
        <h1>${esc(t.h1(p.name))}</h1>
        <div class="facts-row">
          <span><b>${esc(t.supply)}</b> ${esc(p.voltage)} V</span>
          ${p.bus ? `<span><b>${esc(t.bus)}</b> ${esc(p.bus.toUpperCase())}</span>` : ''}
          ${p.addresses?.length ? `<span><b>${esc(t.addresses)}</b> <code>${esc(p.addresses.join(' / '))}</code></span>` : ''}
          ${p.measures?.length ? `<span><b>${esc(t.measures)}</b> ${esc(p.measures.map(tr).join(', '))}</span>` : ''}
        </div>
        ${partSvg(p)}
        <h2>${esc(t.pinsH)}</h2>
        <div class="table-wrap"><table class="pin-table"><thead><tr>${t.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
        <p class="fine">${esc(t.wiringNote)}</p>
        ${/^5$/.test(p.voltage) ? `<p class="note warn">${esc(t.fivev)}</p>` : ''}
        ${p.idCheck ? `<h2>${esc(t.idH)}</h2><p>${esc(t.id(p.idCheck.register, p.idCheck.expect))}</p>` : ''}
        ${code ? `<h2>${esc(t.codeH)}</h2><pre class="code"><code>${esc(code)}</code></pre>` : ''}
        ${p.sources?.length ? `<h2>${esc(t.sourcesH)}</h2><ul class="sources">${p.sources.map((s) => `<li>${esc(s.title)}${s.section ? `, ${esc(s.section)}` : ''}</li>`).join('')}</ul>` : ''}
        <div class="cta-box"><h2>${esc(t.cta)}</h2><p><a class="btn primary" href="${pre}/#download">BoardPilot</a> <a class="btn" href="/parts/${p.id}.json">${esc(t.json)}</a></p></div>
        ${boardLinks(p) ? `<h2>${esc(t.otherBoards(p.name))}</h2><p class="link-cloud">${boardLinks(p)}</p>` : ''}
        ${related ? `<h2>${esc(t.related)}</h2><div class="part-grid">${related}</div>` : ''}
        <p class="fine">${esc(t.license)}</p>
      </div>
    </main>
${footer}`,
    });
  }
  void byId;
  return pages;
}
