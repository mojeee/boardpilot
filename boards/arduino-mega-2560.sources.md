# Sources for arduino-mega-2560.json

| Fact | Source |
|---|---|
| PCB outline 101.6 × 53.34 mm (4.0 × 2.1 in) and every header pin centre | Official Eagle files `Arduino_MEGA_2560-Rev3.brd` (https://www.arduino.cc/en/uploads/Main/arduino-mega2560_R3-reference-design.zip): Dimension layer and pads of POWER, ADCL, ADCH, JP6, PWML, COMMUNICATION and the 2×18 XIO header. z = 53.34 − eagle_y. The product page rounds the size to 101.52 × 53.3 mm. |
| XIO double header: 5V/5V at the top (next to the COMMUNICATION header), D22…D53 in pairs (even column x 93.98, odd column x 96.52), GND/GND at the bottom | Same Eagle file, XIO pad nets (PA0 = D22 at pad 3, …, PB0 = D53 at pad 34) |
| SDA/SCL near AREF are the same nets as D20/D21; both have 10 kΩ pull-ups to +5V (RN1) | Same Eagle file, `signals` section (SDA, SCL, RN1 pads 6/7 on +5V) |
| IOREF on the +5V net; first POWER pad unconnected (NC, skipped); VIN 7-12 V | Eagle `signals`; Arduino Mega 2560 Rev3 datasheet A000067, "Connector Pinouts" and "Recommended Operating Conditions" |
| 3.3V pin 50 mA | Arduino Mega 2560 Rev3 product page tech specs |
| Arduino pin → port pin (PE0, PE1, PE4, … PB0), PWM pins 2-13 and 44-46, A0 = 54 … A15 = 69, SDA = 20, SCL = 21, SPI MISO/MOSI/SCK/SS = 50/51/52/53, LED_BUILTIN = 13 | ArduinoCore-avr `variants/mega/pins_arduino.h` (digital_pin_to_port/bit/timer tables) |
| Serial1-3 on 18/19, 16/17, 14/15; external interrupts INT0-INT5 on 21, 20, 19, 18, 2, 3 | ATmega2560 datasheet, "Alternate Port Functions" (Port D, Port E) and "External Interrupts"; `pins_arduino.h` |
| Toolchain: `arduino:avr:mega` (default cpu atmega2560), protocol `wiring`, 115200 | ArduinoCore-avr `boards.txt` (`mega.menu.cpu.atmega2560.*`) |
| USB ids 2341:0010, 2341:0042, 2a03:0010, 2a03:0042, 2341:0210, 2341:0242 | ArduinoCore-avr `boards.txt` (`mega.vid.N/pid.N`) |
| USB id 1a86:7523 | WCH CH340 default id, used by clones (not unique to this board) |
| USB id 03eb:2fef | ATmega16U2 DFU bootloader, only while re-flashing the USB chip |

Components come from Eagle element positions: ATmega2560 TQFP-100 (IC3), ATmega16U2 (IC4), USB-B (X2), DC jack (X1), NCP1117 regulator (IC1), RESET button, LEDs ON/L/TX/RX, 16 MHz resonator (Y1), ICSP headers. Body sizes are **estimated** from typical package sizes.

VIN `supplies` is 0 because VIN is an input and is not fed from USB (jack → diode D1 → VIN → regulator).
