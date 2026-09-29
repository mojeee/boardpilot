# Sources for rpi-pico.json

Raspberry Pi Pico (RP2040). 40 edge pins (through-hole + castellated) and the 3-pin SWD debug header.

| Fact | Source |
|---|---|
| Board 51 × 21 mm, 1 mm thick PCB; 40 pins on a 2.54 mm grid; rows 17.78 mm apart; first to last pin 48.26 mm | Raspberry Pi Pico datasheet, 2. Mechanical specification, Figure 3 |
| Pin numbering (pin 1 GP0 next to the USB end, 1-20 down one edge, 21-40 back up the other) and pin names | Pico datasheet, Figure 2 (pinout) and Figure 4 (pin numbering); official Pico-R3-A4-Pinout.pdf |
| VBUS (USB 5 V), VSYS (1.8-5.5 V input, = VBUS minus Schottky drop when on USB), 3V3_EN (100 kΩ pull-up to VSYS, low = 3.3 V off), 3V3 (keep load < 300 mA), ADC_VREF (filtered 3.3 V), AGND (analog ground for GPIO26-29), RUN (on-chip ~50 kΩ pull-up, low = reset) | Pico datasheet, 2.1 Raspberry Pi Pico pinout; 4.4 Powerchain |
| GPIO23 (SMPS PS), GPIO24 (VBUS sense), GPIO25 (LED), GPIO29 (ADC3 = VSYS/3) are internal and not on the header, so they are not pins in this file | Pico datasheet, 2.1 |
| GPIO26-28 are ADC0-2; ADC pins have a diode to IOVDD, so never above 3.3 V (+~300 mV) | Pico datasheet, 4.3 Using the ADC |
| UART / SPI / I2C / PWM function of each GPIO | RP2040 datasheet, 2.19.2 Function Select; matches Pico datasheet Figure 2 |
| SWD header order SWCLK, GND, SWDIO (left to right, USB at the top) on the far short edge; internal ~60 kΩ pull-ups | Pico datasheet, Figure 2 and 4.8 Debugging |
| Default pins in the Arduino core: Wire SDA GP4 / SCL GP5, Wire1 GP26/GP27, SPI MISO GP16 / CS GP17 / SCK GP18 / MOSI GP19, Serial1 GP0/GP1, Serial2 GP8/GP9, LED GP25 | earlephilhower/arduino-pico `variants/rpipico/pins_arduino.h` |
| Wire.setSDA()/setSCL() can move I2C to another valid pin pair | arduino-pico documentation, "Wire (I2C Master and Slave)" |
| FQBN `rp2040:rp2040:rpipico`, core `rp2040:rp2040`, board manager URL | arduino-pico `boards.txt` and README (installation) |
| USB ids: 2e8a:0003 RP2040 boot (BOOTSEL), 2e8a:000a Pico SDK CDC (RP2040) and Arduino-Pico `rpipico.pid.0`, 2e8a:0005 MicroPython | raspberrypi/usb-pid Readme; picotool `udev/60-picotool.rules`; arduino-pico `boards.txt`; micropython `ports/rp2/mpconfigport.h` |

Notes on the layout:

- Frame: component side up, USB on the left. Rotating the datasheet top view (USB at the top) 90° counter-clockwise puts pins 1-20 (GP0 … GP15) along the **bottom** edge, left to right, and pins 21-40 along the **top** edge, right to left (VBUS top-left). So GP0 is bottom-left, not top-left.
- Pin centres: 1.37 mm from each short edge ((51 − 48.26) / 2) and 1.61 mm from each long edge ((21 − 17.78) / 2), from Figure 3.
- SWD pads: **estimated** 1.6 mm from the far short edge (Figure 3 shows a 1.6 dimension there) and centred across the width at 2.54 mm pitch.
- Micro-USB overhang 1.3 mm (Figure 3 "1.3 (typ)"), USB width 8 mm (Figure 3). Positions of BOOTSEL, LED, RP2040, flash, SMPS and crystal are **estimated** (±1 mm) from the Figure 3 drawing and are only for the 3D view.
- VSYS `supplies: 4.7` is an **approximation** (datasheet: VBUS minus the Schottky diode drop; exact drop depends on current).
- Arduino-Pico can also report 2e8a:010a/400a/410a/800a/810a/c00a/c10a for other USB stack settings (boards.txt); only the default id is listed.

Mounting holes (`holesMm`): four Ø 2.1 mm holes, 47.0 mm apart along the board and 11.4 mm apart across it, centred, so 2.0 mm from each short edge and 4.8 mm from each long edge (mechanical drawing in the board's datasheet, "Mechanical specification").
