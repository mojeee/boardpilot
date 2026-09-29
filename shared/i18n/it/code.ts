// Italian translations. Key = the exact English text passed to t().
// Scope: code vs wiring checker (shared/codeCheck.ts, components/CodeCheck.tsx) and opening a sketch.
const it: Record<string, string> = {
  'check of the drawing against your code (not a measurement)': 'confronto tra il disegno e il tuo codice (non è una misura)',
  'Line {line}: pin {pin} is not on this board’s header.': 'Riga {line}: il pin {pin} non è sui connettori di questa scheda.',
  'Check the pin number against the board’s pinout (2D pinout view).': 'Controlla il numero del pin sulla piedinatura della scheda (vista piedinatura 2D).',
  'Line {line}: {pin} is connected to the board’s flash memory. Using it stops the program.':
    'Riga {line}: {pin} è collegato alla memoria flash della scheda. Usarlo blocca il programma.',
  'Use another pin.': 'Usa un altro pin.',
  'Line {line}: pinMode({pin}, OUTPUT), but {pin} can only be an input.': 'Riga {line}: pinMode({pin}, OUTPUT), ma {pin} può essere solo un ingresso.',
  'Pick an output-capable pin for this signal and move the wire to it.': 'Scegli un pin che può fare da uscita per questo segnale e sposta lì il filo.',
  'Line {line}: {mode} on {pin}, but this pin has no internal pull resistor. A button there reads random values.':
    'Riga {line}: {mode} su {pin}, ma questo pin non ha resistenze di pull interne. Un pulsante lì legge valori casuali.',
  'Add an external 10 kΩ resistor, or use a pin that has internal pull-ups.': 'Aggiungi una resistenza esterna da 10 kΩ, oppure usa un pin con pull-up interne.',
  'Line {line}: {fn}({pin}, …), but {pin} can only be an input.': 'Riga {line}: {fn}({pin}, …), ma {pin} può essere solo un ingresso.',
  'Line {line}: {fn}({pin}), but {pin} has no analog input.': 'Riga {line}: {fn}({pin}), ma {pin} non ha un ingresso analogico.',
  'Use an analog pin such as {pins}.': 'Usa un pin analogico come {pins}.',
  'Line {line}: {pin} is an ADC2 pin, and this sketch turns on Wi-Fi. ADC2 readings fail while Wi-Fi is on.':
    'Riga {line}: {pin} è un pin ADC2 e questo sketch accende il Wi-Fi. Le letture ADC2 non funzionano con il Wi-Fi acceso.',
  'Move the analog wire to an ADC1 pin such as {pins}.': 'Sposta il filo analogico su un pin ADC1 come {pins}.',
  'Line {line}: {call}({pin}), but the drawing has {role} on {want}.': 'Riga {line}: {call}({pin}), ma nel disegno {role} è su {want}.',
  'Change the code to {call}({want}), or move the wire.': 'Cambia il codice in {call}({want}), oppure sposta il filo.',
  'Line {line}: Serial.begin({baud}), but the monitor listens at {monitor}. The output will look like garbage.':
    'Riga {line}: Serial.begin({baud}), ma il monitor ascolta a {monitor}. L’uscita sembrerà spazzatura.',
  'Set the monitor to {baud} baud, or change Serial.begin.': 'Imposta il monitor a {baud} baud, oppure cambia Serial.begin.',
  'Line {line}: the code sets SDA = {sda} and SCL = {scl}, the reverse of the drawing (SDA on {dsda}, SCL on {dscl}).':
    'Riga {line}: il codice imposta SDA = {sda} e SCL = {scl}, al contrario del disegno (SDA su {dsda}, SCL su {dscl}).',
  'Line {line}: the code sets SDA = {sda} and SCL = {scl}, but the drawing has SDA on {dsda} and SCL on {dscl}.':
    'Riga {line}: il codice imposta SDA = {sda} e SCL = {scl}, ma nel disegno SDA è su {dsda} e SCL su {dscl}.',
  'Change the code to Wire.begin({sda}, {scl}), or move the wires to match the code.': 'Cambia il codice in Wire.begin({sda}, {scl}), oppure sposta i fili come nel codice.',
  'Line {line}: the code drives {pin}, but nothing is wired there. In the drawing, {part} is on {wired}.':
    'Riga {line}: il codice comanda {pin}, ma lì non è collegato niente. Nel disegno, {part} è su {wired}.',
  'Line {line}: the code drives {pin}, but nothing is wired there in the drawing.': 'Riga {line}: il codice comanda {pin}, ma nel disegno lì non è collegato niente.',
  'Change the pin in the code to {wired}, or move the wire to {pin}.': 'Cambia il pin nel codice in {wired}, oppure sposta il filo su {pin}.',
  'Check the pin number, or add the part to the drawing.': 'Controlla il numero del pin, oppure aggiungi il componente al disegno.',
  '{part} is wired to {pin}, but the code never uses {pin}.': '{part} è collegato a {pin}, ma il codice non usa mai {pin}.',
  'If the code uses a variable for this pin, check that it is set to {n}.': 'Se il codice usa una variabile per questo pin, controlla che valga {n}.',
  'Checking {file} against the drawing.': 'Confronto {file} con il disegno.',
  'Open my sketch…': 'Apri il mio sketch…',
  'Hide the code': 'Nascondi il codice',
  'Paste code': 'Incolla il codice',
  'Paste your Arduino sketch here.': 'Incolla qui il tuo sketch Arduino.',
  'The pins in your code match the drawing.': 'I pin nel tuo codice corrispondono al disegno.',
  '{n} problems found. Fix the red ones before uploading.': '{n} problemi trovati. Correggi quelli rossi prima di caricare.',
  '{n} things to check.': '{n} cose da controllare.',
  'This compares the code with the drawing; it does not measure the board.': 'Confronta il codice con il disegno; non misura la scheda.',
  '4. Check my code against the drawing': '4. Confronta il mio codice con il disegno',
  'No file chosen.': 'Nessun file scelto.',
  'This file is too big for a sketch.': 'Questo file è troppo grande per uno sketch.',
  'Pick the .ino file of your project.': 'Scegli il file .ino del tuo progetto.',
  'The file could not be read.': 'Non è stato possibile leggere il file.',
  'Check that the file still exists and try again.': 'Controlla che il file esista ancora e riprova.',
};
export default it;
