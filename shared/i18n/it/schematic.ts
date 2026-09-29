// Italian translations. Key = the exact English text passed to t().
// Scope: the schematic view of the Diagram tab (shared/schematic, three/DiagramView) and its place
// in the report.
const it: Record<string, string> = {
  Wiring: 'Collegamenti',
  Schematic: 'Schema elettrico',
  'Parts and wires as you place them': 'Componenti e fili come li hai disposti',
  'The same project as a circuit drawing, with symbols': 'Lo stesso progetto come schema elettrico, con i simboli',
  'Schematic saved to {path}.': 'Schema elettrico salvato in {path}.',
  'Pin not connected': 'Pin non collegato',
  'Suggested, not in your drawing': 'Suggerito, non presente nel tuo disegno',
  'The wiring rules say these parts are missing. Add them before you power the board.':
    'Le regole di collegamento dicono che mancano questi componenti. Aggiungili prima di alimentare la scheda.',
  'I2C pull-ups': 'Pull-up I2C',
  'Pull-up': 'Pull-up',
  'Voltage divider': 'Partitore di tensione',
  'Level shifter': 'Traslatore di livello',
};
export default it;
