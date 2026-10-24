// BoardPilot site: screenshot tabs. The page language comes from <html lang>; English and Italian
// are separate pages (/ and /it/), built by scripts/build-site.mjs.

const CAPTIONS = {
  en: {
    workspace: 'The project page: 3D board, code with the checker’s fixes, the log, the assistant doing the work, and a warnings banner.',
    newproject: 'New project → Read from port: the board, then what is connected, each fact with its source; you confirm the guesses.',
    export: 'Export PDF: schematic, wiring and pin map, parts list and checks as a drawing set with a title block.',
    debug: 'The debug wizard found SDA and SCL crossed at the sensor, and shows which wires to swap.',
    test: 'I2C address scan, bus wiring diagram and the transaction decoded bit by bit.',
    monitor: 'Your firmware, live: plots colored like their source pin, serial console and memory.',
    library: 'Add, move, rotate and remove parts in 3D. Every part shows its pins and connections.',
    import: 'Paste a link: BoardPilot drafts the pins and 3D model, and you confirm before saving.',
    schematic: 'The project as a schematic: only the pins in use, net labels, power symbols, and the parts the rules suggest drawn dashed.',
    timing: 'Timing view: sampled pin levels and the decoded I2C transaction, with period, frequency and duty measured between cursors.',
    learn: 'A lesson with its example on the 3D board. Labs at the end are checked with live measurements.',
    code: 'Your sketch checked against the drawing: swapped I2C pins, the wrong baud rate, the LED on another pin.',
    home: 'Pick a task, or describe the problem in your own words.',
  },
  it: {
    workspace: 'La pagina del progetto: scheda 3D, codice con le correzioni del controllo, il registro, l’assistente che fa il lavoro e una barra degli avvisi.',
    newproject: 'Nuovo progetto → Leggi dalla porta: la scheda, poi cosa è collegato, ogni dato con la sua fonte; le ipotesi le confermi tu.',
    export: 'Esporta PDF: schema elettrico, collegamenti e mappa dei pin, distinta e controlli come serie di tavole con cartiglio.',
    debug: 'Il debug guidato ha trovato SDA e SCL invertiti sul sensore e mostra quali fili scambiare.',
    test: 'Scansione degli indirizzi I2C, schema del bus e transazione decodificata bit per bit.',
    monitor: 'Il tuo firmware in diretta: grafici colorati come il pin di origine, console seriale e memoria.',
    library: 'Aggiungi, sposta, ruota e rimuovi componenti in 3D. Ogni componente mostra pin e collegamenti.',
    import: 'Incolla un link: BoardPilot prepara pin e modello 3D, tu confermi prima di salvare.',
    schematic: 'Il progetto come schema elettrico: solo i pin usati, etichette di rete, simboli di alimentazione e i componenti suggeriti dalle regole tratteggiati.',
    timing: 'Vista temporale: livelli dei pin campionati e transazione I2C decodificata, con periodo, frequenza e duty misurati tra i cursori.',
    learn: 'Una lezione con il suo esempio sulla scheda 3D. I laboratori finali sono verificati con misure dal vivo.',
    code: 'Il tuo sketch confrontato con il disegno: pin I2C scambiati, baud rate sbagliato, LED su un altro pin.',
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
      img.srcset = b.dataset.srcset;
      img.src = b.dataset.src;
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
