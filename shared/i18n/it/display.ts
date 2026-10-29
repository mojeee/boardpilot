// Italian translations. Key = the exact English text passed to t().
// Display Studio: the panel, the chat card, the checks and the code generator notes.
const it: Record<string, string> = {
  'Simulated: {w}x{h} pixels, as the {controller} shows them': 'Simulato: {w}x{h} pixel, come li mostra il {controller}',
  'Display Studio: “{title}” now runs on {part} ({n} screens). Undo brings the previous one back.':
    'Display Studio: “{title}” ora gira su {part} ({n} schermate). Annulla riporta quella di prima.',
  'Display Studio: “{title}” for the {part}': 'Display Studio: “{title}” per il {part}',
  'Draws the same pixels as the preview (same font, shapes and pattern maths). Values are simulated until you replace the lines marked TODO with your sensors. Libraries: {libs}.':
    'Disegna gli stessi pixel dell’anteprima (stesso font, forme e calcoli dei pattern). I valori sono simulati finché non sostituisci le righe TODO con i tuoi sensori. Librerie: {libs}.',
  'Display Studio wrote the code for “{title}”: press Tab in the Code panel to use it.': 'Display Studio ha scritto il codice per “{title}”: premi Tab nel pannello Codice per usarlo.',
  'Fits the screen': 'Sta nello schermo',
  Play: 'Avvia',
  Simulated: 'Simulato',
  '16-bit colour': 'colore a 16 bit',
  'one colour': 'un colore',
  'e-paper': 'e-paper',
  Screens: 'Schermate',
  'after {s} s': 'dopo {s} s',
  'when {cond}': 'quando {cond}',
  'Values (simulated: move a slider to try a value)': 'Valori (simulati: muovi un cursore per provare un valore)',
  auto: 'auto',
  'on the board: {from}': 'sulla scheda: {from}',
  'Write the code': 'Scrivi il codice',
  'Change the display “{title}” on {part}: ': 'Cambia il display “{title}” su {part}: ',
  'Change it with the assistant': 'Cambialo con l’assistente',
  'Add a display to the project (for example an ST7789, ILI9341 or SSD1306), then design what it shows here, or ask the assistant.':
    'Aggiungi un display al progetto (per esempio un ST7789, ILI9341 o SSD1306), poi progetta qui cosa mostra, oppure chiedilo all’assistente.',
  'Start with test patterns': 'Inizia con i pattern di prova',
  'Design what the {part} ({id}) should show: ': 'Progetta cosa deve mostrare il {part} ({id}): ',
  'Describe it to the assistant': 'Descrivilo all’assistente',
  '{n} screens': '{n} schermate',
  'The display {part} is not in the drawing.': 'Il display {part} non è nel disegno.',
  'Running on your project': 'In funzione nel tuo progetto',
  'Open Display Studio': 'Apri Display Studio',
  'Live preview of {part}': 'Anteprima dal vivo di {part}',
  'Display Studio: what your screen shows, simulated pixel by pixel': 'Display Studio: cosa mostra il tuo schermo, simulato pixel per pixel',
  'The preview works for the {controller}, but BoardPilot cannot write its code yet (supported: {list}).':
    'L’anteprima funziona per il {controller}, ma BoardPilot non sa ancora scriverne il codice (supportati: {list}).',
  'The {controller} needs LovyanGFX or TFT_eSPI, which BoardPilot writes for ESP32 boards (TFT_eSPI also for RP2040 and RP2350). This board is not one of them.':
    'Il {controller} richiede LovyanGFX o TFT_eSPI, che BoardPilot scrive per le schede ESP32 (TFT_eSPI anche per RP2040 e RP2350). Questa scheda non è tra queste.',
  'There is no {wanted} driver for the {controller} on this board, so the code uses {used} instead.':
    'Per il {controller} su questa scheda non c’è un driver {wanted}, quindi il codice usa {used}.',
  'LovyanGFX and TFT_eSPI draw lines and circles with their own algorithms, so a shape can differ from the preview by a pixel here and there.':
    'LovyanGFX e TFT_eSPI disegnano linee e cerchi con algoritmi propri, quindi una forma può differire dall’anteprima di un pixel qua e là.',
  'Some 0.96" 80x160 modules need cfg.offset_x and cfg.offset_y in the LGFX class to centre the picture.':
    'Alcuni moduli da 0,96" 80x160 richiedono cfg.offset_x e cfg.offset_y nella classe LGFX per centrare l’immagine.',
  'TFT_eSPI reads its pins from User_Setup.h: copy the generated file into the TFT_eSPI library folder before you build.':
    'TFT_eSPI legge i pin da User_Setup.h: copia il file generato nella cartella della libreria TFT_eSPI prima di compilare.',
  'TFT_eSPI supports newer chips only in its latest versions. If the build fails on this board, try LovyanGFX.':
    'TFT_eSPI supporta i chip più recenti solo nelle ultime versioni. Se la compilazione fallisce su questa scheda, prova LovyanGFX.',
  Library: 'Libreria',
  'Code as': 'Codice come',
  Sketch: 'Sketch',
  Module: 'Modulo',
  'One sketch with setup() and loop()': 'Uno sketch con setup() e loop()',
  'display_screens.h and display_screens.cpp with display_init() and display_update(), to add to your own sketch':
    'display_screens.h e display_screens.cpp con display_init() e display_update(), da aggiungere al tuo sketch',
  'Display Studio added the module for “{title}”: {files}. In your sketch, include "display_screens.h", call display_init() in setup() and display_update() in loop().':
    'Display Studio ha aggiunto il modulo per “{title}”: {files}. Nel tuo sketch includi "display_screens.h", chiama display_init() in setup() e display_update() in loop().',
  'Display Studio added {files} to the project files. TFT_eSPI needs it in its library folder: copy it there before you build.':
    'Display Studio ha aggiunto {files} ai file del progetto. TFT_eSPI lo vuole nella cartella della sua libreria: copialo lì prima di compilare.',
  'The display’s DC pin is not wired: wire it, then generate the code again.': 'Il pin DC del display non è collegato: collegalo, poi genera di nuovo il codice.',
  'RST is not wired: the code uses -1 (no reset pin). Tie RST high or wire it to a free pin.': 'RST non è collegato: il codice usa -1 (nessun pin di reset). Porta RST alto o collegalo a un pin libero.',
  'This board has too little RAM for a full-screen frame buffer ({kb} KB), so the code draws straight to the display: fast animations will flicker.':
    'Questa scheda ha troppa poca RAM per un frame buffer a schermo intero ({kb} KB), quindi il codice disegna direttamente sul display: le animazioni veloci sfarfalleranno.',
  '{where}: the condition “{cond}” is not understood. Use forms like temp > 30, alarm, !alarm, joined with && or ||.':
    '{where}: la condizione “{cond}” non è chiara. Usa forme come temp > 30, alarm, !alarm, unite con && o ||.',
  'The display has no screens.': 'Il display non ha schermate.',
  'The first screen “{id}” does not exist.': 'La prima schermata “{id}” non esiste.',
  'A change of screen goes from “{from}” to “{to}”, and one of them does not exist.': 'Un cambio di schermata va da “{from}” a “{to}”, e una delle due non esiste.',
  'The change from “{from}” to “{to}” has neither a time nor a condition.': 'Il cambio da “{from}” a “{to}” non ha né un tempo né una condizione.',
  '{where} uses the value “{name}”, which is not defined.': '{where} usa il valore “{name}”, che non è definito.',
  '{where}: the text “{text}” goes past the {w}x{h} screen.': '{where}: il testo “{text}” esce dallo schermo {w}x{h}.',
  '{where} goes past the {w}x{h} screen.': '{where} esce dallo schermo {w}x{h}.',
  '{where}: a {kind} pattern needs a colour screen; on this one it shows in two tones only.': '{where}: un pattern {kind} richiede uno schermo a colori; su questo si vede solo in due toni.',
  'E-paper takes seconds to refresh: moving patterns will not look smooth on the real panel.': 'L’e-paper impiega secondi ad aggiornarsi: i pattern in movimento non saranno fluidi sul pannello reale.',
  'Simulated: click the screen to tap it ({w}x{h} pixels)': 'Simulato: clicca lo schermo per toccarlo ({w}x{h} pixel)',
  'Click the preview to tap it, like a finger on the touch screen.': 'Clicca l’anteprima per toccarla, come con un dito sul touch screen.',
  'on a tap': 'al tocco',
  '{where}: the button does nothing when tapped. Give it an action.': '{where}: il pulsante non fa nulla quando lo tocchi. Dagli un’azione.',
  '{where}: the button goes to the screen “{id}”, which does not exist.': '{where}: il pulsante porta alla schermata “{id}”, che non esiste.',
  '{where}: the button is smaller than 24x24 pixels, which is hard to tap with a finger.': '{where}: il pulsante è più piccolo di 24x24 pixel, difficile da toccare con un dito.',
  '{where}: the label “{text}” is wider than the button.': '{where}: l’etichetta “{text}” è più larga del pulsante.',
  'The XPT2046 shares the SPI bus with the display: give it its own chip select (T_CS). Its numbers are raw: calibrate the corners once in the TOUCH_RAW lines.':
    'L’XPT2046 condivide il bus SPI con il display: dagli un chip select suo (T_CS). I suoi numeri sono grezzi: calibra gli angoli una volta nelle righe TOUCH_RAW.',
  'The GT911 picks its I2C address (0x5D or 0x14) from the level of INT while RST is released. If the controller is not found, the library’s own address setting may need changing.':
    'Il GT911 sceglie il suo indirizzo I2C (0x5D o 0x14) dal livello di INT mentre RST viene rilasciato. Se il controller non viene trovato, potrebbe servire cambiare l’indirizzo nella libreria.',
  'The drawing has buttons but no touch controller is wired. Add an XPT2046, FT6236 or GT911 touch part to the project; until then the code only has an empty touch read to fill in.':
    'Il disegno ha pulsanti ma nessun controller touch collegato. Aggiungi al progetto un XPT2046, FT6236 o GT911; fino ad allora il codice ha solo una lettura touch vuota da completare.',
  'Added the picture “{id}” ({w}x{h}, {bytes} bytes in flash) to the screen “{screen}”.': 'Aggiunta l’immagine “{id}” ({w}x{h}, {bytes} byte in flash) alla schermata “{screen}”.',
  'This image could not be read. Try a PNG file.': 'Non riesco a leggere questa immagine. Prova con un file PNG.',
  'Imported the font “{name}”. Ask the assistant to use it: text with this font takes its y position as the baseline.':
    'Font “{name}” importato. Chiedi all’assistente di usarlo: con questo font la posizione y del testo è la linea di base.',
  'Pictures and fonts': 'Immagini e font',
  'Width in pixels': 'Larghezza in pixel',
  'Picture type': 'Tipo di immagine',
  '1-bit': '1 bit',
  Colour: 'Colore',
  'One bit per pixel, drawn in one colour. Small.': 'Un bit per pixel, disegnata in un solo colore. Piccola.',
  'Full colour, two bytes per pixel.': 'A colori, due byte per pixel.',
  'Swap light and dark': 'Inverti chiaro e scuro',
  'Import a picture': 'Importa un’immagine',
  'Import a font (.h)': 'Importa un font (.h)',
  'A font header made for Adafruit GFX (for example FreeSans9pt7b.h). BoardPilot does not convert TrueType fonts.':
    'Un file di font per Adafruit GFX (per esempio FreeSans9pt7b.h). BoardPilot non converte i font TrueType.',
  'Without an imported font the text uses the built-in 5x7 font, which can be scaled from 1x to 8x.': 'Senza un font importato il testo usa il font 5x7 incorporato, ingrandibile da 1x a 8x.',
  '{where} uses the picture “{id}”, which is not imported.': '{where} usa l’immagine “{id}”, che non è stata importata.',
  '{where} uses the font “{id}”, which is not imported.': '{where} usa il font “{id}”, che non è stato importato.',
  'The pictures and fonts take {kb} KB, more than half of the {flash} KB flash of {board}. Use smaller or one-bit pictures.':
    'Immagini e font occupano {kb} KB, più della metà dei {flash} KB di flash di {board}. Usa immagini più piccole o a 1 bit.',
  'The pictures and fonts take {kb} KB, over a quarter of the {flash} KB flash of {board}.': 'Immagini e font occupano {kb} KB, più di un quarto dei {flash} KB di flash di {board}.',
  'Pictures are kept in flash and read one pixel at a time, so they do not use RAM, but this board has only {ram} KB of RAM for everything else.':
    'Le immagini stanno in flash e si leggono un pixel alla volta, quindi non usano RAM, ma questa scheda ha solo {ram} KB di RAM per tutto il resto.',
  'The picture “{id}” is damaged or larger than {max} pixels a side.': 'L’immagine “{id}” è danneggiata o più grande di {max} pixel per lato.',
  'This is not an Adafruit GFX font header: it needs the Bitmaps array, the Glyphs table and the GFXfont line.': 'Questo non è un file di font per Adafruit GFX: servono l’array Bitmaps, la tabella Glyphs e la riga GFXfont.',
  'The bitmap data of this font has values that are not bytes.': 'I dati bitmap di questo font hanno valori che non sono byte.',
  'A glyph in this font does not have the six numbers (offset, width, height, advance, x offset, y offset).': 'Un glifo di questo font non ha i sei numeri (offset, larghezza, altezza, avanzamento, offset x, offset y).',
  'The character range of this font does not match its glyph table.': 'L’intervallo di caratteri di questo font non corrisponde alla tabella dei glifi.',
  'A glyph points past the end of the font’s bitmap data.': 'Un glifo punta oltre la fine dei dati bitmap del font.',
  'LVGL draws with its own widgets and Montserrat fonts: the screens match the preview in layout, colours and behaviour, not pixel for pixel.':
    'LVGL disegna con i suoi widget e i font Montserrat: le schermate corrispondono all’anteprima per disposizione, colori e comportamento, non pixel per pixel.',
  'Test patterns have no LVGL counterpart and are left out of this code.': 'I pattern di prova non hanno un equivalente in LVGL e restano fuori da questo codice.',
  'The ° sign is in LVGL’s Montserrat fonts only if they were built with it; if it shows as a box, use a font that has it.':
    'Il simbolo ° è nei font Montserrat di LVGL solo se sono stati generati con esso; se compare come un quadratino, usa un font che lo contiene.',
  'Imported Adafruit GFX fonts are not used with LVGL (it has its own font format): the text uses Montserrat. LVGL’s font converter makes fonts for it.':
    'I font Adafruit GFX importati non si usano con LVGL (ha un suo formato): il testo usa Montserrat. Il convertitore di font di LVGL crea font per lui.',
  'Copy the generated lv_conf.h into Documents/Arduino/libraries next to the lvgl folder (replacing the one there), then build with LVGL 8.3.':
    'Copia il file lv_conf.h generato in Documents/Arduino/libraries accanto alla cartella lvgl (sostituendo quello che c’è), poi compila con LVGL 8.3.',
  'BoardPilot cannot build LVGL code itself: build it once in the Arduino IDE and tell the assistant about any error it shows.':
    'BoardPilot non può compilare da solo il codice LVGL: compilalo una volta nell’Arduino IDE e riferisci all’assistente ogni errore che compare.',
};

export default it;
