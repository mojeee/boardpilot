// BoardPilot site: English / Italian switch and the screenshot tabs. English lives in the HTML.

const IT = {
  'nav.features': 'Funzioni',
  'nav.how': 'Come funziona',
  'nav.safety': 'Sicurezza',
  'nav.pricing': 'Prezzi',
  'nav.faq': 'Domande',
  'nav.download': 'Scarica',
  'hero.eyebrow': 'Per maker, studenti e sviluppatori firmware',
  'hero.title': 'Guarda dentro il tuo ESP32.',
  'hero.lead': 'BoardPilot ti guida nel lavoro embedded su una scheda vera. Ogni pin, filo e transazione sul bus è visibile in 3D, e ogni risposta mostra da dove viene.',
  'cta.arm': 'Scarica per Mac (Apple Silicon)',
  'cta.intel': 'Mac Intel',
  'cta.fine': 'Gratis per 30 giorni · macOS 12 o successivo · Funziona anche senza scheda, in modalità simulatore',
  'chip.measured': 'Misurato',
  'chip.crossed': 'SDA e SCL sono invertiti',
  'strip.pins': 'pin mappati dal datasheet Espressif',
  'strip.writes': 'scritture sulla scheda senza il tuo OK',
  'strip.sim': 'guasti simulati per imparare',
  'strip.lang': 'Italiano e inglese',
  'feat.eyebrow': 'Cosa fa',
  'feat.title': 'Da “non funziona” al filo esatto.',
  'f1.t': 'Una scheda 3D dal vivo',
  'f1.d': 'Generata dal datasheet: ogni pin è cliccabile e mostra funzioni, avvisi e livello in tempo reale. I fili si illuminano quando il bus comunica.',
  'f2.t': 'Un debug guidato che misura',
  'f2.d': 'Pull-up, scansione del bus, test di scambio SDA/SCL, ID del chip: l’app controlla passo passo e ti dice la causa, con le prove.',
  'f3.t': 'I2C decodificato, grafici dal vivo',
  'f3.d': 'Vedi start, indirizzo, ACK e bit dei dati sotto la forma d’onda. Traccia i valori dei sensori e la memoria mentre gira il tuo firmware.',
  'f4.t': 'Libreria componenti, da qualsiasi link',
  'f4.d': 'Aggiungi sensori, display e pulsanti, spostali e ruotali in 3D. Incolla il link di un prodotto e BoardPilot prepara il componente e il suo modello 3D, che controlli tu.',
  'f5.t': 'Cablaggio controllato mentre costruisci',
  'f5.d': 'Pin della flash, pin di sola lettura, pin di strapping, 5 V su un componente a 3,3 V, bus invertiti, massa mancante: segnalati sul pin, prima di dare tensione.',
  'f6.t': 'Un assistente onesto',
  'f6.d': 'AI facoltativa che dichiara solo ciò che ha misurato, etichetta le ipotesi come suggerimenti e cita la sezione del datasheet per tutto il resto.',
  'tab.debug': 'Debug',
  'tab.test': 'Test hardware',
  'tab.monitor': 'Monitor',
  'tab.library': 'Libreria componenti',
  'tab.import': 'Importa da link',
  'tab.home': 'Home',
  'cap.debug': 'Il debug guidato ha trovato SDA e SCL invertiti sul sensore e mostra quali fili scambiare.',
  'cap.test': 'Scansione degli indirizzi I2C, schema del bus e transazione decodificata bit per bit.',
  'cap.monitor': 'Il tuo firmware in diretta: grafici colorati come il pin di origine, console seriale e memoria.',
  'cap.library': 'Aggiungi, sposta, ruota e rimuovi componenti in 3D. Ogni componente mostra pin e collegamenti.',
  'cap.import': 'Incolla un link: BoardPilot prepara pin e modello 3D, tu confermi prima di salvare.',
  'cap.home': 'Scegli un’attività, o descrivi il problema con parole tue.',
  'how.eyebrow': 'Come funziona',
  'how.title': 'Prima guarda. Chiede solo ciò che non vede.',
  's1.t': 'Collega',
  's1.d': 'BoardPilot trova la porta, legge chip, dimensione della flash e MAC. Nessuna porta? Ti guida tra cavo, driver e pulsante BOOT.',
  's2.t': 'Scegli un’attività',
  's2.d': 'Collega, nuovo progetto, flash, debug, monitor, test, report. Oppure descrivi il problema con parole tue.',
  's3.t': 'Ottieni la causa, con le prove',
  's3.d': 'Ogni risultato elenca cosa è stato misurato, cosa dice il datasheet e cosa fare dopo. Con un clic crei un report da condividere.',
  'safe.eyebrow': 'Sicurezza',
  'safe.title': 'La tua scheda, il tuo programma, la tua scelta.',
  'safe.lead': 'BoardPilot di base legge soltanto. Qualsiasi scrittura sulla scheda richiede la tua conferma esplicita, e prima salva una copia del tuo firmware.',
  'safe.1': 'Backup completo della flash prima della prima scrittura, ripristino con un clic',
  'safe.2': 'L’AI può chiedere di scrivere, ma solo tu puoi confermare',
  'safe.3': 'Rifiuta i pin della flash e le uscite sui pin di sola lettura, anche nel firmware',
  'safe.4': 'Non mostra mai una tensione che non ha misurato',
  'safe.5': 'Modalità simulatore: impara e fai demo senza alcun hardware',
  'price.eyebrow': 'Prezzi',
  'price.title': 'Prova tutto per 30 giorni.',
  'p1.t': 'Prova gratuita',
  'p1.per': 'per 30 giorni',
  'p1.a': 'Tutte le funzioni, senza account',
  'p1.b': 'Simulatore e schede reali',
  'p1.c': 'I tuoi dati restano sul tuo Mac',
  'p1.cta': 'Scarica',
  'p2.t': 'Licenza',
  'p2.price': 'In arrivo',
  'p2.per': 'una chiave per persona',
  'p2.a': 'Continua a usare BoardPilot dopo la prova',
  'p2.b': 'Tutti gli aggiornamenti della stessa versione principale',
  'p2.c': 'Sostieni lo sviluppo di nuove schede (ESP32-S3, STM32)',
  'p2.cta': 'Richiedi una chiave di licenza',
  'p3.t': 'Scuole e team',
  'p3.price': 'Chiedici',
  'p3.per': 'per postazione',
  'p3.a': 'Licenze per classi e laboratori',
  'p3.b': 'Scenari del simulatore per esercitazioni',
  'p3.c': 'Italiano e inglese',
  'p3.cta': 'Contatti',
  'price.fine': 'BoardPilot è source-available: il codice è pubblico su GitHub, puoi leggerlo, compilarlo e contribuire. Dopo la prova serve una chiave di licenza.',
  'faq.title': 'Domande',
  q1: 'BoardPilot è open source?',
  a1: 'È source-available. Tutto il codice è pubblico su GitHub con la BoardPilot License: puoi leggerlo, studiarlo, modificarlo e compilarlo. Dopo i 30 giorni di prova serve una chiave di licenza. Il firmware (agente diagnostico e libreria BoardPilotProbe) è sotto licenza MIT.',
  q2: 'Quali schede supporta?',
  a2: 'Oggi: l’ESP32 DevKit a 30 pin (ESP32-WROOM-32). Le schede sono file di dati, quindi i prossimi sono ESP32-S3 e STM32 con ST-Link.',
  q3: 'macOS dice che l’app non può essere aperta.',
  a3: 'Le prime versioni non sono ancora firmate da Apple. Fai clic destro su BoardPilot in Applicazioni e scegli Apri, oppure vai in Impostazioni di Sistema → Privacy e sicurezza e fai clic su Apri comunque.',
  q4: 'Mi serve una scheda per provarlo?',
  a4: 'No. La modalità simulatore fa girare tutta l’app con una scheda virtuale e guasti realistici: fili invertiti, un finto BME280, cali di tensione, baud rate sbagliato.',
  q5: 'Serve internet o un account AI?',
  a5: 'No. Controlli, misure e simulatore funzionano offline. L’assistente AI è facoltativo e usa la tua chiave API Anthropic.',
  q6: 'Cosa installa sulla mia scheda?',
  a6: 'Solo se confermi: un piccolo agente diagnostico che permette all’app di leggere i pin e fare test sul bus. Prima salva il tuo programma, che torna con un clic.',
  'foot.license': 'Licenza',
  'foot.releases': 'Versioni',
  'foot.support': 'Assistenza',
};

const CAPTIONS_EN = {
  debug: 'The debug wizard found SDA and SCL crossed at the sensor, and shows which wires to swap.',
  test: 'I2C address scan, bus wiring diagram and the transaction decoded bit by bit.',
  monitor: 'Your firmware, live: plots colored like their source pin, serial console and memory.',
  library: 'Add, move, rotate and remove parts in 3D. Every part shows its pins and connections.',
  import: 'Paste a link: BoardPilot drafts the pins and 3D model, and you confirm before saving.',
  home: 'Pick a task, or describe the problem in your own words.',
};

const EN = {};
let lang = 'en';
let shot = 'debug';

function apply(l) {
  lang = l;
  document.documentElement.lang = l;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n');
    if (!(k in EN)) EN[k] = el.textContent;
    el.textContent = l === 'it' && IT[k] ? IT[k] : EN[k];
  });
  document.querySelectorAll('.lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === l));
  setCaption();
  try {
    localStorage.setItem('bp.lang', l);
  } catch (e) {
    /* storage unavailable */
  }
}

function setCaption() {
  const cap = document.getElementById('shot-caption');
  cap.textContent = lang === 'it' ? IT[`cap.${shot}`] : CAPTIONS_EN[shot];
}

document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => apply(b.dataset.lang)));

document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    shot = b.dataset.shot;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    const img = document.getElementById('shot');
    img.style.opacity = '0';
    setTimeout(() => {
      img.src = `img/${shot}.jpg`;
      img.onload = () => (img.style.opacity = '1');
    }, 150);
    setCaption();
  }),
);

let initial = 'en';
try {
  initial = localStorage.getItem('bp.lang') || (navigator.language || '').slice(0, 2);
} catch (e) {
  /* ignore */
}
apply(initial === 'it' ? 'it' : 'en');
