// Italian translations. Key = the exact English text passed to t().
// Scope: wizard panel UI (app/renderer/wizard). Flow step texts live in ./flows.ts.
const it: Record<string, string> = {
  '{message} Pick the closest button instead.': '{message} Scegli invece il pulsante più vicino.',
  '{reason} Pick the closest button, or ask the assistant below.':
    '{reason} Scegli il pulsante più vicino, oppure chiedi all’assistente qui sotto.',
  'You wrote: “{text}”. The assistant matched it to: {option} (suggestion; change it by running the flow again).':
    'Hai scritto: “{text}”. L’assistente l’ha abbinato a: {option} (suggerimento; puoi cambiarlo rifacendo la procedura).',
  'Or describe it in your own words': 'Oppure descrivilo con parole tue',
  'e.g. the sensor always shows 0 degrees': 'es. il sensore segna sempre 0 gradi',
  Send: 'Invia',
  'Pick from the library': 'Scegli dalla libreria',
  'Type the model printed on it': 'Scrivi il modello stampato sopra',
  'e.g. GY-BME280': 'es. GY-BME280',
  Use: 'Usa',
  'Take a photo': 'Scatta una foto',
  'Upload the datasheet': 'Carica il datasheet',
  'Choose PDF…': 'Scegli PDF…',
  'Choose .bin file…': 'Scegli file .bin…',
  Measured: 'Misurato',
  'From documentation': 'Dalla documentazione',
  Suggestion: 'Suggerimento',
  Evidence: 'Prove',
  'What to do next': 'Cosa fare adesso',
  'Sources: {list}': 'Fonti: {list}',
  'Run the checks again': 'Ripeti i controlli',
  'Create report': 'Crea report',
  'Restore my firmware': 'Ripristina il mio firmware',
  '{title}?': '{title}?',
  Confirm: 'Conferma',
  'Review and confirm…': 'Controlla e conferma…',
  'Not now': 'Non ora',
  'Done, check it': 'Fatto, controlla',
  'The step “{step}” failed: {summary}. Explain in plain words what went wrong and what I should do.':
    'Il passaggio “{step}” non è riuscito: {summary}. Spiegami con parole semplici cosa è andato storto e cosa devo fare.',
  'Explain what went wrong': 'Spiega cosa è andato storto',
  Stop: 'Ferma',
  'Ask about this step…': 'Chiedi su questo passaggio…',
  // default fallback label when a step defines none
  'Try again': 'Riprova',
  'Started: {title}': 'Avviato: {title}',
  '{step}: {summary}': '{step}: {summary}',
  'Fallback: {label}': 'Alternativa: {label}',
  'You chose: {label}': 'Hai scelto: {label}',
  'You wrote: “{text}”': 'Hai scritto: “{text}”',
  'You confirmed.': 'Hai confermato.',
  'You cancelled.': 'Hai annullato.',
  'You entered: {value}': 'Hai inserito: {value}',
  'You said it is done. Checking…': 'Hai detto che è fatto. Controllo…',
  'Something went wrong in this step: {error}': 'Qualcosa è andato storto in questo passo: {error}',
};

export default it;
