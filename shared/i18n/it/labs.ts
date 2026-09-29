// Italian translations. Key = the exact English text passed to t().
// Scope: hands-on labs in the lessons (flows/labs.ts, Learn lab cards, simulator buttons).
const it: Record<string, string> = {
  // lesson lab blocks
  'Blink an LED on your board: the app switches the pin, reads it back and asks what the LED did.':
    'Fai lampeggiare un LED sulla tua scheda: l’app commuta il pin, lo rilegge e ti chiede cosa ha fatto il LED.',
  'Read a button: the app checks the pull-up, then watches the pin go from 1 to 0 while you press.':
    'Leggi un pulsante: l’app controlla il pull-up, poi guarda il pin passare da 1 a 0 mentre premi.',
  'Scan the I2C bus and read your sensor’s chip-ID register.': 'Scansiona il bus I2C e leggi il registro chip-ID del tuo sensore.',
  'Turn a potentiometer end to end while the app reads the ADC.': 'Gira un potenziometro da un capo all’altro mentre l’app legge l’ADC.',
  'Hands-on lab': 'Laboratorio pratico',
  'Start the lab': 'Avvia il laboratorio',
  'Works on a real board with the diagnostic agent, or in the simulator. Nothing is written without your confirmation, and your program is backed up first.':
    'Funziona su una scheda vera con l’agente diagnostico, o nel simulatore. Niente viene scritto senza la tua conferma, e prima si salva una copia del tuo programma.',
  'Lesson “{lesson}” marked as done: its lab passed.': 'Lezione “{lesson}” segnata come completata: il suo laboratorio è superato.',
  'Simulator: press the button': 'Simulatore: premi il pulsante',
  'Simulator: turn the knob': 'Simulatore: gira la manopola',
  'Simulator: holding the button down for 4 seconds.': 'Simulatore: tengo premuto il pulsante per 4 secondi.',
  // flow titles, steps, options
  'Lab: blink an LED': 'Laboratorio: far lampeggiare un LED',
  'Lab: read a button': 'Laboratorio: leggere un pulsante',
  'Lab: read a potentiometer': 'Laboratorio: leggere un potenziometro',
  'Lab: talk to an I2C sensor': 'Laboratorio: parlare con un sensore I2C',
  'The agent switches the LED pin on and off; the app reads the pin back and you say what the LED did.':
    'L’agente accende e spegne il pin del LED; l’app rilegge il pin e tu dici cosa ha fatto il LED.',
  'The app checks the pull-up, then watches the pin go from 1 to 0 while you press.': 'L’app controlla il pull-up, poi guarda il pin passare da 1 a 0 mentre premi.',
  'Turn the knob end to end while the app reads the ADC; it checks that the reading covers most of the range.':
    'Gira la manopola da un capo all’altro mentre l’app legge l’ADC; controlla che la lettura copra quasi tutto l’intervallo.',
  'Scan the I2C bus, read the sensor’s chip-ID register, and see what each byte means.': 'Scansiona il bus I2C, leggi il registro chip-ID del sensore e scopri cosa significa ogni byte.',
  'Find it in your project': 'Trovalo nel tuo progetto',
  'Find the sensor in your project': 'Trova il sensore nel tuo progetto',
  'Which pin?': 'Quale pin?',
  LED: 'LED',
  button: 'pulsante',
  knob: 'manopola',
  'Allow the blink': 'Consenti il lampeggio',
  'Only if nothing else drives this pin.': 'Solo se nient’altro pilota questo pin.',
  'The agent refuses input-only and flash pins.': 'L’agente rifiuta i pin solo ingresso e quelli della flash.',
  'Allowed.': 'Consentito.',
  'You cancelled. Nothing was written.': 'Hai annullato. Non è stato scritto niente.',
  'Blink and read the pin back': 'Lampeggia e rileggi il pin',
  'Did the LED blink?': 'Il LED ha lampeggiato?',
  'The pin switched 3 times. What did the LED do?': 'Il pin è stato commutato 3 volte. Cosa ha fatto il LED?',
  'It blinked 3 times': 'Ha lampeggiato 3 volte',
  'It stayed off': 'È rimasto spento',
  'It stayed on': 'È rimasto acceso',
  Result: 'Risultato',
  'Lab passed.': 'Laboratorio superato.',
  'Not passed yet.': 'Non ancora superato.',
  'Your LED blinks': 'Il tuo LED lampeggia',
  'The LED did not blink': 'Il LED non ha lampeggiato',
  'The pin cannot drive the LED': 'Il pin non può pilotare il LED',
  'Fix it and run the lab again.': 'Correggi e rifai il laboratorio.',
  'Read the pin while released': 'Leggi il pin a pulsante rilasciato',
  'The released pin is not a steady 1.': 'Il pin a pulsante rilasciato non è un 1 stabile.',
  'The pin floats': 'Il pin è flottante',
  'The pin reads 0 while released': 'Il pin legge 0 a pulsante rilasciato',
  'Add the pull-up and run the lab again.': 'Aggiungi il pull-up e rifai il laboratorio.',
  'Press and hold the button': 'Premi e tieni premuto il pulsante',
  'Press the button and keep it down, then click “Done, check it”. The app watches the pin for 3 seconds.':
    'Premi il pulsante e tienilo giù, poi clicca “Fatto, controlla”. L’app guarda il pin per 3 secondi.',
  'Your button works': 'Il tuo pulsante funziona',
  'Turn the knob end to end': 'Gira la manopola da un capo all’altro',
  'Click “Done, check it”, then turn the knob slowly from one end to the other and back. The app reads it for 6 seconds.':
    'Clicca “Fatto, controlla”, poi gira la manopola lentamente da un capo all’altro e ritorno. L’app la legge per 6 secondi.',
  'Your knob reads the full range': 'La tua manopola legge tutto l’intervallo',
  'The reading did not change': 'La lettura non è cambiata',
  'The reading covered only part of the range': 'La lettura ha coperto solo parte dell’intervallo',
  'Scan the bus': 'Scansiona il bus',
  'Nothing answered as wired.': 'Nessuno ha risposto con il cablaggio attuale.',
  'Nothing answers on the bus': 'Nessuno risponde sul bus',
  'SDA and SCL are crossed': 'SDA e SCL sono invertiti',
  'Your sensor answers on I2C': 'Il tuo sensore risponde su I2C',
  'This lab needs the diagnostic agent': 'Questo laboratorio ha bisogno dell’agente diagnostico',
  'No diagnostic agent for this board yet, so the lab cannot measure.': 'Per questa scheda non c’è ancora l’agente diagnostico, quindi il laboratorio non può misurare.',
  'Pick a pin from the list.': 'Scegli un pin dall’elenco.',
  // messages with values
  'A device answered at {addr}. The scan sends each address and listens for an ACK: only a real chip pulls SDA low to answer.':
    'Un dispositivo ha risposto a {addr}. La scansione invia ogni indirizzo e ascolta un ACK: solo un chip vero porta SDA basso per rispondere.',
  'An external pull-up is present.': 'C’è un pull-up esterno.',
  'Devices answering: {list}.': 'Dispositivi che rispondono: {list}.',
  'Found {list}.': 'Trovati {list}.',
  'From your project: the {what} is on {pin}.': 'Dal tuo progetto: il {what} è su {pin}.',
  'From {min} to {max} mV.': 'Da {min} a {max} mV.',
  'In a button lab, the pin {pin} stays HIGH even while the user presses the button. Explain the likely wiring mistakes for a beginner (button legs on the same side of the breadboard gap, wrong row, not wired to GND).':
    'In un laboratorio sul pulsante, il pin {pin} resta HIGH anche mentre l’utente preme il pulsante. Spiega gli errori di cablaggio probabili per un principiante (piedini del pulsante dallo stesso lato della scanalatura della breadboard, fila sbagliata, non collegato a GND).',
  'Its chip-ID register {reg} reads {value}, which the datasheet gives for the {part}.': 'Il suo registro chip-ID {reg} legge {value}, il valore che il datasheet indica per il {part}.',
  'Its chip-ID register {reg} reads {value}; the {part} should read {expect}.': 'Il suo registro chip-ID {reg} legge {value}; il {part} dovrebbe leggere {expect}.',
  'Lab not passed yet: {title}': 'Laboratorio non ancora superato: {title}',
  'Lab passed: {title}': 'Laboratorio superato: {title}',
  'Lowest {min} mV, highest {max} mV: {pct}% of the {full} mV range.': 'Minimo {min} mV, massimo {max} mV: il {pct}% dell’intervallo di {full} mV.',
  'No I2C part in your project: using the board’s default bus, SDA {sda} and SCL {scl}.': 'Nessun componente I2C nel progetto: uso il bus predefinito della scheda, SDA {sda} e SCL {scl}.',
  'No agent build for the {board}.': 'Nessuna versione dell’agente per la {board}.',
  'No device answered. Check power (VIN to 3.3 V, GND to GND), that SDA goes to {sda} and SCL to {scl}, and that the board has pull-ups.':
    'Nessun dispositivo ha risposto. Controlla l’alimentazione (VIN a 3,3 V, GND a GND), che SDA vada a {sda} e SCL a {scl}, e che la scheda abbia i pull-up.',
  'No external pull-up found.': 'Nessun pull-up esterno trovato.',
  'Not in your project yet: the app asks for the pin.': 'Non è ancora nel progetto: l’app chiede il pin.',
  'Nothing answered as wired, but {list} answered with SDA and SCL exchanged. Swap the two wires (or the pins in your code) and run the lab again.':
    'Nessuno ha risposto con il cablaggio attuale, ma {list} ha risposto con SDA e SCL scambiati. Scambia i due fili (o i pin nel codice) e rifai il laboratorio.',
  'Pressed: {levels}': 'Premuto: {levels}',
  'Register {reg} at {addr} reads {value}.': 'Il registro {reg} a {addr} legge {value}.',
  'Released it reads 1, held by a pull-up resistor.': 'Rilasciato legge 1, tenuto da una resistenza di pull-up.',
  'Released it reads 1.': 'Rilasciato legge 1.',
  'Released, {pin} changes by itself ({levels}): nothing holds it at a level. In your sketch INPUT_PULLUP turns on the chip’s own pull-up and fixes it. The agent reads pins without that pull-up, so for this lab put a 10 kΩ resistor from {pin} to 3.3 V, then run the lab again.':
    'Rilasciato, {pin} cambia da solo ({levels}): niente lo tiene a un livello. Nel tuo sketch INPUT_PULLUP accende il pull-up interno del chip e lo risolve. L’agente legge i pin senza quel pull-up, quindi per questo laboratorio metti una resistenza da 10 kΩ tra {pin} e 3,3 V, poi rifai il laboratorio.',
  'Released, {pin} reads 0 all the time. Either the button is wired to 3.3 V instead of GND, it is stuck, or a pull-down holds the pin low. Wire the button between {pin} and GND with a 10 kΩ pull-up to 3.3 V.':
    'Rilasciato, {pin} legge sempre 0. O il pulsante è collegato a 3,3 V invece che a GND, o è bloccato, o un pull-down tiene basso il pin. Collega il pulsante tra {pin} e GND con un pull-up da 10 kΩ a 3,3 V.',
  'Released: {levels}': 'Rilasciato: {levels}',
  'Scan as wired: nothing.': 'Scansione con il cablaggio attuale: niente.',
  'Scan with SDA and SCL exchanged: nothing.': 'Scansione con SDA e SCL scambiati: niente.',
  'Scan with SDA and SCL exchanged: {list}.': 'Scansione con SDA e SCL scambiati: {list}.',
  'The agent refused to drive {pin}: {error} Move the LED to one of these pins: {pins}.': 'L’agente ha rifiutato di pilotare {pin}: {error} Sposta il LED su uno di questi pin: {pins}.',
  'The agent will switch {pin} on and off 3 times (6 writes), then leave it off.': 'L’agente accenderà e spegnerà {pin} 3 volte (6 scritture), poi lo lascerà spento.',
  'The pin switched, but the LED stayed dark. Most often the LED is the wrong way round (the long leg goes to the pin side), the resistor is missing a contact, or the short leg is not on GND.':
    'Il pin è stato commutato, ma il LED è rimasto spento. Di solito il LED è al contrario (il piedino lungo va verso il pin), la resistenza non fa contatto, o il piedino corto non è su GND.',
  'The pin switched, but the LED stayed on: it is probably wired to 3.3 V instead of to {pin}, or {pin} is not the pin it is on.':
    'Il pin è stato commutato, ma il LED è rimasto acceso: probabilmente è collegato a 3,3 V invece che a {pin}, oppure non è su {pin}.',
  'The reading went from {min} to {max} mV. analogRead() gives you the same, as a number.': 'La lettura è andata da {min} a {max} mV. analogRead() ti dà la stessa cosa, come numero.',
  'The value moved but only across {pct}% of the range. Turn it fully both ways, and check that the outer legs go to 3.3 V and GND (not 5 V or VIN).':
    'Il valore si è mosso ma solo sul {pct}% dell’intervallo. Giralo fino in fondo nei due sensi e controlla che i piedini esterni vadano a 3,3 V e GND (non a 5 V o VIN).',
  'The value stayed near {min} mV. The middle leg (wiper) may not be on {pin}, or an outer leg is not on 3.3 V or GND. Did you turn it while the app was reading?':
    'Il valore è rimasto vicino a {min} mV. Il piedino centrale (cursore) potrebbe non essere su {pin}, o un piedino esterno non è su 3,3 V o GND. L’hai girato mentre l’app leggeva?',
  'The {board} has no diagnostic agent yet, so the app cannot see its pins. Try the lab in the simulator, or on a board that has the agent.':
    'La {board} non ha ancora l’agente diagnostico, quindi l’app non vede i suoi pin. Prova il laboratorio nel simulatore, o su una scheda che ha l’agente.',
  'Which pin is the {what} connected to? These are the usual ones on the {board}.': 'A quale pin è collegato il {what}? Questi sono i soliti sulla {board}.',
  'You picked {pin}.': 'Hai scelto {pin}.',
  'You saw: {answer}': 'Hai visto: {answer}',
  '{pin} did not follow every write.': '{pin} non ha seguito ogni scrittura.',
  '{pin} did not read back what was written, so something else pulls it: another part or a short. Check what else is connected to {pin}.':
    '{pin} non ha riletto ciò che è stato scritto, quindi qualcos’altro lo tira: un altro componente o un corto. Controlla cos’altro è collegato a {pin}.',
  '{pin} followed every write.': '{pin} ha seguito ogni scrittura.',
  '{pin} read back {levels} after writing 1 0 1 0 1 0.': '{pin} ha riletto {levels} dopo aver scritto 1 0 1 0 1 0.',
  '{pin} read back: {levels}.': '{pin} riletto: {levels}.',
  '{pin} reads 1 when released and 0 when pressed. That is “active low”: in code, if (digitalRead(pin) == LOW) means pressed.':
    '{pin} legge 1 da rilasciato e 0 da premuto. Si dice “attivo basso”: nel codice, if (digitalRead(pin) == LOW) significa premuto.',
  '{pin} released read {levels}.': '{pin} da rilasciato ha letto {levels}.',
  '{pin} released: {levels}.': '{pin} rilasciato: {levels}.',
  '{pin} stayed at 1: the press did not reach the pin.': '{pin} è rimasto a 1: la pressione non è arrivata al pin.',
  '{pin} switched as told, and you saw the LED follow it. digitalWrite() in your own code does exactly this.':
    '{pin} è stato commutato come richiesto, e hai visto il LED seguirlo. digitalWrite() nel tuo codice fa esattamente questo.',
  '{pin} went to 0 while pressed.': '{pin} è andato a 0 mentre premevi.',
  '{pin} while pressed: {levels}.': '{pin} da premuto: {levels}.',
  '{pin}: lowest {min} mV, highest {max} mV (full scale {full} mV).': '{pin}: minimo {min} mV, massimo {max} mV (fondo scala {full} mV).',
  '{what} on {pin}.': '{what} su {pin}.',
  'Lab bench, three beginner mistakes': 'Banco del laboratorio, tre errori da principiante',
  'The LED is on an input-only pin, the button has no pull-up, and the knob has a loose leg.':
    'Il LED è su un pin solo ingresso, il pulsante non ha il pull-up e la manopola ha un piedino staccato.',
};
export default it;
