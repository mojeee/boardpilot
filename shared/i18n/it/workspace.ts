// Italian translations. Key = the exact English text passed to t().
// Workspace redesign: top menu, panels, the Code panel and its editor, code suggestions.
const it: Record<string, string> = {
  // Top menu (MENU in TaskRail.tsx, translated at render time)
  Connect: 'Collega',
  Debug: 'Debug',
  'Your project: the 3D board, the code, the log and the assistant': 'Il tuo progetto: la scheda 3D, il codice, il registro e l’assistente',

  // Panels
  'Right panel': 'Pannello destro',
  'Project tools': 'Strumenti del progetto',
  'Parts, pins, templates, starter code and calculators': 'Componenti, pin, modelli, codice di partenza e calcolatori',
  'Show the assistant (⌘I)': 'Mostra l’assistente (⌘I)',
  'Hide the panel (⌘I)': 'Nascondi il pannello (⌘I)',
  'Code and log': 'Codice e registro',
  Log: 'Registro',
  'Run story': 'Storia dell’esecuzione',
  'Restore the panel size': 'Ripristina la dimensione del pannello',
  'Expand the panel': 'Allarga il pannello',
  'Hide the panel (⌘J)': 'Nascondi il pannello (⌘J)',
  'Show the panel (⌘J)': 'Mostra il pannello (⌘J)',

  // Code panel
  'Code for the parts and pins in your drawing, with its source': 'Codice per i componenti e i pin del tuo disegno, con la sua fonte',
  'Thinking…': 'Ci penso…',
  'Suggest code': 'Suggerisci codice',
  'The simulator runs template projects step by step. For your own code: flash it to the board; the BoardPilotProbe markers (probe.step) then show each step live.':
    'Il simulatore esegue passo per passo i progetti dai modelli. Per il tuo codice: caricalo sulla scheda; i marcatori BoardPilotProbe (probe.step) mostrano poi ogni passo dal vivo.',
  'Run in simulator': 'Esegui nel simulatore',
  'Save the code as a file…': 'Salva il codice in un file…',
  'Flash to board': 'Carica sulla scheda',
  State: 'Stato',
  Step: 'Passo',
  Values: 'Valori',
  'Show the code': 'Mostra il codice',
  'Write or paste your sketch in the Code panel below; it is checked against the drawing as you type.':
    'Scrivi o incolla il tuo sketch nel pannello Codice qui sotto; viene confrontato con il disegno mentre scrivi.',
  'Code of {file}': 'Codice di {file}',
  'Write your sketch here, open a file, or use “Suggest code” to start from the parts in your drawing.':
    'Scrivi qui il tuo sketch, apri un file, oppure usa “Suggerisci codice” per partire dai componenti del tuo disegno.',
  'Fix: {code}': 'Correggi: {code}',
  'Code suggestion': 'Suggerimento di codice',
  source: 'fonte',
  'Accept · Tab': 'Accetta · Tab',
  'Explain this code suggestion in plain words: {code}': 'Spiega in parole semplici questo suggerimento di codice: {code}',
  Explain: 'Spiega',
  'Dismiss · Esc': 'Ignora · Esc',
  'From the parts library': 'Dalla libreria dei componenti',
  'The code is in the Code panel below, with the running line highlighted. The story of the run is in the Log panel.':
    'Il codice è nel pannello Codice qui sotto, con la riga in esecuzione evidenziata. La storia dell’esecuzione è nel pannello Registro.',
  'Run until the next thing happens, then pause': 'Esegui fino al prossimo evento, poi fermati',
  'Replace with starter code for your drawing': 'Sostituisci con il codice di partenza per il tuo disegno',
  'Starter code for your drawing': 'Codice di partenza per il tuo disegno',
  'Sets up every part in the drawing on the pins it is wired to, and prints its readings once a second.':
    'Configura ogni componente del disegno sui pin a cui è collegato e stampa le sue letture una volta al secondo.',
  'An empty sketch for this board. Add parts to the drawing to get code for them.': 'Uno sketch vuoto per questa scheda. Aggiungi componenti al disegno per avere il loro codice.',
  'Careful: the code checker finds a problem in this suggestion: {problem}': 'Attenzione: il controllo del codice trova un problema in questo suggerimento: {problem}',

  // Assistant (main process)
  'The assistant could not write that code.': 'L’assistente non è riuscito a scrivere quel codice.',
  'Describe what the code should do in other words.': 'Descrivi con altre parole cosa deve fare il codice.',
  'Try again, or use the starter code from the drawing.': 'Riprova, oppure usa il codice di partenza dal disegno.',
  'Suggested code': 'Codice suggerito',
};

export default it;
