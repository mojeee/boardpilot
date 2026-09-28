# Sources for arduino-nano.json

| Fact | Source |
|---|---|
| Header pin centres, row order and signal of every pin | Official Eagle files for Nano 3.0, `Arduino Nano2.brd` (https://www.arduino.cc/en/uploads/Main/ArduinoNano30Eagle.zip): pads of J1 (D1/TX … D12) and J2 (VIN … D13), with net names. The board is drawn vertical with USB at y = 0; it is rotated so USB is on the left: posMm = [eagle_y, eagle_x]. J1 becomes the top row (z 1.27), J2 the bottom row (z 16.51). |
| PCB 43.18 × 17.78 mm | Eagle Dimension layer (1.7 × 0.7 in). The official mechanical drawing (datasheet A000005, section 6) rounds this to 43.2 × 18 mm and gives 15.24 mm between the rows. The 18.54 mm figure seen elsewhere was **not** used. |
| Pin list and names (RX0, TX1, RST, REF, 3V3, A6, A7) | Arduino Nano datasheet A000005, "Connector Pinouts"; Nano full pinout PDF A000005 |
| 3V3 comes from the FT232RL (net 3V3 → U2 pin 17 3V3OUT) | Eagle `signals` section |
| 3V3OUT supplies up to 50 mA | FTDI FT232R datasheet, pin description of 3V3OUT. On CH340 clones the 3V3 source differs and may be weaker (**not documented**; stated only as a caution). |
| A6 = 20, A7 = 21, and they are ADC-only (ADC6/ADC7 have no port, so no digital I/O and no pull-up) | ArduinoCore-avr `variants/eightanaloginputs/pins_arduino.h` and `variants/standard/pins_arduino.h`; ATmega328P datasheet (TQFP/QFN pinout: ADC6/ADC7 are analog-only inputs) |
| Everything else about the ATmega328P pins | Same sources as the Uno (standard variant, ATmega328P datasheet) |
| Toolchain: `arduino:avr:nano` (default cpu atmega328 = new bootloader, 115200); old bootloader option uploads at 57600 | ArduinoCore-avr `boards.txt` (`nano.menu.cpu.atmega328`, `nano.menu.cpu.atmega328old`) |
| USB ids 0403:6001 (FTDI FT232R default id), 1a86:7523 (CH340 clones) | FTDI default VID/PID; WCH CH340 default id. The official boards.txt lists no id for the Nano, so identification by USB id alone is not unique. |

Components: ATmega328P (U1, TQFP-32 at 45°, drawn as an axis-aligned square), mini-USB (J3), RESET (SW1), LEDs TX/RX/PWR/L, ICSP header (J4). Positions from the Eagle file; sizes **estimated**. The FT232RL and the 5 V regulator sit on the bottom side and are not drawn. The datasheet text says "Micro-B USB" but the classic Nano (and its Eagle file) uses mini-USB.

VIN `supplies` is 0 because VIN is an input (USB 5 V reaches the 5V rail through Schottky diode D1; VIN only feeds the regulator). maxVolt 12 is the recommended maximum input from the product page.
