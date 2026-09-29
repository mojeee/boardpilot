// Italian translations. Key = the exact English text passed to t().
// Scope: 3D view, 2D pinout, info card (app/renderer/three) and renderer state (app/renderer/state).
const it: Record<string, string> = {
  /* ---------- viewport ---------- */
  'Project opened.': 'Progetto aperto.',
  'Project saved to {path}.': 'Progetto salvato in {path}.',
  Power: 'Alimentazione',
  Ground: 'Massa',
  'Simulated board': 'Scheda simulata',
  Live: 'Dal vivo',
  '{n} wiring errors': '{n} errori di cablaggio',
  '1 wiring error': '1 errore di cablaggio',
  '{n} warnings': '{n} avvisi',
  '1 warning': '1 avviso',
  '2D pinout': 'Piedinatura 2D',
  Overview: 'Panoramica',
  Top: 'Dall’alto',
  'Pin side': 'Lato pin',
  Module: 'Modulo',
  Labels: 'Etichette',
  Diagram: 'Schema',
  'Wiring diagram': 'Schema dei collegamenti',
  'Wiring diagram of the project': 'Schema dei collegamenti del progetto',
  'Save as SVG…': 'Salva come SVG…',
  'Wiring diagram saved to {path}.': 'Schema dei collegamenti salvato in {path}.',
  'No wires yet. Add parts and wires (or start from a template) and the diagram draws itself.': 'Ancora nessun filo. Aggiungi componenti e fili (o parti da un modello) e lo schema si disegna da solo.',
  'Show the name of every pin': 'Mostra il nome di ogni pin',
  Desk: 'Banco',
  Plain: 'Semplice',
  'Floor style: a workbench or a plain grid': 'Sfondo: un banco di lavoro o una griglia semplice',
  'Draw wire': 'Disegna filo',
  Parts: 'Componenti',
  'Undo (⌘Z)': 'Annulla (⌘Z)',
  'Redo (⇧⌘Z)': 'Ripeti (⇧⌘Z)',
  'Open project…': 'Apri progetto…',
  'Save project…': 'Salva progetto…',
  'From {pin}: now click a pin on a part.': 'Da {pin}: ora clicca un pin su un componente.',
  'Click a board pin, then a pin on a part.': 'Clicca un pin della scheda, poi un pin su un componente.',
  'Drag parts to move · R rotate · Delete remove · ⌘Z undo · W wire mode':
    'Trascina i componenti per spostarli · R ruota · Canc rimuovi · ⌘Z annulla · W modalità filo',

  /* ---------- info card: pin ---------- */
  '{name} (default)': '{name} (predefinito)',
  'Wired to': 'Collegato a',
  'level {n}': 'livello {n}',
  '{n}% duty': 'duty {n}%',
  measured: 'misurato',
  'No live data. Start live view in Monitor.': 'Nessun dato dal vivo. Avvia la vista dal vivo in Monitor.',
  'No live data. Needs the diagnostic agent.': 'Nessun dato dal vivo. Serve l’agente diagnostico.',
  'Voltage is measured only on ADC pins, and only when the app asks the ADC.':
    'La tensione si misura solo sui pin ADC, e solo quando l’app interroga l’ADC.',
  'This pin reports a digital level only (0 or 1), never a voltage.':
    'Questo pin indica solo un livello digitale (0 o 1), mai una tensione.',
  'Set HIGH…': 'Porta a HIGH…',
  'Set LOW…': 'Porta a LOW…',

  // pin flags (FLAG_TEXT in PinInfoCard)
  'Input only: can read, cannot drive an LED or other output. No internal pull-up.':
    'Solo ingresso: può leggere, ma non può pilotare un LED o altre uscite. Nessuna resistenza di pull-up interna.',
  'Strapping pin: its level at reset changes how the board boots.':
    'Pin di strapping: il suo livello al reset cambia il modo in cui la scheda si avvia.',
  'Connected to the internal flash. Never use.': 'Collegato alla flash interna. Non usarlo mai.',
  'Carries the USB serial link (uploads and the serial monitor).':
    'Porta il collegamento seriale USB (caricamento del programma e monitor seriale).',
  'ADC2: measuring voltage stops working while Wi-Fi is on.':
    'ADC2: la misura di tensione smette di funzionare quando il Wi-Fi è acceso.',
  'ADC1: can measure voltage, also with Wi-Fi on.': 'ADC1: può misurare la tensione, anche con il Wi-Fi acceso.',
  'Drives the blue LED on the board.': 'Pilota il LED blu sulla scheda.',

  // pin notes from boards/esp32-devkitc-30.json
  'USB serial TX. Used for uploading and the serial monitor.':
    'TX della seriale USB. Serve per caricare il programma e per il monitor seriale.',
  'USB serial RX. Used for uploading and the serial monitor.':
    'RX della seriale USB. Serve per caricare il programma e per il monitor seriale.',
  'Strapping pin (SDIO timing). Pulled up at reset. Fine to use after boot.':
    'Pin di strapping (temporizzazione SDIO). Tenuto HIGH da un pull-up al reset. Puoi usarlo senza problemi dopo l’avvio.',
  'Strapping pin: must be LOW or floating to enter download mode. Drives the blue on-board LED on most DevKit V1 boards.':
    'Pin di strapping: deve essere LOW o scollegato per entrare in modalità download. Sulla maggior parte delle schede DevKit V1 pilota il LED blu integrato.',
  'Strapping pin: LOW at reset silences the boot messages.':
    'Pin di strapping: se è LOW al reset, i messaggi di avvio non vengono stampati.',
  'Output of the on-board 3.3 V regulator (about 600 mA shared with the ESP32).':
    'Uscita del regolatore 3.3 V della scheda (circa 600 mA, condivisi con l’ESP32).',
  'Reset. Pulling it LOW resets the chip (same as the EN button).':
    'Reset. Se lo porti a LOW il chip si riavvia (come il pulsante EN).',
  'Outputs a short PWM signal at boot.': 'All’avvio emette un breve segnale PWM.',
  'Strapping pin: HIGH at reset selects 1.8 V flash voltage, so the board may not boot. Keep it LOW or floating at reset.':
    'Pin di strapping: se è HIGH al reset seleziona la tensione flash a 1.8 V e la scheda potrebbe non avviarsi. Tienilo LOW o scollegato al reset.',
  '5 V from USB (or a 5 V input when USB is not connected).':
    '5 V dalla USB (oppure un ingresso a 5 V quando la USB non è collegata).',

  /* ---------- info card: part ---------- */
  Rename: 'Rinomina',
  'my part': 'mio componente',
  Rotate: 'Ruota',
  Duplicate: 'Duplica',
  Delete: 'Elimina',
  Remove: 'Rimuovi',
  'Measures {what}.': 'Misura {what}.',
  Pins: 'Pin',
  'not wired': 'non collegato',
  Source: 'Fonte',
  'Edit part definition': 'Modifica la definizione del componente',

  // part measures and categories (values from part files)
  temperature: 'temperatura',
  humidity: 'umidità',
  pressure: 'pressione',
  acceleration: 'accelerazione',
  rotation: 'rotazione',
  sensor: 'sensore',
  display: 'display',
  output: 'uscita',
  input: 'ingresso',

  /* ---------- info card: wire ---------- */
  Wire: 'Filo',
  'Remove wire': 'Rimuovi filo',
  Close: 'Chiudi',

  /* ---------- 3D parts ---------- */
  'Unknown part “{id}”': 'Componente sconosciuto “{id}”',
  'Click a board pin first, then the part pin.': 'Clicca prima un pin della scheda, poi il pin del componente.',
  'Wire added: {from} → {part} {pin}.': 'Filo aggiunto: {from} → {part} {pin}.',
  suggestion: 'suggerimento',

  /* ---------- scene actions ---------- */
  'Added {name}.': 'Aggiunto {name}.',
  'Removed {name} and its wires. Press ⌘Z to undo.': 'Rimosso {name} con i suoi fili. Premi ⌘Z per annullare.',
  'Removed a wire. Press ⌘Z to undo.': 'Filo rimosso. Premi ⌘Z per annullare.',

  /* ---------- hardware helpers (hw.ts) ---------- */
  'I2C scan on {sda}/{scl}: {steps}': 'Scansione I2C su {sda}/{scl}: {steps}',
  'I2C read on {sda}/{scl}: {steps}': 'Lettura I2C su {sda}/{scl}: {steps}',
  'Install the diagnostic agent?': 'Installare l’agente diagnostico?',
  'The app needs a small helper program on the board to see the pins. It replaces your program for now.':
    'Per vedere i pin, l’app ha bisogno di un piccolo programma di aiuto sulla scheda. Per ora sostituisce il tuo programma.',
  'First, a full copy of the program on your board is saved on this Mac.':
    'Prima viene salvata su questo Mac una copia completa del programma che hai sulla scheda.',
  'Then the diagnostic agent is written to the board.': 'Poi l’agente diagnostico viene scritto sulla scheda.',
  '“Restore my firmware” puts your program back with one click.':
    '“Ripristina il mio firmware” rimette il tuo programma con un clic.',
  'Back up and install': 'Fai il backup e installa',
  'You cancelled. Nothing was written.': 'Hai annullato. Non è stato scritto nulla.',
  'Drive {pin} HIGH?': 'Portare {pin} a HIGH?',
  'Drive {pin} LOW?': 'Portare {pin} a LOW?',
  'The board will output {volts} on {pin}.': 'La scheda metterà {volts} in uscita su {pin}.',
  'Only do this if nothing connected to this pin drives it too (that could short two outputs).':
    'Fallo solo se nient’altro collegato a questo pin lo sta pilotando (potresti cortocircuitare due uscite).',
  'The agent refuses input-only and flash pins.': 'L’agente rifiuta i pin di solo ingresso e quelli della flash.',
  'Set HIGH': 'Porta a HIGH',
  'Set LOW': 'Porta a LOW',
  '{pin} set HIGH.': '{pin} portato a HIGH.',
  '{pin} set LOW.': '{pin} portato a LOW.',
  'Run PWM on {pin}?': 'Avviare il PWM su {pin}?',
  'The board will switch the pin on and off {hz} times a second, on {duty}% of the time. An LED looks {duty}% bright.':
    'La scheda accenderà e spegnerà il pin {hz} volte al secondo, acceso per il {duty}% del tempo. Un LED sembrerà luminoso al {duty}%.',
  'Only do this if nothing else drives this pin.': 'Fallo solo se nient’altro pilota questo pin.',
  'Start PWM': 'Avvia PWM',
  'There is no backup for this board yet. A backup is made automatically before the first write.':
    'Non c’è ancora un backup per questa scheda. Il backup viene fatto in automatico prima della prima scrittura.',
  'Restore your firmware?': 'Ripristinare il tuo firmware?',
  'This writes the backup from {date} back to the board.': 'Questo riscrive sulla scheda il backup del {date}.',
  'The diagnostic agent is removed.': 'L’agente diagnostico viene rimosso.',
  'Your program runs again after the board restarts.': 'Il tuo programma riparte dopo il riavvio della scheda.',
  Restore: 'Ripristina',
};

export default it;
