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

/* ---------------- "Build a project by chatting": recorded conversations ---------------- */

const CHAT_T = {
  en: {
    btn: 'Watch the conversation',
    note: 'A real conversation with Claude, recorded and replayed in your browser: “{title}” on the {board}.',
    alt: 'BoardPilot’s assistant proposing parts and wiring for “{title}”, with the result on the 3D board',
    more: 'More recorded conversations:',
    honest:
      'These are real conversations with Claude ({model}), recorded once and replayed here: no AI is called while you watch. In the app you have the conversation yourself, with your own Claude, GPT or Gemini key or the free demo AI. Every proposal is checked by the same wiring rules as a drawing you make by hand.',
  },
  it: {
    btn: 'Guarda la conversazione',
    note: 'Una vera conversazione con Claude, registrata e riprodotta nel tuo browser: “{title}” sulla {board}.',
    alt: 'L’assistente di BoardPilot propone componenti e collegamenti per “{title}”, con il risultato sulla scheda 3D',
    more: 'Altre conversazioni registrate:',
    honest:
      'Sono vere conversazioni con Claude ({model}), registrate una volta e riprodotte qui: mentre guardi non viene chiamata nessuna IA. Nell’app la conversazione la fai tu, con la tua chiave Claude, GPT o Gemini o con l’IA demo gratuita. Ogni proposta è verificata dalle stesse regole di cablaggio di un disegno fatto a mano.',
  },
};

export const chatUrl = (lang, id) => `/demo/#demo=chat&chat=${encodeURIComponent(id)}&lang=${lang === 'it' ? 'it' : 'en'}`;

/**
 * The recorded-chat block for the landing page. `recordings` are the files of
 * app/renderer/replay/recordings/ ({ id, title, blurb, board, lang, model }); `boardName(id)` names a board.
 * The first recording in the page language is the main one; the others are links.
 */
export function chatDemo({ lang, recordings, boardName, image, width = 1800, height = 1125 }) {
  const t = CHAT_T[lang === 'it' ? 'it' : 'en'];
  if (!recordings.length) return '';
  // Stable sort: the caller's order, with recordings in the page language first.
  const ordered = [...recordings].sort((a, b) => Number(b.lang === lang) - Number(a.lang === lang));
  const [main, ...rest] = ordered;
  const box = tryLive({
    lang,
    boardId: main.board,
    boardName: boardName(main.board),
    image,
    width,
    height,
    script: false,
    url: chatUrl(lang, main.id),
    alt: fill(t.alt, { title: main.title }),
    note: fill(t.note, { title: main.title, board: boardName(main.board) }),
  }).replace(`>${T[lang === 'it' ? 'it' : 'en'].btn}</a>`, `>${esc(t.btn)}</a>`);
  const links = rest
    .map((r) => `<li><a href="${esc(chatUrl(lang, r.id))}" target="_blank" rel="noopener"><b>${esc(r.title)}</b> <span>${esc(r.blurb)}</span></a></li>`)
    .join('\n            ');
  return `<div class="wrap try-wrap">${box}</div>
          ${rest.length ? `<p class="chat-more">${esc(t.more)}</p>\n          <ul class="chat-list">\n            ${links}\n          </ul>` : ''}
          <p class="chat-honest">${esc(fill(t.honest, { model: main.model }))}</p>`;
}
