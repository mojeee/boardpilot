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

  // Project tabs
  'Demo bench': 'Banco demo',
  Untitled: 'Senza nome',
  'Double-click to rename': 'Doppio clic per rinominare',
  'The checks found problems': 'I controlli hanno trovato problemi',
  'The checks found things to look at': 'I controlli hanno trovato cose da guardare',
  'Project name': 'Nome del progetto',
  'Close {name}': 'Chiudi {name}',
  'Open projects': 'Progetti aperti',
  'Closed “{name}”. ⌘⇧T opens it again.': '“{name}” chiuso. ⌘⇧T lo riapre.',

  // New project dialog
  'New empty project on {board}. Add parts from the Parts button, or ask the assistant.':
    'Nuovo progetto vuoto su {board}. Aggiungi componenti con il pulsante Componenti, oppure chiedi all’assistente.',
  'Start empty, let BoardPilot read the board on your USB port, or begin from a template.':
    'Parti da zero, lascia che BoardPilot legga la scheda sulla porta USB, oppure inizia da un modello.',
  Blank: 'Vuoto',
  'Pick a board and add parts yourself, or describe the project to the assistant.': 'Scegli una scheda e aggiungi tu i componenti, oppure descrivi il progetto all’assistente.',
  'Read from port': 'Leggi dalla porta',
  'Plug in your board. BoardPilot finds it, identifies the chip and looks for what is connected.':
    'Collega la scheda. BoardPilot la trova, identifica il chip e cerca cosa è collegato.',
  Template: 'Modello',
  '{n} ready projects that build themselves on your board: blink, weather station, plant watering…':
    '{n} progetti pronti che si costruiscono da soli sulla tua scheda: blink, stazione meteo, irrigazione…',

  // Describe it
  'The assistant could not help with that project.': 'L’assistente non è riuscito ad aiutarti con quel progetto.',
  'Describe what the project should do in other words.': 'Descrivi con altre parole cosa deve fare il progetto.',
  'Try again, or pick a template.': 'Riprova, oppure scegli un modello.',
  'Parts named in your description, from the parts library.': 'I componenti citati nella tua descrizione, dalla libreria dei componenti.',
  'No part of the library matched your words. Try naming the parts, or turn on the assistant.':
    'Nessun componente della libreria corrisponde alle tue parole. Prova a nominare i componenti, oppure attiva l’assistente.',
  'you wrote “{word}”': 'hai scritto “{word}”',
  'Project “{name}” built from your description: {parts}.': 'Progetto “{name}” costruito dalla tua descrizione: {parts}.',
  'no parts': 'nessun componente',
  'The assistant’s sketch for this project': 'Lo sketch dell’assistente per questo progetto',
  'Or describe it, and the assistant suggests parts, wiring and starter code': 'Oppure descrivilo, e l’assistente suggerisce componenti, collegamenti e codice di partenza',
  'e.g. a plant waterer: soil sensor, small pump, OLED, runs on USB': 'es. un irrigatore: sensore del terreno, piccola pompa, OLED, alimentato da USB',
  'Describe your project': 'Descrivi il tuo progetto',
  Suggest: 'Suggerisci',
  'It asks a few questions first. Everything it suggests is shown for you to confirm.': 'Prima fa qualche domanda. Tutto ciò che suggerisce ti viene mostrato da confermare.',
  'The assistant is off: the parts are matched from the words you use. Everything is shown for you to confirm.':
    'L’assistente è spento: i componenti vengono trovati dalle parole che usi. Tutto ti viene mostrato da confermare.',
  'or type your answer': 'oppure scrivi la tua risposta',
  'Create the project': 'Crea il progetto',
  'Use the “{name}” template instead': 'Usa invece il modello “{name}”',
  'The safe-pin rules wire the parts; the starter code matches that wiring. You can change anything afterwards.':
    'Le regole dei pin sicuri collegano i componenti; il codice di partenza corrisponde a quei collegamenti. Puoi cambiare tutto dopo.',

  // Read from port
  'To see what is connected to your board, the app installs its diagnostic agent. Your program is backed up first and comes back with one click.':
    'Per vedere cosa è collegato alla scheda, l’app installa il suo agente diagnostico. Prima viene salvata una copia del tuo programma, che torna con un clic.',
  'Answers at {addr}; you said it is a {part}.': 'Risponde a {addr}; hai detto che è un {part}.',
  '{board} (read from port)': '{board} (letta dalla porta)',
  'Project built from what was found on the board. {n} part(s) are a guess: click them in 3D to confirm.':
    'Progetto costruito da ciò che è stato trovato sulla scheda. {n} componente/i sono un’ipotesi: cliccali in 3D per confermarli.',
  'Project built from what was found on the board.': 'Progetto costruito da ciò che è stato trovato sulla scheda.',
  'Reading your board': 'Lettura della scheda',
  'only reads · nothing is written without your OK': 'solo lettura · nulla viene scritto senza il tuo OK',
  'Please confirm what was guessed': 'Conferma ciò che è stato ipotizzato',
  'This is right': 'È corretto',
  'Something may be connected to these analog pins': 'Forse qualcosa è collegato a questi pin analogici',
  'Not sure: leave it out': 'Non so: lascialo fuori',
  'measured voltage; what it is, you tell the app': 'tensione misurata; cosa sia, lo dici tu all’app',
  'Found parts are added as “detected”, each with its measurement. You confirm anything that was guessed.':
    'I componenti trovati vengono aggiunti come “rilevati”, ognuno con la sua misura. Confermi tu ciò che è stato ipotizzato.',
  'Pick the board myself': 'Scelgo io la scheda',
  'Open the project': 'Apri il progetto',
  detected: 'rilevato',
  Detected: 'Rilevato',
  'This part is a suggestion: it was guessed, not measured. Confirm it before the next steps rely on it.':
    'Questo componente è un suggerimento: è stato ipotizzato, non misurato. Confermalo prima che i passi successivi ci facciano affidamento.',
  'You confirmed {part}.': 'Hai confermato {part}.',
  'Yes, this is right': 'Sì, è corretto',
  'No, remove it': 'No, rimuovilo',
  'Answers at {addr}; ID register {reg} = {value}, as the {part} datasheet says.': 'Risponde a {addr}; registro ID {reg} = {value}, come dice il datasheet del {part}.',
  'Answers at {addr}. Several parts use this address; the most common is the {part}. Please confirm.':
    'Risponde a {addr}. Diversi componenti usano questo indirizzo; il più comune è il {part}. Confermalo.',
  'Answers at {addr}, but no part in the library uses this address. Add it from the parts library.':
    'Risponde a {addr}, ma nessun componente della libreria usa questo indirizzo. Aggiungilo dalla libreria dei componenti.',
  'Looking for a board on USB…': 'Cerco una scheda su USB…',
  '{n} ports found, none looks like a board. Pick the board yourself, or use Connect to choose the port.':
    '{n} porte trovate, nessuna sembra una scheda. Scegli tu la scheda, oppure usa Collega per scegliere la porta.',
  'No board on USB. Use a data cable (many only charge), plug it in directly, then try again.':
    'Nessuna scheda su USB. Usa un cavo dati (molti caricano soltanto), collegalo direttamente, poi riprova.',
  'Port found: {port} ({chip})': 'Porta trovata: {port} ({chip})',
  'Port found: {port}': 'Porta trovata: {port}',
  'Reading the chip (only reads)…': 'Lettura del chip (solo lettura)…',
  'Chip: {chip}, {flash} flash → {board}': 'Chip: {chip}, flash {flash} → {board}',
  'Chip: {chip}. Several boards use it: using the {board} for now. Pick yours if it is different.':
    'Chip: {chip}. Lo usano diverse schede: per ora uso la {board}. Scegli la tua se è diversa.',
  'No diagnostic agent for this board yet, so the app cannot look at the pins. Add your parts by hand.':
    'Non c’è ancora un agente diagnostico per questa scheda, quindi l’app non può guardare i pin. Aggiungi i componenti a mano.',
  'To see what is connected, the app needs its diagnostic agent on the board (your firmware is backed up first).':
    'Per vedere cosa è collegato, l’app ha bisogno del suo agente diagnostico sulla scheda (prima viene salvata una copia del tuo firmware).',
  'Skipped: nothing was written. The project has the board only; add your parts by hand.':
    'Saltato: non è stato scritto nulla. Il progetto ha solo la scheda; aggiungi i componenti a mano.',
  'Diagnostic agent installed and answering (your firmware was backed up first).': 'Agente diagnostico installato e attivo (prima è stata salvata una copia del tuo firmware).',
  'Diagnostic agent answers.': 'L’agente diagnostico risponde.',
  'Pull-ups on {sda}/{scl}: yes (something is connected to the I2C pins)': 'Pull-up su {sda}/{scl}: sì (qualcosa è collegato ai pin I2C)',
  'No pull-ups on {sda}/{scl}: nothing on the I2C bus, or a module without pull-ups': 'Nessun pull-up su {sda}/{scl}: niente sul bus I2C, oppure un modulo senza pull-up',
  'Scanning I2C on {sda}/{scl}, as wired and exchanged…': 'Scansione I2C su {sda}/{scl}, come collegati e scambiati…',
  'Nothing answers on the I2C bus.': 'Nessuno risponde sul bus I2C.',
  '{list} answers only with SDA and SCL exchanged: the wires look crossed': '{list} risponde solo con SDA e SCL scambiati: i fili sembrano invertiti',
  'I2C devices at {list}': 'Dispositivi I2C a {list}',
  'unknown device': 'dispositivo sconosciuto',
  '{addr}: probably a {part} (guess, please confirm)': '{addr}: probabilmente un {part} (ipotesi, confermala)',
  '{addr} answers, chip ID {value} → {part}': '{addr} risponde, ID del chip {value} → {part}',
  'Reading ADC pins for knobs and sensors…': 'Lettura dei pin ADC per manopole e sensori…',
  'Steady readings on {list}: maybe a knob or an analog sensor (you confirm)': 'Letture stabili su {list}: forse una manopola o un sensore analogico (confermi tu)',
  'No ADC pin reads a steady voltage: no knob or analog sensor found': 'Nessun pin ADC legge una tensione stabile: nessuna manopola o sensore analogico trovato',
  '{part}: the wires are drawn crossed, as found on the bench. The wiring check explains how to fix them.':
    '{part}: i fili sono disegnati invertiti, come trovati sul banco. Il controllo dei collegamenti spiega come correggerli.',
  'Supply and ground wires are drawn to the usual pins: the app cannot measure which ones you used. Check them on your bench.':
    'I fili di alimentazione e massa sono disegnati sui pin abituali: l’app non può misurare quali hai usato. Controllali sul tuo banco.',
  'Steady voltage on {pin}; you confirmed what it is.': 'Tensione stabile su {pin}; hai confermato cosa è.',
};

export default it;
