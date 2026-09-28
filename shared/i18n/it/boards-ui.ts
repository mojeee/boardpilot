// Italian translations. Key = the exact English text passed to t().
// Scope: multi-board UI: board picker, board-specific flashing tools (avrdude, nrfjprog, picotool,
// STM32 tools, teensy_loader_cli), board-aware wiring rules and board identification texts.
const it: Record<string, string> = {
  "This board is not in the library.":
    "Questa scheda non è nella libreria.",
  "Pick a board from the list.":
    "Scegli una scheda dall’elenco.",
  "Board set to {name}.":
    "Scheda impostata: {name}.",
  "This board cannot read its program back, so no backup was made. The confirmation you gave covered this.":
    "Questa scheda non può rileggere il suo programma, quindi non è stato fatto nessun backup. La conferma che hai dato copriva anche questo.",
  "The diagnostic agent is not available for the {board} yet.":
    "L’agente diagnostico non è ancora disponibile per {board}.",
  "You can still check the wiring in 3D, flash your own firmware and use the serial monitor.":
    "Puoi comunque controllare il cablaggio in 3D, caricare il tuo firmware e usare il monitor seriale.",
  "Build it once with “npm run build:agent” (needs arduino-cli and the board’s core), then try again.":
    "Compilalo una volta con “npm run build:agent” (servono arduino-cli e il core della scheda), poi riprova.",
  "The backup file is empty. It is not safe to continue.":
    "Il file di backup è vuoto. Non è sicuro continuare.",
  "The board’s bootloader did not answer.":
    "Il bootloader della scheda non ha risposto.",
  "Check that the right board is selected (for a Nano clone try the old bootloader), close other serial monitors, and try again.":
    "Controlla di aver scelto la scheda giusta (per un clone di Nano prova il vecchio bootloader), chiudi gli altri monitor seriali e riprova.",
  "The chip on this board is not the one the selected board uses.":
    "Il chip su questa scheda non è quello della scheda scelta.",
  "Pick the board you really have in the board list.":
    "Scegli nell’elenco la scheda che hai davvero.",
  "avrdude reported a problem: {detail}":
    "avrdude ha segnalato un problema: {detail}",
  "The app could not find avrdude, the tool that talks to Arduino AVR boards.":
    "L’app non trova avrdude, lo strumento che parla con le schede Arduino AVR.",
  "Install the Arduino IDE (it includes avrdude), or open Terminal and run: brew install avrdude. Then restart BoardPilot.":
    "Installa l’IDE Arduino (include avrdude), oppure apri il Terminale ed esegui: brew install avrdude. Poi riavvia BoardPilot.",
  "Install the Arduino IDE (it includes avrdude), then restart BoardPilot.":
    "Installa l’IDE Arduino (include avrdude), poi riavvia BoardPilot.",
  "This board has no avrdude settings.":
    "Questa scheda non ha impostazioni per avrdude.",
  "Pick another board, or report this as a bug.":
    "Scegli un’altra scheda, oppure segnalalo come bug.",
  "The app has no flashing tool for this board yet.":
    "L’app non ha ancora uno strumento per caricare il firmware su questa scheda.",
  "You can still check the wiring in 3D and use the serial monitor.":
    "Puoi comunque controllare il cablaggio in 3D e usare il monitor seriale.",
  "The chip’s memory is read-protected, so it cannot be read or backed up.":
    "La memoria del chip è protetta in lettura, quindi non si può leggere né salvare in un backup.",
  "Removing the protection erases the chip. Do it only if you do not need the program on it.":
    "Togliere la protezione cancella il chip. Fallo solo se il programma che c’è sopra non ti serve.",
  "The app could not reach the board’s J-Link debugger.":
    "L’app non riesce a raggiungere il debugger J-Link della scheda.",
  "Check that the board is switched on and the USB cable is in the port marked for the debugger (J2 on the nRF52840 DK).":
    "Controlla che la scheda sia accesa e che il cavo USB sia nella porta del debugger (J2 sulla nRF52840 DK).",
  "nrfjprog reported a problem: {detail}":
    "nrfjprog ha segnalato un problema: {detail}",
  "The app could not find nrfjprog, the tool that talks to Nordic boards.":
    "L’app non trova nrfjprog, lo strumento che parla con le schede Nordic.",
  "Install the nRF Command Line Tools from nordicsemi.com (they include nrfjprog and the SEGGER J-Link software). Then restart BoardPilot.":
    "Installa gli nRF Command Line Tools da nordicsemi.com (includono nrfjprog e il software SEGGER J-Link). Poi riavvia BoardPilot.",
  "This board needs a .hex file.":
    "Questa scheda ha bisogno di un file .hex.",
  "Export a .hex file from your build and pick that one.":
    "Esporta un file .hex dalla tua compilazione e scegli quello.",
  "The board could not be switched to its USB bootloader.":
    "Non è stato possibile mettere la scheda nel suo bootloader USB.",
  "Unplug the board, hold the BOOTSEL button while plugging it back in, then release it and try again.":
    "Scollega la scheda, tieni premuto il pulsante BOOTSEL mentre la ricolleghi, poi rilascialo e riprova.",
  "picotool reported a problem: {detail}":
    "picotool ha segnalato un problema: {detail}",
  "The app could not find picotool, the tool that talks to Raspberry Pi Pico boards.":
    "L’app non trova picotool, lo strumento che parla con le schede Raspberry Pi Pico.",
  "Open Terminal and run: brew install picotool (or install the Raspberry Pi Pico core in the Arduino IDE). Then restart BoardPilot.":
    "Apri il Terminale ed esegui: brew install picotool (oppure installa il core Raspberry Pi Pico nell’IDE Arduino). Poi riavvia BoardPilot.",
  "Install the Raspberry Pi Pico core in the Arduino IDE (it includes picotool), then restart BoardPilot.":
    "Installa il core Raspberry Pi Pico nell’IDE Arduino (include picotool), poi riavvia BoardPilot.",
  "{tool} did not finish in time.":
    "{tool} non ha finito in tempo.",
  "{tool} is not installed.":
    "{tool} non è installato.",
  "The system did not allow the app to open the board.":
    "Il sistema non ha permesso all’app di aprire la scheda.",
  "Add the udev rules for this board (see the board’s documentation), then unplug and replug it.":
    "Aggiungi le regole udev per questa scheda (vedi la documentazione della scheda), poi scollegala e ricollegala.",
  "Unplug and replug the board. If you installed a driver, allow it in the system settings.":
    "Scollega e ricollega la scheda. Se hai installato un driver, consentilo nelle impostazioni di sistema.",
  "The app could not reach the STM32 chip.":
    "L’app non riesce a raggiungere il chip STM32.",
  "Check the USB cable. For a Black Pill over USB: hold BOOT0, press and release NRST, then release BOOT0 and try again.":
    "Controlla il cavo USB. Per una Black Pill via USB: tieni premuto BOOT0, premi e rilascia NRST, poi rilascia BOOT0 e riprova.",
  "{tool} reported a problem: {detail}":
    "{tool} ha segnalato un problema: {detail}",
  "The app could not find a tool that talks to STM32 chips.":
    "L’app non trova uno strumento che parli con i chip STM32.",
  "Install STM32CubeProgrammer from st.com, or open Terminal and run: brew install stlink dfu-util. Then restart BoardPilot.":
    "Installa STM32CubeProgrammer da st.com, oppure apri il Terminale ed esegui: brew install stlink dfu-util. Poi riavvia BoardPilot.",
  "Install STM32CubeProgrammer from st.com, then restart BoardPilot.":
    "Installa STM32CubeProgrammer da st.com, poi riavvia BoardPilot.",
  "dfu-util can only write .bin files.":
    "dfu-util può scrivere solo file .bin.",
  "Export a .bin file from your build, or install STM32CubeProgrammer.":
    "Esporta un file .bin dalla tua compilazione, oppure installa STM32CubeProgrammer.",
  "The app could not find teensy_loader_cli, the tool that programs Teensy boards.":
    "L’app non trova teensy_loader_cli, lo strumento che programma le schede Teensy.",
  "Open Terminal and run: brew install teensy_loader_cli (or install Teensyduino). Then restart BoardPilot.":
    "Apri il Terminale ed esegui: brew install teensy_loader_cli (oppure installa Teensyduino). Poi riavvia BoardPilot.",
  "Install Teensyduino from pjrc.com, then restart BoardPilot.":
    "Installa Teensyduino da pjrc.com, poi riavvia BoardPilot.",
  "This port does not look like a Teensy.":
    "Questa porta non sembra una Teensy.",
  "Pick the port that appears when the Teensy is plugged in, or press its program button once.":
    "Scegli la porta che compare quando colleghi la Teensy, oppure premi una volta il suo pulsante di programmazione.",
  "Teensy boards cannot read their program back, so no backup is possible.":
    "Le schede Teensy non possono rileggere il loro programma, quindi il backup non è possibile.",
  "Keep a copy of your own firmware file to put it back later.":
    "Tieni una copia del tuo file firmware per rimetterlo in seguito.",
  "Teensy boards cannot read their program back, so there is no backup to restore.":
    "Le schede Teensy non possono rileggere il loro programma, quindi non c’è nessun backup da ripristinare.",
  "Flash your own firmware file instead.":
    "Carica invece il tuo file firmware.",
  "teensy_loader_cli reported a problem: {detail}":
    "teensy_loader_cli ha segnalato un problema: {detail}",
  "Press the white program button on the Teensy once and try again.":
    "Premi una volta il pulsante bianco di programmazione sulla Teensy e riprova.",
  "BME280 on {sda}/{scl} with SDA and SCL crossed at the sensor, LED at 62% PWM, knob and button.":
    "BME280 su {sda}/{scl} con SDA e SCL invertiti sul sensore, LED con PWM al 62%, manopola e pulsante.",
  "USB ids match: {boards}.":
    "Gli ID USB corrispondono a: {boards}.",
  "No plugged-in board matched a known USB id. Pick your board from the list.":
    "Nessuna scheda collegata corrisponde a un ID USB conosciuto. Scegli la tua scheda dall’elenco.",
  "Choose your board":
    "Scegli la tua scheda",
  "Pin rules, the 3D model, flashing and the simulator all follow the board you pick.":
    "Regole dei pin, modello 3D, caricamento del firmware e simulatore seguono tutti la scheda che scegli.",
  "Search boards, e.g. Pico, STM32, Uno":
    "Cerca schede, ad es. Pico, STM32, Uno",
  "Find my board":
    "Trova la mia scheda",
  "Several boards use the same USB chip. Pick the one printed on your board.":
    "Più schede usano lo stesso chip USB. Scegli quella stampata sulla tua scheda.",
  "{v} V logic":
    "Logica a {v} V",
  "{n} pins":
    "{n} pin",
  "Live pin view":
    "Vista dei pin dal vivo",
  "Wiring checks and flashing":
    "Controlli del cablaggio e caricamento",
  "Plugged in":
    "Collegata",
  "In use":
    "In uso",
  "No board matches. Try another name.":
    "Nessuna scheda corrisponde. Prova un altro nome.",
  "Change the board":
    "Cambia scheda",
  "First, a full copy of the program on your board is saved on this computer.":
    "Prima viene salvata su questo computer una copia completa del programma che c’è sulla scheda.",
  "This board cannot read its program back, so no backup is possible. Your current program will be replaced.":
    "Questa scheda non può rileggere il suo programma, quindi il backup non è possibile. Il programma attuale verrà sostituito.",
  "The project now uses the {board}.":
    "Ora il progetto usa {board}.",
  "{moved} wires moved to matching pins, {dropped} removed. Check them in the 3D view.":
    "{moved} fili spostati sui pin corrispondenti, {dropped} rimossi. Controllali nella vista 3D.",
  "{a} or {b}":
    "{a} o {b}",
  "Never use the flash pins. Move this wire to a free pin such as {pins}.":
    "Non usare mai i pin della flash. Sposta questo filo su un pin libero come {pins}.",
  "Move it to {pin}.":
    "Spostalo su {pin}.",
  "{pin} is a power input. It only has voltage when the board is powered through it, not from USB.":
    "{pin} è un ingresso di alimentazione. Ha tensione solo quando la scheda è alimentata da lì, non dalla USB.",
  "Use {pin} for power.":
    "Usa {pin} per l’alimentazione.",
  "Move the power wire to {pin}. {got} V can damage the part and the board pins it talks to.":
    "Sposta il filo di alimentazione su {pin}. {got} V possono danneggiare il componente e i pin della scheda a cui è collegato.",
  "A GPIO can only supply a few milliamps. Use {pin} for power.":
    "Un GPIO può dare solo pochi milliampere. Usa {pin} per l’alimentazione.",
  "This pin is input only. Move this wire to a pin such as {pins}.":
    "Questo pin è solo ingresso. Sposta questo filo su un pin come {pins}.",
  "Move the wire to an analog input such as {pins}.":
    "Sposta il filo su un ingresso analogico come {pins}.",
  "If your project uses Wi-Fi, move this wire to an ADC1 pin such as {pins}.":
    "Se il tuo progetto usa il Wi-Fi, sposta questo filo su un pin ADC1 come {pins}.",
  "{pin} (GPIO {gpio}) is a strapping pin. If {part} holds it at the wrong level at reset, the board may not boot.":
    "{pin} (GPIO {gpio}) è un pin di strapping. Se {part} lo tiene al livello sbagliato al reset, la scheda potrebbe non avviarsi.",
  "Move this wire to a pin that is not a strapping pin, such as {pins}.":
    "Sposta questo filo su un pin che non sia di strapping, come {pins}.",
  "{pin} carries the board’s USB data line. Using it breaks uploading and the serial monitor over USB.":
    "{pin} porta la linea dati USB della scheda. Usarlo blocca il caricamento e il monitor seriale via USB.",
  "{pin} is part of the debug port. Using it can stop the debugger from reaching the chip.":
    "{pin} fa parte della porta di debug. Usarlo può impedire al debugger di raggiungere il chip.",
  "Move this wire to a free pin such as {pins}.":
    "Sposta questo filo su un pin libero come {pins}.",
  "{pin} is already used by something on the board. {note}":
    "{pin} è già usato da qualcosa sulla scheda. {note}",
  "{part} is a {need} V part, but {pin} uses 5 V signals. This can damage the part.":
    "{part} è un componente a {need} V, ma {pin} usa segnali a 5 V. Questo può danneggiare il componente.",
  "Use a level shifter between the board and the part, or a version of the part made for 5 V.":
    "Usa un convertitore di livello (level shifter) tra la scheda e il componente, oppure una versione del componente fatta per 5 V.",
  "{part} works at 5 V and may send 5 V signals into {pin}, which only takes 3.3 V.":
    "{part} funziona a 5 V e può mandare segnali a 5 V su {pin}, che accetta solo 3,3 V.",
  "Use a level shifter, or a 3.3 V version of the part.":
    "Usa un convertitore di livello (level shifter), oppure una versione a 3,3 V del componente.",
  "{part}: SDA goes to {sda} and SCL to {scl}. That is the reverse of the board’s default (SDA = {dsda}, SCL = {dscl}).":
    "{part}: SDA va su {sda} e SCL su {scl}. È il contrario di quello predefinito della scheda (SDA = {dsda}, SCL = {dscl}).",
  "Swap the two wires at the sensor, or set Wire.begin({sda}, {scl}) in your code.":
    "Scambia i due fili sul sensore, oppure scrivi Wire.begin({sda}, {scl}) nel tuo codice.",
  "Swap the two wires at the sensor. On this board the I2C pins are fixed.":
    "Scambia i due fili sul sensore. Su questa scheda i pin I2C sono fissi.",
  "Add a wire from {pin} to this pin.":
    "Aggiungi un filo da {pin} a questo pin.",
  "Board: {chip}, ID {mac}, flash {flash}.":
    "Scheda: {chip}, ID {mac}, flash {flash}.",
  "The USB ids on {port} match: {boards}. The project is set to the {board}. If yours is different, pick it with the board button at the top.":
    "Gli ID USB su {port} corrispondono a: {boards}. Il progetto è impostato su {board}. Se la tua è diversa, sceglila con il pulsante della scheda in alto.",
  "The board answered as {chip}, but the project is set to the {board}. Pick the right board with the board button at the top, so pin rules and flashing match.":
    "La scheda ha risposto come {chip}, ma il progetto è impostato su {board}. Scegli la scheda giusta con il pulsante della scheda in alto, così le regole dei pin e il caricamento corrispondono.",
  "The diagnostic agent is not available for the {board} yet, so the app checks your wiring drawing instead.":
    "L’agente diagnostico non è ancora disponibile per {board}, quindi l’app controlla il disegno del cablaggio.",
  "No diagnostic agent for this board yet. Checking the wiring drawing instead.":
    "Ancora nessun agente diagnostico per questa scheda. Controllo il disegno del cablaggio.",
  "Flash {flash}, ID {mac}, USB chip {chip}":
    "Flash {flash}, ID {mac}, chip USB {chip}",
  "Chip {chip}, flash {flash}, ID {mac}":
    "Chip {chip}, flash {flash}, ID {mac}",
  "Board ID: {id}":
    "ID della scheda: {id}",
  "No USB port that looks like a development board.":
    "Nessuna porta USB sembra una scheda di sviluppo.",
  "Assuming the default pins: SDA on {sda}, SCL on {scl}. Change the wires in the 3D view if yours differ.":
    "Uso i pin predefiniti: SDA su {sda}, SCL su {scl}. Se i tuoi sono diversi, cambia i fili nella vista 3D.",
  "{part}, on the default pins {sda} and {scl}.":
    "{part}, sui pin predefiniti {sda} e {scl}.",
  "Pick the .{ext} file your build produced (Arduino: Sketch → Export Compiled Binary).":
    "Scegli il file .{ext} prodotto dalla compilazione (Arduino: Sketch → Esporta sketch compilato).",
  "Check the diagnostic agent":
    "Controlla l’agente diagnostico",
  "Find the board on USB and read its chip, flash size and ID.":
    "Trova la scheda sulla USB e leggi chip, dimensione della flash e ID.",
  "The app asks the chip for its type, flash size and ID. This only reads.":
    "L’app chiede al chip il tipo, la dimensione della flash e l’ID. Legge soltanto.",
  "The diagnostic agent can run I2C on any two pins, so the app scans again with the two lines exchanged. If the sensor answers only now, the wires are crossed.":
    "L’agente diagnostico può usare l’I2C su due pin qualsiasi, quindi l’app ripete la scansione con le due linee scambiate. Se il sensore risponde solo ora, i fili sono invertiti.",
  "Write a firmware file to the board, after a backup, and check that it starts.":
    "Scrivi un file firmware sulla scheda, dopo un backup, e controlla che si avvii.",
  "suggestion (USB ids; several boards can share one USB chip)":
    "suggerimento (ID USB; più schede possono avere lo stesso chip USB)",
  "First, a full copy of the program on your board is saved on this computer (1 to 2 minutes). Boards that cannot be read back (Teensy) are not backed up.":
    "Prima viene salvata su questo computer una copia completa del programma che c’è sulla scheda (1-2 minuti). Le schede che non possono essere rilette (Teensy) non vengono salvate.",
  "If this board has no backup yet, the app first saves a full copy of its flash on this computer. Boards that cannot be read back (Teensy) are not backed up.":
    "Se questa scheda non ha ancora un backup, l’app salva prima su questo computer una copia completa della sua flash. Le schede che non possono essere rilette (Teensy) non vengono salvate.",
  "Input (the board drives it)":
    "Ingresso (lo pilota la scheda)",
  "Then the diagnostic agent is written to the board.":
    "Poi l’agente diagnostico viene scritto sulla scheda.",
  "This pin is wired to the board’s flash memory.": "Questo pin è collegato alla memoria flash della scheda.",
  "Pick another pin. Using the flash pins crashes the board.": "Scegli un altro pin. Usare i pin della flash blocca la scheda.",
  "This pin can only read signals. It cannot drive an output.": "Questo pin può solo leggere segnali. Non può pilotare un’uscita.",
  "Move this wire to an output-capable pin (see the board’s safe pins in the pin card).": "Sposta questo filo su un pin che può fare da uscita (vedi i pin sicuri della scheda nella scheda del pin).",
  "This pin carries the USB serial link the app uses to talk to the board.": "Questo pin porta il collegamento seriale USB che l’app usa per parlare con la scheda.",
  "Leave the USB serial pins free while the app is connected.": "Lascia liberi i pin della seriale USB mentre l’app è collegata.",
  "This pin is used for USB or the debug port, so the agent does not touch it.": "Questo pin è usato per l’USB o la porta di debug, quindi l’agente non lo tocca.",
  "Pick another pin.": "Scegli un altro pin.",
  "Use an analog (ADC) pin. On ESP32 boards, ADC1 pins keep working with Wi-Fi on.": "Usa un pin analogico (ADC). Sulle schede ESP32 i pin ADC1 funzionano anche con il Wi-Fi acceso.",
  "This pin is analog only: it can measure a voltage but has no digital input or output.": "Questo pin è solo analogico: può misurare una tensione ma non ha ingresso o uscita digitale.",
  "Use it with an analog reading, or pick another pin for digital signals.": "Usalo per una lettura analogica, oppure scegli un altro pin per i segnali digitali.",
  "This pin cannot output PWM on this board.": "Su questa scheda questo pin non può generare PWM.",
  "Pick a pin marked PWM on the board, such as the ones with ~ on Arduino boards.": "Scegli un pin segnato come PWM sulla scheda, per esempio quelli con ~ sulle schede Arduino.",
  "The I2C lines did not go HIGH: the bus is stuck or has no pull-up resistors.": "Le linee I2C non sono andate ALTE: il bus è bloccato o non ha resistenze di pull-up.",
  "Check that the sensor is powered and that SDA and SCL have pull-ups (most breakout boards include them).": "Controlla che il sensore sia alimentato e che SDA e SCL abbiano le pull-up (la maggior parte dei moduli le include).",
  "That pin number does not exist on this board.": "Quel numero di pin non esiste su questa scheda.",
};

export default it;
