// BoardPilot site: screenshot tabs. The page language comes from <html lang>; English and Italian
// are separate pages (/ and /it/), built by scripts/build-site.mjs.

const CAPTIONS = {
  en: {
    debug: 'The debug wizard found SDA and SCL crossed at the sensor, and shows which wires to swap.',
    test: 'I2C address scan, bus wiring diagram and the transaction decoded bit by bit.',
    monitor: 'Your firmware, live: plots colored like their source pin, serial console and memory.',
    library: 'Add, move, rotate and remove parts in 3D. Every part shows its pins and connections.',
    import: 'Paste a link: BoardPilot drafts the pins and 3D model, and you confirm before saving.',
    home: 'Pick a task, or describe the problem in your own words.',
  },
  it: {
    debug: 'Il debug guidato ha trovato SDA e SCL invertiti sul sensore e mostra quali fili scambiare.',
    test: 'Scansione degli indirizzi I2C, schema del bus e transazione decodificata bit per bit.',
    monitor: 'Il tuo firmware in diretta: grafici colorati come il pin di origine, console seriale e memoria.',
    library: 'Aggiungi, sposta, ruota e rimuovi componenti in 3D. Ogni componente mostra pin e collegamenti.',
    import: 'Incolla un link: BoardPilot prepara pin e modello 3D, tu confermi prima di salvare.',
    home: 'Scegli un’attività, o descrivi il problema con parole tue.',
  },
};

const lang = document.documentElement.lang === 'it' ? 'it' : 'en';
const img = document.getElementById('shot');
const cap = document.getElementById('shot-caption');

document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    const shot = b.dataset.shot;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    if (!img) return;
    img.style.opacity = '0';
    setTimeout(() => {
      img.srcset = `/img/${shot}-900.jpg 900w, /img/${shot}.jpg 1800w`;
      img.src = `/img/${shot}.jpg`;
      img.onload = () => (img.style.opacity = '1');
    }, 150);
    if (cap) cap.textContent = CAPTIONS[lang][shot];
  }),
);

// First visit from an Italian browser: offer the Italian page once (no automatic redirect, so search
// engines always see both versions).
try {
  if (lang === 'en' && !localStorage.getItem('bp.langHint') && (navigator.language || '').toLowerCase().startsWith('it')) {
    localStorage.setItem('bp.langHint', '1');
    const a = document.querySelector('.lang a[hreflang="it"]');
    if (a) a.classList.add('pulse');
  }
} catch (e) {
  /* storage unavailable */
}
