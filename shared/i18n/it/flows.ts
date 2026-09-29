// Italian translations. Key = the exact English text passed to t().
// Covers /flows (step texts, logs, results), shared/wiring.ts, shared/protocol.ts,
// shared/partSchema.ts, shared/partHeuristics.ts and shared/assign.ts.
const it: Record<string, string> = {
  /* ---------- flows/index.ts: symptoms in "Debug a problem" ---------- */
  'A sensor does not respond': 'Un sensore non risponde',
  'Not found, zeros, wrong values': 'Non trovato, zeri, valori sbagliati',
  'The board is not detected': 'La scheda non viene rilevata',
  'No port, upload fails to connect': 'Nessuna porta, il caricamento non si collega',
  'The board keeps restarting': 'La scheda continua a riavviarsi',
  'Boot loop, brownout, crashes': 'Riavvii continui, calo di tensione (brownout), crash',
  'Garbage on the serial monitor': 'Caratteri strani sul monitor seriale',
  'Strange characters instead of text': 'Simboli strani al posto del testo',

  /* ---------- flows/common.ts ---------- */
  'Find your board': 'Trova la tua scheda',
  'Using {chip} on {port}.': 'Uso {chip} su {port}.',
  'No board found on USB. Plug it in with a data cable, or run “Debug a problem → Board not detected”.':
    'Nessuna scheda trovata su USB. Collegala con un cavo dati, oppure avvia “Risolvi un problema → Scheda non rilevata”.',
  'Board: {chip}, MAC {mac}, flash {flash}.': 'Scheda: {chip}, MAC {mac}, flash {flash}.',
  '{chip} on {port}.': '{chip} su {port}.',
  'Try again': 'Riprova',
  'Install the diagnostic agent': 'Installa l’agente diagnostico',
  'To look at the pins, the app needs a small helper program on the board. This replaces your program for now.':
    'Per guardare i pin, l’app ha bisogno di un piccolo programma di aiuto sulla scheda. Per ora prende il posto del tuo programma.',
  'First, a full copy of the program on your board is saved on this Mac (1 to 2 minutes).':
    'Prima viene salvata su questo Mac una copia completa del programma della scheda (1-2 minuti).',
  'Then the diagnostic agent is written to the board.': 'Poi l’agente diagnostico viene scritto sulla scheda.',
  'Afterwards, “Restore my firmware” puts your program back with one click.':
    'Dopo, “Ripristina il mio firmware” rimette il tuo programma con un clic.',
  'Not installed. Without the agent the app can only check your wiring drawing.':
    'Non installato. Senza l’agente l’app può controllare solo il disegno del cablaggio.',
  'Agent {ver} is running.': 'L’agente {ver} è in funzione.',
  'Show the confirmation again': 'Mostra di nuovo la conferma',
  'Only check my wiring drawing': 'Controlla solo il disegno del cablaggio',

  /* ---------- flows/connect-identify.ts ---------- */
  'Connect and identify a board': 'Collega e identifica una scheda',
  'Find the board on USB and read its chip, flash size and MAC address.':
    'Trova la scheda su USB e leggi chip, dimensione della flash e indirizzo MAC.',
  'The Mac does not see a board on USB yet. Try these one at a time, then press Done:\n1. Use a different USB cable. Many cables only charge and carry no data.\n2. Plug straight into the Mac, not through a hub.\n3. Look at the small chip next to the USB port. “CP2102” may need the Silicon Labs CP210x driver; “CH340” needs the WCH CH34x driver. After installing, allow it in System Settings → Privacy & Security.\n4. Check that a light on the board turns on.':
    'Il Mac non vede ancora nessuna scheda su USB. Prova queste cose una alla volta, poi premi Fatto:\n1. Usa un altro cavo USB. Molti cavi servono solo a caricare e non trasmettono dati.\n2. Collega la scheda direttamente al Mac, non tramite un hub.\n3. Guarda il piccolo chip vicino alla porta USB. “CP2102” può richiedere il driver Silicon Labs CP210x; “CH340” richiede il driver WCH CH34x. Dopo l’installazione, autorizzalo in Impostazioni di Sistema → Privacy e sicurezza.\n4. Controlla che sulla scheda si accenda una luce.',
  'Look for boards on USB': 'Cerca schede su USB',
  'Port {port} (USB chip: {chip})': 'Porta {port} (chip USB: {chip})',
  'Port {port}': 'Porta {port}',
  'No board found on USB.': 'Nessuna scheda trovata su USB.',
  'Found {port} with a {chip} USB chip.': 'Trovata {port} con chip USB {chip}.',
  'Found {port}.': 'Trovata {port}.',
  '{n} ports found. Pick yours.': 'Trovate {n} porte. Scegli la tua.',
  'Search again': 'Cerca di nuovo',
  'Help the Mac see the board': 'Aiuta il Mac a vedere la scheda',
  'A port appeared.': 'È comparsa una porta.',
  'Still no board. Try the next item on the list, or ask the assistant.':
    'Ancora nessuna scheda. Prova il punto successivo della lista, oppure chiedi all’assistente.',
  'Board appeared on {port}.': 'La scheda è comparsa su {port}.',
  'The Mac shows no serial port for my ESP32 board. What should I check, in order?':
    'Il Mac non mostra nessuna porta seriale per la mia scheda ESP32. Cosa devo controllare, in ordine?',
  'I tried something else, check again': 'Ho provato altro, controlla di nuovo',
  'Pick a port by hand': 'Scegli una porta a mano',
  'Which port is your board?': 'Qual è la porta della tua scheda?',
  'Several serial ports are present. Ports with a known USB chip are listed first.':
    'Ci sono più porte seriali. Le porte con un chip USB riconosciuto sono in cima alla lista.',
  'USB chip: {chip}': 'Chip USB: {chip}',
  'Using {port}.': 'Uso {port}.',
  'Read the chip': 'Leggi il chip',
  'The app asks the chip for its type, flash size and MAC address. This only reads.':
    'L’app chiede al chip il tipo, la dimensione della flash e l’indirizzo MAC. Legge soltanto.',
  'No port selected.': 'Nessuna porta selezionata.',
  'Chip {chip} (revision {rev})': 'Chip {chip} (revisione {rev})',
  'Chip {chip}': 'Chip {chip}',
  'Flash {flash}, MAC {mac}, USB chip {chip}': 'Flash {flash}, MAC {mac}, chip USB {chip}',
  '{chip}, {flash} flash.': '{chip}, flash da {flash}.',
  'Use the BOOT button trick': 'Usa il trucco del pulsante BOOT',
  'Pick another port': 'Scegli un’altra porta',
  'Put the board in download mode': 'Metti la scheda in modalità download',
  'Hold the BOOT button. While holding it, press and release EN. Then release BOOT and press Done.':
    'Tieni premuto il pulsante BOOT. Mentre lo tieni premuto, premi e rilascia EN. Poi rilascia BOOT e premi Fatto.',
  'Chip {chip}, flash {flash}, MAC {mac}': 'Chip {chip}, flash {flash}, MAC {mac}',
  'Your board': 'La tua scheda',
  'No board identified.': 'Nessuna scheda identificata.',
  Identified: 'Identificata',
  '{chip} is connected': '{chip} è collegato',
  'Your board answers on {port}. Nothing was written to it.': 'La tua scheda risponde su {port}. Non è stato scritto nulla.',
  'Chip: {chip}, revision {rev}': 'Chip: {chip}, revisione {rev}',
  'Chip: {chip}': 'Chip: {chip}',
  'Flash size: {flash}': 'Dimensione flash: {flash}',
  'MAC address: {mac}': 'Indirizzo MAC: {mac}',
  'Features: {list}': 'Funzioni: {list}',
  'Test hardware to check your wiring': 'Prova l’hardware per controllare il cablaggio',
  'Monitor to see what your program prints': 'Monitor per vedere cosa stampa il tuo programma',
  'Debug a problem if something does not work': 'Risolvi un problema se qualcosa non funziona',

  /* ---------- flows/debug-sensor-not-responding.ts ---------- */
  'Debug: sensor not responding': 'Debug: il sensore non risponde',
  'Checks power, pull-ups, the I2C bus, crossed wires and the chip ID, step by step.':
    'Controlla passo passo alimentazione, pull-up, bus I2C, fili invertiti e ID del chip.',
  'What do you see?': 'Cosa vedi?',
  'Pick the closest one, or describe it in your own words.': 'Scegli la voce più vicina, oppure descrivilo con parole tue.',
  'It reads zeros or nothing': 'Legge zeri o niente',
  'My code says the sensor is not found': 'Il mio codice dice che il sensore non viene trovato',
  'Values look wrong': 'I valori sembrano sbagliati',
  'It worked before, now it stopped': 'Prima funzionava, ora non più',
  'Which sensor?': 'Quale sensore?',
  'No I2C sensor in your project yet. Tell the app which one.':
    'Nel tuo progetto non c’è ancora un sensore I2C. Di’ all’app quale usi.',
  'From your project: {part} with SDA on {sda} and SCL on {scl}.': 'Dal tuo progetto: {part} con SDA su {sda} e SCL su {scl}.',
  '{part}, SDA {sda}, SCL {scl}.': '{part}, SDA {sda}, SCL {scl}.',
  'Tell the app which sensor': 'Di’ all’app quale sensore usi',
  'Type the model printed on the board, pick it from the list, take a photo, or upload its datasheet.':
    'Scrivi il modello stampato sulla scheda, sceglilo dalla lista, scatta una foto o carica il suo datasheet.',
  'No sensor chosen.': 'Nessun sensore scelto.',
  '“{name}” is not an I2C sensor in the parts library yet. Pick one from the list, or ask the assistant.':
    '“{name}” non è ancora un sensore I2C della libreria componenti. Scegline uno dalla lista, oppure chiedi all’assistente.',
  'Assuming the default pins: SDA on D21, SCL on D22. Change the wires in the 3D view if yours differ.':
    'Uso i pin predefiniti: SDA su D21, SCL su D22. Se i tuoi sono diversi, sposta i fili nella vista 3D.',
  '{part}, on the default pins D21 and D22.': '{part}, sui pin predefiniti D21 e D22.',
  'Check power and pull-ups': 'Controlla alimentazione e pull-up',
  'I2C lines need pull-up resistors. Most breakouts have them, powered by the sensor’s VIN. No pull-up usually means no power.':
    'Le linee I2C hanno bisogno di resistenze di pull-up. Quasi tutte le breakout le hanno, alimentate dal VIN del sensore. Niente pull-up di solito vuol dire niente alimentazione.',
  'No sensor selected.': 'Nessun sensore selezionato.',
  '{pin}: pulled up (HIGH with nothing driving it)': '{pin}: con pull-up (HIGH senza che nessuno lo piloti)',
  '{pin}: no pull-up (LOW)': '{pin}: nessun pull-up (LOW)',
  'Both lines are pulled up, so the sensor very likely has power.':
    'Entrambe le linee hanno il pull-up, quindi molto probabilmente il sensore è alimentato.',
  'Neither line is pulled up. The sensor may have no power or no ground, or the wires are loose.':
    'Nessuna delle due linee ha il pull-up. Forse il sensore non ha alimentazione o massa, oppure i fili sono allentati.',
  'Only {pin} is pulled up. One of the two wires may be loose.': 'Solo {pin} ha il pull-up. Uno dei due fili potrebbe essere allentato.',
  'The pull-up check on my I2C lines did not pass. What does that mean for a GY-BME280 breakout?':
    'Il controllo dei pull-up sulle mie linee I2C non è passato. Cosa significa per una breakout GY-BME280?',
  'Check again': 'Controlla di nuovo',
  'Skip this check': 'Salta questo controllo',
  'Scan the I2C bus as wired': 'Scansiona il bus I2C così com’è cablato',
  'Devices answering: {list}': 'Dispositivi che rispondono: {list}',
  'No device answered with SDA = {sda}, SCL = {scl}.': 'Nessun dispositivo ha risposto con SDA = {sda}, SCL = {scl}.',
  '{part} answers at {addr}.': '{part} risponde all’indirizzo {addr}.',
  'Something answers at {found}, but not at the {part} addresses {expected}.':
    'Qualcosa risponde a {found}, ma non agli indirizzi di {part} ({expected}).',
  'Nothing answered. Next: try with SDA and SCL exchanged.': 'Non ha risposto nessuno. Prossimo passo: prova con SDA e SCL scambiati.',
  'Scan again': 'Scansiona di nuovo',
  'Swap test: SDA and SCL exchanged': 'Test di scambio: SDA e SCL invertiti',
  'The ESP32 can move I2C to any pins in software, so the app scans again with the two lines exchanged. If the sensor answers only now, the wires are crossed.':
    'L’ESP32 può spostare l’I2C su qualsiasi pin via software, quindi l’app rifà la scansione con le due linee scambiate. Se il sensore risponde solo adesso, i fili sono invertiti.',
  '{part} answers at {addr} only with SDA and SCL exchanged: the wires are crossed.':
    '{part} risponde a {addr} solo con SDA e SCL scambiati: i fili sono invertiti.',
  'Found at {addr} with the lines exchanged. SDA and SCL are crossed.': 'Trovato a {addr} con le linee scambiate. SDA e SCL sono invertiti.',
  'No answer with the lines exchanged either.': 'Nessuna risposta nemmeno con le linee scambiate.',
  'No answer either way.': 'Nessuna risposta in nessuno dei due modi.',
  'Read the chip ID': 'Leggi l’ID del chip',
  'Every Bosch sensor has an ID register. It tells the BME280 (0x60) from the look-alike BMP280 (0x58).':
    'Ogni sensore Bosch ha un registro ID. Permette di distinguere il BME280 (0x60) dal simile BMP280 (0x58).',
  'Nothing to read.': 'Niente da leggere.',
  'ID register {reg} = {value}: this is a genuine {part}.': 'Registro ID {reg} = {value}: è un {part} originale.',
  'ID {value}, as expected.': 'ID {value}, come previsto.',
  'ID register {reg} = {value}, expected {expect}.': 'Registro ID {reg} = {value}, previsto {expect}.',
  'Unexpected ID {value}.': 'ID inatteso {value}.',
  'Read again': 'Leggi di nuovo',
  Skip: 'Salta',
  'What we found': 'Cosa abbiamo trovato',
  Done: 'Fatto',
  'Wiring drawing check': 'Controllo del disegno del cablaggio',
  '1 problem in your wiring drawing': '1 problema nel disegno del cablaggio',
  '{n} problems in your wiring drawing': '{n} problemi nel disegno del cablaggio',
  'Your wiring drawing looks fine': 'Il disegno del cablaggio sembra a posto',
  'These come from the rules for your board and parts, not from measurements. The real wires may differ from the drawing.':
    'Questi risultati vengono dalle regole per la tua scheda e i componenti, non da misure. I fili reali potrebbero essere diversi dal disegno.',
  'No rule found a problem in the drawing. To check the real wires, the app needs the diagnostic agent.':
    'Nessuna regola ha trovato problemi nel disegno. Per controllare i fili reali, l’app ha bisogno dell’agente diagnostico.',
  'Parts library': 'Libreria componenti',
  'Install the agent to measure the real wires': 'Installa l’agente per misurare i fili reali',
  'The sensor': 'Il sensore',
  'Pull-ups: {sda} {sdaOk}, {scl} {sclOk}': 'Pull-up: {sda} {sdaOk}, {scl} {sclOk}',
  yes: 'sì',
  no: 'no',
  'Scan with SDA = {sda}, SCL = {scl}: {found}': 'Scansione con SDA = {sda}, SCL = {scl}: {found}',
  'no answer': 'nessuna risposta',
  'Scan with SDA = {sda}, SCL = {scl} (exchanged): {found}': 'Scansione con SDA = {sda}, SCL = {scl} (scambiati): {found}',
  'ID register {reg} = {value} (expected {expect})': 'Registro ID {reg} = {value} (previsto {expect})',
  'SDA and SCL are crossed': 'SDA e SCL sono invertiti',
  '{part} answers only when SDA and SCL are exchanged. The wire from {sda} goes to the sensor’s SCL pin and the wire from {scl} goes to its SDA pin.':
    '{part} risponde solo con SDA e SCL scambiati. Il filo da {sda} va al pin SCL del sensore e il filo da {scl} va al suo pin SDA.',
  'Swap test (this session)': 'Test di scambio (questa sessione)',
  'Swap the two wires at the sensor: {sda} → SDA, {scl} → SCL.': 'Scambia i due fili sul sensore: {sda} → SDA, {scl} → SCL.',
  'Or keep the wires and change your code to Wire.begin({a}, {b}).': 'Oppure lascia i fili come sono e cambia il codice in Wire.begin({a}, {b}).',
  'Then run the checks again to confirm.': 'Poi rifai i controlli per conferma.',
  'This is a different chip': 'Questo è un chip diverso',
  'Unexpected chip ID': 'ID del chip inatteso',
  'The sensor answers, but its ID {value} is not the expected {expect}.': 'Il sensore risponde, ma il suo ID {value} non è quello previsto ({expect}).',
  'Use a BMP280 library (for example Adafruit BMP280), which reads temperature and pressure.':
    'Usa una libreria per BMP280 (per esempio Adafruit BMP280), che legge temperatura e pressione.',
  'For humidity, buy a genuine BME280 (ID 0x60).': 'Per l’umidità, compra un BME280 originale (ID 0x60).',
  'Check the model printed on the chip and pick the matching part.': 'Controlla il modello stampato sul chip e scegli il componente giusto.',
  'The sensor answers correctly': 'Il sensore risponde correttamente',
  '{part} answers at {addr} on {sda}/{scl} and its ID is correct. The wiring works, so the problem is most likely in the code.':
    '{part} risponde a {addr} su {sda}/{scl} e il suo ID è corretto. Il cablaggio funziona, quindi molto probabilmente il problema è nel codice.',
  '{part} answers at {addr} on {sda}/{scl}. The wiring works, so the problem is most likely in the code.':
    '{part} risponde a {addr} su {sda}/{scl}. Il cablaggio funziona, quindi molto probabilmente il problema è nel codice.',
  'Make sure the code uses address {addr} (many libraries default to 0x77).':
    'Controlla che il codice usi l’indirizzo {addr} (molte librerie usano 0x77 come predefinito).',
  'Make sure the code calls Wire.begin({a}, {b}) or uses the defaults.': 'Controlla che il codice chiami Wire.begin({a}, {b}) o usi i pin predefiniti.',
  'Open Monitor to see what your program prints.': 'Apri Monitor per vedere cosa stampa il tuo programma.',
  'The sensor seems to have no power': 'Sembra che il sensore non sia alimentato',
  'The sensor does not answer': 'Il sensore non risponde',
  'Neither I2C line is pulled up and nothing answers, even with the lines exchanged. That usually means the sensor has no power or no ground. This is a suggestion: check the VIN and GND wires first.':
    'Nessuna linea I2C ha il pull-up e non risponde nessuno, nemmeno con le linee scambiate. Di solito vuol dire che il sensore non ha alimentazione o massa. È un suggerimento: controlla prima i fili VIN e GND.',
  'Nothing answers on the bus, even with the lines exchanged. Check the wires one by one. This is a suggestion based on the measurements above.':
    'Sul bus non risponde nessuno, nemmeno con le linee scambiate. Controlla i fili uno per uno. È un suggerimento basato sulle misure qui sopra.',
  'Check that VIN goes to 3V3 and GND goes to GND.': 'Controlla che VIN vada a 3V3 e GND vada a GND.',
  'Press each wire firmly into the breadboard.': 'Premi bene ogni filo nella breadboard.',
  'Run the checks again.': 'Rifai i controlli.',

  /* ---------- flows/debug-board-not-detected.ts ---------- */
  'Debug: board not detected': 'Debug: scheda non rilevata',
  'Finds out why the Mac does not see the board, one likely cause at a time.':
    'Scopre perché il Mac non vede la scheda, una causa probabile alla volta.',
  'A board is visible on {port} (USB chip {chip}).': 'Si vede una scheda su {port} (chip USB {chip}).',
  'The Mac sees a board on {port}.': 'Il Mac vede una scheda su {port}.',
  'No USB serial port that looks like an ESP32.': 'Nessuna porta seriale USB che sembri un ESP32.',
  'No board on USB.': 'Nessuna scheda su USB.',
  'Is a light on the board on?': 'C’è una luce accesa sulla scheda?',
  'Most ESP32 boards have a small red power LED next to the USB port.':
    'Quasi tutte le schede ESP32 hanno un piccolo LED rosso di alimentazione vicino alla porta USB.',
  'Yes, a light is on': 'Sì, c’è una luce accesa',
  'No light at all': 'Nessuna luce',
  'I can’t tell': 'Non riesco a capirlo',
  'Try another cable': 'Prova un altro cavo',
  'No light means no power reaches the board. Try another USB cable and another USB port on the Mac, then press Done.':
    'Nessuna luce vuol dire che alla scheda non arriva corrente. Prova un altro cavo USB e un’altra porta USB del Mac, poi premi Fatto.',
  'The board has power but no data connection. The most common reason is a charge-only cable. Try a cable you know works for data (for example one that syncs a phone), then press Done.':
    'La scheda è alimentata ma non c’è collegamento dati. Il motivo più comune è un cavo solo di ricarica. Prova un cavo che sai che trasmette dati (per esempio uno che sincronizza un telefono), poi premi Fatto.',
  'The board appeared on {port} after changing the cable.': 'La scheda è comparsa su {port} dopo aver cambiato cavo.',
  'The board appeared.': 'La scheda è comparsa.',
  'Still nothing.': 'Ancora niente.',
  'Install the USB driver': 'Installa il driver USB',
  'Look at the small chip next to the USB port.\n• “CP2102” or “CP2104”: install the Silicon Labs CP210x VCP driver (silabs.com).\n• “CH340” or “CH9102”: install the WCH CH34x driver (wch-ic.com).\nAfter installing, open System Settings → Privacy & Security and allow the driver. Replug the board and press Done.':
    'Guarda il piccolo chip vicino alla porta USB.\n• “CP2102” o “CP2104”: installa il driver Silicon Labs CP210x VCP (silabs.com).\n• “CH340” o “CH9102”: installa il driver WCH CH34x (wch-ic.com).\nDopo l’installazione, apri Impostazioni di Sistema → Privacy e sicurezza e autorizza il driver. Scollega e ricollega la scheda, poi premi Fatto.',
  'Still no board. Ask the assistant, or try the board on another computer to see if the board itself is faulty.':
    'Ancora nessuna scheda. Chiedi all’assistente, oppure prova la scheda su un altro computer per capire se è guasta.',
  'My ESP32 still does not show up on macOS after trying another cable and installing the driver. What else can cause this?':
    'Il mio ESP32 ancora non compare su macOS dopo aver provato un altro cavo e installato il driver. Cos’altro può essere?',
  'Talk to the chip': 'Parla con il chip',
  'Chip {chip}, flash {flash}, MAC {mac}.': 'Chip {chip}, flash {flash}, MAC {mac}.',
  '{chip} answers.': '{chip} risponde.',
  Result: 'Risultato',
  'Your board is detected': 'La tua scheda viene rilevata',
  'The board appeared after changing the cable, so the old cable most likely carries power only.':
    'La scheda è comparsa dopo aver cambiato cavo, quindi molto probabilmente il vecchio cavo porta solo corrente.',
  'The board appeared after installing the driver.': 'La scheda è comparsa dopo l’installazione del driver.',
  'The Mac sees the board and the chip answers.': 'Il Mac vede la scheda e il chip risponde.',
  '{chip} on {port}, MAC {mac}': '{chip} su {port}, MAC {mac}',
  'USB port list': 'Elenco delle porte USB',
  'Label or throw away the charge-only cable.': 'Etichetta o butta via il cavo solo di ricarica.',
  'Continue with the task you wanted to do.': 'Continua con quello che volevi fare.',
  'The board is still not detected': 'La scheda non viene ancora rilevata',
  'Neither the cable nor the driver helped. The board, the USB socket or the Mac’s port may be faulty. This is a suggestion.':
    'Né il cavo né il driver hanno aiutato. Potrebbero essere guasti la scheda, il connettore USB o la porta del Mac. È un suggerimento.',
  'No USB serial port appeared during this session': 'In questa sessione non è comparsa nessuna porta seriale USB',
  'Try the board on another computer.': 'Prova la scheda su un altro computer.',
  'Try another board with the same cable.': 'Prova un’altra scheda con lo stesso cavo.',

  /* ---------- flows/debug-garbage-on-serial.ts ---------- */
  'Debug: garbage on serial': 'Debug: caratteri strani sulla seriale',
  'Tries the common serial speeds and finds the one your program uses.':
    'Prova le velocità seriali più comuni e trova quella usata dal tuo programma.',
  'Check your program is on the board': 'Controlla che il tuo programma sia sulla scheda',
  'The diagnostic agent is on the board, not your program. Restore your firmware first.':
    'Sulla scheda c’è l’agente diagnostico, non il tuo programma. Prima ripristina il tuo firmware.',
  'Your own program is running.': 'Sta girando il tuo programma.',
  'Try the common speeds': 'Prova le velocità più comuni',
  'Garbage characters usually mean the program and the monitor use different speeds (baud rates). The app listens at each common speed for 2 seconds.':
    'I caratteri strani di solito vogliono dire che programma e monitor usano velocità diverse (baud rate). L’app ascolta per 2 secondi a ogni velocità comune.',
  '{baud} baud: {lines} lines, {pct}% readable.': '{baud} baud: {lines} righe, {pct}% leggibile.',
  'The board printed nothing at any speed.': 'La scheda non ha stampato niente a nessuna velocità.',
  'Clearest at {baud} baud ({pct}% readable).': 'Più chiaro a {baud} baud ({pct}% leggibile).',
  '{baud} baud: {lines} lines, {pct}% readable (“{sample}”)': '{baud} baud: {lines} righe, {pct}% leggibile (“{sample}”)',
  '{baud} baud: {lines} lines, {pct}% readable': '{baud} baud: {lines} righe, {pct}% leggibile',
  'The board prints nothing': 'La scheda non stampa niente',
  'At every common speed the board stayed silent. Your program may not call Serial.begin(), or it prints on other pins.':
    'A tutte le velocità comuni la scheda è rimasta in silenzio. Forse il tuo programma non chiama Serial.begin(), oppure stampa su altri pin.',
  'Add Serial.begin(115200) in setup() and a Serial.println() in loop().':
    'Aggiungi Serial.begin(115200) in setup() e un Serial.println() in loop().',
  'Serial output is clean at 115200': 'L’uscita seriale è pulita a 115200',
  'Your program talks at {baud} baud': 'Il tuo programma parla a {baud} baud',
  'At 115200 baud the output is readable. If your terminal shows garbage, set it to 115200.':
    'A 115200 baud l’uscita è leggibile. Se il tuo terminale mostra caratteri strani, impostalo a 115200.',
  'The output is readable at {baud} baud but garbage at 115200. The monitor and your program must use the same speed.':
    'L’uscita è leggibile a {baud} baud ma illeggibile a 115200. Il monitor e il tuo programma devono usare la stessa velocità.',
  'Serial capture at several speeds (this session)': 'Cattura seriale a più velocità (questa sessione)',
  'Set your serial monitor to 115200 baud.': 'Imposta il monitor seriale a 115200 baud.',
  'Either set the monitor to {baud}, or change Serial.begin({baud}) to Serial.begin(115200) in your code (recommended: the ESP32 boot messages also use 115200).':
    'Imposta il monitor a {baud}, oppure cambia Serial.begin({baud}) in Serial.begin(115200) nel codice (consigliato: anche i messaggi di avvio dell’ESP32 usano 115200).',

  /* ---------- flows/debug-keeps-resetting.ts ---------- */
  'Debug: board keeps resetting': 'Debug: la scheda continua a riavviarsi',
  'Listens to what the board prints while it restarts and reads the reset reason.':
    'Ascolta cosa stampa la scheda mentre si riavvia e legge il motivo del reset.',
  'normal power-on': 'accensione normale',
  'the program restarted the chip (software reset, often after a crash)':
    'il programma ha riavviato il chip (reset software, spesso dopo un crash)',
  'a watchdog timer reset the chip: some code blocked for too long':
    'un watchdog ha resettato il chip: una parte del codice è rimasta bloccata troppo a lungo',
  'the RTC watchdog reset the chip': 'il watchdog RTC ha resettato il chip',
  'waking from deep sleep (normal if you use deep sleep)': 'risveglio dal deep sleep (normale se usi il deep sleep)',
  'the supply voltage dropped too low (brownout)': 'la tensione di alimentazione è scesa troppo (calo di tensione, brownout)',
  'The diagnostic agent is on the board right now, not your program. Restore your firmware first (top bar → Restore), then run this again.':
    'In questo momento sulla scheda c’è l’agente diagnostico, non il tuo programma. Prima ripristina il tuo firmware (barra in alto → Ripristina), poi riprova.',
  'I restored it, check again': 'L’ho ripristinato, controlla di nuovo',
  'Listen to the serial output (6 s)': 'Ascolta l’uscita seriale (6 s)',
  'This only reads. The app opens the serial port at 115200 baud, the speed the ESP32 uses for its boot messages.':
    'Legge soltanto. L’app apre la porta seriale a 115200 baud, la velocità che l’ESP32 usa per i messaggi di avvio.',
  '{lines} lines, 1 restart seen.': '{lines} righe, 1 riavvio visto.',
  '{lines} lines, {n} restarts seen.': '{lines} righe, {n} riavvii visti.',
  'The board restarted {n} time(s) in 6 s.': 'La scheda si è riavviata {n} volta/e in 6 s.',
  'No restart seen in 6 s.': 'Nessun riavvio visto in 6 s.',
  'Listen again': 'Ascolta di nuovo',
  'see ESP-IDF reset reasons': 'vedi i motivi di reset in ESP-IDF',
  'rst: {reason} × {n}: {why}': 'rst: {reason} × {n}: {why}',
  '“Brownout detector was triggered” was printed': 'È stato stampato “Brownout detector was triggered”',
  'Crash message: {msg}': 'Messaggio di crash: {msg}',
  'The power supply dips too low': 'L’alimentazione scende troppo',
  'The chip reported a brownout: the 3.3 V supply dropped below the safe level, usually when Wi-Fi starts and the current jumps. The chip then restarts to protect itself.':
    'Il chip ha segnalato un calo di tensione (brownout): l’alimentazione a 3.3 V è scesa sotto il livello sicuro, di solito quando parte il Wi-Fi e la corrente sale di colpo. Allora il chip si riavvia per proteggersi.',
  'Use a shorter, thicker USB cable, or a powered USB hub.': 'Usa un cavo USB più corto e più spesso, oppure un hub USB alimentato.',
  'Remove parts powered from the board’s 3V3 pin to see if it stops.':
    'Scollega i componenti alimentati dal pin 3V3 della scheda per vedere se smette.',
  'Add a 470 µF capacitor between 3V3 and GND near the board.': 'Aggiungi un condensatore da 470 µF tra 3V3 e GND vicino alla scheda.',
  'A watchdog restarts the board': 'Un watchdog riavvia la scheda',
  'Your program crashes': 'Il tuo programma va in crash',
  'Some code runs too long without giving time back to the system, so a watchdog restarts the chip.':
    'Una parte del codice gira troppo a lungo senza lasciare tempo al sistema, quindi un watchdog riavvia il chip.',
  'The program hits an error (for example a null pointer) and the chip restarts.':
    'Il programma incontra un errore (per esempio un puntatore nullo) e il chip si riavvia.',
  'Add delay(1) or yield() inside long loops.': 'Aggiungi delay(1) o yield() dentro i cicli lunghi.',
  'Avoid waiting forever for a sensor inside loop().': 'Evita di aspettare all’infinito un sensore dentro loop().',
  'Open Monitor to see the full crash message.': 'Apri Monitor per vedere il messaggio di crash completo.',
  'Look for pointers used before they are set.': 'Cerca puntatori usati prima di essere impostati.',
  'The board restarts': 'La scheda si riavvia',
  'No restart seen': 'Nessun riavvio visto',
  'The board restarted, but without a brownout or crash message. The reset reasons are listed below.':
    'La scheda si è riavviata, ma senza messaggi di brownout o di crash. I motivi del reset sono elencati qui sotto.',
  'In 6 seconds the board did not restart. If it resets only sometimes, run this again when it happens.':
    'In 6 secondi la scheda non si è riavviata. Se si resetta solo ogni tanto, riprova quando succede.',
  'Watch the output in Monitor while it happens.': 'Guarda l’uscita in Monitor mentre succede.',

  /* ---------- flows/flash-firmware.ts ---------- */
  'Flash firmware': 'Carica firmware',
  'Write a .bin file to the board, after a backup, and check that it starts.':
    'Scrivi un file .bin sulla scheda, dopo un backup, e controlla che parta.',
  'Choose the firmware file': 'Scegli il file del firmware',
  'Pick the .bin file your build produced (Arduino: Sketch → Export Compiled Binary). A single app image is written at 0x10000; a “merged” image at 0x0.':
    'Scegli il file .bin prodotto dalla compilazione (Arduino: Sketch → Esporta sketch compilato). Un’immagine singola dell’app viene scritta a 0x10000; un’immagine “merged” a 0x0.',
  'No file chosen.': 'Nessun file scelto.',
  'Choose again': 'Scegli di nuovo',
  'Write to the board?': 'Scrivere sulla scheda?',
  'This writes {file} to your board.': 'Questo scrive {file} sulla tua scheda.',
  'This writes the file to your board.': 'Questo scrive il file sulla tua scheda.',
  'If this board has no backup yet, the app first saves a full copy of its flash on this Mac.':
    'Se questa scheda non ha ancora un backup, l’app prima salva su questo Mac una copia completa della sua flash.',
  'Then the new firmware is written. The board restarts afterwards.': 'Poi viene scritto il nuovo firmware. Alla fine la scheda si riavvia.',
  '“Restore my firmware” can put the old program back.': '“Ripristina il mio firmware” può rimettere il vecchio programma.',
  'Cancelled. Nothing was written.': 'Annullato. Non è stato scritto nulla.',
  'Wrote {kb} KB.': 'Scritti {kb} KB.',
  'Written ({kb} KB).': 'Scritto ({kb} KB).',
  'Check that it starts': 'Controlla che parta',
  'Check the file before writing': 'Controlla il file prima di scrivere',
  'The app reads the file and checks that it is made for this board: format, chip and size. Nothing is written yet.': 'L’app legge il file e controlla che sia fatto per questa scheda: formato, chip e dimensione. Non viene ancora scritto niente.',
  'Not written: {why}': 'Non scritto: {why}',
  'The file matches this board.': 'Il file è adatto a questa scheda.',
  'The pre-flight check reads the firmware file’s header. If it says the file is for another chip, pick the right board in your build tool (Arduino: Tools → Board: {board}) and export again.': 'Il controllo pre-volo legge l’intestazione del file firmware. Se dice che il file è per un altro chip, scegli la scheda giusta nel tuo strumento di compilazione (Arduino: Strumenti → Scheda: {board}) ed esporta di nuovo.',
  'Choose another file': 'Scegli un altro file',
  'The file is empty.': 'Il file è vuoto.',
  'This board needs a .{fmt} file; this one is .{ext}.': 'Questa scheda vuole un file .{fmt}; questo è .{ext}.',
  ' or .': ' o .',
  'The file is damaged: line {line} is not valid Intel HEX.': 'Il file è danneggiato: la riga {line} non è Intel HEX valido.',
  'Intel HEX file, checksums correct, {size} of program.': 'File Intel HEX, checksum corretti, {size} di programma.',
  'The program ends at {top}, past the end of this board’s {size} flash. It was built for a bigger chip.': 'Il programma finisce a {top}, oltre la fine della flash da {size} di questa scheda. È stato compilato per un chip più grande.',
  'The program starts at {low}, which is not in this board’s flash. It was built for another chip.': 'Il programma inizia a {low}, che non è nella flash di questa scheda. È stato compilato per un altro chip.',
  'Fits in the {size} flash ({pct}% used).': 'Sta nella flash da {size} ({pct}% usato).',
  'The program reaches the last 2 KB of flash, where the Arduino bootloader lives. Uploading may fail or erase the bootloader.': 'Il programma arriva agli ultimi 2 KB di flash, dove si trova il bootloader Arduino. Il caricamento può fallire o cancellare il bootloader.',
  'This is not a valid UF2 file.': 'Questo non è un file UF2 valido.',
  'The file was built for {family}, not for this board’s {chip}.': 'Il file è stato compilato per {family}, non per il {chip} di questa scheda.',
  'UF2 file for {family}, {size} of program.': 'File UF2 per {family}, {size} di programma.',
  'This does not look like a merged ESP32 image (no image header where the bootloader should be).': 'Non sembra un’immagine ESP32 unita (nessuna intestazione dove dovrebbe esserci il bootloader).',
  'This is not an ESP32 app image (it does not start with the image header). Use the .bin from “Export Compiled Binary”.': 'Questa non è un’immagine app ESP32 (non inizia con l’intestazione). Usa il .bin di “Esporta sketch compilato”.',
  '{chip} image header found.': 'Intestazione immagine {chip} trovata.',
  'The image is set up for {img} of flash, but this board has {size}. It may not boot.': 'L’immagine è impostata per {img} di flash, ma questa scheda ne ha {size}. Potrebbe non avviarsi.',
  'The file is {file} but only {room} of flash is free from {offset}.': 'Il file è di {file} ma da {offset} sono liberi solo {room} di flash.',
  'The app is {file}. The default Arduino partition scheme has 1.25 MB for the app: pick a larger “Partition Scheme” if it does not start.': 'L’app è di {file}. Lo schema di partizioni Arduino predefinito ha 1,25 MB per l’app: scegli uno “Schema partizioni” più grande se non parte.',
  'The start of the file is not a program for this chip (stack at {sp}, start at {reset}). It may be built for another chip or another flash address.': 'L’inizio del file non è un programma per questo chip (stack a {sp}, avvio a {reset}). Potrebbe essere compilato per un altro chip o un altro indirizzo di flash.',
  'Program start found (vector table at 0x08000000).': 'Inizio del programma trovato (tabella dei vettori a 0x08000000).',
  'The file is {file} but this board has only {size} of flash.': 'Il file è di {file} ma questa scheda ha solo {size} di flash.',
  'The app listens for 4 seconds to see whether the new program prints anything.':
    'L’app ascolta per 4 secondi per vedere se il nuovo programma stampa qualcosa.',
  'The board printed: “{text}”': 'La scheda ha stampato: “{text}”',
  'It runs and prints ({n} lines).': 'Funziona e stampa ({n} righe).',
  'It printed nothing at 115200. That is fine if your program does not use Serial.':
    'Non ha stampato niente a 115200. Va bene se il tuo programma non usa Serial.',
  'Firmware written': 'Firmware scritto',
  'The file was written.': 'Il file è stato scritto.',
  'The file was written and the board prints output.': 'Il file è stato scritto e la scheda stampa dei dati.',
  'File: {file}': 'File: {file}',
  'Board printed: {text}': 'La scheda ha stampato: {text}',
  'Open Monitor to watch it run.': 'Apri Monitor per vederlo funzionare.',

  /* ---------- shared/wiring.ts ---------- */
  '{a} and {b}': '{a} e {b}',
  'The wire goes to “{pin}”, which is not a pin on this board.': 'Il filo va a “{pin}”, che non è un pin di questa scheda.',
  'Move the wire to a pin shown on the board.': 'Sposta il filo su un pin mostrato sulla scheda.',
  '{pin} (GPIO {gpio}) is wired to the board’s internal flash memory.': '{pin} (GPIO {gpio}) è collegato alla memoria flash interna della scheda.',
  'Never use GPIO 6 to 11. Move this wire to a free GPIO.': 'Non usare mai i GPIO da 6 a 11. Sposta questo filo su un GPIO libero.',
  '{part} {partPin} (power) goes to GND. The part gets no power.': '{part} {partPin} (alimentazione) va a GND. Il componente non riceve corrente.',
  'Move it to 3V3.': 'Spostalo su 3V3.',
  '{part} runs on {need} V but gets {got} V from {pin}.': '{part} funziona a {need} V ma riceve {got} V da {pin}.',
  'Move the power wire to 3V3. {got} V can damage the part and the ESP32 pins it talks to.':
    'Sposta il filo di alimentazione su 3V3. {got} V possono danneggiare il componente e i pin dell’ESP32 collegati a lui.',
  '{part} needs {need} V but gets only {got} V from {pin}.': '{part} ha bisogno di {need} V ma riceve solo {got} V da {pin}.',
  'It may not work reliably. Check the part’s datasheet or use a level shifter.':
    'Potrebbe non funzionare bene. Controlla il datasheet del componente o usa un convertitore di livello (level shifter).',
  '{part} is powered from {pin}, a signal pin.': '{part} è alimentato da {pin}, un pin di segnale.',
  'A GPIO can only supply a few milliamps. Use 3V3 for power.': 'Un GPIO può dare solo pochi milliampere. Per l’alimentazione usa 3V3.',
  '{part} {partPin} (ground) goes to {pin}, a power pin. That is a short circuit.':
    '{part} {partPin} (massa) va a {pin}, un pin di alimentazione. È un cortocircuito.',
  '{part} {partPin} (ground) goes to {pin}, not to GND.': '{part} {partPin} (massa) va a {pin}, non a GND.',
  'Move it to a GND pin.': 'Spostalo su un pin GND.',
  '{part} {partPin} is a signal but goes to {pin}.': '{part} {partPin} è un segnale ma va a {pin}.',
  'Move it to a GPIO pin.': 'Spostalo su un pin GPIO.',
  '{pin} (GPIO {gpio}) can only read signals, but {part} {partPin} needs a pin that can drive it.':
    '{pin} (GPIO {gpio}) può solo leggere segnali, ma {part} {partPin} ha bisogno di un pin che possa pilotarlo.',
  'GPIO 34 to 39 are input only. Move this wire to a pin such as D25, D26, D27 or D32.':
    'I GPIO da 34 a 39 sono solo ingressi. Sposta questo filo su un pin come D25, D26, D27 o D32.',
  '{pin} cannot measure voltage, so the {part} value cannot be read here.':
    '{pin} non può misurare tensioni, quindi qui il valore di {part} non si può leggere.',
  'Move the wire to an ADC1 pin: GPIO 32 to 39 (D32, D33, D34, D35, VP, VN).':
    'Sposta il filo su un pin ADC1: GPIO da 32 a 39 (D32, D33, D34, D35, VP, VN).',
  '{pin} is an ADC2 pin. It stops working while Wi-Fi is on.': '{pin} è un pin ADC2. Smette di funzionare quando il Wi-Fi è acceso.',
  'If your project uses Wi-Fi, move this wire to an ADC1 pin (GPIO 32 to 39).':
    'Se il tuo progetto usa il Wi-Fi, sposta questo filo su un pin ADC1 (GPIO da 32 a 39).',
  '{pin} (GPIO 12) is a strapping pin. If {part} holds it HIGH at reset, the board picks the wrong flash voltage and may not boot.':
    '{pin} (GPIO 12) è un pin di strapping. Se {part} lo tiene HIGH al reset, la scheda sceglie la tensione sbagliata per la flash e potrebbe non avviarsi.',
  '{pin} (GPIO {gpio}) is a strapping pin. Its level at reset changes how the board boots.':
    '{pin} (GPIO {gpio}) è un pin di strapping. Il suo livello al reset cambia il modo in cui la scheda si avvia.',
  'Move this wire to a pin that is not a strapping pin, such as D25, D26 or D27.':
    'Sposta questo filo su un pin che non sia di strapping, come D25, D26 o D27.',
  'It usually works, but if the board fails to boot or upload, move this wire first.':
    'Di solito funziona, ma se la scheda non si avvia o non accetta il caricamento, sposta prima questo filo.',
  '{pin} carries the USB serial link. Uploads and the serial monitor use it.':
    '{pin} porta il collegamento seriale USB. Lo usano il caricamento e il monitor seriale.',
  'Use another pin, or disconnect this wire while uploading.': 'Usa un altro pin, oppure scollega questo filo durante il caricamento.',
  '{pin} is wired to {parts}. These cannot share a pin.': '{pin} è collegato a {parts}. Non possono condividere un pin.',
  'Give each signal its own GPIO.': 'Dai a ogni segnale il suo GPIO.',
  '{a} and {b} both use I2C address {addr} on the same bus. Only one of them can answer.':
    '{a} e {b} usano entrambi l’indirizzo I2C {addr} sullo stesso bus. Solo uno dei due può rispondere.',
  'Neither part can change its address. Put one of them on a second I2C bus, or use an I2C multiplexer.':
    'Nessuno dei due può cambiare indirizzo. Metti uno dei due su un secondo bus I2C, oppure usa un multiplexer I2C.',
  '{a} and {b} both answer at I2C address {addr} by default, on the same bus. Set to the same address, neither reads correctly.':
    '{a} e {b} rispondono entrambi all’indirizzo I2C {addr} di fabbrica, sullo stesso bus. Con lo stesso indirizzo, nessuno dei due si legge correttamente.',
  'Set {part} to address {other} with its {pin} pin, so each part has its own address.':
    'Imposta {part} all’indirizzo {other} con il suo pin {pin}, così ogni componente ha il proprio indirizzo.',
  'Set {part} to address {other} (see its address jumper or pads), so each part has its own address.':
    'Imposta {part} all’indirizzo {other} (vedi il ponticello o le piazzole dell’indirizzo), così ogni componente ha il proprio indirizzo.',
  '{part}: SDA goes to {sda} and SCL to {scl}. That is the reverse of the ESP32 default (SDA = D21, SCL = D22).':
    '{part}: SDA va a {sda} e SCL a {scl}. È il contrario dei pin predefiniti dell’ESP32 (SDA = D21, SCL = D22).',
  'Swap the two wires at the sensor, or set Wire.begin(22, 21) in your code.':
    'Scambia i due fili sul sensore, oppure scrivi Wire.begin(22, 21) nel tuo codice.',
  '{pin} is SDA for one I2C part and SCL for another. The bus lines are crossed between parts.':
    '{pin} è SDA per un componente I2C e SCL per un altro. Le linee del bus sono invertite tra i componenti.',
  'All parts on one I2C bus must share the same SDA pin and the same SCL pin.':
    'Tutti i componenti su un bus I2C devono usare lo stesso pin SDA e lo stesso pin SCL.',
  '{part} {partPin} is not connected to GND.': '{part} {partPin} non è collegato a GND.',
  '{part} {partPin} is not connected to power.': '{part} {partPin} non è collegato all’alimentazione.',
  'Without a shared ground the signals have no reference. Add a wire to a GND pin.':
    'Senza una massa in comune i segnali non hanno un riferimento. Aggiungi un filo verso un pin GND.',
  'Add a wire from 3V3 to this pin.': 'Aggiungi un filo da 3V3 a questo pin.',

  /* ---------- shared/protocol.ts ---------- */
  'The agent reported an error.': 'L’agente ha segnalato un errore.',
  'GPIO 6 to 11 are wired to the board’s internal flash memory.': 'I GPIO da 6 a 11 sono collegati alla memoria flash interna della scheda.',
  'Pick another pin. Using these crashes the board.': 'Scegli un altro pin. Usare questi manda in crash la scheda.',
  'GPIO 34 to 39 can only read signals. They cannot drive an output.':
    'I GPIO da 34 a 39 possono solo leggere segnali. Non possono pilotare un’uscita.',
  'Move this wire to an output-capable pin such as D25, D26 or D27.':
    'Sposta questo filo su un pin che può fare da uscita, come D25, D26 o D27.',
  'GPIO 1 and 3 carry the USB serial link the app uses to talk to the board.':
    'I GPIO 1 e 3 portano il collegamento seriale USB che l’app usa per parlare con la scheda.',
  'Leave TX0 and RX0 free while the app is connected.': 'Lascia liberi TX0 e RX0 mentre l’app è collegata.',
  'This pin cannot measure voltage.': 'Questo pin non può misurare tensioni.',
  'Use an ADC pin. GPIO 32 to 39 work even with Wi-Fi on.': 'Usa un pin ADC. I GPIO da 32 a 39 funzionano anche con il Wi-Fi acceso.',
  'No device answered at that address.': 'Nessun dispositivo ha risposto a quell’indirizzo.',
  'Check power, ground and that SDA and SCL are not swapped.': 'Controlla alimentazione, massa e che SDA e SCL non siano invertiti.',
  'That pin number does not exist on the ESP32.': 'Quel numero di pin non esiste sull’ESP32.',
  'Pick a pin from the board view.': 'Scegli un pin dalla vista della scheda.',
  'The board agent reported “{code}”.': 'L’agente sulla scheda ha segnalato “{code}”.',
  'Try again. If it repeats, reconnect the board.': 'Riprova. Se succede di nuovo, ricollega la scheda.',

  /* ---------- shared/partSchema.ts ---------- */
  'Fix the field and save again.': 'Correggi il campo e salva di nuovo.',
  'The part is empty.': 'Il componente è vuoto.',
  'The part needs a name.': 'Il componente ha bisogno di un nome.',
  'The part needs at least one pin.': 'Il componente ha bisogno di almeno un pin.',
  'Parts can have at most 24 pins in this version.': 'In questa versione i componenti possono avere al massimo 24 pin.',
  'Every pin needs a name, like VCC or SDA.': 'Ogni pin ha bisogno di un nome, come VCC o SDA.',
  'Two pins are called {name}. Pin names must be different.': 'Due pin si chiamano {name}. I nomi dei pin devono essere diversi.',
  'An I2C part needs one pin with role SDA and one with role SCL.': 'Un componente I2C ha bisogno di un pin con ruolo SDA e di uno con ruolo SCL.',

  /* ---------- shared/partHeuristics.ts ---------- */
  'The page mentions both I2C and SPI. I chose I2C; change it if you wire it as SPI.':
    'La pagina parla sia di I2C sia di SPI. Ho scelto I2C; cambialo se lo colleghi in SPI.',
  'Possible I2C addresses found in the text: {list}. Check them in the datasheet.':
    'Possibili indirizzi I2C trovati nel testo: {list}. Controllali nel datasheet.',
  'Made without the AI assistant, from keywords on the page. Check every pin and its role before saving.':
    'Creato senza l’assistente AI, a partire dalle parole chiave della pagina. Controlla ogni pin e il suo ruolo prima di salvare.',

  /* ---------- shared/assign.ts ---------- */
  'No free pin left for {part} {pin}.': 'Non ci sono più pin liberi per {part} {pin}.',
  'Your project now uses the {board}, the board that answered on USB.': 'Il tuo progetto ora usa la {board}, la scheda che ha risposto sulla USB.',
};

export default it;
