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
export function tryLive({ lang, boardId, boardName, image, width = 1800, height = 1125, script = true }) {
  const t = T[lang === 'it' ? 'it' : 'en'];
  const url = demoUrl(lang, boardId);
  return `<div class="try-live" data-src="${esc(url)}" data-title="${esc(t.frame)}" data-full="${esc(t.full)}">
          <img src="${esc(image)}" width="${width}" height="${height}" alt="${esc(fill(t.alt, { board: boardName }))}" loading="lazy" decoding="async" />
          <div class="try-live-over">
            <a class="btn primary try-live-btn" href="${esc(url)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>${esc(t.btn)}</a>
            <p>${esc(fill(t.note, { board: boardName }))}</p>
          </div>
        </div>${script ? '\n        <script src="/try-live.js" defer></script>' : ''}`;
}
