// Italian translations. Key = the exact English text passed to t().
// General UI: App shell, top bar, task rail, log panel, assistant, dialogs, license, developer menu.
const it: Record<string, string> = {
  // App shell
  Start: 'Inizia',
  'BoardPilot must run inside its desktop app (the preload bridge is missing).':
    'BoardPilot deve girare dentro la sua app desktop (manca il bridge di preload).',

  // Task rail (TASKS in TaskRail.tsx, translated at render time)
  Home: 'Home',
  Tasks: 'Attività',
  'Connect and identify': 'Collega e identifica',
  'Find the board and read its chip': 'Trova la scheda e leggi il suo chip',
  'New project': 'Nuovo progetto',
  'Pick parts, get safe pins and starter code': 'Scegli i componenti, ottieni pin sicuri e codice di partenza',
  'Flash firmware': 'Carica firmware',
  'Write a program to the board, safely': 'Scrivi un programma sulla scheda, in sicurezza',
  'Debug a problem': 'Risolvi un problema',
  'Find out why something does not work': 'Scopri perché qualcosa non funziona',
  Monitor: 'Monitor',
  'Live values, serial output and memory': 'Valori in tempo reale, uscita seriale e memoria',
  'Test hardware': 'Testa l’hardware',
  'Check pins, buses and decoded signals': 'Controlla pin, bus e segnali decodificati',
  Report: 'Report',
  'Summary of this session to share': 'Riepilogo di questa sessione da condividere',

  // Top bar
  'agent {ver}': 'agent {ver}',
  'your firmware': 'il tuo firmware',
  'No board connected': 'Nessuna scheda collegata',
  Simulator: 'Simulatore',
  'Restore my firmware': 'Ripristina il mio firmware',
  Language: 'Lingua',
  'AI model {model}': 'Modello AI {model}',
  'Add ANTHROPIC_API_KEY to .env.local': 'Aggiungi ANTHROPIC_API_KEY a .env.local',
  'AI on': 'AI attiva',
  'AI off': 'AI spenta',
  'Developer menu': 'Menu sviluppatore',
  'Developer menu (simulator)': 'Menu sviluppatore (simulatore)',
  // progress tasks sent by the hardware hub, shown in the top bar
  'Backing up your firmware': 'Backup del tuo firmware',
  'Installing the diagnostic agent': 'Installazione dell’agent diagnostico',
  'Restoring your firmware': 'Ripristino del tuo firmware',
  'Flashing your firmware': 'Caricamento del tuo firmware',

  // Session log
  'Session log': 'Log della sessione',
  All: 'Tutti',
  Checks: 'Controlli',
  Found: 'Trovati',
  Warnings: 'Avvisi',
  Failed: 'Falliti',
  Actions: 'Azioni',
  Info: 'Info',
  Clear: 'Svuota',
  'Everything the app checks, finds and does appears here.': 'Qui compare tutto quello che l’app controlla, trova e fa.',
  'Show in 3D': 'Mostra in 3D',
  // type chip on each log row
  info: 'info',
  check: 'controllo',
  warning: 'avviso',
  failed: 'fallito',
  found: 'trovato',
  action: 'azione',

  // Assistant
  Assistant: 'Assistente',
  Measured: 'Misurato',
  'From documentation': 'Dalla documentazione',
  Suggestion: 'Suggerimento',
  measurement: 'misura',
  datasheet: 'datasheet',
  library: 'libreria',
  'you said': 'l’hai detto tu',
  '1 tool call': '1 chiamata a strumento',
  '{n} tool calls': '{n} chiamate a strumenti',
  'Ask about your board…': 'Chiedi qualcosa sulla tua scheda…',
  'AI is off: add ANTHROPIC_API_KEY to .env.local': 'AI spenta: aggiungi ANTHROPIC_API_KEY a .env.local',
  Ask: 'Chiedi',
  off: 'spenta',
  'Ask anything about your board, wiring or code. I only state measurements I actually took, and show where every fact comes from.':
    'Chiedimi qualsiasi cosa su scheda, cablaggio o codice. Riporto solo misure che ho fatto davvero e ti mostro da dove viene ogni informazione.',
  'The assistant is off because no API key is set. Add ANTHROPIC_API_KEY=… to .env.local in the project folder and restart. Every check and measurement works without it.':
    'L’assistente è spento perché manca la chiave API. Aggiungi ANTHROPIC_API_KEY=… a .env.local nella cartella del progetto e riavvia. Tutti i controlli e le misure funzionano anche senza.',
  'Checking…': 'Controllo in corso…',
  'Assistant ran {tool} {input}': 'L’assistente ha eseguito {tool} {input}',
  'The assistant asks to install the diagnostic agent: {reason}': 'L’assistente chiede di installare l’agent diagnostico: {reason}',
  'The assistant asks: {reason}': 'L’assistente chiede: {reason}',

  // Confirm dialog
  Cancel: 'Annulla',
  'Nothing is written to the board unless you confirm.': 'Sulla scheda non viene scritto nulla finché non confermi.',

  // Photo input
  'Photo of the part': 'Foto del componente',
  'Your part': 'Il tuo componente',
  'Looking at the photo…': 'Sto guardando la foto…',
  suggestion: 'suggerimento',
  'Could also be: {list}': 'Potrebbe anche essere: {list}',
  'Yes, that’s it': 'Sì, è lui',
  'No, try again': 'No, riprova',

  // Developer menu
  Developer: 'Sviluppatore',
  Close: 'Chiudi',
  Hardware: 'Hardware',
  'Real board': 'Scheda reale',
  Scenario: 'Scenario',
  'Bench actions': 'Azioni al banco',
  'Fix the wiring': 'Correggi il cablaggio',
  'Turn the knob': 'Gira la manopola',
  'Real mode uses esptool (pip3 install esptool) and the prebuilt agent in resources/agent (npm run build:agent).':
    'La modalità reale usa esptool (pip3 install esptool) e l’agent precompilato in resources/agent (npm run build:agent).',
  Project: 'Progetto',
  'Started an empty project.': 'Hai iniziato un progetto vuoto.',
  'Empty project': 'Progetto vuoto',
  // simulator scenarios (names and descriptions from app/main/sim/scenarios)
  'Sold as BME280, is a BMP280': 'Venduto come BME280, è un BMP280',
  'Wiring is right, but the chip answers ID 0x58: a BMP280 without humidity.':
    'Il cablaggio è giusto, ma il chip risponde con ID 0x58: è un BMP280, senza umidità.',
  'Garbage on serial': 'Caratteri strani sulla seriale',
  'The sketch uses Serial.begin(9600) but the monitor listens at 115200.':
    'Lo sketch usa Serial.begin(9600) ma il monitor ascolta a 115200.',
  'Weather station, all good': 'Stazione meteo, tutto ok',
  'Everything wired correctly. The firmware streams temperature, humidity, pressure and the knob.':
    'Tutto collegato correttamente. Il firmware invia temperatura, umidità, pressione e la manopola.',
  'Board keeps resetting': 'La scheda continua a riavviarsi',
  'The firmware draws too much current when Wi-Fi starts; the brownout detector resets the board.':
    'Il firmware assorbe troppa corrente quando parte il Wi-Fi; il brownout detector riavvia la scheda.',
  'No board detected': 'Nessuna scheda rilevata',
  'No serial port appears: charge-only cable or missing driver.':
    'Non compare nessuna porta seriale: cavo solo di ricarica o driver mancante.',
  'Port busy': 'Porta occupata',
  'The port exists but another app (a serial monitor) holds it open.':
    'La porta esiste ma un’altra app (un monitor seriale) la tiene aperta.',
  'Sensor VIN unplugged': 'VIN del sensore scollegato',
  "The sensor's power wire is loose: no pull-ups on the bus and no answer.":
    'Il filo di alimentazione del sensore è staccato: nessuna resistenza di pull-up sul bus e nessuna risposta.',
  'Weather station, SDA and SCL crossed': 'Stazione meteo, SDA e SCL invertiti',
  'BME280 on D21/D22 with SDA and SCL crossed at the sensor, LED on D25 at 62% PWM, knob on D34 at 1.84 V, button with pull-up on D12 (strapping pin).':
    'BME280 su D21/D22 con SDA e SCL invertiti sul sensore, LED su D25 con PWM al 62%, manopola su D34 a 1,84 V, pulsante con pull-up su D12 (pin di strapping).',

  // License
  Activate: 'Attiva',
  'Buy a license': 'Acquista una licenza',
  'Read the license': 'Leggi la licenza',
  Licensed: 'Con licenza',
  'Trial ended': 'Prova terminata',
  'Trial: {n} days left': 'Prova: mancano {n} giorni',
  License: 'Licenza',
  'Licensed to {name} ({plan}). Thank you for supporting BoardPilot.':
    'Licenza intestata a {name} ({plan}). Grazie per sostenere BoardPilot.',
  'You are using the free trial: {n} of {total} days left.': 'Stai usando la prova gratuita: mancano {n} giorni su {total}.',
  'The {total}-day trial has ended.': 'La prova di {total} giorni è terminata.',
  'BoardPilot is source-available: you can read and build the code, and continued use needs a license key.':
    'BoardPilot è source-available: puoi leggere e compilare il codice, ma per continuare a usarlo serve una chiave di licenza.',
  'Your free trial has ended': 'La tua prova gratuita è terminata',
  'Thank you for trying BoardPilot for {total} days. To keep using it, enter a license key. Your projects, backups and parts library are safe on this Mac.':
    'Grazie per aver provato BoardPilot per {total} giorni. Per continuare a usarlo, inserisci una chiave di licenza. I tuoi progetti, i backup e la libreria dei componenti restano al sicuro su questo Mac.',
  'Drag to resize. Double-click to reset.': 'Trascina per ridimensionare. Doppio clic per ripristinare.',
  "New empty project. Add parts, start from a template, or detect the board on your USB port.": "Nuovo progetto vuoto. Aggiungi componenti, parti da un modello o rileva la scheda sulla porta USB.",
  "New empty project. Undo brings the previous one back.": "Nuovo progetto vuoto. Annulla riporta quello precedente.",
  "Detect my board": "Rileva la mia scheda",
  "Start empty": "Inizia vuoto",
  "Finds the board on USB, reads its chip and sets it as the project board. Only reads.": "Trova la scheda sulla USB, legge il suo chip e la imposta come scheda del progetto. Legge soltanto.",
};

export default it;
