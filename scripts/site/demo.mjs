// "Try it live": the real app with a simulated board, embedded in the landing page and on every
// board page. The page shows a screenshot and a button; nothing of the demo (about 800 KB
// compressed, in site/demo/, built by `npm run build:web`) loads until the visitor clicks.
// site/try-live.js swaps the screenshot for an iframe; on phones and without JavaScript the
// button simply opens the demo full-screen in a new tab.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const T = {
  en: {
    btn: 'Try it live',
    note: 'The real app with a simulated {board}, running in your browser. No install, nothing to plug in.',
    frame: 'BoardPilot live demo',
    full: 'Open full screen',
    alt: 'BoardPilot showing the {board} in 3D',
  },
  it: {
    btn: 'Provala dal vivo',
    note: 'La vera app con una scheda {board} simulata, nel tuo browser. Niente da installare, niente da collegare.',
    frame: 'Demo dal vivo di BoardPilot',
    full: 'Apri a schermo intero',
    alt: 'BoardPilot mostra la scheda {board} in 3D',
  },
};

const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

/** The demo's address: the board preselected with its weather-station bench, in the page language. */
export const demoUrl = (lang, boardId) => `/demo/#demo=board&board=${encodeURIComponent(boardId)}&lang=${lang === 'it' ? 'it' : 'en'}`;

/**
 * The embed block. `image` is the screenshot shown until the click (site-relative, e.g.
 * /img/boards/rpi-pico.jpg); `boardName` goes in the texts.
 */
export function tryLive({ lang, boardId, boardName, image, width = 1800, height = 1125, script = true, url: demoHref, alt, note }) {
  const t = T[lang === 'it' ? 'it' : 'en'];
  // `url`, `alt` and `note` override the board demo, e.g. a lesson's 3D preview on the learn pages.
  const url = demoHref ?? demoUrl(lang, boardId);
  return `<div class="try-live" data-src="${esc(url)}" data-title="${esc(t.frame)}" data-full="${esc(t.full)}">
          <img src="${esc(image)}" width="${width}" height="${height}" alt="${esc(alt ?? fill(t.alt, { board: boardName }))}" loading="lazy" decoding="async" />
          <div class="try-live-over">
            <a class="btn primary try-live-btn" href="${esc(url)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>${esc(t.btn)}</a>
            <p>${esc(note ?? fill(t.note, { board: boardName }))}</p>
          </div>
        </div>${script ? '\n        <script src="/try-live.js" defer></script>' : ''}`;
}

/* ---------------- Recorded conversations (app/renderer/replay/recordings/) ---------------- */

const CHAT_T = {
  en: {
    honest:
      'The recordings are real conversations with {model}, recorded once and replayed here: no AI is called while you watch. In the app you have the conversation yourself, with your own Claude, GPT or Gemini key or the free demo AI. Every proposal is checked by the same wiring rules as a drawing you make by hand.',
  },
  it: {
    honest:
      'Le registrazioni sono vere conversazioni con {model}, registrate una volta e riprodotte qui: mentre guardi non viene chiamata nessuna IA. Nell’app la conversazione la fai tu, con la tua chiave Claude, GPT o Gemini o con l’IA demo gratuita. Ogni proposta è verificata dalle stesse regole di cablaggio di un disegno fatto a mano.',
  },
};

export const chatUrl = (lang, id) => `/demo/#demo=chat&chat=${encodeURIComponent(id)}&lang=${lang === 'it' ? 'it' : 'en'}`;

/* ---------------- The landing page's demo gallery ---------------- */

const GALLERY_T = {
  en: {
    live: 'Live app',
    rec: 'Recording',
    script: 'Scripted',
    soon: 'Coming soon',
    newTag: 'New',
    watch: 'Watch the conversation →',
    open: 'Open the demo →',
    debugT: 'Find a crossed wire',
    debugD: 'The debug wizard checks a weather station whose sensor is “not found”: pull-ups, a bus scan, the swap test. It finds SDA and SCL crossed and shows which wires to swap.',
    debugAlt: 'The debug wizard showing SDA and SCL crossed at the BME280 sensor',
    simulated: 'simulated board',
    inLang: { en: 'in English', it: 'in Italian' },
    recAlt: 'The assistant’s checked proposal for “{title}” applied to the 3D board',
    displayT: 'Display Studio',
    displayD: 'See what your screen will show, pixel by pixel, and get the code that draws it. A recorded demo is on its way.',
    boardsD: 'Every board page has its own live demo with that board preselected: Pico, Arduino, STM32, nRF52, Teensy and more.',
    boardsCta: 'Pick a board →',
    stage: 'Now playing in the player above',
  },
  it: {
    live: 'App dal vivo',
    rec: 'Registrazione',
    script: 'Automatica',
    soon: 'In arrivo',
    newTag: 'Novità',
    watch: 'Guarda la conversazione →',
    open: 'Apri la demo →',
    debugT: 'Trova un filo invertito',
    debugD: 'Il debug guidato controlla una stazione meteo il cui sensore “non viene trovato”: pull-up, scansione del bus, test di scambio. Trova SDA e SCL invertiti e mostra quali fili scambiare.',
    debugAlt: 'Il debug guidato mostra SDA e SCL invertiti sul sensore BME280',
    simulated: 'scheda simulata',
    inLang: { en: 'in inglese', it: 'in italiano' },
    recAlt: 'La proposta verificata dell’assistente per “{title}” applicata alla scheda 3D',
    displayT: 'Display Studio',
    displayD: 'Guarda cosa mostrerà il tuo schermo, pixel per pixel, e ottieni il codice che lo disegna. Una demo registrata è in arrivo.',
    boardsD: 'Ogni pagina delle schede ha la sua demo dal vivo con quella scheda già scelta: Pico, Arduino, STM32, nRF52, Teensy e altre.',
    boardsCta: 'Scegli una scheda →',
    stage: 'In riproduzione nel riquadro qui sopra',
  },
};

/**
 * Titles and descriptions of the recordings in the other language (a recording carries only its own).
 * A recording missing here shows its own title and blurb.
 */
const RECORDING_T = {
  'weather-esp32': { it: ['Stazione meteo', 'Temperatura, umidità e pressione su un piccolo schermo, con un ESP32.'] },
  'plant-pico': { it: ['Irrigazione della pianta', 'Annaffia una pianta quando il terreno è secco, con un Raspberry Pi Pico.'] },
  'distance-uno': { it: ['Allarme di distanza', 'Suona quando qualcosa si avvicina a meno di 30 cm, con un Arduino Uno.'] },
  'night-lamp-it': { en: ['Night lamp', 'An LED that turns on when it gets dark, on an ESP32 (the conversation is in Italian).'] },
};

/** "claude-sonnet-5-5" → "Claude Sonnet 5.5" */
export const modelName = (id) =>
  String(id ?? '')
    .replace(/-(\d+)-(\d+)$/, ' $1.$2')
    .replace(/-(\d+)$/, ' $1')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** A recording that fills the Display Studio slot (added by the Display Studio work). */
export const isDisplayRecording = (r) => r.slot === 'display-studio' || /^display/.test(r.id);

export const debugUrl = (lang) => `/demo/#demo=debug&scenario=weather-station-swapped&lang=${lang === 'it' ? 'it' : 'en'}`;

function card({ kind, kindLabel, url, image, alt, title, text, meta, cta, tag }) {
  const img = image
    ? `<img src="${esc(image)}" srcset="${esc(image.replace(/\.jpg$/, '-900.jpg'))} 900w, ${esc(image)} 1800w" sizes="(max-width: 640px) 100vw, 380px" width="1800" height="1125" alt="${esc(alt)}" loading="lazy" decoding="async" />`
    : '<span class="demo-blank" aria-hidden="true"></span>';
  const poster = url
    ? `<a class="demo-poster" href="${esc(url)}" target="_blank" rel="noopener" data-demo="${esc(url)}" tabindex="-1" aria-hidden="true">${img}<span class="play"></span></a>`
    : `<div class="demo-poster soon">${img}</div>`;
  return `<article class="demo-card${url ? '' : ' is-soon'}" data-kind="${kind}">
              ${poster}
              <div class="demo-body">
                <span class="kind k-${kind}">${esc(kindLabel)}</span>${tag ? ` <span class="new-tag">${esc(tag)}</span>` : ''}
                <h3>${esc(title)}</h3>
                <p>${esc(text)}</p>
                ${meta ? `<p class="demo-meta">${esc(meta)}</p>` : ''}
                ${url && cta ? `<a class="more" href="${esc(url)}" target="_blank" rel="noopener" data-demo="${esc(url)}">${esc(cta)}</a>` : ''}
              </div>
            </article>`;
}

/**
 * The demo gallery under the live player: the scripted debugging demo, every recorded conversation,
 * the Display Studio slot (a placeholder until a recording with `slot: "display-studio"` or an id
 * starting with "display" exists) and a link to the per-board demos.
 * `poster(recording)` returns a site-relative screenshot (with a -900 copy) or null.
 */
export function demoGallery({ lang, recordings, boardName, poster, debugPoster = '/img/debug.jpg', boardsHref }) {
  const t = GALLERY_T[lang === 'it' ? 'it' : 'en'];
  const l = lang === 'it' ? 'it' : 'en';
  const recTitle = (r) => RECORDING_T[r.id]?.[l]?.[0] ?? r.title;
  const recText = (r) => (r.lang === l ? r.blurb : RECORDING_T[r.id]?.[l]?.[1] ?? r.blurb);
  const recCard = (r, tag) =>
    card({
      kind: 'rec',
      kindLabel: t.rec,
      url: chatUrl(lang, r.id),
      image: poster(r),
      alt: fill(t.recAlt, { title: recTitle(r) }),
      title: recTitle(r),
      text: recText(r),
      meta: `${modelName(r.model)} · ${boardName(r.board)} · ${t.inLang[r.lang] ?? r.lang}`,
      cta: t.watch,
      tag,
    });
  // Recordings in the page language first, then the others (stable).
  const chats = recordings.filter((r) => !isDisplayRecording(r)).sort((a, b) => Number(b.lang === l) - Number(a.lang === l));
  const display = recordings.find(isDisplayRecording);
  const cards = [
    card({ kind: 'script', kindLabel: t.script, url: debugUrl(lang), image: debugPoster, alt: t.debugAlt, title: t.debugT, text: t.debugD, meta: `${boardName('esp32-devkitc-30')} · ${t.simulated}`, cta: t.open }),
    ...chats.map((r) => recCard(r)),
    display ? recCard(display, t.newTag) : card({ kind: 'soon', kindLabel: t.soon, title: t.displayT, text: t.displayD }),
  ];
  return `<div class="demo-grid" data-now="${esc(t.stage)}">
            ${cards.join('\n            ')}
          </div>
          <p class="demo-boards"><span class="kind k-live">${esc(t.live)}</span> ${esc(t.boardsD)} <a class="more" href="${esc(boardsHref)}">${esc(t.boardsCta)}</a></p>
          <p class="chat-honest">${esc(fill(CHAT_T[l].honest, { model: modelName(chats[0]?.model ?? 'claude') }))}</p>`;
}
