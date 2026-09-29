// Italian translations. Key = the exact English text passed to t().
// Scope: state machine designer (shared/statemachine, components/StateMachineDesigner) and its
// pointer in the "PWM, state machines and more" lesson.
const it: Record<string, string> = {
  // New project
  'State machine designer: diagram, C code and tests': 'Progettista di macchine a stati: diagramma, codice C e test',

  // component
  'Loaded the example “{name}”. Undo brings your machine back.': 'Caricato l’esempio “{name}”. Annulla riporta la tua macchina.',
  'Loaded the example “{name}”.': 'Caricato l’esempio “{name}”.',
  'Draw how your device behaves: its states, the events that move it from one state to another, and what happens on the way. The app checks the design and writes C code with a unit test.':
    'Disegna come si comporta il dispositivo: i suoi stati, gli eventi che lo portano da uno stato all’altro e cosa succede nel passaggio. L’app controlla il progetto e scrive il codice C con un test unitario.',
  'The state machine in this project could not be read. Start again from an example or an empty machine.':
    'Non è stato possibile leggere la macchina a stati di questo progetto. Ricomincia da un esempio o da una macchina vuota.',
  'Start with an empty machine': 'Inizia con una macchina vuota',
  Hooks: 'Hook',
  Test: 'Test',
  'Generated: change the design here and save again, instead of editing the file.':
    'Generato: cambia il progetto qui e salva di nuovo, invece di modificare il file.',
  'Your code goes here: what each state does, the conditions and the actions.':
    'Qui va il tuo codice: cosa fa ogni stato, le condizioni e le azioni.',
  'Runs on your computer, not on the board. Save it next to the .h and .c files, then run:':
    'Gira sul tuo computer, non sulla scheda. Salvalo accanto ai file .h e .c, poi esegui:',
  'Everything in one sketch. Put the .ino file in a folder with the same name, then open it in the Arduino IDE.':
    'Tutto in un solo sketch. Metti il file .ino in una cartella con lo stesso nome, poi aprilo nell’IDE di Arduino.',
  'Saved {file}.': 'Salvato {file}.',
  'Machine name (used in the C names)': 'Nome della macchina (usato nei nomi C)',
  'Load an example': 'Carica un esempio',
  'Load an example…': 'Carica un esempio…',
  'Remove the state machine from this project': 'Togli la macchina a stati da questo progetto',
  'Removed the state machine from the project. Undo brings it back.': 'Macchina a stati tolta dal progetto. Annulla la riporta.',
  start: 'inizio',
  'no way out': 'senza uscita',
  'never reached': 'mai raggiunto',
  'Events some states ignore ({n})': 'Eventi ignorati da alcuni stati ({n})',
  'Actual size': 'Dimensione reale',
  'Fit to the panel': 'Adatta al pannello',
  'Click a state or an arrow to find it below.': 'Clicca uno stato o una freccia per trovarlo qui sotto.',
  States: 'Stati',
  'The dot marks the starting state: the device is in it right after power-on.':
    'Il pallino indica lo stato iniziale: il dispositivo è lì appena acceso.',
  'Start here': 'Inizia qui',
  'State name': 'Nome dello stato',
  'What it does (optional)': 'Cosa fa (facoltativo)',
  'Delete this state and its transitions': 'Elimina questo stato e le sue transizioni',
  'Add a state': 'Aggiungi uno stato',
  Events: 'Eventi',
  'Things that happen: a button press, a timer running out, a reading crossing a limit.':
    'Cose che succedono: un pulsante premuto, un timer che scade, una lettura che supera un limite.',
  'Event name': 'Nome dell’evento',
  'Where it comes from (optional)': 'Da dove arriva (facoltativo)',
  'Delete this event and its transitions': 'Elimina questo evento e le sue transizioni',
  'Add an event': 'Aggiungi un evento',
  Transitions: 'Transizioni',
  'In a state, when an event happens and the condition is true: do the action and go to the next state.':
    'In uno stato, quando succede un evento e la condizione è vera: esegui l’azione e passa allo stato successivo.',
  'From state': 'Dallo stato',
  Event: 'Evento',
  'To state': 'Allo stato',
  'Delete this transition': 'Elimina questa transizione',
  'Only if… (condition, optional)': 'Solo se… (condizione, facoltativa)',
  'Then do… (action, optional)': 'Poi fai… (azione, facoltativa)',
  'Add a transition': 'Aggiungi una transizione',
  'Add an event first: every transition starts with one.': 'Prima aggiungi un evento: ogni transizione parte da uno.',
  'C code and tests': 'Codice C e test',
  'Fix the {n} problems marked in red to get the code.': 'Correggi i {n} problemi segnati in rosso per avere il codice.',
  'Save {file}…': 'Salva {file}…',
  'A design tool: nothing here talks to the board, and the generated test runs on your computer. The machine is saved with the project.':
    'Uno strumento di progetto: qui niente parla con la scheda e il test generato gira sul tuo computer. La macchina si salva con il progetto.',
  'State machine diagram': 'Diagramma della macchina a stati',

  // checks
  'The machine has no states yet.': 'La macchina non ha ancora stati.',
  'Add a state, for example IDLE.': 'Aggiungi uno stato, per esempio IDLE.',
  'No starting state is chosen.': 'Nessuno stato iniziale scelto.',
  'Mark one state as the start: the device is in it right after power-on.':
    'Segna uno stato come inizio: il dispositivo è lì appena acceso.',
  'A state has no usable name.': 'Uno stato non ha un nome utilizzabile.',
  'An event has no usable name.': 'Un evento non ha un nome utilizzabile.',
  'Use letters, digits and _, for example WAITING or BUTTON_PRESSED.': 'Usa lettere, cifre e _, per esempio WAITING o BUTTON_PRESSED.',
  'The name {name} is used by the generated code.': 'Il nome {name} è usato dal codice generato.',
  'Pick another name.': 'Scegli un altro nome.',
  'Two states are both called {name} in C.': 'Due stati si chiamano entrambi {name} in C.',
  'Two events are both called {name} in C.': 'Due eventi si chiamano entrambi {name} in C.',
  'Rename one of them: the C code needs different names.': 'Rinominane uno: il codice C ha bisogno di nomi diversi.',
  'A transition points to a state or event that no longer exists.': 'Una transizione punta a uno stato o evento che non esiste più.',
  'Pick the missing state or event again, or delete the transition.': 'Scegli di nuovo lo stato o l’evento mancante, oppure elimina la transizione.',
  '{state} has more than one transition for {event} without a condition.': '{state} ha più di una transizione per {event} senza condizione.',
  'Only one of them could ever run. Give the others a condition, or delete them.':
    'Solo una potrebbe mai scattare. Dai una condizione alle altre, oppure eliminale.',
  '{state} has two transitions for {event} with the same condition.': '{state} ha due transizioni per {event} con la stessa condizione.',
  'The second one could never run. Change its condition, or delete it.': 'La seconda non potrebbe mai scattare. Cambia la sua condizione, oppure eliminala.',
  '{state} can never be reached from {start}.': '{state} non si raggiunge mai partendo da {start}.',
  'Add a transition into it, or delete it.': 'Aggiungi una transizione che ci arriva, oppure eliminalo.',
  '{state} has no way out.': '{state} non ha via d’uscita.',
  'Fine for a final state, like a fault that needs a restart. Otherwise add a transition that leaves it.':
    'Va bene per uno stato finale, come un guasto che richiede un riavvio. Altrimenti aggiungi una transizione che ne esce.',
  'No state reacts to {event}.': 'Nessuno stato reagisce a {event}.',
  'Add a transition for it, or delete the event.': 'Aggiungi una transizione per questo evento, oppure eliminalo.',
  'In {state}, these events are ignored: {events}.': 'In {state} questi eventi vengono ignorati: {events}.',
  'Often that is what you want: the code stays in the same state and does nothing.':
    'Spesso è quello che vuoi: il codice resta nello stesso stato e non fa nulla.',

  // examples
  'Thermostat (from the lesson)': 'Termostato (dalla lezione)',
  'Idle, heating and an error state that waits for a reset.': 'Attesa, riscaldamento e uno stato di errore che aspetta un reset.',
  'Temperature below the target': 'Temperatura sotto l’obiettivo',
  'Temperature at the target': 'Temperatura all’obiettivo',
  'The sensor stops answering': 'Il sensore smette di rispondere',
  'The user presses reset': 'L’utente preme reset',
  'heater on': 'accendi il riscaldatore',
  'heater off': 'spegni il riscaldatore',
  'Traffic light': 'Semaforo',
  'Red, green, yellow on a timer; a pedestrian button shortens green.': 'Rosso, verde, giallo a tempo; un pulsante pedonale accorcia il verde.',
  'Red on, 20 s': 'Rosso acceso, 20 s',
  'Green on, 20 s': 'Verde acceso, 20 s',
  'Yellow on, 3 s': 'Giallo acceso, 3 s',
  'The time of the current light is over': 'Il tempo della luce attuale è finito',
  'A pedestrian presses the button': 'Un pedone preme il pulsante',
  'start the 20 s timer': 'avvia il timer da 20 s',
  'start the 3 s timer': 'avvia il timer da 3 s',
  'green for at least 5 s': 'verde da almeno 5 s',
  'Button debounce': 'Antirimbalzo del pulsante',
  'A press counts only when the pin stays low for 20 ms.': 'Una pressione conta solo se il pin resta basso per 20 ms.',
  'Not pressed': 'Non premuto',
  'Went low, waiting 20 ms': 'Andato basso, attesa 20 ms',
  'Pressed for sure': 'Premuto di sicuro',
  'Went high, waiting 20 ms': 'Andato alto, attesa 20 ms',
  'The pin reads LOW (pressed, with a pull-up)': 'Il pin legge LOW (premuto, con un pull-up)',
  'The pin reads HIGH': 'Il pin legge HIGH',
  '20 ms have passed': 'Sono passati 20 ms',
  'start the 20 ms timer': 'avvia il timer da 20 ms',
  'it was a bounce': 'era un rimbalzo',
  'report a press': 'segnala una pressione',
  'report a release': 'segnala un rilascio',
  'Plant watering (template)': 'Irrigazione della pianta (modello)',
  'The logic of the Plant watering template: wait, water for 3 s, let it soak 30 s.':
    'La logica del modello Irrigazione della pianta: attendi, annaffia per 3 s, lascia assorbire 30 s.',
  'Pump off, checks the soil every second': 'Pompa spenta, controlla il terreno ogni secondo',
  'Pump on': 'Pompa accesa',
  'Pump off, water soaks in': 'Pompa spenta, l’acqua viene assorbita',
  'Soil below 40%': 'Terreno sotto il 40%',
  'The pump ran for 3 s': 'La pompa ha funzionato per 3 s',
  '30 s have passed': 'Sono passati 30 s',
  'pump on': 'accendi la pompa',
  'pump off': 'spegni la pompa',

  // lesson "PWM, state machines and more"
  'Try it: in New project, the State machine designer draws your machine, checks it, and writes the C code with a unit test for every transition. The thermostat above is one of its examples.':
    'Provalo: in Nuovo progetto, il Progettista di macchine a stati disegna la tua macchina, la controlla e scrive il codice C con un test unitario per ogni transizione. Il termostato qui sopra è uno dei suoi esempi.',
};
export default it;
