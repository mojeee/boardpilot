// Italian translations. Key = the exact English text passed to t().
// Scope: timing view in Monitor (components/TimingPanel.tsx, shared/timing.ts) and its PNG export.
const it: Record<string, string> = {
  'Timing': 'Tempi',
  'sampled': 'campionato',
  'board time': 'tempo scheda',
  'Serial pin: not sampled by the agent.': 'Pin seriale: l’agente non lo campiona.',
  'no samples': 'nessun campione',
  'PWM at {hz} is faster than the sampling: these are snapshots, not the real waveform.':
    'PWM a {hz} è più veloce del campionamento: questi sono istantanei, non la vera forma d’onda.',
  'I2C decoded': 'I2C decodificato',
  'agent trace, not sampled': 'traccia dell’agente, non campionata',
  'The last I2C command returned no steps (no device answered).': 'L’ultimo comando I2C non ha restituito passi (nessun dispositivo ha risposto).',
  'Waiting for at least two samples to measure the sample rate.': 'In attesa di almeno due campioni per misurare la frequenza di campionamento.',
  'Sampled at {hz}: pulses shorter than {ms} can be missed.': 'Campionato a {hz}: gli impulsi più brevi di {ms} possono sfuggire.',
  'Click a row name to measure its period, frequency and duty cycle.': 'Clicca il nome di una riga per misurarne periodo, frequenza e duty cycle.',
  'Between the cursors on {pin}:': 'Tra i cursori su {pin}:',
  'Over the visible window on {pin}:': 'Nella finestra visibile su {pin}:',
  'This row is a measured voltage (ADC). Period and duty cycle need a digital row.':
    'Questa riga è una tensione misurata (ADC). Periodo e duty cycle richiedono una riga digitale.',
  'No samples in this range.': 'Nessun campione in questo intervallo.',
  'A level lasted only one sample, so the signal may change faster than the sampling can show. No period is given.':
    'Un livello è durato un solo campione: il segnale potrebbe cambiare più in fretta di quanto il campionamento riesca a mostrare. Nessun periodo indicato.',
  'Not enough edges: a full cycle needs 3 edges and {n} were seen. Nothing is guessed.':
    'Fronti insufficienti: un ciclo completo richiede 3 fronti e ne sono stati visti {n}. Niente viene indovinato.',
  'Period': 'Periodo',
  'Frequency': 'Frequenza',
  'from {n} sampled edges ({cycles} full cycles)': 'da {n} fronti campionati ({cycles} cicli completi)',
  'BoardPilot timing. Sampled at {hz} (board clock): pulses shorter than {ms} can be missed. The I2C lane is decoded by the agent, not sampled.':
    'Tempi BoardPilot. Campionato a {hz} (orologio della scheda): gli impulsi più brevi di {ms} possono sfuggire. La corsia I2C è decodificata dall’agente, non campionata.',
  'BoardPilot timing (sampled).': 'Tempi BoardPilot (campionati).',
  'Timing picture saved to {path}.': 'Immagine dei tempi salvata in {path}.',
  'Timing samples saved to {path}.': 'Campioni dei tempi salvati in {path}.',
  'Paused with the Monitor’s Pause button.': 'In pausa con il pulsante Pausa del Monitor.',
  'Zoom out': 'Riduci',
  'Zoom in': 'Ingrandisci',
  'Time shown on screen': 'Tempo mostrato sullo schermo',
  'Show all': 'Mostra tutto',
  'Clear cursors': 'Togli i cursori',
  'Export PNG': 'Esporta PNG',
  'Export CSV': 'Esporta CSV',
  'Clear samples': 'Cancella i campioni',
  'No samples yet. Press “Stream live pins” above to see the pins over time.':
    'Ancora nessun campione. Premi “Mostra i pin dal vivo” qui sopra per vedere i pin nel tempo.',
  'Click the waveform to place cursor A, then B. Drag a cursor to move it. Wheel to zoom, Shift+wheel to scroll.':
    'Clicca la forma d’onda per mettere il cursore A, poi B. Trascina un cursore per spostarlo. Rotella per lo zoom, Maiusc+rotella per scorrere.',
  '± one sample ({ms})': '± un campione ({ms})',
  'Edges are drawn as slopes across the time between two samples: the real edge is somewhere in there.':
    'I fronti sono disegnati come rampe lungo il tempo tra due campioni: il fronte vero è da qualche parte lì dentro.',
  'Analog pins (ADC) show their measured voltage as a line, not as levels.': 'I pin analogici (ADC) mostrano la tensione misurata come linea, non come livelli.',
  'The I2C lane is the agent’s decoded transaction, in order but not to time scale; the dotted line marks about when its reply arrived.':
    'La corsia I2C è la transazione decodificata dall’agente, in ordine ma non in scala di tempo; la linea tratteggiata indica circa quando è arrivata la risposta.',
  'The picture could not be saved.': 'Non è stato possibile salvare l’immagine.',
  'Try the export again.': 'Riprova l’esportazione.',
};
export default it;
