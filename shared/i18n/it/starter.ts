// Italian translations. Key = the exact English text passed to t().
// Scope: starter projects (shared/starter, New project "3. Starter code", session:saveProject).
const it: Record<string, string> = {
  Toolchain: 'Toolchain',
  'Generate Pico SDK project': 'Genera progetto Pico SDK',
  'Save project folder…': 'Salva cartella del progetto…',
  'Project files': 'File del progetto',
  'A CMake project for the official Raspberry Pi Pico SDK, with only the pins in your drawing. The README says how to build it.':
    'Un progetto CMake per il Pico SDK ufficiale di Raspberry Pi, con solo i pin del tuo disegno. Il README spiega come compilarlo.',
  'Generated a Pico SDK project for {board}.': 'Generato un progetto Pico SDK per {board}.',
  'Saved the project in {path}.': 'Progetto salvato in {path}.',
  'The project files are not valid, so nothing was saved.': 'I file del progetto non sono validi, quindi non è stato salvato nulla.',
  'Generate the project again, then save it.': 'Genera di nuovo il progetto, poi salvalo.',
  'Choose where to create the project folder': 'Scegli dove creare la cartella del progetto',
  'Create folder here': 'Crea la cartella qui',
  'There are already too many folders with this name here.': 'Qui ci sono già troppe cartelle con questo nome.',
  'Pick another place, or remove old copies.': 'Scegli un altro posto, o elimina le copie vecchie.',
  '{pin} is wired to both {a} and {b}. The starter uses it for {a} only.': '{pin} è collegato sia a {a} sia a {b}. Il progetto iniziale lo usa solo per {a}.',
  '{part}: {pin} is not wired, so the starter leaves this I2C part out.': '{part}: {pin} non è collegato, quindi il progetto iniziale esclude questo componente I2C.',
  'SDA ({sda}) and SCL ({scl}) are not an I2C pair on this chip, so the starter does not start I2C there. Move the wires to a pair such as {dsda} and {dscl}.':
    'SDA ({sda}) e SCL ({scl}) non sono una coppia I2C su questo chip, quindi il progetto iniziale non avvia l’I2C lì. Sposta i fili su una coppia come {dsda} e {dscl}.',
  'The I2C pins {sda} and {scl} use the same I2C block as another pair, so the starter leaves them out. Put all I2C parts on the same two pins.':
    'I pin I2C {sda} e {scl} usano lo stesso blocco I2C di un’altra coppia, quindi il progetto iniziale li esclude. Metti tutti i componenti I2C sugli stessi due pin.',
  '{part} uses other pins of an SPI block that another part already uses, so the starter leaves its SPI out.':
    '{part} usa altri pin di un blocco SPI già usato da un altro componente, quindi il progetto iniziale esclude il suo SPI.',
  'The SPI pins of {part} are not one SPI block on this chip, so the starter does not start SPI for it.':
    'I pin SPI di {part} non appartengono a un solo blocco SPI su questo chip, quindi il progetto iniziale non avvia l’SPI per questo componente.',
  '{part}: {pin} is not an analog pin, so the starter reads it as a digital level. Move the wire to {pins} for a real reading.':
    '{part}: {pin} non è un pin analogico, quindi il progetto iniziale legge solo il livello digitale. Sposta il filo su {pins} per una lettura vera.',
  // ESP-IDF and STM32 HAL starters (shared/starter/espIdf.ts, stm32Hal.ts)
  'Generate {toolchain} project': 'Genera progetto {toolchain}',
  'Generated a {toolchain} project for {board}.': 'Generato un progetto {toolchain} per {board}.',
  "An ESP-IDF project (idf.py) for Espressif's official framework, with only the pins in your drawing. The README says how to build and flash it.":
    'Un progetto ESP-IDF (idf.py) per il framework ufficiale di Espressif, con solo i pin del tuo disegno. Il README spiega come compilarlo e caricarlo.',
  "A CMake project with ST's official HAL drivers (downloaded when you build), with only the pins in your drawing. The README says how to build and flash it.":
    'Un progetto CMake con i driver HAL ufficiali di ST (scaricati quando compili), con solo i pin del tuo disegno. Il README spiega come compilarlo e caricarlo.',
  '{pin} is connected to the flash or PSRAM chip, so the starter does not use it for {part}. Move the wire to a free pin.':
    '{pin} è collegato al chip di flash o PSRAM, quindi il progetto iniziale non lo usa per {part}. Sposta il filo su un pin libero.',
  '{pin} can only be an input, so the starter cannot drive {part} there. Move the wire to an output-capable pin.':
    '{pin} può essere solo un ingresso, quindi il progetto iniziale non può comandare {part} lì. Sposta il filo su un pin che può fare da uscita.',
  '{part}: SCK is not wired, so the starter does not start SPI for it.': '{part}: SCK non è collegato, quindi il progetto iniziale non avvia l’SPI per questo componente.',
  '{part}: {pin} has no internal pull-up, so the button needs a 10 kΩ resistor from {pin} to 3.3 V.':
    '{part}: {pin} non ha una resistenza di pull-up interna, quindi il pulsante ha bisogno di una resistenza da 10 kΩ tra {pin} e 3,3 V.',
  'The board file has no alternate function number for {fn} on {pin}, so the starter does not set it up.':
    'Il file della scheda non indica il numero di funzione alternativa per {fn} su {pin}, quindi il progetto iniziale non la configura.',
  '{pin} carries the printf output ({uart}) on this board, so the starter does not use it for {part}. Move the wire to a free pin.':
    'Su questa scheda {pin} porta l’uscita di printf ({uart}), quindi il progetto iniziale non lo usa per {part}. Sposta il filo su un pin libero.',
  '{pin} is a debug (SWD) pin that programs the board, so the starter does not use it for {part}. Move the wire to a free pin.':
    '{pin} è un pin di debug (SWD) che programma la scheda, quindi il progetto iniziale non lo usa per {part}. Sposta il filo su un pin libero.',
};
export default it;
