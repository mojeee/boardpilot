// Italian translations. Key = the exact English text passed to t().
// Main process: driver errors, hub log messages, AI/assistant errors, parts import, license, IPC results,
// and the simulator scenario names and descriptions.
const it: Record<string, string> = {
  /* ---------- serial port and agent link (agentClient.ts) ---------- */
  'Another program is using this port.': 'Un altro programma sta usando questa porta.',
  'Close any other serial monitor and try again.': 'Chiudi gli altri monitor seriali e riprova.',
  'The port is not there any more.': 'La porta non c’è più.',
  'Check the USB cable, then search for boards again.': 'Controlla il cavo USB, poi cerca di nuovo le schede.',
  'The port could not be opened: {msg}': 'Non è stato possibile aprire la porta: {msg}',
  'Unplug the board, plug it back in and try again.': 'Scollega la scheda, ricollegala e riprova.',
  'The connection to the board was lost.': 'La connessione con la scheda si è interrotta.',
  'Check the USB cable and reconnect.': 'Controlla il cavo USB e ricollegati.',
  'The board agent did not answer.': 'L’agente sulla scheda non ha risposto.',
  'Press EN on the board to restart it, then try again.': 'Premi EN sulla scheda per riavviarla, poi riprova.',

  /* ---------- generic errors (errors.ts) ---------- */
  'Something unexpected happened: {msg}': 'È successo qualcosa di inatteso: {msg}',
  'Try again. If it keeps happening, unplug the board, plug it back in and reconnect.':
    'Riprova. Se succede ancora, scollega la scheda, ricollegala e connettiti di nuovo.',
  '{what} took too long (more than {s} s).': '{what}: ci vuole troppo tempo (più di {s} s).',
  'Check the USB cable and try again. If the board is stuck, press EN to restart it.':
    'Controlla il cavo USB e riprova. Se la scheda è bloccata, premi EN per riavviarla.',

  /* ---------- esptool ---------- */
  'esptool did not finish in time.': 'esptool non ha finito in tempo.',
  'Unplug the board, plug it back in and try again. If it keeps happening, hold BOOT while it connects.':
    'Scollega la scheda, ricollegala e riprova. Se succede ancora, tieni premuto BOOT mentre si connette.',
  'esptool is not installed.': 'esptool non è installato.',
  'Open Terminal and run: pip3 install esptool': 'Apri il Terminale ed esegui: pip3 install esptool',
  'The app could not find esptool, the tool that talks to the ESP32 chip.':
    'L’app non trova esptool, lo strumento che parla con il chip ESP32.',
  'Open Terminal and run: pip3 install esptool. Then restart BoardPilot.':
    'Apri il Terminale ed esegui: pip3 install esptool. Poi riavvia BoardPilot.',
  'Another program is using this port, so the app cannot talk to the board.':
    'Un altro programma sta usando questa porta, quindi l’app non riesce a parlare con la scheda.',
  'Close any serial monitor (Arduino IDE, PlatformIO, screen, another BoardPilot window) and try again.':
    'Chiudi i monitor seriali aperti (Arduino IDE, PlatformIO, screen, un’altra finestra di BoardPilot) e riprova.',
  'The board did not answer when the app tried to wake it up.':
    'La scheda non ha risposto quando l’app ha provato a svegliarla.',
  'Hold the BOOT button, press and release EN, then release BOOT and try again. Some boards need this every time.':
    'Tieni premuto il pulsante BOOT, premi e rilascia EN, poi rilascia BOOT e riprova. Alcune schede lo richiedono ogni volta.',
  'The board disappeared while the app was talking to it.':
    'La scheda è sparita mentre l’app ci stava parlando.',
  'Check the USB cable is firmly plugged in, then search for boards again.':
    'Controlla che il cavo USB sia inserito bene, poi cerca di nuovo le schede.',
  'macOS did not allow the app to open the port.': 'macOS non ha permesso all’app di aprire la porta.',
  'Unplug and replug the board. If you installed a driver, allow it in System Settings → Privacy & Security.':
    'Scollega e ricollega la scheda. Se hai installato un driver, consentilo in Impostazioni di Sistema → Privacy e sicurezza.',
  'esptool reported a problem: {detail}': 'esptool ha segnalato un problema: {detail}',
  'The board answered, but the app could not read its details.':
    'La scheda ha risposto, ma l’app non è riuscita a leggerne i dettagli.',
  'Try again. If it repeats, update esptool: pip3 install -U esptool':
    'Riprova. Se si ripete, aggiorna esptool: pip3 install -U esptool',

  /* ---------- USB bridge driver hints (ports.ts) ---------- */
  'This board uses a Silicon Labs CP210x chip. On recent macOS it works without a driver; if not, install the “CP210x VCP driver” from silabs.com.':
    'Questa scheda usa un chip Silicon Labs CP210x. Sulle versioni recenti di macOS funziona senza driver; altrimenti installa il “CP210x VCP driver” da silabs.com.',
  'This board uses a WCH CH34x chip. Install the “CH34x macOS driver” from wch-ic.com, then allow it in System Settings → Privacy & Security.':
    'Questa scheda usa un chip WCH CH34x. Installa il “CH34x macOS driver” da wch-ic.com, poi consentilo in Impostazioni di Sistema → Privacy e sicurezza.',
  'Look at the small chip next to the USB port: “CP2102” needs the Silicon Labs driver, “CH340” needs the WCH driver.':
    'Guarda il piccolo chip vicino alla porta USB: “CP2102” richiede il driver Silicon Labs, “CH340” il driver WCH.',

  /* ---------- real driver ---------- */
  'The backup file is smaller than the flash. It is not safe to continue.':
    'Il file di backup è più piccolo della flash. Non è sicuro continuare.',
  'Try the backup again with a shorter or better USB cable.':
    'Rifai il backup con un cavo USB più corto o di qualità migliore.',

  /* ---------- hardware hub ---------- */
  'Switched to simulator mode. No real board is used.': 'Passato alla modalità simulatore. Non si usa nessuna scheda vera.',
  'Switched to real hardware mode.': 'Passato alla modalità hardware reale.',
  'Simulator scenario: {name}': 'Scenario del simulatore: {name}',
  'This only works in simulator mode.': 'Funziona solo in modalità simulatore.',
  'Switch to the simulator in the developer menu.': 'Passa al simulatore dal menu sviluppatore.',
  'Simulator: the wiring on the bench was fixed.': 'Simulatore: i collegamenti sul banco sono stati sistemati.',
  'Simulator: turning the knob from one end to the other.': 'Simulatore: giro la manopola da un capo all’altro.',
  'Looking for boards': 'Ricerca delle schede',
  'Identifying the board': 'Identificazione della scheda',
  'The board has not been identified yet.': 'La scheda non è ancora stata identificata.',
  'Run “Connect and identify” first.': 'Esegui prima “Collega e identifica”.',
  'Backing up the program currently on the board, so it can be restored with one click.':
    'Faccio il backup del programma che c’è ora sulla scheda, così puoi ripristinarlo con un clic.',
  'Backing up your firmware': 'Backup del tuo firmware',
  'Backup saved ({mb} MB).': 'Backup salvato ({mb} MB).',
  'The diagnostic agent firmware is not included in this copy of the app yet.':
    'Il firmware dell’agente diagnostico non è ancora incluso in questa copia dell’app.',
  'Build it once with “npm run build:agent” (needs arduino-cli and the esp32 core), then try again.':
    'Compilalo una volta con “npm run build:agent” (servono arduino-cli e il core esp32), poi riprova.',
  'The app is still busy with the board.': 'L’app sta ancora lavorando con la scheda.',
  'Wait for the current task to finish.': 'Aspetta che finisca l’operazione in corso.',
  'No board selected.': 'Nessuna scheda selezionata.',
  'Writing the diagnostic agent to the board.': 'Scrivo l’agente diagnostico sulla scheda.',
  'Installing the diagnostic agent': 'Installazione dell’agente diagnostico',
  'Connecting to the agent': 'Connessione all’agente',
  'Strapping pins at reset: {pins}.': 'Pin di strapping al reset: {pins}.',
  'GPIO 12 was HIGH at reset: this can select the wrong flash voltage.':
    'GPIO 12 era HIGH al reset: così può essere scelta la tensione flash sbagliata.',
  'The board did not answer as the diagnostic agent.': 'La scheda non ha risposto come agente diagnostico.',
  'Install the agent (the app asks first), or press EN to restart the board.':
    'Installa l’agente (l’app te lo chiede prima), oppure premi EN per riavviare la scheda.',
  'Diagnostic agent {ver} running on {chip}. Free memory: {kb} KB.':
    'Agente diagnostico {ver} attivo su {chip}. Memoria libera: {kb} KB.',
  'Driving a pin needs your confirmation.': 'Per pilotare un pin serve la tua conferma.',
  'Use the button in the app, which asks first.': 'Usa il pulsante nell’app, che ti chiede prima.',
  'The diagnostic agent is not connected.': 'L’agente diagnostico non è connesso.',
  'Start a check that installs it. The app asks before writing anything.':
    'Avvia un controllo che lo installa. L’app ti chiede prima di scrivere qualsiasi cosa.',
  'Agent command “{cmd}”': 'Comando dell’agente “{cmd}”',
  'That backup belongs to another board or was deleted.': 'Quel backup è di un’altra scheda oppure è stato eliminato.',
  'Pick a backup made from this board.': 'Scegli un backup fatto da questa scheda.',
  'Restoring your firmware from the backup.': 'Ripristino il tuo firmware dal backup.',
  'Restoring your firmware': 'Ripristino del tuo firmware',
  'Your firmware is back on the board.': 'Il tuo firmware è di nuovo sulla scheda.',
  'Writing {file} at {offset}.': 'Scrivo {file} all’indirizzo {offset}.',
  'Flashing your firmware': 'Caricamento del tuo firmware',
  'Flashing firmware': 'Caricamento del firmware',
  'Opening the serial monitor': 'Apertura del monitor seriale',
  'The serial monitor is not open.': 'Il monitor seriale non è aperto.',
  'Open it first.': 'Aprilo prima.',
  'Sending to the board': 'Invio alla scheda',
  'Reading serial output': 'Lettura dell’output seriale',

  /* ---------- simulator driver ---------- */
  'The port {port} is not there any more.': 'La porta {port} non c’è più.',
  'Close any serial monitor (Arduino IDE, PlatformIO, screen) and try again.':
    'Chiudi i monitor seriali aperti (Arduino IDE, PlatformIO, screen) e riprova.',
  'Hold the BOOT button, press and release EN, then release BOOT and try again.':
    'Tieni premuto il pulsante BOOT, premi e rilascia EN, poi rilascia BOOT e riprova.',
  'The diagnostic agent is not on the board.': 'L’agente diagnostico non è sulla scheda.',
  'Install it first. The app backs up your program before writing.':
    'Installalo prima. L’app fa il backup del tuo programma prima di scrivere.',
  'Install it first (the app asks before writing).': 'Installalo prima (l’app ti chiede prima di scrivere).',

  /* ---------- simulator scenarios (app/main/sim/scenarios/*.json) ---------- */
  'Weather station, SDA and SCL crossed': 'Stazione meteo, SDA e SCL incrociati',
  'BME280 on D21/D22 with SDA and SCL crossed at the sensor, LED on D25 at 62% PWM, knob on D34 at 1.84 V, button with pull-up on D12 (strapping pin).':
    'BME280 su D21/D22 con SDA e SCL incrociati sul sensore, LED su D25 al 62% di PWM, manopola su D34 a 1.84 V, pulsante con pull-up su D12 (pin di strapping).',
  'Weather station, all good': 'Stazione meteo, tutto a posto',
  'Everything wired correctly. The firmware streams temperature, humidity, pressure and the knob.':
    'Tutto collegato correttamente. Il firmware invia temperatura, umidità, pressione e la manopola.',
  'Sold as BME280, is a BMP280': 'Venduto come BME280, è un BMP280',
  'Wiring is right, but the chip answers ID 0x58: a BMP280 without humidity.':
    'I collegamenti sono giusti, ma il chip risponde con ID 0x58: è un BMP280 senza umidità.',
  'Sensor VIN unplugged': 'VIN del sensore scollegato',
  'The sensor\'s power wire is loose: no pull-ups on the bus and no answer.':
    'Il filo di alimentazione del sensore è staccato: niente pull-up sul bus e nessuna risposta.',
  'No board detected': 'Nessuna scheda rilevata',
  'No serial port appears: charge-only cable or missing driver.':
    'Non compare nessuna porta seriale: cavo USB solo ricarica o driver mancante.',
  'Port busy': 'Porta occupata',
  'The port exists but another app (a serial monitor) holds it open.':
    'La porta esiste, ma un’altra app (un monitor seriale) la tiene aperta.',
  'Board keeps resetting': 'La scheda continua a riavviarsi',
  'The firmware draws too much current when Wi-Fi starts; the brownout detector resets the board.':
    'Il firmware assorbe troppa corrente quando parte il Wi-Fi: il rilevatore di brownout riavvia la scheda.',
  'Garbage on serial': 'Caratteri strani sulla seriale',
  'The sketch uses Serial.begin(9600) but the monitor listens at 115200.':
    'Lo sketch usa Serial.begin(9600), ma il monitor ascolta a 115200.',

  /* ---------- license ---------- */
  'This license key is not valid.': 'Questa chiave di licenza non è valida.',
  'Copy the whole key, starting with BP1-. If it still fails, contact us from the website.':
    'Copia tutta la chiave, a partire da BP1-. Se non funziona ancora, contattaci dal sito.',

  /* ---------- parts import and user parts ---------- */
  'That does not look like a web link.': 'Questo non sembra un link web.',
  'Paste a full link starting with https://': 'Incolla un link completo che inizia con https://',
  'Only web links (http or https) can be imported.': 'Si possono importare solo link web (http o https).',
  'Paste a product page or datasheet link.': 'Incolla il link di una pagina prodotto o di un datasheet.',
  'The page could not be loaded.': 'Non è stato possibile caricare la pagina.',
  'Check the link and your internet connection, or add the part by hand.':
    'Controlla il link e la connessione a internet, oppure aggiungi il componente a mano.',
  'The site answered with an error ({status}).': 'Il sito ha risposto con un errore ({status}).',
  'Some shops block apps. Try the datasheet PDF link, or add the part by hand.':
    'Alcuni negozi bloccano le app. Prova il link al PDF del datasheet, oppure aggiungi il componente a mano.',
  'The file is too large to import (over 8 MB).': 'Il file è troppo grande da importare (oltre 8 MB).',
  'Use the product page instead of a big PDF.': 'Usa la pagina prodotto invece di un PDF grande.',
  'Reading a PDF datasheet needs the AI assistant.': 'Per leggere un datasheet in PDF serve l’assistente AI.',
  'Add ANTHROPIC_API_KEY to .env.local, or use the product page link, or add the part by hand.':
    'Aggiungi ANTHROPIC_API_KEY in .env.local, oppure usa il link della pagina prodotto, oppure aggiungi il componente a mano.',
  'Built-in parts cannot be deleted.': 'I componenti integrati non si possono eliminare.',
  'You can remove it from your project instead.': 'Puoi invece toglierlo dal tuo progetto.',

  /* ---------- AI assistant ---------- */
  'The AI assistant is off because no API key is set.':
    'L’assistente AI è spento perché non è impostata nessuna chiave API.',
  'Add ANTHROPIC_API_KEY=... to a file named .env.local in the project folder, then restart the app. Everything else works without it.':
    'Aggiungi ANTHROPIC_API_KEY=... in un file chiamato .env.local nella cartella del progetto, poi riavvia l’app. Tutto il resto funziona anche senza.',
  'The API key was not accepted.': 'La chiave API non è stata accettata.',
  'Check ANTHROPIC_API_KEY in .env.local and restart the app.':
    'Controlla ANTHROPIC_API_KEY in .env.local e riavvia l’app.',
  'The AI service is busy right now.': 'Il servizio AI è occupato in questo momento.',
  'Wait a minute and ask again.': 'Aspetta un minuto e chiedi di nuovo.',
  'The app could not reach the AI service.': 'L’app non riesce a raggiungere il servizio AI.',
  'Check your internet connection. Measurements and checks still work offline.':
    'Controlla la connessione a internet. Misure e controlli funzionano anche offline.',
  'The AI service returned an error ({status}).': 'Il servizio AI ha restituito un errore ({status}).',
  'Try again in a moment.': 'Riprova tra poco.',
  'The assistant failed: {msg}': 'L’assistente non è riuscito a rispondere: {msg}',
  'Try again.': 'Riprova.',
  'The assistant could not answer that request.': 'L’assistente non può rispondere a questa richiesta.',
  'Rephrase the question about your board or wiring.': 'Riformula la domanda sulla tua scheda o sui collegamenti.',
  'The assistant needed too many steps.': 'All’assistente servivano troppi passaggi.',
  'Ask a more specific question.': 'Fai una domanda più precisa.',
  'No answer.': 'Nessuna risposta.',
  'The assistant could not read the photo.': 'L’assistente non è riuscito a leggere la foto.',
  'Try a sharper photo with the printed text visible, or pick the part from the list.':
    'Prova una foto più nitida con le scritte leggibili, oppure scegli il componente dall’elenco.',
  'The assistant could not read that page.': 'L’assistente non è riuscito a leggere quella pagina.',
  'Add the part by hand.': 'Aggiungi il componente a mano.',
  'The assistant answer could not be read.': 'Non è stato possibile leggere la risposta dell’assistente.',
  'Try again or add the part by hand.': 'Riprova oppure aggiungi il componente a mano.',
  'I could not match that to an option.': 'Non sono riuscito ad abbinarlo a una delle opzioni.',

  /* ---------- IPC results ---------- */
  'Not saved.': 'Non salvato.',
  'Export cancelled.': 'Esportazione annullata.',
  'Nothing opened.': 'Nessun file aperto.',
  'That file is not a BoardPilot project.': 'Quel file non è un progetto BoardPilot.',
  'Pick a .boardpilot.json file saved from the app.': 'Scegli un file .boardpilot.json salvato dall’app.',

  /* ---------- safety tokens ---------- */
  'This would write to the board, and it was not confirmed.':
    'Questo scriverebbe sulla scheda, ma non è stato confermato.',
  'Use the Confirm button in the dialog to allow it.': 'Usa il pulsante Conferma nella finestra per consentirlo.',
  'Install Python from python.org (tick “Add python.exe to PATH”), then open Command Prompt and run: py -m pip install esptool. Then restart BoardPilot.':
    'Installa Python da python.org (spunta “Add python.exe to PATH”), poi apri il Prompt dei comandi ed esegui: py -m pip install esptool. Poi riavvia BoardPilot.',
  'Open Terminal and run: pip3 install esptool (or brew install esptool). Then restart BoardPilot.':
    'Apri il Terminale ed esegui: pip3 install esptool (oppure brew install esptool). Poi riavvia BoardPilot.',
  'This board uses a Silicon Labs CP210x chip. Install the “CP210x Universal Windows Driver” from silabs.com, then unplug and replug the board.':
    'Questa scheda usa un chip Silicon Labs CP210x. Installa il “CP210x Universal Windows Driver” da silabs.com, poi scollega e ricollega la scheda.',
  'This board uses a WCH CH34x chip. Install the “CH341SER” Windows driver from wch-ic.com, then unplug and replug the board.':
    'Questa scheda usa un chip WCH CH34x. Installa il driver Windows “CH341SER” da wch-ic.com, poi scollega e ricollega la scheda.',
};

export default it;
