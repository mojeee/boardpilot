# Motion clip posts

One post per clip from [the motion clips](../motion.md), in English and Italian. The captions are burned into the video in English; upload `<clip>.it.srt` as Italian subtitles where the platform allows it. Every clip is muted and recorded from the real app; the ones marked Simulator ran on the simulated board, and the post says so.

Suggested tags: #embedded #ESP32 #RaspberryPiPico #Arduino #STM32 #electronics #maker

## Found it (found-it)

Files: `found-it-16x9.mp4` (YouTube, X, LinkedIn), `found-it-1x1.mp4` (feed), `found-it-9x16.mp4` (Shorts, Reels). Simulator clip, 12 s.

**English**

Sensor not found? BoardPilot scans the I2C bus as wired, then with SDA and SCL exchanged. If the sensor only answers when exchanged, the wires are crossed, and the app shows the measurements that prove it. Simulator run, real app.

**Italiano**

Il sensore non risponde? BoardPilot scansiona il bus I2C così come è collegato, poi con SDA e SCL scambiati. Se il sensore risponde solo scambiati, i fili sono invertiti, e l'app mostra le misure che lo provano. Simulatore, app vera.

## Honest AI (honest-ai)

Files: `honest-ai-16x9.mp4` (YouTube, X, LinkedIn), `honest-ai-1x1.mp4` (feed), `honest-ai-9x16.mp4` (Shorts, Reels). Simulator clip, 11 s.

**English**

An assistant for hardware should never invent a reading. In BoardPilot every finding says where it comes from: a measurement taken in this session, a datasheet section, or a suggestion you confirm first.

**Italiano**

Un assistente per l'hardware non deve mai inventare una lettura. In BoardPilot ogni risultato dice da dove viene: una misura di questa sessione, una sezione del datasheet, o un suggerimento da confermare.

## 13 boards (thirteen-boards)

Files: `thirteen-boards-16x9.mp4` (YouTube, X, LinkedIn), `thirteen-boards-1x1.mp4` (feed), `thirteen-boards-9x16.mp4` (Shorts, Reels). Simulator clip, 15 s.

**English**

ESP32, Raspberry Pi Pico, Arduino, STM32, nRF52 and Teensy: 13 boards, each one a data file with its pin rules and sources. The 3D board is generated from that file, so every pin is a real object you can click.

**Italiano**

ESP32, Raspberry Pi Pico, Arduino, STM32, nRF52 e Teensy: 13 schede, ognuna un file di dati con le regole dei pin e le fonti. La scheda 3D nasce da quel file, così ogni pin è un oggetto vero da cliccare.

## 380+ parts (parts-library)

Files: `parts-library-16x9.mp4` (YouTube, X, LinkedIn), `parts-library-1x1.mp4` (feed), `parts-library-9x16.mp4` (Shorts, Reels). Simulator clip, 12 s.

**English**

More than 380 parts in the built-in library: sensors, displays, motors, relays, LEDs. Each one knows its pins, its bus and addresses, and the datasheet it came from, so the wiring checker can warn you before anything is powered.

**Italiano**

Più di 380 parti nella libreria: sensori, display, motori, relè, LED. Ognuna conosce i suoi pin, il bus e gli indirizzi, e il datasheet da cui viene, così il controllo dei collegamenti ti avvisa prima di dare corrente.

## Register bits (register-bits)

Files: `register-bits-16x9.mp4` (YouTube, X, LinkedIn), `register-bits-1x1.mp4` (feed), `register-bits-9x16.mp4` (Shorts, Reels). Lesson clip, 11 s.

**English**

REG |= (1 << 5); is less scary when you can see it. The Learn lessons in BoardPilot let you press a button, run one line of C and watch the register change, bit by bit.

**Italiano**

REG |= (1 << 5); fa meno paura quando lo vedi. Le lezioni di BoardPilot ti fanno premere un pulsante, eseguire una riga di C e guardare il registro cambiare, bit per bit.

## PWM (pwm)

Files: `pwm-16x9.mp4` (YouTube, X, LinkedIn), `pwm-1x1.mp4` (feed), `pwm-9x16.mp4` (Shorts, Reels). Lesson clip, 11 s.

**English**

PWM in one picture: widen the pulse and the average voltage rises, so the LED gets brighter and the motor spins faster. One of the interactive widgets in BoardPilot's built-in lessons.

**Italiano**

Il PWM in un'immagine: allarghi l'impulso e la tensione media sale, così il LED si accende di più e il motore gira più veloce. Uno dei widget interattivi delle lezioni integrate in BoardPilot.

## I2C decoded (i2c-decode)

Files: `i2c-decode-16x9.mp4` (YouTube, X, LinkedIn), `i2c-decode-1x1.mp4` (feed), `i2c-decode-9x16.mp4` (Shorts, Reels). Simulator clip, 11 s.

**English**

What actually happens on the wire when you read a sensor register: start, address, ACK, register, restart, data, stop. BoardPilot draws every I2C transaction the diagnostic agent sees, bit by bit. Shown here in simulator mode.

**Italiano**

Cosa succede davvero sul filo quando leggi un registro del sensore: start, indirizzo, ACK, registro, restart, dati, stop. BoardPilot disegna ogni transazione I2C vista dall'agente diagnostico, bit per bit. Qui in modalità simulatore.

## Works without hardware (no-hardware)

Files: `no-hardware-16x9.mp4` (YouTube, X, LinkedIn), `no-hardware-1x1.mp4` (feed), `no-hardware-9x16.mp4` (Shorts, Reels). Simulator clip, 11 s.

**English**

No board yet? BoardPilot's simulator implements the same interface as a real board, so every task runs without hardware: connect, debug, test, monitor. It is how we build the app, and how you can try it today.

**Italiano**

Non hai ancora una scheda? Il simulatore di BoardPilot ha la stessa interfaccia di una scheda vera, quindi ogni attività funziona senza hardware: collegare, fare debug, testare, monitorare. È così che sviluppiamo l'app, ed è così che puoi provarla oggi.
