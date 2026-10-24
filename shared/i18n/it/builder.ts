// Italian translations. Key = the exact English text passed to t().
// Project builder ("Describe your project"): proposal card, choice cards, recorded conversations.
const it: Record<string, string> = {
  // Proposal and choice cards (ProposalCard.tsx)
  'Applied the assistant’s project “{title}”: {parts} parts, {wires} wires on the {board}. Undo brings the previous drawing back.':
    'Applicato il progetto dell’assistente “{title}”: {parts} componenti, {wires} fili sulla {board}. Annulla riporta il disegno di prima.',
  Options: 'Opzioni',
  '{n} problem(s)': '{n} problema/i',
  '{n} warning(s)': '{n} avviso/i',
  'Checks passed': 'Controlli superati',
  'Wiring ({n} wires)': 'Collegamenti ({n} fili)',
  'safe pin': 'pin sicuro',
  'Not wired yet: {pins}': 'Non ancora collegati: {pins}',
  'Also buy': 'Da comprare anche',
  'Applied to your project': 'Applicato al tuo progetto',
  Undo: 'Annulla',
  'Apply to my project': 'Applica al mio progetto',
  'Opened as a new project': 'Aperto come nuovo progetto',
  'Open the code': 'Apri il codice',
  'A suggestion built from the parts library and the board file, checked by the wiring rules. Check it against your real parts before you wire.':
    'Un suggerimento costruito dalla libreria dei componenti e dal file della scheda, verificato dalle regole di cablaggio. Confrontalo con i tuoi componenti reali prima di collegare.',

  // Recorded conversations (ReplayBar.tsx)
  'Recorded conversation': 'Conversazione registrata',
  'A real chat with Claude ({model}, {date}), replayed in your browser. No AI is called.':
    'Una vera chat con Claude ({model}, {date}), riprodotta nel tuo browser. Nessuna IA viene chiamata.',
  Replay: 'Riguarda',
  'Try it yourself': 'Prova tu',
  'Watch an example conversation ({n})': 'Guarda una conversazione di esempio ({n})',

  // change_setting (appActions.ts)
  'Change a setting': 'Cambia un’impostazione',
  'Language, how the 3D view looks (light, detail, desk, pin labels), simulator or real board, simulator scenario.':
    'Lingua, aspetto della vista 3D (luce, dettaglio, banco, etichette dei pin), scheda simulata o reale, scenario del simulatore.',
  'Switching to your real board on USB': 'Passo alla tua scheda reale su USB',
  'Switching to the simulated board': 'Passo alla scheda simulata',
  'Scenarios are for the simulated board. Switch to the simulator first.': 'Gli scenari sono per la scheda simulata. Passa prima al simulatore.',
  'There is no scenario “{name}”. Scenarios: {list}.': 'Non c’è uno scenario “{name}”. Scenari: {list}.',
  '{setting} is now {value}.': '{setting} ora è {value}.',

  // New project
  'The assistant continues in the chat: it asks what it needs, compares parts with you and proposes the wiring, checked by the wiring rules. Nothing changes until you press Apply.':
    'L’assistente continua nella chat: chiede quello che gli serve, confronta i componenti con te e propone i collegamenti, verificati dalle regole di cablaggio. Non cambia nulla finché non premi Applica.',
  'Describe your project': 'Descrivi il tuo progetto',
  'Say what you want to make. The assistant asks what it needs, compares parts with you, then proposes the parts and wiring. Nothing changes until you press Apply.':
    'Di’ cosa vuoi costruire. L’assistente chiede quello che gli serve, confronta i componenti con te, poi propone componenti e collegamenti. Non cambia nulla finché non premi Applica.',
  'e.g. A weather station that shows the temperature on a small screen': 'es. Una stazione meteo che mostra la temperatura su un piccolo schermo',
  'A plant watering system': 'Un sistema per annaffiare una pianta',
  'A distance alarm with a buzzer': 'Un allarme di distanza con un cicalino',
  'A room monitor with a display': 'Un monitor della stanza con un display',

  // shared/projectBuilder.ts
  '3.3 V part on a 5 V board: needs a level shifter on its signal lines.': 'Componente a 3,3 V su una scheda a 5 V: serve un traslatore di livello sulle linee di segnale.',
  '5 V part on a 3.3 V board: power it from 5 V; its outputs may need a divider.': 'Componente a 5 V su una scheda a 3,3 V: alimentalo a 5 V; le sue uscite possono richiedere un partitore.',
  'Works at the board’s {v} V logic.': 'Funziona con la logica a {v} V della scheda.',
  'Two 4.7 kΩ pull-up resistors for SDA and SCL (no I2C part in the project has its own).':
    'Due resistenze di pull-up da 4,7 kΩ per SDA e SCL (nessun componente I2C del progetto ha le sue).',
  'A {k} kΩ pull-up on {part} {pin}.': 'Un pull-up da {k} kΩ su {part} {pin}.',
  'A 1 kΩ + 2 kΩ divider: {part} {pin} sends 5 V into {board}.': 'Un partitore da 1 kΩ + 2 kΩ: {part} {pin} manda 5 V in {board}.',
  'A flyback diode (e.g. 1N4007) across {part}, stripe to +.': 'Un diodo di ricircolo (es. 1N4007) ai capi di {part}, con la fascia verso il +.',
  'A level shifter for {n} line(s) between 5 V and 3.3 V.': 'Un traslatore di livello per {n} linea/e tra 5 V e 3,3 V.',
  'Ignored the wire {wire}: there is no part "{part}" in the proposal.': 'Ignorato il filo {wire}: nella proposta non c’è il componente "{part}".',
  'Ignored the wire {wire}: {board} has no pin "{pin}". A safe pin was picked instead.': 'Ignorato il filo {wire}: la {board} non ha il pin "{pin}". È stato scelto un pin sicuro.',
  'Ignored the wire {wire}: {part} has no pin "{pin}" (its pins: {pins}).': 'Ignorato il filo {wire}: {part} non ha il pin "{pin}" (i suoi pin: {pins}).',
  'Ignored the wire {wire}: that part pin already has a wire.': 'Ignorato il filo {wire}: quel pin del componente ha già un filo.',
  'Ignored the wire {wire}: one end is not a pin of a part in the proposal.': 'Ignorato il filo {wire}: un capo non è un pin di un componente della proposta.',
};

export default it;
