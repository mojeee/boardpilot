// Italian translations. Key = the exact English text passed to t().
// Scope: power budget panel (shared/power, components/PowerBudget) and the current notes in
// parts/*.json and boards/*.json.
const it: Record<string, string> = {
  'Power and battery life': 'Consumi e durata della batteria',
  'Awake for (ms)': 'Sveglio per (ms)',
  'Wakes up every (s, 0 = always on)': 'Si sveglia ogni (s, 0 = sempre acceso)',
  'Battery (mAh)': 'Batteria (mAh)',
  Device: 'Dispositivo',
  Awake: 'Sveglio',
  Asleep: 'In sospensione',
  Peak: 'Picco',
  'Source: {source}': 'Fonte: {source}',
  'No sleep figure: counted as awake.': 'Nessun dato in sospensione: conteggiato come sveglio.',
  'No datasheet current for: {names}. They are left out, so the real battery life is shorter.':
    'Nessuna corrente nel datasheet per: {names}. Sono esclusi, quindi la durata reale della batteria è più breve.',
  'Average current': 'Corrente media',
  'Peak (all at once)': 'Picco (tutti insieme)',
  'Battery life, about': 'Durata della batteria, circa',
  'Uses the most: {list}.': 'Consuma di più: {list}.',
  'Estimate from datasheet figures, not a measurement. Battery self-discharge, regulator losses and the cut-off voltage make real life shorter.':
    'Stima dai valori dei datasheet, non una misura. Autoscarica della batteria, perdite del regolatore e tensione di spegnimento accorciano la durata reale.',
  '* marks a device without a sleep figure: it is counted at its awake current.':
    '* indica un dispositivo senza dato in sospensione: è conteggiato con la corrente da sveglio.',
  hours: 'ore',
  days: 'giorni',
  months: 'mesi',
  years: 'anni',
  '150 µA converting continuously, 0.5 µA powered down.': '150 µA in conversione continua, 0,5 µA spento.',
  '120 µA while measuring, 0.01 µA powered down.': '120 µA durante la misura, 0,01 µA spento.',
  "At 1 reading per second of humidity, pressure and temperature; chip only (a breakout's regulator adds a little).":
    'Con 1 lettura al secondo di umidità, pressione e temperatura; solo il chip (il regolatore della scheda aggiunge un po’).',
  'At 1 reading per second in ultra-low-power mode; chip only.': 'Con 1 lettura al secondo in modalità a bassissimo consumo; solo il chip.',
  '1 to 1.5 mA while measuring, 40 to 50 µA in standby.': 'Da 1 a 1,5 mA durante la misura, da 40 a 50 µA in standby.',
  '1 mA during a conversion, 750 nA standby.': '1 mA durante una conversione, 750 nA in standby.',
  '15 mA while working; under 2 mA quiescent.': '15 mA in funzione; meno di 2 mA a riposo.',
  'Under 50 µA quiescent.': 'Meno di 50 µA a riposo.',
  'Gyroscope and accelerometer on with the DMP; chip only (the GY-521 power LED and regulator add more).':
    'Giroscopio e accelerometro accesi con il DMP; solo il chip (il LED di alimentazione e il regolatore del GY-521 aggiungono altro).',
  "The coil while the relay is on (5 V, 70 Ω); the module's LED adds a few mA. Off: almost nothing.":
    'La bobina a relè acceso (5 V, 70 Ω); il LED del modulo aggiunge qualche mA. Spento: quasi niente.',
  'Operating current.': 'Corrente di funzionamento.',
  'Average while ranging; 5 µA in hardware standby.': 'Media durante la misura della distanza; 5 µA in standby hardware.',
  "ESP32 chip only: about 20 to 68 mA running with Wi-Fi off (modem-sleep, by CPU speed), 240 mA peaks while Wi-Fi transmits, 10 µA in deep sleep. The DevKit's USB chip, regulator and LED add more, so a bare module is better on batteries.":
    'Solo il chip ESP32: circa da 20 a 68 mA in funzione con il Wi-Fi spento (modem-sleep, secondo la velocità della CPU), picchi di 240 mA mentre il Wi-Fi trasmette, 10 µA in deep sleep. Il chip USB, il regolatore e il LED della DevKit aggiungono altro, quindi a batteria è meglio un modulo nudo.',
  'Whole Pico board: about 25 mA running a busy loop, 0.8 mA in dormant mode (datasheet figures at 5 V on VSYS).':
    'Tutta la scheda Pico: circa 25 mA con un ciclo attivo, 0,8 mA in modalità dormant (valori del datasheet a 5 V su VSYS).',
};
export default it;
