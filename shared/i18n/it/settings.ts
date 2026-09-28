// Italian translations for the AI settings. Key = the exact English text passed to t().
const it: Record<string, string> = {
  /* ---------- AI settings dialog ---------- */
  'AI settings': 'Impostazioni AI',
  'Pick the AI service and paste your own API key. Every check and measurement works without AI.':
    'Scegli il servizio AI e incolla la tua chiave API. Tutti i controlli e le misure funzionano anche senza AI.',
  'Claude by Anthropic. Careful answers and strong tool use. The default for BoardPilot.':
    'Claude di Anthropic. Risposte accurate e ottimo uso degli strumenti. La scelta predefinita di BoardPilot.',
  'GPT by OpenAI. Uses a key from the OpenAI platform.': 'GPT di OpenAI. Usa una chiave della piattaforma OpenAI.',
  'Gemini by Google. Uses a key from Google AI Studio.': 'Gemini di Google. Usa una chiave di Google AI Studio.',
  'in use': 'in uso',
  'Key saved {hint}': 'Chiave salvata {hint}',
  'Key from .env.local {hint}': 'Chiave da .env.local {hint}',
  'No key yet': 'Nessuna chiave',
  'API key for {provider}': 'Chiave API per {provider}',
  'Get a key': 'Ottieni una chiave',
  'Leave empty to keep the current key ({hint})': 'Lascia vuoto per tenere la chiave attuale ({hint})',
  'Paste your key here': 'Incolla qui la tua chiave',
  'This Mac cannot encrypt keys right now, so keys cannot be saved here. A key in .env.local still works.':
    'Questo Mac ora non può cifrare le chiavi, quindi qui non si possono salvare. Una chiave in .env.local funziona comunque.',
  'Loading…': 'Caricamento…',
  'Load models': 'Carica modelli',
  'Recommended: {model}': 'Consigliato: {model}',
  'Your key is stored encrypted on this computer. Requests go directly from the app to the provider you choose.':
    'La chiave è salvata cifrata su questo computer. Le richieste vanno direttamente dall’app al fornitore che scegli.',
  'Remove key': 'Rimuovi chiave',
  'Testing…': 'Verifica in corso…',
  'Test connection': 'Prova la connessione',
  'Save': 'Salva',
  '1 model found.': 'Trovato 1 modello.',
  '{n} models found.': 'Trovati {n} modelli.',
  'It works: {provider} answered in {ms} ms using {model}.': 'Funziona: {provider} ha risposto in {ms} ms con {model}.',
  'The saved key was removed.': 'La chiave salvata è stata rimossa.',

  /* ---------- top bar and assistant panel ---------- */
  '{provider}, model {model}. Click to change.': '{provider}, modello {model}. Clicca per cambiare.',
  'Set up the AI assistant': 'Configura l’assistente AI',
  'AI is off: add a key in AI settings': 'AI spenta: aggiungi una chiave nelle impostazioni AI',
  'The assistant is off because no API key is set. Add your own key for Claude, GPT or Gemini. Every check and measurement works without it.':
    'L’assistente è spento perché manca la chiave API. Aggiungi la tua chiave per Claude, GPT o Gemini. Tutti i controlli e le misure funzionano anche senza.',
  'Open AI settings': 'Apri le impostazioni AI',

  /* ---------- main process: assistant and provider errors ---------- */
  'Open AI settings (the AI chip at the top), pick a provider and paste your API key. Everything else works without it.':
    'Apri le impostazioni AI (il chip AI in alto), scegli un fornitore e incolla la tua chiave API. Tutto il resto funziona anche senza.',
  'Paste an API key first.': 'Prima incolla una chiave API.',
  'The model list comes from the provider and needs your key.': 'L’elenco dei modelli arriva dal fornitore e richiede la tua chiave.',
  'The test sends one short message to the provider with your key.': 'La prova invia un breve messaggio al fornitore con la tua chiave.',
  '{provider} did not accept the API key.': '{provider} non ha accettato la chiave API.',
  'Open AI settings (the AI chip at the top), check the key or paste a new one.':
    'Apri le impostazioni AI (il chip AI in alto), controlla la chiave o incollane una nuova.',
  'Your {provider} account has no credit or quota left.': 'Il tuo account {provider} non ha più credito o quota.',
  'Check billing on the provider website, or pick another provider in AI settings.':
    'Controlla la fatturazione sul sito del fornitore, oppure scegli un altro fornitore nelle impostazioni AI.',
  'The AI service took too long to answer.': 'Il servizio AI ha impiegato troppo tempo a rispondere.',
  'Try again. A shorter question can help.': 'Riprova. Una domanda più breve può aiutare.',
  'The model "{model}" is not available with this key.': 'Il modello "{model}" non è disponibile con questa chiave.',
  'Open AI settings, press Load models and pick another model.':
    'Apri le impostazioni AI, premi Carica modelli e scegli un altro modello.',
  '{provider} rejected the request: {msg}': '{provider} ha rifiutato la richiesta: {msg}',
  'Try again. If it repeats, pick another model in AI settings.':
    'Riprova. Se si ripete, scegli un altro modello nelle impostazioni AI.',
  'Turn on the AI assistant in AI settings (add an API key), or use the product page link, or add the part by hand.':
    'Attiva l’assistente AI nelle impostazioni AI (aggiungi una chiave API), oppure usa il link della pagina prodotto, oppure aggiungi il componente a mano.',

  /* ---------- main process: settings storage ---------- */
  'Unknown AI provider.': 'Fornitore AI sconosciuto.',
  'Pick Claude, GPT or Gemini.': 'Scegli Claude, GPT o Gemini.',
  'That key looks too short. Copy the whole key from the provider website.':
    'La chiave sembra troppo corta. Copia la chiave intera dal sito del fornitore.',
  'That key contains spaces or line breaks. Copy only the key itself.':
    'La chiave contiene spazi o a capo. Copia solo la chiave.',
  'That model name is not valid.': 'Il nome del modello non è valido.',
  'Pick a model from the list, or press Load models.': 'Scegli un modello dall’elenco, oppure premi Carica modelli.',
  'Paste the key again.': 'Incolla di nuovo la chiave.',
  'This Mac cannot encrypt the key right now, so it was not saved.':
    'Questo Mac ora non può cifrare la chiave, quindi non è stata salvata.',
  'Put the key in .env.local in the project folder instead (for example OPENAI_API_KEY=...), then restart the app.':
    'Metti invece la chiave in .env.local nella cartella del progetto (per esempio OPENAI_API_KEY=...), poi riavvia l’app.',
  'The settings could not be saved: {msg}': 'Non è stato possibile salvare le impostazioni: {msg}',
  'Check that the disk is not full, then try again.': 'Controlla che il disco non sia pieno, poi riprova.',
};

export default it;
