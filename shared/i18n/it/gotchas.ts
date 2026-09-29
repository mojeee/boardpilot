// Italian translations. Key = the exact English text passed to t().
// Scope: part gotchas (the "gotchas" field in parts/*.json) and where they are shown.
const it: Record<string, string> = {
  'Many boards sold as BME280 carry a BMP280, which has no humidity sensor. The chip ID register 0xD0 tells them apart: 0x60 is a BME280, 0x58 a BMP280.':
    'Molte schede vendute come BME280 montano un BMP280, che non ha il sensore di umidità. Il registro ID 0xD0 li distingue: 0x60 è un BME280, 0x58 un BMP280.',
  'Read in normal mode at a high rate, the sensor warms itself and reads high. For weather readings use forced mode, about one reading per minute.':
    'Letto in modalità normale ad alta frequenza, il sensore si scalda da solo e legge valori alti. Per il meteo usa la modalità forzata, circa una lettura al minuto.',
  'It measures temperature and pressure only, no humidity. If your code asks for humidity, you need a BME280.':
    'Misura solo temperatura e pressione, non l’umidità. Se il tuo codice chiede l’umidità, serve un BME280.',
  'The address is 0x76 with SDO to GND and 0x77 with SDO high. Most GY boards answer at 0x76, while the Adafruit library looks at 0x77 unless you pass 0x76.':
    'L’indirizzo è 0x76 con SDO a GND e 0x77 con SDO alto. La maggior parte delle schede GY risponde a 0x76, mentre la libreria Adafruit cerca 0x77 se non le passi 0x76.',
  'Read it at most once every 2 seconds. Faster reads return the old value or fail.':
    'Leggilo al massimo una volta ogni 2 secondi. Letture più veloci restituiscono il valore vecchio o falliscono.',
  'It measures 0 to 50 °C and 20 to 90 %RH in whole numbers only. Below 0 °C it cannot measure.':
    'Misura da 0 a 50 °C e dal 20 al 90 %UR, solo a numeri interi. Sotto 0 °C non può misurare.',
  'After power-up, wait 1 second before the first read.':
    'Dopo l’accensione, aspetta 1 secondo prima della prima lettura.',
  'ECHO outputs 5 V. On a 3.3 V board, put a voltage divider (for example 1 kΩ and 2 kΩ) between ECHO and the pin.':
    'ECHO esce a 5 V. Su una scheda a 3,3 V metti un partitore di tensione (per esempio 1 kΩ e 2 kΩ) tra ECHO e il pin.',
  'It needs 5 V on VCC. At 3.3 V most modules give no echo or wrong distances.':
    'Vuole 5 V su VCC. A 3,3 V la maggior parte dei moduli non dà eco o dà distanze sbagliate.',
  'Leave at least 60 ms between measurements, or the echo of the last one is measured again.':
    'Lascia almeno 60 ms tra una misura e l’altra, altrimenti viene misurata di nuovo l’eco della precedente.',
  'The address is 0x3C or 0x3D (the jumper on the back). A board printed “0x78” is 0x3C: the print shows the address shifted left by one bit.':
    'L’indirizzo è 0x3C o 0x3D (il ponticello sul retro). Una scheda con scritto “0x78” è a 0x3C: la scritta mostra l’indirizzo spostato a sinistra di un bit.',
  'A 128×64 display needs a 1 KB screen buffer in RAM. On a board with 2 KB of RAM (Uno, Nano) that leaves little for the rest of the sketch.':
    'Un display 128×64 vuole un buffer di 1 KB in RAM. Su una scheda con 2 KB di RAM (Uno, Nano) resta poco per il resto dello sketch.',
  'The address is 0x68, or 0x69 when AD0 is HIGH.':
    'L’indirizzo è 0x68, oppure 0x69 con AD0 alto.',
  'It starts in sleep mode and reads zeros until PWR_MGMT_1 (0x6B) is cleared. Libraries do this in begin(); your own code must too.':
    'Parte in modalità sleep e legge zeri finché PWR_MGMT_1 (0x6B) non viene azzerato. Le librerie lo fanno in begin(); anche il tuo codice deve farlo.',
  'It needs a 4.7 kΩ pull-up resistor between DATA and VCC. Without it the sensor is not found.':
    'Vuole una resistenza di pull-up da 4,7 kΩ tra DATA e VCC. Senza, il sensore non viene trovato.',
  'A 12-bit reading takes up to 750 ms. Code that waits less gets the last value, or 85 °C (the power-on value).':
    'Una lettura a 12 bit richiede fino a 750 ms. Il codice che aspetta meno riceve il valore precedente, oppure 85 °C (il valore all’accensione).',
  'Each LED draws up to about 60 mA at full white: 30 LEDs need about 1.8 A, more than USB gives. Power the strip from its own 5 V supply and connect the grounds.':
    'Ogni LED assorbe fino a circa 60 mA in bianco pieno: 30 LED vogliono circa 1,8 A, più di quanto dà l’USB. Alimenta la striscia con un suo alimentatore da 5 V e collega le masse.',
  'Put a 300 to 500 Ω resistor in the data line and a large capacitor (about 1000 µF) across the strip’s supply.':
    'Metti una resistenza da 300 a 500 Ω sulla linea dati e un condensatore grande (circa 1000 µF) sull’alimentazione della striscia.',
  'At 5 V the data input needs at least 0.7 × 5 V = 3.5 V to read HIGH. A 3.3 V board often works but not always: a level shifter (74AHCT125) makes it reliable.':
    'A 5 V l’ingresso dati vuole almeno 0,7 × 5 V = 3,5 V per leggere ALTO. Una scheda a 3,3 V spesso funziona ma non sempre: un traslatore di livello (74AHCT125) lo rende affidabile.',
  'A moving servo draws current peaks that can reset a USB-powered board. Power servos from a separate 5 V supply and connect the grounds.':
    'Un servo in movimento assorbe picchi di corrente che possono resettare una scheda alimentata da USB. Alimenta i servo con un 5 V separato e collega le masse.',
  'The relay coil needs 5 V: power the module from the 5 V pin, not 3V3.':
    'La bobina del relè vuole 5 V: alimenta il modulo dal pin 5 V, non da 3V3.',
  'After power-up it needs about a minute to settle and may trigger by itself during that time.':
    'Dopo l’accensione ha bisogno di circa un minuto per stabilizzarsi e in quel tempo può scattare da solo.',
  'The backpack answers at 0x27 (PCF8574) or 0x3F (PCF8574A). If nothing shows up at 0x27, try 0x3F.':
    'Il modulo I2C risponde a 0x27 (PCF8574) o 0x3F (PCF8574A). Se a 0x27 non c’è niente, prova 0x3F.',
  'Blank screen or only blocks? Turn the contrast potentiometer on the back.':
    'Schermo vuoto o solo rettangoli? Gira il potenziometro del contrasto sul retro.',
  'With the usual 0.1 Ω shunt it measures up to 3.2 A (±320 mV across the shunt), and the bus voltage up to 26 V.':
    'Con il solito shunt da 0,1 Ω misura fino a 3,2 A (±320 mV sullo shunt) e la tensione di bus fino a 26 V.',
  'Put it in series on the positive side: supply + to VIN+, VIN− to the load.':
    'Mettilo in serie sul lato positivo: + dell’alimentazione su VIN+, VIN− verso il carico.',
  'Every sensor starts at address 0x29. To use two on one bus, hold one in reset with XSHUT and give the other a new address at start-up; the new address is lost at power-off.':
    'Ogni sensore parte all’indirizzo 0x29. Per usarne due sullo stesso bus, tieni uno in reset con XSHUT e dai all’altro un nuovo indirizzo all’avvio; il nuovo indirizzo si perde allo spegnimento.',
  'A high-resolution reading takes about 120 ms. Reading faster returns the previous value.':
    'Una lettura ad alta risoluzione richiede circa 120 ms. Leggendo più in fretta si ottiene il valore precedente.',
  'It runs on 3.3 V only: 5 V on VCC damages it.':
    'Funziona solo a 3,3 V: 5 V su VCC lo danneggiano.',
  'The first fix needs a view of the sky and takes about 30 seconds or more. Indoors it may never find one.':
    'Il primo fix vuole la vista del cielo e richiede circa 30 secondi o più. Al chiuso potrebbe non trovarlo mai.',
  'It talks at 9600 baud. Connect the module’s TX to the board’s RX.':
    'Comunica a 9600 baud. Collega il TX del modulo all’RX della scheda.',
  'The reading depends on your soil and supply voltage. Note the values in dry air and in water, and scale between them.':
    'La lettura dipende dal terreno e dalla tensione di alimentazione. Annota i valori in aria asciutta e in acqua, e scala tra i due.',
  'Each input must stay between GND and VDD, even in differential mode. The default range is ±2.048 V; set the gain for larger signals.':
    'Ogni ingresso deve restare tra GND e VDD, anche in modalità differenziale. Il campo predefinito è ±2,048 V; imposta il guadagno per segnali più grandi.',
  'CLK and DIO are not I2C: use a TM1637 library. Any two pins work.':
    'CLK e DIO non sono I2C: usa una libreria TM1637. Vanno bene due pin qualsiasi.',
  'Each coil draws about 100 mA at 5 V (50 Ω). Power the ULN2003 board from 5 V, never from a GPIO pin.':
    'Ogni bobina assorbe circa 100 mA a 5 V (50 Ω). Alimenta la scheda ULN2003 dai 5 V, mai da un pin GPIO.',
  'The L298 loses about 2 to 3 V inside: a motor on a 6 V supply gets roughly 4 V. Connect the driver’s GND to the board’s GND.':
    'L’L298 perde circa 2-3 V al suo interno: un motore con alimentazione a 6 V riceve circa 4 V. Collega il GND del driver al GND della scheda.',
  'An input with nothing pulling it reads random values. Use INPUT_PULLUP and wire the button to GND: pressed reads LOW.':
    'Un ingresso che nessuno tira legge valori casuali. Usa INPUT_PULLUP e collega il pulsante a GND: premuto legge LOW.',
  'The contacts bounce for a few milliseconds, so one press can count as several. Debounce in code.':
    'I contatti rimbalzano per qualche millisecondo, quindi una pressione può contare come più di una. Fai il debounce nel codice.',
  'The long leg (anode) goes to the pin, the short leg to GND, always through a resistor (220 Ω to 1 kΩ).':
    'La gamba lunga (anodo) va al pin, quella corta a GND, sempre con una resistenza (da 220 Ω a 1 kΩ).',
  'The SD library reads FAT16 and FAT32 cards. Cards formatted as exFAT (most over 32 GB) are not found.':
    'La libreria SD legge schede FAT16 e FAT32. Le schede formattate exFAT (quasi tutte sopra i 32 GB) non vengono trovate.',
  'Its address is fixed at 0x38: one per bus. The DHT20 uses the same chip and the same address.':
    'Il suo indirizzo è fisso a 0x38: uno per bus. Il DHT20 usa lo stesso chip e lo stesso indirizzo.',
  'After power-up, wait 40 ms; each measurement takes about 80 ms.':
    'Dopo l’accensione aspetta 40 ms; ogni misura richiede circa 80 ms.',
  'Good to know ({part}): {text}':
    'Da sapere ({part}): {text}',
  'Good to know':
    'Da sapere',
};
export default it;
