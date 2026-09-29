# Sources for arduino-uno-r3.json

| Fact | Source |
|---|---|
| PCB outline 68.58 × 53.34 mm (2.7 × 2.1 in) and every header pin centre | Official Eagle files `UNO-TH_Rev3e.brd` (https://content.arduino.cc/assets/UNO-TH_Rev3e-reference.zip): Dimension layer and pads of elements IOH (10-pin), IOL (8-pin), POWER (8-pin), AD (6-pin). Converted with z = 53.34 − eagle_y (Eagle origin is bottom-left; USB is already on the left). |
| 160 mil gap between D7 (x 45.72) and D8 (x 41.656) | Same Eagle file (IOL pad 8 vs IOH pad 1: 4.064 mm) |
| Pin nets: SDA/SCL header = AD4/SDA, AD5/SCL nets (same as A4/A5); IOREF on the +5V net; first POWER pad unconnected (NC, skipped) | Same Eagle file, `signals` section |
| IOREF "connected to 5V"; VIN max 20 V (6-20 V) | Arduino UNO R3 datasheet A000066, "Connector Pinouts" and "Recommended Operating Conditions" |
| 3.3V pin 50 mA; recommended input 7-12 V | Arduino Uno Rev3 product page tech specs (docs.arduino.cc/hardware/uno-rev3) |
| Pin numbers (A0 = 14 … A5 = 19), SDA = 18, SCL = 19, SPI SS/MOSI/MISO/SCK = 10/11/12/13, LED_BUILTIN = 13 | ArduinoCore-avr `variants/standard/pins_arduino.h` |
| Port pins (PD0-PD7, PB0-PB5, PC0-PC5), PWM on 3/5/6/9/10/11, INT0/INT1 on D2/D3, ADC0-5 | Microchip ATmega328P datasheet, "Pin Configurations" and "Alternate Port Functions"; `pins_arduino.h` timer table |
| D0/D1 are the serial link to the ATmega16U2 USB bridge (1 kΩ series resistors RN4) | Eagle `signals` (IO0/IO1 to RN4) and datasheet A000066 |
| Toolchain: fqbn `arduino:avr:uno`, protocol `arduino`, 115200 baud, mcu atmega328p | ArduinoCore-avr `boards.txt` (`uno.*`) |
| USB ids 2341:0043, 2341:0001, 2a03:0043, 2341:0243, 2341:006a | ArduinoCore-avr `boards.txt` (`uno.vid.N/pid.N`) |
| USB id 1a86:7523 | WCH CH340 default id, used by clones (not an official Arduino id; also used by other boards) |
| USB id 03eb:2fef | ATmega16U2 DFU bootloader (Atmel/Microchip FLIP DFU), only while re-flashing the USB chip |

Components (rects) come from the element positions in the same Eagle file: ATmega328P DIP (ZU4), ATmega16U2 (U3), USB-B (X2), DC jack (X1), NCP1117 5 V regulator (U1), RESET button, LEDs ON/L/TX/RX, 16 MHz resonator (Y2), ICSP headers. Body sizes are **estimated** from typical package sizes (DIP-28, QFN-32, SOT-223, 0805, USB-B overhang ≈ 6.3 mm, jack overhang ≈ 1.8 mm).

VIN `supplies` is 0 because VIN is an input: it is not fed from USB (USB 5 V goes through the T1 switch to the 5 V rail; VIN comes from the jack through diode D1). It is excluded from automatic power pin picks.

Mounting holes (`holesMm`): the four holes of the Arduino UNO Rev3 reference design, Ø 3.2 mm (125 mil), at (550, 100), (600, 2000), (2600, 300) and (2600, 1400) mil from the lower-left corner of the Eagle board (`UNO-TH_Rev3e.brd`, Holes layer; the same pattern as the Arduino shield outline). Converted with z = 53.34 − eagle_y.
