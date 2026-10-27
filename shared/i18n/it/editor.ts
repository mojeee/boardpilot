// Italian strings for the Code panel's editor (components/CodeEditor.tsx, components/code/*),
// its completions and pin cards (shared/codeComplete.ts, shared/codeRefs.ts), the compiler check
// (app/main/hardware/compile.ts, shared/compileOutput.ts) and the serial console's link to the code.
const it: Record<string, string> = {
  // compiler (main process)
  'The compiler (arduino-cli) is not installed.': 'Il compilatore (arduino-cli) non è installato.',
  'Install the Arduino IDE 2 (it brings arduino-cli), or arduino-cli from arduino.cc, then try again. The check against the drawing works without it.':
    'Installa l’Arduino IDE 2 (include arduino-cli) oppure arduino-cli da arduino.cc, poi riprova. Il controllo rispetto al disegno funziona anche senza.',
  'Install it with “brew install arduino-cli”, or install the Arduino IDE 2, then try again. The check against the drawing works without it.':
    'Installalo con “brew install arduino-cli” oppure installa l’Arduino IDE 2, poi riprova. Il controllo rispetto al disegno funziona anche senza.',
  'These files cannot be compiled as an Arduino sketch.': 'Questi file non si possono compilare come sketch Arduino.',
  'The main file must be an .ino file with a simple name (letters, digits, - and _). ESP-IDF, Pico SDK and STM32 projects build with their own tools: see their README.':
    'Il file principale deve essere un .ino con un nome semplice (lettere, cifre, - e _). I progetti ESP-IDF, Pico SDK e STM32 si compilano con i loro strumenti: vedi il loro README.',
  'The compiler is already running.': 'Il compilatore è già in funzione.',
  'Wait for it to finish, then try again.': 'Aspetta che finisca, poi riprova.',
  'This board has no Arduino board name, so it cannot be compiled here.': 'Questa scheda non ha un nome scheda Arduino, quindi non si può compilare qui.',
  'Build it with the board’s own tools.': 'Compilalo con gli strumenti della scheda.',
  'The compiler did not finish in time.': 'Il compilatore non ha finito in tempo.',
  'The first build for a board takes longest. Try again: later builds are faster.': 'La prima compilazione per una scheda è la più lunga. Riprova: le successive sono più veloci.',
  'Compiling needs the BoardPilot app with arduino-cli: a web page cannot run the compiler. The check against the drawing works here too.':
    'Per compilare serve l’app BoardPilot con arduino-cli: una pagina web non può avviare il compilatore. Il controllo rispetto al disegno funziona anche qui.',

  // toolbar, status bar, files
  'Compile the code with arduino-cli to find errors before flashing. Nothing is written to the board.':
    'Compila il codice con arduino-cli per trovare gli errori prima di scrivere sulla scheda. Sulla scheda non viene scritto nulla.',
  'Compiling…': 'Compilazione…',
  Compile: 'Compila',
  'Saved the code in {path}.': 'Codice salvato in {path}.',
  'Added {file} to the project’s code.': '{file} aggiunto al codice del progetto.',
  'Arduino sketch': 'Sketch Arduino',
  'C/C++ header': 'Header C/C++',
  'C/C++ source': 'Sorgente C/C++',
  Text: 'Testo',
  'Ln {line}, Col {col}': 'Riga {line}, col {col}',
  'Arduino board name used to compile': 'Nome scheda Arduino usato per compilare',
  'List the problems in this file': 'Elenca i problemi di questo file',
  '{n} to check': '{n} da controllare',
  'matches the drawing': 'coerente con il disegno',
  'The code changed since this check.': 'Il codice è cambiato dopo questo controllo.',
  'changed since': 'cambiato da allora',
  '⌘I ask AI · ⌘F find · Tab accept': '⌘I chiedi all’IA · ⌘F cerca · Tab accetta',
  'Use letters, digits, dot, dash and underscore (folders with /).': 'Usa lettere, cifre, punto, trattino e trattino basso (cartelle con /).',
  'A file with this name already exists.': 'Esiste già un file con questo nome.',
  'File name': 'Nome del file',
  'Remove {file}': 'Rimuovi {file}',
  'New file name': 'Nome del nuovo file',
  'Add a file (.h, .cpp) to the project': 'Aggiungi un file (.h, .cpp) al progetto',
  'Remove {file} from the project?': 'Rimuovere {file} dal progetto?',
  Keep: 'Tieni',

  // ask box, selection toolbar, AI
  'Ask for code': 'Chiedi codice',
  'Change line {n}': 'Cambia la riga {n}',
  'Change lines {a}–{b}': 'Cambia le righe {a}–{b}',
  'Code here': 'Codice qui',
  'How should it change? e.g. “blink twice as fast”': 'Come deve cambiare? Es. “lampeggia due volte più veloce”',
  'What should the code do? e.g. “print the temperature every 2 s”': 'Cosa deve fare il codice? Es. “stampa la temperatura ogni 2 s”',
  'The AI is off: without it you get starter code from the parts library. Turn it on in AI settings for code from your words.':
    'L’IA è spenta: senza di essa ottieni il codice iniziale dalla libreria dei componenti. Accendila nelle impostazioni IA per codice dalle tue parole.',
  'Ask the assistant what this code does': 'Chiedi all’assistente cosa fa questo codice',
  '✦ Change…': '✦ Cambia…',
  'Describe how this code should change (⌘I)': 'Descrivi come deve cambiare questo codice (⌘I)',
  'Explain this code from my sketch in plain words, line by line where it helps (it starts on line {line}):\n{code}':
    'Spiega con parole semplici questo codice del mio sketch, riga per riga dove serve (inizia alla riga {line}):\n{code}',
  'Changing code from a description needs the AI. Turn it on in AI settings, or edit the lines yourself.':
    'Per cambiare il codice da una descrizione serve l’IA. Accendila nelle impostazioni IA, oppure modifica tu le righe.',
  'Fix this problem on line {line}: {problem}': 'Correggi questo problema alla riga {line}: {problem}',
  '✦ Fix with AI': '✦ Correggi con l’IA',
  '✦ Explain': '✦ Spiega',
  'The compiler says:': 'Il compilatore dice:',
  'Explain this compiler message in plain words and how to fix it. Line {line}: {code}\nCompiler: {message}':
    'Spiega con parole semplici questo messaggio del compilatore e come correggerlo. Riga {line}: {code}\nCompilatore: {message}',

  // diagnostics and compile log
  'drawing check (not a measurement)': 'controllo del disegno (non una misura)',
  'compiler (arduino-cli)': 'compilatore (arduino-cli)',
  'Only Arduino sketches (.ino) are compiled here. ESP-IDF, Pico SDK and STM32 projects build with their own tools: see their README.':
    'Qui si compilano solo sketch Arduino (.ino). I progetti ESP-IDF, Pico SDK e STM32 si compilano con i loro strumenti: vedi il loro README.',
  'Compiling {file} with arduino-cli. Nothing is written to the board.': 'Compilo {file} con arduino-cli. Sulla scheda non viene scritto nulla.',
  '{header} usually comes from the library “{library}”. Install it with the Arduino Library Manager (or: arduino-cli lib install "{library}"), then check again.':
    '{header} di solito viene dalla libreria “{library}”. Installala con il Library Manager di Arduino (oppure: arduino-cli lib install "{library}"), poi ricontrolla.',
  'Find the library that provides {header} and install it with the Arduino Library Manager, then check again.':
    'Trova la libreria che fornisce {header} e installala con il Library Manager di Arduino, poi ricontrolla.',
  'suggestion: library index of BoardPilot': 'suggerimento: indice delle librerie di BoardPilot',
  'Install the board package once: arduino-cli core install {core}': 'Installa una volta il pacchetto della scheda: arduino-cli core install {core}',

  // completions
  'source: {what}': 'fonte: {what}',
  'A pin constant of your code.': 'Una costante di pin del tuo codice.',
  'your code': 'il tuo codice',
  'board file ({board}) and the drawing': 'file della scheda ({board}) e disegno',
  'This call drives the pin, and this pin cannot be an output.': 'Questa chiamata pilota il pin, e questo pin non può essere un’uscita.',
  'Sets a pin as OUTPUT, INPUT or INPUT_PULLUP. Call it once in setup().': 'Imposta un pin come OUTPUT, INPUT o INPUT_PULLUP. Chiamala una volta in setup().',
  'Drives an output pin HIGH (3.3 V or 5 V) or LOW (0 V).': 'Porta un pin di uscita a HIGH (3,3 V o 5 V) o LOW (0 V).',
  'Reads a pin: HIGH or LOW.': 'Legge un pin: HIGH o LOW.',
  'Reads the voltage on an analog pin as a number (0 to 4095 on most 3.3 V boards, 0 to 1023 on AVR).':
    'Legge la tensione su un pin analogico come numero (da 0 a 4095 sulla maggior parte delle schede a 3,3 V, da 0 a 1023 su AVR).',
  'Reads the voltage on an analog pin in millivolts, corrected with the chip’s calibration.': 'Legge la tensione su un pin analogico in millivolt, corretta con la calibrazione del chip.',
  'PWM output: 0 is always off, 255 always on, values between dim an LED or slow a motor.':
    'Uscita PWM: 0 sempre spento, 255 sempre acceso, i valori intermedi attenuano un LED o rallentano un motore.',
  'Waits this many milliseconds. Nothing else runs meanwhile: prefer millis() for longer waits.':
    'Aspetta questi millisecondi. Intanto non gira nient’altro: per attese lunghe meglio millis().',
  'Milliseconds since the board started. Use it to do things every N ms without stopping the program.':
    'Millisecondi dall’avvio della scheda. Serve per fare qualcosa ogni N ms senza fermare il programma.',
  'Microseconds since the board started, for short timings.': 'Microsecondi dall’avvio della scheda, per tempi brevi.',
  'Runs a function the moment a pin changes. Keep that function very short.': 'Esegue una funzione nel momento in cui un pin cambia. Tieni quella funzione molto corta.',
  'Plays a square wave of this frequency (Hz) on a pin, for a passive buzzer.': 'Genera un’onda quadra di questa frequenza (Hz) su un pin, per un buzzer passivo.',
  'Rescales a number from one range to another (whole numbers only).': 'Riporta un numero da un intervallo a un altro (solo numeri interi).',
  'Keeps a number between a minimum and a maximum.': 'Tiene un numero tra un minimo e un massimo.',
  'Runs the code inside every N milliseconds without blocking the loop.': 'Esegue il codice al suo interno ogni N millisecondi senza bloccare il loop.',
  pattern: 'schema',
  'Runs once when the board starts.': 'Viene eseguita una volta all’avvio della scheda.',
  'Runs again and again after setup().': 'Viene eseguita di continuo dopo setup().',
  'Opens the serial port at this speed (baud). The Monitor must use the same speed.': 'Apre la porta seriale a questa velocità (baud). Il Monitor deve usare la stessa velocità.',
  'Prints a value and starts a new line.': 'Stampa un valore e va a capo.',
  'Prints a value without a new line.': 'Stampa un valore senza andare a capo.',
  'Prints text with values filled in, like C printf.': 'Stampa un testo con i valori inseriti, come printf del C.',
  'How many received bytes are waiting to be read.': 'Quanti byte ricevuti aspettano di essere letti.',
  'Reads one received byte (-1 when there is none).': 'Legge un byte ricevuto (-1 se non ce ne sono).',
  'Reads received text up to a character, usually the end of the line.': 'Legge il testo ricevuto fino a un carattere, di solito la fine della riga.',
  'Starts I2C. On ESP32 you choose the SDA and SCL pins; other boards use fixed pins: call begin().':
    'Avvia l’I2C. Su ESP32 scegli i pin SDA e SCL; le altre schede usano pin fissi: chiama begin().',
  'I2C speed in Hz: 100000 (standard) works with every part, 400000 with most.': 'Velocità I2C in Hz: 100000 (standard) va con tutti i componenti, 400000 con la maggior parte.',
  'Starts a message to the device at this address.': 'Inizia un messaggio al dispositivo a questo indirizzo.',
  'Queues a byte to send (a register number or data).': 'Mette in coda un byte da inviare (un numero di registro o un dato).',
  'Sends the message. 0 means the device answered; 2 means no device at that address.': 'Invia il messaggio. 0 vuol dire che il dispositivo ha risposto; 2 che a quell’indirizzo non c’è nessun dispositivo.',
  'Asks the device for this many bytes.': 'Chiede al dispositivo questo numero di byte.',
  'Reads one byte the device sent.': 'Legge un byte inviato dal dispositivo.',
  'Starts the probe: values are sent to BoardPilot Monitor every N ms.': 'Avvia la sonda: i valori arrivano al Monitor di BoardPilot ogni N ms.',
  'Sends a named value to the Monitor plot; the pin number colours it like the pin.': 'Invia un valore con nome al grafico del Monitor; il numero di pin lo colora come il pin.',
  'Tells BoardPilot which step the program is on (shown live in the Code panel).': 'Dice a BoardPilot a che passo è il programma (mostrato dal vivo nel pannello Codice).',
  'Tells BoardPilot the state machine’s current state.': 'Dice a BoardPilot lo stato attuale della macchina a stati.',
  'Call it in every loop(): it sends the values.': 'Chiamala in ogni loop(): invia i valori.',
  'Starts the sensor at this I2C address (0x76 or 0x77). Returns false when it does not answer.': 'Avvia il sensore a questo indirizzo I2C (0x76 o 0x77). Restituisce false se non risponde.',
  'Temperature in °C.': 'Temperatura in °C.',
  'Relative humidity in %. A BMP280 has no humidity sensor.': 'Umidità relativa in %. Un BMP280 non ha il sensore di umidità.',
  'Pressure in pascal (divide by 100 for hPa).': 'Pressione in pascal (dividi per 100 per avere hPa).',
  'Starts the display at this I2C address (usually 0x3C). Returns false when it does not answer.': 'Avvia il display a questo indirizzo I2C (di solito 0x3C). Restituisce false se non risponde.',
  'Clears the picture in memory (call display() to show it).': 'Cancella l’immagine in memoria (chiama display() per mostrarla).',
  'Sends the picture in memory to the screen.': 'Invia allo schermo l’immagine in memoria.',
  'Text size: 1 is 6×8 pixels per letter, 2 doubles it.': 'Dimensione del testo: 1 è 6×8 pixel per lettera, 2 la raddoppia.',
  'Colour of the next text.': 'Colore del testo successivo.',
  'Where the next text starts, in pixels from the top left corner.': 'Dove inizia il testo successivo, in pixel dall’angolo in alto a sinistra.',
  'Writes text and moves to the next line.': 'Scrive il testo e va alla riga successiva.',
  'Draws a line between two points.': 'Disegna una linea tra due punti.',
  'Draws a filled rectangle.': 'Disegna un rettangolo pieno.',
  'Starts the sensor.': 'Avvia il sensore.',
  'Temperature in °C (NaN when the reading failed). At most one reading every 2 seconds.': 'Temperatura in °C (NaN se la lettura non è riuscita). Al massimo una lettura ogni 2 secondi.',
  'Relative humidity in % (NaN when the reading failed).': 'Umidità relativa in % (NaN se la lettura non è riuscita).',

  // pin cards
  'Connected to the board’s flash memory: never use it.': 'Collegato alla memoria flash della scheda: non usarlo mai.',
  'Input only: it cannot drive an LED or a relay.': 'Solo ingresso: non può pilotare un LED o un relè.',
  'Strapping pin: a HIGH level at reset can stop the board from booting.': 'Pin di strapping: un livello HIGH al reset può impedire l’avvio della scheda.',
  'Strapping pin: its level at reset changes how the board starts.': 'Pin di strapping: il suo livello al reset cambia il modo in cui la scheda si avvia.',
  'No internal pull-up or pull-down: a button needs an external resistor.': 'Nessun pull-up o pull-down interno: un pulsante ha bisogno di una resistenza esterna.',
  'ADC2: analog readings fail while Wi-Fi is on.': 'ADC2: le letture analogiche non funzionano con il Wi-Fi acceso.',
  'Used by the USB serial port (upload and Serial Monitor).': 'Usato dalla porta seriale USB (caricamento e Serial Monitor).',
  'Native USB data line.': 'Linea dati USB nativa.',
  'Debug port: using it can lock out the debugger.': 'Porta di debug: usarla può escludere il debugger.',
  'Used by something on the board: use it only with care.': 'Usato da qualcosa sulla scheda: usalo solo con attenzione.',
  'The board’s own LED is on this pin.': 'Il LED della scheda è su questo pin.',
  'Nothing is wired to this pin in the drawing.': 'Nel disegno a questo pin non è collegato nulla.',
  Also: 'Anche',
  'source: board file of the {board} and the drawing': 'fonte: file della scheda {board} e disegno',
  'or {key}-click the pin in the code': 'oppure {key}-clic sul pin nel codice',
  'source: parts library ({part}), {library}': 'fonte: libreria dei componenti ({part}), {library}',
  'source: parts library ({part})': 'fonte: libreria dei componenti ({part})',

  // CodeMirror's own words
  Find: 'Cerca',
  Replace: 'Sostituisci',
  next: 'successivo',
  previous: 'precedente',
  all: 'tutti',
  'match case': 'maiuscole/minuscole',
  'by word': 'parola intera',
  regexp: 'espressione regolare',
  replace: 'sostituisci',
  'replace all': 'sostituisci tutti',
  close: 'chiudi',
  'current match': 'risultato attuale',
  'on line': 'alla riga',
  'Go to line': 'Vai alla riga',
  go: 'vai',
  'Fold line': 'Comprimi la riga',
  'Unfold line': 'Espandi la riga',
  'folded code': 'codice compresso',
  unfold: 'espandi',
  Problems: 'Problemi',
  'No problems': 'Nessun problema',
  Completions: 'Completamenti',

  // compiler output in plain words
  '{name} is used but never defined. Check the spelling (capitals count), or add the #include or the variable it comes from.':
    '{name} è usato ma mai definito. Controlla come è scritto (le maiuscole contano), o aggiungi l’#include o la variabile da cui viene.',
  'A semicolon ; is missing, usually at the end of the line before.': 'Manca un punto e virgola ;, di solito alla fine della riga prima.',
  'A closing {c} is missing.': 'Manca una {c} di chiusura.',
  'A closing brace } is missing: every { needs one.': 'Manca una graffa } di chiusura: ogni { ne vuole una.',
  '{object} has no function or field called {member}. Check the spelling, or the library version the example was written for.':
    '{object} non ha una funzione o un campo chiamato {member}. Controlla come è scritto, o la versione della libreria per cui era scritto l’esempio.',
  'A library is missing. Install it with the Arduino Library Manager, then check again.': 'Manca una libreria. Installala con il Library Manager di Arduino, poi ricontrolla.',
  'The same name is defined twice. Remove or rename one of them.': 'Lo stesso nome è definito due volte. Togline uno o rinominalo.',
  'A value has the wrong type for where it is used. A cast or a different variable type fixes it.':
    'Un valore ha il tipo sbagliato per dove è usato. Si risolve con un cast o con un altro tipo di variabile.',
  'This call has the wrong number or kind of values in its parentheses. Compare with the function’s definition.':
    'Questa chiamata ha un numero o un tipo sbagliato di valori tra parentesi. Confrontala con la definizione della funzione.',
  'A variable is set up but never used. Harmless; remove it to keep the code tidy.': 'Una variabile è creata ma mai usata. Innocuo; toglila per tenere il codice in ordine.',
  'A function promises to return a value but can end without return.': 'Una funzione promette di restituire un valore ma può finire senza return.',
  'An unusual character is in the code, often a curly quote pasted from a web page. Retype the quotes.':
    'Nel codice c’è un carattere insolito, spesso una virgoletta tipografica incollata da una pagina web. Riscrivi le virgolette.',
  'The compiler suggests: {name}': 'Il compilatore suggerisce: {name}',
  'The board package {core} is not installed, so the code could not be compiled.': 'Il pacchetto della scheda {core} non è installato, quindi il codice non si è potuto compilare.',
  'The code needs a library that is not installed: {libs}.': 'Il codice ha bisogno di una libreria non installata: {libs}.',
  'The compiler found {n} errors. Fix them before flashing.': 'Il compilatore ha trovato {n} errori. Correggili prima di scrivere sulla scheda.',
  'The compiler stopped without saying where. See the log.': 'Il compilatore si è fermato senza dire dove. Guarda il log.',
  '{pct}% of the flash': '{pct}% della flash',
  'Compiled ({size}), with {n} warnings.': 'Compilato ({size}), con {n} avvisi.',
  'Compiled without errors ({size}).': 'Compilato senza errori ({size}).',

  // serial console, new project
  'Probably printed by line {line} of {file} (matched by its text)': 'Probabilmente stampato dalla riga {line} di {file} (trovata dal testo)',
  'line {n}': 'riga {n}',
  'The {toolchain} files are in the Code panel.': 'I file {toolchain} sono nel pannello Codice.',
  'Put these files in the Code panel to edit them, checked against the drawing': 'Metti questi file nel pannello Codice per modificarli, controllati rispetto al disegno',
  'Edit in the Code panel': 'Modifica nel pannello Codice',
};

export default it;
