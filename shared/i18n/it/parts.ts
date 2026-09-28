// Italian translations. Key = the exact English text passed to t().
// Parts library and part editor (PartsLibrary.tsx, PartEditor.tsx).
const it: Record<string, string> = {
  // Part editor: pin roles (ROLE_LABEL)
  'Power (VCC)': 'Alimentazione (VCC)',
  Ground: 'Massa',
  'I2C SDA': 'I2C SDA',
  'I2C SCL': 'I2C SCL',
  'SPI MOSI': 'SPI MOSI',
  'SPI MISO': 'SPI MISO',
  'SPI clock': 'SPI clock',
  'SPI chip select': 'SPI chip select',
  'Input (ESP32 drives it)': 'Ingresso (lo pilota l’ESP32)',
  'Output (part drives it)': 'Uscita (la pilota il componente)',
  'Analog output': 'Uscita analogica',
  'One-wire data': 'Dati One-Wire',
  Interrupt: 'Interrupt',
  'Other / not wired': 'Altro / non collegato',

  // Part categories (CATEGORIES)
  sensor: 'sensore',
  display: 'display',
  output: 'uscita',
  input: 'ingresso',

  // 3D shapes (SHAPES)
  breakout: 'breakout',
  module: 'modulo',
  chip: 'chip',
  oled: 'OLED',
  led: 'LED',
  button: 'pulsante',
  pot: 'potenziometro',
  dht: 'DHT',
  motor: 'motore',
  relay: 'relè',

  // Part editor
  '“{name}” is in your parts library.': '“{name}” ora è nella tua libreria dei componenti.',
  'import, confirmed by you': 'importato, confermato da te',
  'added by you': 'aggiunto da te',
  'Edit part': 'Modifica componente',
  'Check the imported part': 'Controlla il componente importato',
  'New part': 'Nuovo componente',
  Close: 'Chiudi',
  suggestion: 'suggerimento',
  'Drafted by the AI assistant from the page.': 'Bozza preparata dall’assistente AI a partire dalla pagina.',
  'Guessed from keywords on the page.': 'Ricavato dalle parole chiave della pagina.',
  'Check the pins against the part in your hand before saving.':
    'Prima di salvare, confronta i pin con il componente che hai in mano.',
  Name: 'Nome',
  'HC-SR04 ultrasonic sensor': 'Sensore a ultrasuoni HC-SR04',
  Kind: 'Tipo',
  Bus: 'Bus',
  none: 'nessuno',
  'Supply (V)': 'Alimentazione (V)',
  'I2C addresses': 'Indirizzi I2C',
  'Pins, in the order printed on the board': 'Pin, nell’ordine stampato sulla schedina',
  'Move up': 'Sposta su',
  'Move down': 'Sposta giù',
  'Remove pin': 'Rimuovi pin',
  'Add pin': 'Aggiungi pin',
  '3D model': 'Modello 3D',
  Shape: 'Forma',
  'W (mm)': 'L (mm)',
  'D (mm)': 'P (mm)',
  'H (mm)': 'A (mm)',
  Width: 'Larghezza',
  Depth: 'Profondità',
  Height: 'Altezza',
  Color: 'Colore',
  'Source: {url}': 'Fonte: {url}',
  'I checked the pins and roles against the real part.': 'Ho controllato pin e ruoli sul componente reale.',
  Cancel: 'Annulla',
  'Save to library': 'Salva nella libreria',
  'Save and add to project': 'Salva e aggiungi al progetto',

  // Parts library: filters (FILTERS)
  All: 'Tutti',
  Sensors: 'Sensori',
  Displays: 'Display',
  Inputs: 'Ingressi',
  Outputs: 'Uscite',
  'My parts': 'I miei componenti',

  // Parts library
  'Drafted “{name}” from {page}. Check it before saving.': 'Bozza di “{name}” creata da {page}. Controllala prima di salvare.',
  'assistant (suggestion)': 'assistente (suggerimento)',
  'keyword rules (suggestion)': 'regole sulle parole chiave (suggerimento)',
  'Add a part from a link': 'Aggiungi un componente da un link',
  'Paste a product page or datasheet link': 'Incolla il link di una pagina prodotto o di un datasheet',
  Import: 'Importa',
  'The assistant reads the page and drafts the pins and 3D shape. You check it before it is saved.':
    'L’assistente legge la pagina e prepara una bozza di pin e forma 3D. La controlli tu prima del salvataggio.',
  'Without the AI assistant the app guesses from keywords on the page. You check every field before saving.':
    'Senza l’assistente AI, l’app deduce i dati dalle parole chiave della pagina. Controlli tu ogni campo prima di salvare.',
  'my part': 'mio componente',
  'Add to project': 'Aggiungi al progetto',
  Edit: 'Modifica',
  'Delete from library': 'Elimina dalla libreria',
  'Delete “{name}” from your library? Projects that use it will show it as unknown.':
    'Eliminare “{name}” dalla tua libreria? I progetti che lo usano lo mostreranno come sconosciuto.',
  'Deleted “{name}” from your library.': 'Hai eliminato “{name}” dalla tua libreria.',
  'Parts library': 'Libreria componenti',
  'Search parts, e.g. temperature, oled, 0x76': 'Cerca componenti, ad es. temperatura, oled, 0x76',
  'No part matches. Import it from a link below, or create it by hand.':
    'Nessun componente corrisponde. Importalo da un link qui sotto o crealo a mano.',
  'Create a part by hand…': 'Crea un componente a mano…',
  'The page mentions {chip}; the built-in part “{name}” is similar and can be compared.':
    'La pagina cita {chip}; il componente integrato “{name}” è simile e puoi confrontarli.',
  'The page is about {chip}. Pins, bus and addresses come from the built-in part “{name}”.':
    'La pagina parla di {chip}. Pin, bus e indirizzi vengono dal componente integrato “{name}”.',
  'Boards from different shops can order their pins differently: compare with the labels on your board.':
    'Le schede di negozi diversi possono avere i pin in un ordine diverso: confronta con le scritte sulla tua scheda.',
  '3D size taken from the page: {size} mm.': 'Dimensioni 3D prese dalla pagina: {size} mm.',
  '3D board color measured from the product photo.': 'Colore della scheda 3D misurato dalla foto del prodotto.',
  'Product photo': 'Foto del prodotto',
  'Matched to a part in the library from the chip name on the page.': 'Abbinato a un componente della libreria grazie al nome del chip nella pagina.',
  'parts library match (suggestion)': 'abbinamento con la libreria (suggerimento)',
};

export default it;
