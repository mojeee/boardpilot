# Sources for teensy-41.json

Board: PJRC Teensy 4.1 (NXP i.MX RT1062). Orientation: micro-USB on the LEFT, the Vin/GND/3.3V/23… row on top, the GND/0/1… row at the bottom (same as the front pinout card).

| Fact | Source |
|---|---|
| PCB 60.96 × 17.78 mm, 1.57 mm thick; pin 1 centre 1.27 mm from both edges; 2.54 mm pitch; rows 15.24 mm apart; USB overhang 0.6 mm, 7.5 mm wide, 5.0 mm deep; button 41.66 mm from pin 1 | PJRC "Teensy dimensions" page, Teensy 4.1 drawing (`dimensions_teensy41.png`) |
| 5-pin column (On/Off, Program, GND, 3.3V, VBAT, top to bottom) sits 45.72 mm from pin 1, in line with pins 38/27, at 2.54 mm pitch between the two rows | Same drawing (45.72 dimension) and the back pinout card (card11b rev4), which labels the column next to the SD socket |
| Pin order: top row Vin, GND, 3.3V, 23 … 13, GND, 41 … 33; bottom row GND, 0 … 12, 3.3V, 24 … 32 | PJRC pinout card front (card11a rev4) |
| Silkscreen "5V", "G", "3V" at the Vin/GND/3.3V pins | PJRC product photo (teensy41_4.jpg) |
| Alternate functions per pin (Serial1-8, Wire/Wire1/Wire2, SPI/SPI1, CAN1-3, I2S1/I2S2, S/PDIF, MQS, PWM) | Pinout card front (card11a rev4) |
| Analog A0-A13 = pins 14-27, A14-A17 = pins 38-41; LED_BUILTIN = 13; SS/MOSI/MISO/SCK = 10/11/12/13; SDA/SCL = 18/19 | PaulStoffregen/cores `teensy4/pins_arduino.h` |
| i.MX RT1062 pad name for each pin (chipPin) | PaulStoffregen/cores `teensy4/core_pins.h`, `CORE_PINn_CONFIG` for ARDUINO_TEENSY41 |
| Pins are not 5 V tolerant (digital and analog), 3.3 V max; LED on pin 13 | PJRC Teensy 4.1 product page ("pins are not 5V tolerant", "Pin 13 has an orange LED") |
| 3.3 V output 250 mA max; Vin 3.6 to 5.5 V | Pinout card front ("3.3V (250 mA max)", "Vin (3.6 to 5.5 volts)") |
| VBAT: 3 V coin cell for the RTC; On/Off: hold 4 s = off, 0.5 s = on; Program pin/button enters program mode, not a reset | Product page sections "VBAT", "On / Off Pin and Power Control", "Program Pushbutton / Pin" |
| 8 MB flash, 1024 KB RAM, 600 MHz Cortex-M7; chip marking MIMXRT1062DVJ6B | Product page (technical specs, board revision notes) |
| USB 16c0:0483 (USB Type Serial, default), 16c0:0489 (Serial + MIDI) | PaulStoffregen/cores `teensy4/usb_desc.h` (`PRODUCT_ID`) |
| USB 16c0:0478 (HalfKay bootloader) | PaulStoffregen/teensy_loader_cli `teensy_loader_cli.c` (`open_usb_device(0x16C0, 0x0478)`) and PJRC `00-teensy.rules` (16c0:04xx) |
| Toolchain `teensy:avr:teensy41`, core `teensy:avr`, index URL | PJRC `package_teensy_index.json` (platform architecture "avr", board "Teensy 4.1") |

## Notes

- No pin has the `uart0` flag: Teensy's `Serial` is native USB, so no header pin is used for upload or the serial monitor.
- No strapping flags: PJRC documents no boot-sensitive header pins (the i.MX RT boot mode is handled by Teensy's bootloader chip).
- The toolchain values from the assignment were checked and are correct (fqbn, core, index URL).
- The USB host (5 pads) and Ethernet (6 pads) headers are not modelled as pins; they appear as components only. Their positions are **estimated** from the dimension drawing (USB host row 11.43 mm from pin 1 to its centre pin; Ethernet pads 2.0 mm pitch).
- The NXP ROM bootloader id (listed as `1fc9:013*` in `00-teensy.rules`) is not included, because the exact product id is not stated in PJRC's files.

## Estimated

- Component rectangles: i.MX RT1062 (10 × 10 mm BGA), 8 MB flash chip, program button and microSD socket positions are **estimated** from the product photo and the dimension drawing. The button centre follows the drawing (41.66 mm from pin 1); the microSD socket spans roughly x 49-61 mm.
- Header pin positions come directly from the dimension drawing and are not estimated.
