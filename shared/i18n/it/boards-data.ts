// Italian translations. Key = the exact English text passed to t().
// Scope: board data from /boards/*.json (board summaries, pin notes, upload notes).
const it: Record<string, string> = {
  "A big Arduino with 54 digital pins, 16 analog inputs and 4 serial ports. It uses 5 V logic, so 3.3 V-only sensors need a level shifter.":
    "Un Arduino grande con 54 pin digitali, 16 ingressi analogici e 4 porte seriali. Usa logica a 5 V, quindi i sensori solo a 3,3 V hanno bisogno di un convertitore di livello (level shifter).",
  "I2C only works on 20 (SDA) and 21 (SCL); the SDA/SCL pins near AREF are the same signals. Both have 10 kΩ pull-ups to 5 V on the board.":
    "L’I2C funziona solo su 20 (SDA) e 21 (SCL); i pin SDA/SCL vicino ad AREF sono gli stessi segnali. Entrambi hanno sulla scheda un pull-up da 10 kΩ verso 5 V.",
  "Same signal as D21 (I2C clock). Has a 10 kΩ pull-up to 5 V on the board: 3.3 V-only I2C parts need a level shifter.":
    "Stesso segnale di D21 (clock I2C). Ha sulla scheda un pull-up da 10 kΩ verso 5 V: i componenti I2C solo a 3,3 V hanno bisogno di un convertitore di livello (level shifter).",
  "Same signal as D20 (I2C data). Has a 10 kΩ pull-up to 5 V on the board: 3.3 V-only I2C parts need a level shifter.":
    "Stesso segnale di D20 (dati I2C). Ha sulla scheda un pull-up da 10 kΩ verso 5 V: i componenti I2C solo a 3,3 V hanno bisogno di un convertitore di livello (level shifter).",
  "Analog reference input. Leave it unconnected unless your code calls analogReference(EXTERNAL); never power parts from it.":
    "Ingresso di riferimento analogico. Lascialo scollegato a meno che il tuo codice non chiami analogReference(EXTERNAL); non alimentare mai componenti da qui.",
  "The built-in LED \"L\" is on this pin.":
    "Il LED integrato \"L\" è su questo pin.",
  "Serial TX. Shared with the USB link: using it for parts can break uploads and the serial monitor.":
    "TX seriale. Condiviso con il collegamento USB: usarlo per i componenti può bloccare il caricamento e il monitor seriale.",
  "Serial RX. Shared with the USB link: using it for parts can break uploads and the serial monitor.":
    "RX seriale. Condiviso con il collegamento USB: usarlo per i componenti può bloccare il caricamento e il monitor seriale.",
  "Default I2C SDA. Has a 10 kΩ pull-up to 5 V on the board: 3.3 V-only I2C parts need a level shifter.":
    "SDA I2C predefinito. Ha sulla scheda un pull-up da 10 kΩ verso 5 V: i componenti I2C solo a 3,3 V hanno bisogno di un convertitore di livello (level shifter).",
  "Default I2C SCL. Has a 10 kΩ pull-up to 5 V on the board: 3.3 V-only I2C parts need a level shifter.":
    "SCL I2C predefinito. Ha sulla scheda un pull-up da 10 kΩ verso 5 V: i componenti I2C solo a 3,3 V hanno bisogno di un convertitore di livello (level shifter).",
  "Tells shields that this board uses 5 V logic. Connected to 5V; not meant to power parts.":
    "Dice agli shield che questa scheda usa logica a 5 V. È collegato a 5V; non serve ad alimentare componenti.",
  "Reset input. Pull it LOW (or press the button) to restart the board.":
    "Ingresso di reset. Portalo a LOW (o premi il pulsante) per riavviare la scheda.",
  "3.3 V output, 50 mA max. Enough for one or two small sensors.":
    "Uscita a 3,3 V, massimo 50 mA. Basta per uno o due sensori piccoli.",
  "5 V output from USB or the on-board regulator.":
    "Uscita a 5 V dalla USB o dal regolatore sulla scheda.",
  "Power input (7-12 V recommended) from the barrel jack or an external supply. It is not fed from USB, so do not use it to power parts.":
    "Ingresso di alimentazione (consigliati 7-12 V) dal jack o da un alimentatore esterno. Non riceve tensione dalla USB, quindi non usarlo per alimentare componenti.",
  "5 V, same rail as the 5V pin.":
    "5 V, stessa linea del pin 5V.",
  "SPI chip select. Keep it an OUTPUT when using SPI, or SPI can stop working.":
    "Chip select SPI. Tienilo come OUTPUT quando usi l’SPI, altrimenti l’SPI può smettere di funzionare.",
  "A small, breadboard-friendly Arduino with the same chip as the Uno. It uses 5 V logic, so 3.3 V-only sensors need a level shifter.":
    "Un Arduino piccolo, comodo sulla breadboard, con lo stesso chip della Uno. Usa logica a 5 V, quindi i sensori solo a 3,3 V hanno bisogno di un convertitore di livello (level shifter).",
  "Clones with the old bootloader upload at 57600 baud: choose “ATmega328P (Old Bootloader)” if uploads fail.":
    "I cloni con il vecchio bootloader caricano a 57600 baud: se il caricamento non riesce, scegli “ATmega328P (Old Bootloader)”.",
  "I2C only works on A4 (SDA) and A5 (SCL).":
    "L’I2C funziona solo su A4 (SDA) e A5 (SCL).",
  "The built-in LED \"L\" is on this pin (also SPI clock).":
    "Il LED integrato \"L\" è su questo pin (è anche il clock SPI).",
  "3.3 V from the USB chip (FT232RL, 50 mA max; often less on clones). Weak: fine for one small sensor only.":
    "3,3 V dal chip USB (FT232RL, massimo 50 mA; spesso meno sui cloni). Debole: va bene solo per un sensore piccolo.",
  "Default I2C SDA (same signal as the SDA pin).":
    "SDA I2C predefinito (stesso segnale del pin SDA).",
  "Default I2C SCL (same signal as the SCL pin).":
    "SCL I2C predefinito (stesso segnale del pin SCL).",
  "Analog input only: no digitalWrite, no digitalRead and no internal pull-up.":
    "Solo ingresso analogico: niente digitalWrite, niente digitalRead e nessun pull-up interno.",
  "The classic Arduino board for learning. It uses 5 V logic, so 3.3 V-only sensors need a level shifter.":
    "La classica scheda Arduino per imparare. Usa logica a 5 V, quindi i sensori solo a 3,3 V hanno bisogno di un convertitore di livello (level shifter).",
  "I2C only works on A4 (SDA) and A5 (SCL); the SDA/SCL pins near AREF are the same signals.":
    "L’I2C funziona solo su A4 (SDA) e A5 (SCL); i pin SDA/SCL vicino ad AREF sono gli stessi segnali.",
  "Same signal as A5 (I2C clock).":
    "Stesso segnale di A5 (clock I2C).",
  "Same signal as A4 (I2C data).":
    "Stesso segnale di A4 (dati I2C).",
  "Power input (7-12 V recommended, 20 V max) from the barrel jack or an external supply. It is not fed from USB, so do not use it to power parts.":
    "Ingresso di alimentazione (consigliati 7-12 V, massimo 20 V) dal jack o da un alimentatore esterno. Non riceve tensione dalla USB, quindi non usarlo per alimentare componenti.",
  "A tiny, low-cost STM32F411 board with USB-C. Fast (100 MHz), breadboard friendly, 3.3 V logic, and most pins tolerate 5 V.":
    "Una scheda STM32F411 piccola ed economica con USB-C. Veloce (100 MHz), comoda sulla breadboard, logica a 3,3 V, e la maggior parte dei pin tollera i 5 V.",
  "To upload over USB, hold BOOT0, press and release NRST, then release BOOT0 (DFU mode). An ST-LINK on the SWD pins also works.":
    "Per caricare via USB, tieni premuto BOOT0, premi e rilascia NRST, poi rilascia BOOT0 (modalità DFU). Funziona anche un ST-LINK sui pin SWD.",
  "Wire uses PB7 for SDA and PB6 for SCL. Only specific STM32 pin pairs can do I2C (for example PB9/PB8 with Wire.setSDA/setSCL).":
    "Wire usa PB7 per SDA e PB6 per SCL. Solo alcune coppie di pin dell’STM32 possono fare I2C (per esempio PB9/PB8 con Wire.setSDA/setSCL).",
  "5 V from USB-C (after a protection diode). Can also power the board.":
    "5 V dalla USB-C (dopo un diodo di protezione). Può anche alimentare la scheda.",
  "3.3 V output for sensors.":
    "Uscita a 3,3 V per i sensori.",
  "BOOT1 (10 kohm to GND on the board). Only matters when BOOT0 is held at reset.":
    "BOOT1 (10 kohm verso GND sulla scheda). Conta solo quando BOOT0 è tenuto premuto al reset.",
  "5 V tolerant only as a digital input. As an analog input keep it between 0 and 3.3 V.":
    "Tollera i 5 V solo come ingresso digitale. Come ingresso analogico tienilo tra 0 e 3,3 V.",
  "Also wired to the empty SPI flash footprint U3 on the back (only matters if you solder a flash chip). 5 V tolerant only as a digital input. As an analog input keep it between 0 and 3.3 V.":
    "È collegato anche all’impronta vuota della flash SPI U3 sul retro (conta solo se saldi un chip di flash). Tollera i 5 V solo come ingresso digitale. Come ingresso analogico tienilo tra 0 e 3,3 V.",
  "KEY button is on this pin (to GND through 330 ohm): use INPUT_PULLUP, pressed = LOW. Not 5 V tolerant.":
    "Su questo pin c’è il pulsante KEY (verso GND tramite 330 ohm): usa INPUT_PULLUP, premuto = LOW. Non tollera i 5 V.",
  "Reset: connect to GND to restart the board (same as the NRST button).":
    "Reset: collegalo a GND per riavviare la scheda (come il pulsante NRST).",
  "32.768 kHz crystal pin. Leave it free.":
    "Pin del quarzo da 32,768 kHz. Lascialo libero.",
  "Blue onboard LED, active LOW (LOW = on). Weak pin: do not drive other loads from it.":
    "LED blu sulla scheda, attivo basso (LOW = acceso). Pin debole: non usarlo per pilotare altri carichi.",
  "Input for a backup battery that keeps the RTC running. Gives no power.":
    "Ingresso per una batteria tampone che tiene in funzione l’RTC. Non fornisce alimentazione.",
  "USB D- to the USB-C port. Used for USB serial and upload.":
    "USB D- verso la porta USB-C. Usato per la seriale USB e il caricamento.",
  "USB D+ to the USB-C port. Used for USB serial and upload.":
    "USB D+ verso la porta USB-C. Usato per la seriale USB e il caricamento.",
  "JTAG JTDI after reset; works as a normal pin in Arduino.":
    "JTAG JTDI dopo il reset; con Arduino funziona come un pin normale.",
  "JTAG SWO after reset; works as a normal pin in Arduino.":
    "JTAG SWO dopo il reset; con Arduino funziona come un pin normale.",
  "JTAG NJTRST after reset; works as a normal pin in Arduino.":
    "JTAG NJTRST dopo il reset; con Arduino funziona come un pin normale.",
  "Not 5 V tolerant on the F411 (keep it at 3.3 V or below).":
    "Sull’F411 non tollera i 5 V (tienilo a 3,3 V o meno).",
  "Same 5 V rail as the other 5V pin.":
    "Stessa linea a 5 V dell’altro pin 5V.",
  "Same 3.3 V rail as the other 3V3 pin.":
    "Stessa linea a 3,3 V dell’altro pin 3V3.",
  "SWD debug clock (SWCLK). Leave it free if you use an ST-LINK.":
    "Clock di debug SWD (SWCLK). Lascialo libero se usi un ST-LINK.",
  "SWD debug data (SWDIO). Leave it free if you use an ST-LINK.":
    "Dati di debug SWD (SWDIO). Lascialo libero se usi un ST-LINK.",
  "3.3 V on the SWD header (same rail as 3V3).":
    "3,3 V sul connettore SWD (stessa linea di 3V3).",
  "Espressif's small ESP32-C3 board with Wi-Fi, Bluetooth LE, a RISC-V core and an RGB LED. Breadboard friendly, 3.3 V logic.":
    "La piccola scheda ESP32-C3 di Espressif con Wi-Fi, Bluetooth LE, un core RISC-V e un LED RGB. Comoda sulla breadboard, logica a 3,3 V.",
  "If uploading does not start, hold BOOT, press and release RST, then release BOOT.":
    "Se il caricamento non parte, tieni premuto BOOT, premi e rilascia RST, poi rilascia BOOT.",
  "Any GPIO can be I2C on the ESP32-C3. Arduino's defaults, GPIO 8 (SDA) and GPIO 9 (SCL), are strapping pins and GPIO 8 also drives the RGB LED.":
    "Sull’ESP32-C3 qualsiasi GPIO può fare I2C. I pin predefiniti di Arduino, GPIO 8 (SDA) e GPIO 9 (SCL), sono pin di strapping, e GPIO 8 pilota anche il LED RGB.",
  "3.3 V from the on-board regulator. You can feed 3.3 V in here instead of USB, but never both at once.":
    "3,3 V dal regolatore sulla scheda. Puoi dare 3,3 V da qui invece che dalla USB, ma mai tutti e due insieme.",
  "Strapping pin: should be HIGH at reset. Do not let a part pull it LOW while the board starts.":
    "Pin di strapping: deve essere HIGH al reset. Non lasciare che un componente lo porti a LOW mentre la scheda si avvia.",
  "Reset. Pulling it LOW restarts the chip (same as the RST button).":
    "Reset. Portarlo a LOW riavvia il chip (come il pulsante RST).",
  "5 V from the micro-USB port. You can power the board here with 5 V instead of USB, but never both at once.":
    "5 V dalla porta micro-USB. Puoi alimentare la scheda da qui con 5 V invece che dalla USB, ma mai tutti e due insieme.",
  "USB serial TX through the CP2102N. Used for uploading and the serial monitor.":
    "TX della seriale USB tramite il CP2102N. Usato per il caricamento e il monitor seriale.",
  "USB serial RX through the CP2102N. Used for uploading and the serial monitor.":
    "RX della seriale USB tramite il CP2102N. Usato per il caricamento e il monitor seriale.",
  "Strapping pin wired to the BOOT button: LOW at reset starts upload mode instead of your program. Arduino's default I2C SCL.":
    "Pin di strapping collegato al pulsante BOOT: LOW al reset avvia la modalità di caricamento invece del tuo programma. SCL I2C predefinito di Arduino.",
  "Strapping pin and the RGB LED data line. It must be HIGH at reset for uploading to work. Arduino's default I2C SDA.":
    "Pin di strapping e linea dati del LED RGB. Deve essere HIGH al reset perché il caricamento funzioni. SDA I2C predefinito di Arduino.",
  "ADC2 on the ESP32-C3 gives unstable readings (chip errata) and is not supported by ESP-IDF. Use GPIO 0 to 4 for analog.":
    "Sull’ESP32-C3 l’ADC2 dà letture instabili (errata del chip) e non è supportato da ESP-IDF. Per l’analogico usa i GPIO da 0 a 4.",
  "Native USB D- of the chip. This board's micro-USB port does not use it, so it is free, but it starts up in USB mode.":
    "USB D- nativa del chip. La porta micro-USB di questa scheda non la usa, quindi è libera, ma all’avvio parte in modalità USB.",
  "Native USB D+ of the chip. This board's micro-USB port does not use it, so it is free, but it has a USB pull-up at start-up.":
    "USB D+ nativa del chip. La porta micro-USB di questa scheda non la usa, quindi è libera, ma all’avvio ha un pull-up USB.",
  "The classic ESP32 board with Wi-Fi and Bluetooth. Breadboard friendly, 3.3 V logic.":
    "La classica scheda ESP32 con Wi-Fi e Bluetooth. Comoda sulla breadboard, logica a 3,3 V.",
  "If uploading does not start, hold BOOT, press and release EN, then release BOOT.":
    "Se il caricamento non parte, tieni premuto BOOT, premi e rilascia EN, poi rilascia BOOT.",
  "Espressif's own ESP32-S3 board: Wi-Fi, Bluetooth LE, two USB ports and an RGB LED. Breadboard friendly, 3.3 V logic.":
    "La scheda ESP32-S3 di Espressif: Wi-Fi, Bluetooth LE, due porte USB e un LED RGB. Comoda sulla breadboard, logica a 3,3 V.",
  "Use the port labelled UART. If uploading does not start, hold BOOT, press and release RESET, then release BOOT.":
    "Usa la porta con la scritta UART. Se il caricamento non parte, tieni premuto BOOT, premi e rilascia RESET, poi rilascia BOOT.",
  "Any GPIO can be I2C on the ESP32-S3. Arduino's Wire uses GPIO 8 (SDA) and GPIO 9 (SCL) by default.":
    "Sull’ESP32-S3 qualsiasi GPIO può fare I2C. Il Wire di Arduino usa per impostazione predefinita GPIO 8 (SDA) e GPIO 9 (SCL).",
  "Reset. Pulling it LOW restarts the chip (same as the RESET button).":
    "Reset. Portarlo a LOW riavvia il chip (come il pulsante RESET).",
  "Arduino's default I2C SDA pin on the ESP32-S3.":
    "Pin SDA I2C predefinito di Arduino sull’ESP32-S3.",
  "Strapping pin for the JTAG source. It is ignored unless special eFuses are burned, so it is normally fine to use.":
    "Pin di strapping per la sorgente JTAG. Viene ignorato a meno che non siano stati bruciati eFuse speciali, quindi di solito si può usare senza problemi.",
  "Strapping pin: keep it LOW (its default) at reset, or uploading may fail.":
    "Pin di strapping: tienilo LOW (il suo valore predefinito) al reset, altrimenti il caricamento può non riuscire.",
  "Arduino's default I2C SCL pin on the ESP32-S3.":
    "Pin SCL I2C predefinito di Arduino sull’ESP32-S3.",
  "5 V from the USB ports. You can power the board here with 5 V instead of USB, but never both at once.":
    "5 V dalle porte USB. Puoi alimentare la scheda da qui con 5 V invece che dalla USB, ma mai tutti e due insieme.",
  "USB serial TX through the CP2102N (port labelled UART). Used for uploading and the serial monitor.":
    "TX della seriale USB tramite il CP2102N (porta con la scritta UART). Usato per il caricamento e il monitor seriale.",
  "USB serial RX through the CP2102N (port labelled UART). Used for uploading and the serial monitor.":
    "RX della seriale USB tramite il CP2102N (porta con la scritta UART). Usato per il caricamento e il monitor seriale.",
  "Drives the RGB LED on v1.1 boards. Arduino's RGB_BUILTIN points to GPIO 48 (the v1.0 LED pin), so use 38 for this LED.":
    "Pilota il LED RGB sulle schede v1.1. RGB_BUILTIN di Arduino punta a GPIO 48 (il pin del LED sulla v1.0), quindi per questo LED usa 38.",
  "Used inside the module by the octal PSRAM (N8R8 and other R8 / R16V boards). Not available: do not use.":
    "Usato dentro il modulo dalla PSRAM octal (N8R8 e altre schede R8 / R16V). Non disponibile: non usarlo.",
  "Strapping pin wired to the BOOT button: LOW at reset starts upload mode instead of your program.":
    "Pin di strapping collegato al pulsante BOOT: LOW al reset avvia la modalità di caricamento invece del tuo programma.",
  "Free on v1.1 boards. On the older v1.0 board this pin drives the RGB LED.":
    "Libero sulle schede v1.1. Sulla vecchia scheda v1.0 questo pin pilota il LED RGB.",
  "Native USB D+ (the port labelled USB). Using it breaks that USB port.":
    "USB D+ nativa (la porta con la scritta USB). Usarlo blocca quella porta USB.",
  "Native USB D- (the port labelled USB). Using it breaks that USB port.":
    "USB D- nativa (la porta con la scritta USB). Usarlo blocca quella porta USB.",
  "Nordic's official development kit for the nRF52840 Bluetooth chip, with a built-in J-Link debugger, 4 buttons, 4 LEDs and Arduino-style headers. Pins run at 3.0 V and are not 5 V tolerant.":
    "Il kit di sviluppo ufficiale di Nordic per il chip Bluetooth nRF52840, con debugger J-Link integrato, 4 pulsanti, 4 LED e connettori in stile Arduino. I pin lavorano a 3,0 V e non tollerano i 5 V.",
  "Plug USB into the port on the short edge (interface MCU, J2) and set the power switch to ON; before the first Arduino sketch, burn the Adafruit bootloader and SoftDevice once.":
    "Collega la USB alla porta sul lato corto (MCU di interfaccia, J2) e metti l’interruttore di alimentazione su ON; prima del primo sketch Arduino, scrivi una volta il bootloader Adafruit e il SoftDevice.",
  "The nRF52840 I2C (TWIM) block can use almost any pin, but the Arduino core's Wire is fixed to P0.26 (SDA) and P0.27 (SCL), the Arduino SDA/SCL sockets.":
    "Il blocco I2C (TWIM) dell’nRF52840 può usare quasi qualsiasi pin, ma il Wire del core Arduino è fisso su P0.26 (SDA) e P0.27 (SCL), le prese SDA/SCL Arduino.",
  "Arduino SCL (I2C clock). The DK connects I2C pull-up resistors to this line when a shield is detected (SB33).":
    "SCL Arduino (clock I2C). La DK collega resistenze di pull-up I2C a questa linea quando rileva uno shield (SB33).",
  "Arduino SDA (I2C data). The DK connects I2C pull-up resistors to this line when a shield is detected (SB33).":
    "SDA Arduino (dati I2C). La DK collega resistenze di pull-up I2C a questa linea quando rileva uno shield (SB33).",
  "Arduino AREF position, wired to P0.02 (analog input AIN0).":
    "Posizione AREF di Arduino, collegata a P0.02 (ingresso analogico AIN0).",
  "With the TRACE switch (SW7) set to Alt, Button 2 is moved to this pin.":
    "Con l’interruttore TRACE (SW7) su Alt, il Button 2 viene spostato su questo pin.",
  "With the TRACE switch (SW7) set to Alt, Button 1 is moved to this pin.":
    "Con l’interruttore TRACE (SW7) su Alt, il Button 1 viene spostato su questo pin.",
  "Serial1 TX in the Arduino core.":
    "TX di Serial1 nel core Arduino.",
  "Serial1 RX in the Arduino core.":
    "RX di Serial1 nel core Arduino.",
  "NFC antenna pin by default. To use it as a normal pin, set CONFIG_NFCT_PINS_AS_GPIOS in your firmware.":
    "Per impostazione predefinita è un pin dell’antenna NFC. Per usarlo come pin normale, imposta CONFIG_NFCT_PINS_AS_GPIOS nel tuo firmware.",
  "Serial RX from the on-board debugger (the USB virtual COM port). Serial2 in the Arduino core.":
    "RX seriale dal debugger sulla scheda (la porta COM virtuale USB). Serial2 nel core Arduino.",
  "Flow-control line (CTS) of the USB virtual COM port. Free when flow control is off, or with switch SW7 set to off.":
    "Linea di controllo di flusso (CTS) della porta COM virtuale USB. Libera quando il controllo di flusso è spento, o con l’interruttore SW7 su off.",
  "Serial TX to the on-board debugger (the USB virtual COM port). Serial2 in the Arduino core.":
    "TX seriale verso il debugger sulla scheda (la porta COM virtuale USB). Serial2 nel core Arduino.",
  "Flow-control line (RTS) of the USB virtual COM port. Free when flow control is off, or with switch SW7 set to off.":
    "Linea di controllo di flusso (RTS) della porta COM virtuale USB. Libera quando il controllo di flusso è spento, o con l’interruttore SW7 su off.",
  "Used by the 32.768 kHz crystal. Not connected to this header unless you cut SB1 and short SB3.":
    "Usato dal quarzo da 32,768 kHz. Non è collegato a questo connettore a meno che tu non tagli SB1 e cortocircuiti SB3.",
  "Used by the 32.768 kHz crystal. Not connected to this header unless you cut SB2 and short SB4.":
    "Usato dal quarzo da 32,768 kHz. Non è collegato a questo connettore a meno che tu non tagli SB2 e cortocircuiti SB4.",
  "DK supply VDD: 3.0 V by default (fixed 3 V regulator).":
    "Alimentazione VDD della DK: 3,0 V per impostazione predefinita (regolatore fisso a 3 V).",
  "Arduino IOREF: tells a shield the logic level, which is VDD (3.0 V by default).":
    "IOREF Arduino: dice a uno shield il livello logico, che è VDD (3,0 V per impostazione predefinita).",
  "Not connected by default. Solder bridges SB43-SB46 can link it to the chip reset (P0.18) or the IF BOOT/RESET button.":
    "Non collegato per impostazione predefinita. I ponticelli a saldare SB43-SB46 possono collegarlo al reset del chip (P0.18) o al pulsante IF BOOT/RESET.",
  "Arduino 3.3V position. On this DK it carries VDD, 3.0 V by default.":
    "Posizione 3.3V di Arduino. Su questa DK porta VDD, 3,0 V per impostazione predefinita.",
  "5 V from the DK's boost regulator. Never connect it to an nRF52840 pin.":
    "5 V dal regolatore boost della DK. Non collegarlo mai a un pin dell’nRF52840.",
  "With the TRACE switch (SW7) set to Alt, the virtual COM port CTS line is moved to this pin.":
    "Con l’interruttore TRACE (SW7) su Alt, la linea CTS della porta COM virtuale viene spostata su questo pin.",
  "Button 1 on the DK, active low: reads 0 when pressed. Use INPUT_PULLUP (no external pull-up on the board).":
    "Pulsante 1 della DK, attivo basso: legge 0 quando è premuto. Usa INPUT_PULLUP (sulla scheda non c’è un pull-up esterno).",
  "LED 1 (green) on the DK, active low: write 0 to turn it on. Cut SB5 to free the pin. LED_BUILTIN in the Arduino core.":
    "LED 1 (verde) della DK, attivo basso: scrivi 0 per accenderlo. Taglia SB5 per liberare il pin. È LED_BUILTIN nel core Arduino.",
  "LED 3 (green) on the DK, active low: write 0 to turn it on. Cut SB7 to free the pin.":
    "LED 3 (verde) della DK, attivo basso: scrivi 0 per accenderlo. Taglia SB7 per liberare il pin.",
  "Wired to the on-board 64 Mbit QSPI flash; not connected to this header unless you cut SB13 and short SB23.":
    "Collegato alla flash QSPI da 64 Mbit sulla scheda; non è collegato a questo connettore a meno che tu non tagli SB13 e cortocircuiti SB23.",
  "Wired to the on-board 64 Mbit QSPI flash; not connected to this header unless you cut SB11 and short SB21.":
    "Collegato alla flash QSPI da 64 Mbit sulla scheda; non è collegato a questo connettore a meno che tu non tagli SB11 e cortocircuiti SB21.",
  "Wired to the on-board 64 Mbit QSPI flash; not connected to this header unless you cut SB14 and short SB24.":
    "Collegato alla flash QSPI da 64 Mbit sulla scheda; non è collegato a questo connettore a meno che tu non tagli SB14 e cortocircuiti SB24.",
  "Wired to the on-board 64 Mbit QSPI flash; not connected to this header unless you cut SB10 and short SB20.":
    "Collegato alla flash QSPI da 64 Mbit sulla scheda; non è collegato a questo connettore a meno che tu non tagli SB10 e cortocircuiti SB20.",
  "Button 4 on the DK, active low: reads 0 when pressed. Use INPUT_PULLUP (no external pull-up on the board).":
    "Pulsante 4 della DK, attivo basso: legge 0 quando è premuto. Usa INPUT_PULLUP (sulla scheda non c’è un pull-up esterno).",
  "Button 2 on the DK, active low: reads 0 when pressed. Use INPUT_PULLUP (no external pull-up on the board).":
    "Pulsante 2 della DK, attivo basso: legge 0 quando è premuto. Usa INPUT_PULLUP (sulla scheda non c’è un pull-up esterno).",
  "LED 2 (green) on the DK, active low: write 0 to turn it on. Cut SB6 to free the pin.":
    "LED 2 (verde) della DK, attivo basso: scrivi 0 per accenderlo. Taglia SB6 per liberare il pin.",
  "LED 4 (green) on the DK, active low: write 0 to turn it on. Cut SB8 to free the pin.":
    "LED 4 (verde) della DK, attivo basso: scrivi 0 per accenderlo. Taglia SB8 per liberare il pin.",
  "The chip's reset pin when pin reset is enabled (the IF BOOT/RESET button uses it). Avoid using it as a normal pin.":
    "Il pin di reset del chip quando il reset da pin è attivo (lo usa il pulsante IF BOOT/RESET). Evita di usarlo come pin normale.",
  "Wired to the on-board 64 Mbit QSPI flash; not connected to this header unless you cut SB12 and short SB22.":
    "Collegato alla flash QSPI da 64 Mbit sulla scheda; non è collegato a questo connettore a meno che tu non tagli SB12 e cortocircuiti SB22.",
  "Wired to the on-board 64 Mbit QSPI flash; not connected to this header unless you cut SB15 and short SB25.":
    "Collegato alla flash QSPI da 64 Mbit sulla scheda; non è collegato a questo connettore a meno che tu non tagli SB15 e cortocircuiti SB25.",
  "Button 3 on the DK, active low: reads 0 when pressed. Use INPUT_PULLUP (no external pull-up on the board).":
    "Pulsante 3 della DK, attivo basso: legge 0 quando è premuto. Usa INPUT_PULLUP (sulla scheda non c’è un pull-up esterno).",
  "Debug trace output (SWO) to the on-board debugger. Usable as a pin if you do not use trace.":
    "Uscita di trace di debug (SWO) verso il debugger sulla scheda. Puoi usarlo come pin se non usi il trace.",
  "ST's official STM32F401 board with Arduino Uno style sockets and a built-in ST-LINK programmer and debugger. 3.3 V logic, most pins tolerate 5 V.":
    "La scheda STM32F401 ufficiale di ST con prese in stile Arduino Uno e un programmatore e debugger ST-LINK integrato. Logica a 3,3 V, la maggior parte dei pin tollera i 5 V.",
  "Plug the USB cable into the mini-USB port on the ST-LINK end. No button press is needed.":
    "Collega il cavo USB alla porta mini-USB sul lato dell’ST-LINK. Non serve premere nessun pulsante.",
  "Wire uses PB9 (D14) for SDA and PB8 (D15) for SCL. Only specific STM32 pin pairs can do I2C (for example PB7/PB6 with Wire.setSDA/setSCL).":
    "Wire usa PB9 (D14) per SDA e PB8 (D15) per SCL. Solo alcune coppie di pin dell’STM32 possono fare I2C (per esempio PB7/PB6 con Wire.setSDA/setSCL).",
  "Not connected to this header by default: PA3/PA2 go to the ST-LINK USB serial port (solder bridges SB13/SB14 on, SB62/SB63 off). Serial uses them.":
    "Non collegato a questo connettore per impostazione predefinita: PA3/PA2 vanno alla porta seriale USB dell’ST-LINK (ponticelli a saldare SB13/SB14 chiusi, SB62/SB63 aperti). Serial li usa.",
  "Also the SWO debug trace line to the ST-LINK (SB15). Fine as a normal pin.":
    "È anche la linea di trace di debug SWO verso l’ST-LINK (SB15). Va bene come pin normale.",
  "Green user LED LD2 is on this pin (HIGH = on, solder bridge SB21).":
    "Su questo pin c’è il LED utente verde LD2 (HIGH = acceso, ponticello a saldare SB21).",
  "Default I2C data pin (Wire SDA).":
    "Pin dati I2C predefinito (Wire SDA).",
  "Default I2C clock pin (Wire SCL).":
    "Pin clock I2C predefinito (Wire SCL).",
  "Analog supply / ADC reference (AREF on Arduino boards). Tied to 3.3 V by SB57.":
    "Alimentazione analogica / riferimento dell’ADC (AREF sulle schede Arduino). Collegato a 3,3 V tramite SB57.",
  "Tells shields the logic level: 3.3 V.":
    "Dice agli shield il livello logico: 3,3 V.",
  "Connect to GND to reset the board (same as the black RESET button).":
    "Collegalo a GND per resettare la scheda (come il pulsante nero RESET).",
  "5 V output (from USB by default).":
    "Uscita a 5 V (dalla USB per impostazione predefinita).",
  "Input for 7 to 12 V (with jumper JP5 on E5V/VIN). It gives no power when the board runs from USB.":
    "Ingresso per 7-12 V (con il jumper JP5 su E5V/VIN). Non fornisce alimentazione quando la scheda va con la USB.",
  "Analog input PC1. Solder bridges SB46/SB56 can switch it to PB9 (I2C SDA); default is PC1. 5 V tolerant only as a digital input. As an analog input keep it between 0 and 3.3 V.":
    "Ingresso analogico PC1. I ponticelli a saldare SB46/SB56 possono passarlo a PB9 (SDA I2C); il predefinito è PC1. Tollera i 5 V solo come ingresso digitale. Come ingresso analogico tienilo tra 0 e 3,3 V.",
  "Analog input PC0. Solder bridges SB52/SB51 can switch it to PB8 (I2C SCL); default is PC0. 5 V tolerant only as a digital input. As an analog input keep it between 0 and 3.3 V.":
    "Ingresso analogico PC0. I ponticelli a saldare SB52/SB51 possono passarlo a PB8 (SCL I2C); il predefinito è PC0. Tollera i 5 V solo come ingresso digitale. Come ingresso analogico tienilo tra 0 e 3,3 V.",
  "STM32 supply, 3.3 V.":
    "Alimentazione dell’STM32, 3,3 V.",
  "Input for an external 5 V supply (4.75 to 5.25 V, jumper JP5 on E5V). Gives no power from USB.":
    "Ingresso per un alimentatore esterno a 5 V (da 4,75 a 5,25 V, jumper JP5 su E5V). Dalla USB non riceve alimentazione.",
  "HIGH at reset starts the ST bootloader instead of your program. Leave it LOW (default).":
    "HIGH al reset avvia il bootloader ST invece del tuo programma. Lascialo LOW (predefinito).",
  "Same as IOREF on the Arduino header.":
    "Come IOREF sul connettore Arduino.",
  "SWD debug line to the on-board ST-LINK (SWDIO). Do not use it as I/O or programming stops working.":
    "Linea di debug SWD verso l’ST-LINK sulla scheda (SWDIO). Non usarla come I/O, o la programmazione smette di funzionare.",
  "Same as RESET on the Arduino header.":
    "Come RESET sul connettore Arduino.",
  "SWD debug line to the on-board ST-LINK (SWCLK). Do not use it as I/O or programming stops working.":
    "Linea di debug SWD verso l’ST-LINK sulla scheda (SWCLK). Non usarla come I/O, o la programmazione smette di funzionare.",
  "Same as 3V3 on the Arduino header.":
    "Come 3V3 sul connettore Arduino.",
  "Same as 5V on the Arduino header.":
    "Come 5V sul connettore Arduino.",
  "Blue USER button B1 is wired to this pin (SB17). Weak pin: do not drive LEDs from it.":
    "Il pulsante blu USER B1 è collegato a questo pin (SB17). Pin debole: non usarlo per pilotare LED.",
  "Same as VIN on the Arduino header.":
    "Come VIN sul connettore Arduino.",
  "32.768 kHz crystal X2 pin. Not connected to this header on MB1136 C-02 and later (SB48/SB49 off).":
    "Pin del quarzo X2 da 32,768 kHz. Non è collegato a questo connettore sulle MB1136 C-02 e successive (SB48/SB49 aperti).",
  "Same signal as Arduino pin A0.":
    "Stesso segnale del pin Arduino A0.",
  "High-speed clock input (8 MHz from the ST-LINK on MB1136 C-02 and later). Not usable as a normal pin.":
    "Ingresso del clock ad alta velocità (8 MHz dall’ST-LINK sulle MB1136 C-02 e successive). Non si può usare come pin normale.",
  "Same signal as Arduino pin A1.":
    "Stesso segnale del pin Arduino A1.",
  "Same signal as Arduino pin A2.":
    "Stesso segnale del pin Arduino A2.",
  "RTC backup supply. Tied to 3.3 V on this board (SB45).":
    "Alimentazione di backup dell’RTC. Su questa scheda è collegata a 3,3 V (SB45).",
  "Same signal as Arduino pin A3.":
    "Stesso segnale del pin Arduino A3.",
  "Same signal as Arduino pin A4.":
    "Stesso segnale del pin Arduino A4.",
  "Same signal as Arduino pin A5.":
    "Stesso segnale del pin Arduino A5.",
  "Same signal as Arduino pin D15.":
    "Stesso segnale del pin Arduino D15.",
  "Same signal as Arduino pin D14.":
    "Stesso segnale del pin Arduino D14.",
  "Same as AVDD on the Arduino header.":
    "Come AVDD sul connettore Arduino.",
  "5 V from the ST-LINK USB connector.":
    "5 V dal connettore USB dell’ST-LINK.",
  "Same signal as Arduino pin D13. Green user LED LD2 is on this pin (HIGH = on, solder bridge SB21).":
    "Stesso segnale del pin Arduino D13. Su questo pin c’è il LED utente verde LD2 (HIGH = acceso, ponticello a saldare SB21).",
  "USB data line of the STM32, but no USB connector is wired to it on this board.":
    "Linea dati USB dell’STM32, ma su questa scheda non c’è nessun connettore USB collegato.",
  "Same signal as Arduino pin D12.":
    "Stesso segnale del pin Arduino D12.",
  "Same signal as Arduino pin D11.":
    "Stesso segnale del pin Arduino D11.",
  "Same signal as Arduino pin D10.":
    "Stesso segnale del pin Arduino D10.",
  "Same signal as Arduino pin D9.":
    "Stesso segnale del pin Arduino D9.",
  "Same signal as Arduino pin D8.":
    "Stesso segnale del pin Arduino D8.",
  "BOOT1: only matters when BOOT0 is HIGH at reset. Normal pin otherwise.":
    "BOOT1: conta solo quando BOOT0 è HIGH al reset. Altrimenti è un pin normale.",
  "Same signal as Arduino pin D7.":
    "Stesso segnale del pin Arduino D7.",
  "Same signal as Arduino pin D6.":
    "Stesso segnale del pin Arduino D6.",
  "Same signal as Arduino pin D5.":
    "Stesso segnale del pin Arduino D5.",
  "Same signal as Arduino pin D4.":
    "Stesso segnale del pin Arduino D4.",
  "Same signal as Arduino pin D3.":
    "Stesso segnale del pin Arduino D3.",
  "Analog ground (joined to GND).":
    "Massa analogica (unita a GND).",
  "Same signal as Arduino pin D2.":
    "Stesso segnale del pin Arduino D2.",
  "Same signal as Arduino pin D1. Not connected to this header by default: PA3/PA2 go to the ST-LINK USB serial port (solder bridges SB13/SB14 on, SB62/SB63 off). Serial uses them.":
    "Stesso segnale del pin Arduino D1. Non collegato a questo connettore per impostazione predefinita: PA3/PA2 vanno alla porta seriale USB dell’ST-LINK (ponticelli a saldare SB13/SB14 chiusi, SB62/SB63 aperti). Serial li usa.",
  "Same signal as Arduino pin D0. Not connected to this header by default: PA3/PA2 go to the ST-LINK USB serial port (solder bridges SB13/SB14 on, SB62/SB63 off). Serial uses them.":
    "Stesso segnale del pin Arduino D0. Non collegato a questo connettore per impostazione predefinita: PA3/PA2 vanno alla porta seriale USB dell’ST-LINK (ponticelli a saldare SB13/SB14 chiusi, SB62/SB63 aperti). Serial li usa.",
  "The second-generation Pico with the faster RP2350 chip, twice the memory and 4 MB flash. Same 40-pin layout as the Pico, 3.3 V logic.":
    "La Pico di seconda generazione con il chip RP2350, più veloce, il doppio della memoria e 4 MB di flash. Stessa disposizione a 40 pin della Pico, logica a 3,3 V.",
  "If the board is not found, hold the BOOTSEL button while plugging in the USB cable.":
    "Se la scheda non viene trovata, tieni premuto il pulsante BOOTSEL mentre colleghi il cavo USB.",
  "Only certain pin pairs can be I2C on this chip, and SDA and SCL cannot be swapped in software. Wire uses GP4 (SDA) and GP5 (SCL); Wire.setSDA()/Wire.setSCL() before Wire.begin() can move I2C0 to GP0/GP1, GP8/GP9, GP12/GP13, GP16/GP17 or GP20/GP21. Wire1 defaults to GP26/GP27.":
    "Su questo chip solo alcune coppie di pin possono fare I2C, e SDA e SCL non si possono scambiare via software. Wire usa GP4 (SDA) e GP5 (SCL); Wire.setSDA()/Wire.setSCL() prima di Wire.begin() possono spostare I2C0 su GP0/GP1, GP8/GP9, GP12/GP13, GP16/GP17 o GP20/GP21. Wire1 usa per impostazione predefinita GP26/GP27.",
  "Tolerates 5 V inputs, but only while the board is powered.":
    "Tollera ingressi a 5 V, ma solo mentre la scheda è alimentata.",
  "Reset pin. Connect it to GND for a moment to restart the board. It has an internal pull-up.":
    "Pin di reset. Collegalo a GND per un attimo per riavviare la scheda. Ha un pull-up interno.",
  "Analog input ADC0 (0 to 3.3 V). Never put more than 3.3 V on this pin.":
    "Ingresso analogico ADC0 (da 0 a 3,3 V). Non mettere mai più di 3,3 V su questo pin.",
  "Analog input ADC1 (0 to 3.3 V). Never put more than 3.3 V on this pin.":
    "Ingresso analogico ADC1 (da 0 a 3,3 V). Non mettere mai più di 3,3 V su questo pin.",
  "Analog ground for GP26 to GP28. Use it as the ground for analog sensors.":
    "Massa analogica per GP26-GP28. Usala come massa per i sensori analogici.",
  "Analog input ADC2 (0 to 3.3 V). Never put more than 3.3 V on this pin.":
    "Ingresso analogico ADC2 (da 0 a 3,3 V). Non mettere mai più di 3,3 V su questo pin.",
  "Reference voltage for the analog inputs (filtered 3.3 V). Do not power parts from it.":
    "Tensione di riferimento per gli ingressi analogici (3,3 V filtrati). Non alimentare componenti da qui.",
  "3.3 V output for sensors and modules. Keep the load under 300 mA.":
    "Uscita a 3,3 V per sensori e moduli. Tieni il carico sotto i 300 mA.",
  "Turns the 3.3 V supply on or off. Leave it unconnected; connecting it to GND switches the board off.":
    "Accende o spegne l’alimentazione a 3,3 V. Lascialo scollegato; collegarlo a GND spegne la scheda.",
  "Main power input (1.8 to 5.5 V). From USB it is about 4.7 V (5 V minus a diode drop).":
    "Ingresso di alimentazione principale (da 1,8 a 5,5 V). Dalla USB è circa 4,7 V (5 V meno la caduta di un diodo).",
  "5 V straight from the USB cable. It is 0 V when USB is not plugged in.":
    "5 V presi direttamente dal cavo USB. È a 0 V quando la USB non è collegata.",
  "Debug clock for a debug probe (SWD). Not a GPIO.":
    "Clock di debug per una sonda di debug (SWD). Non è un GPIO.",
  "Ground pin of the 3-pin debug header.":
    "Pin di massa del connettore di debug a 3 pin.",
  "Debug data for a debug probe (SWD). Not a GPIO.":
    "Dati di debug per una sonda di debug (SWD). Non è un GPIO.",
  "The Raspberry Pi Pico with Wi-Fi and Bluetooth added. Same 40 pins and 3.3 V logic as the Pico; the on-board LED is driven by the wireless chip (use LED_BUILTIN), and GPIO 23, 24, 25 and 29 are used by the radio, so they are not on the header.":
    "La Raspberry Pi Pico con in più Wi-Fi e Bluetooth. Stessi 40 pin e logica a 3,3 V della Pico; il LED sulla scheda è pilotato dal chip wireless (usa LED_BUILTIN), e i GPIO 23, 24, 25 e 29 sono usati dalla radio, quindi non sono sul connettore.",
  "A small, low-cost board with the Raspberry Pi RP2040 chip. 3.3 V logic (not 5 V tolerant), breadboard friendly, and flashed by dragging a file onto it.":
    "Una scheda piccola ed economica con il chip Raspberry Pi RP2040. Logica a 3,3 V (non tollera i 5 V), comoda sulla breadboard, e si programma trascinandoci sopra un file.",
  "A very fast (600 MHz) breadboard-friendly board with native USB, lots of serial, I2C and SPI ports and a microSD slot. 3.3 V logic; the pins are not 5 V tolerant.":
    "Una scheda molto veloce (600 MHz), comoda sulla breadboard, con USB nativa, tante porte seriali, I2C e SPI e uno slot microSD. Logica a 3,3 V; i pin non tollerano i 5 V.",
  "Press the white program button once if the upload waits for the board.":
    "Premi una volta il pulsante bianco di programmazione se il caricamento aspetta la scheda.",
  "Wire only works on pins 18 (SDA) and 19 (SCL). Wire1 uses 17 (SDA1) and 16 (SCL1); Wire2 uses 25 (SDA2) and 24 (SCL2).":
    "Wire funziona solo sui pin 18 (SDA) e 19 (SCL). Wire1 usa 17 (SDA1) e 16 (SCL1); Wire2 usa 25 (SDA2) e 24 (SCL2).",
  "VIN (printed 5V): 5 V from USB when plugged in. Can also take 3.6 to 5.5 V input; cut the VUSB-VIN pad before using external power together with USB.":
    "VIN (stampato 5V): 5 V dalla USB quando è collegata. Accetta anche un ingresso da 3,6 a 5,5 V; taglia la piazzola VUSB-VIN prima di usare un’alimentazione esterna insieme alla USB.",
  "3.3 V output from the on-board regulator (250 mA max for everything you connect).":
    "Uscita a 3,3 V dal regolatore sulla scheda (massimo 250 mA per tutto quello che colleghi).",
  "Default I2C clock (Wire SCL). Also analog A5.":
    "Clock I2C predefinito (Wire SCL). È anche l’analogico A5.",
  "Default I2C data (Wire SDA). Also analog A4.":
    "Dati I2C predefiniti (Wire SDA). È anche l’analogico A4.",
  "Orange on-board LED, and also the SPI clock (SCK). HIGH turns the LED on.":
    "LED arancione sulla scheda, e anche il clock SPI (SCK). HIGH accende il LED.",
  "Serial1 RX. The USB serial monitor does not use this pin (Teensy has native USB).":
    "RX di Serial1. Il monitor seriale USB non usa questo pin (la Teensy ha la USB nativa).",
  "Serial1 TX. The USB serial monitor does not use this pin (Teensy has native USB).":
    "TX di Serial1. Il monitor seriale USB non usa questo pin (la Teensy ha la USB nativa).",
  "Power control: a button from here to GND held 4 s turns the 3.3 V power off, 0.5 s turns it back on.":
    "Controllo dell’alimentazione: un pulsante da qui a GND tenuto premuto 4 s spegne l’alimentazione a 3,3 V, 0,5 s la riaccende.",
  "Pulling this to GND does the same as the white button: enters programming mode. It is not a reset.":
    "Portarlo a GND fa lo stesso del pulsante bianco: entra in modalità di programmazione. Non è un reset.",
  "Input for a 3 V coin cell (CR2032) to keep the real-time clock running. It does not supply power to parts.":
    "Ingresso per una batteria a bottone da 3 V (CR2032) che tiene in funzione l’orologio in tempo reale. Non alimenta i componenti.",
};

export default it;
