# Sources for rpi-pico-2.json

Raspberry Pi Pico 2 (RP2350A). Same header, pin numbering and outline as the Pico.

| Fact | Source |
|---|---|
| Board 51 × 21 × 1 mm; 2.54 mm grid; rows 17.78 mm apart; 48.26 mm pin span; SWD pads on the far short edge | Raspberry Pi Pico 2 datasheet, 3. Mechanical specification, Figure 3 |
| Pinout identical to Pico (GP0-GP22, GP26-28, 8 GND, AGND, RUN, 3V3_EN, 3V3(OUT), ADC_VREF, VSYS, VBUS; SWCLK/GND/SWDIO) | Pico 2 datasheet, Figure 2 (pinout) and 3.1 pinout |
| GPIO23 SMPS PS, GPIO24 VBUS sense, GPIO25 LED, GPIO29 ADC3 (VSYS/3): internal | Pico 2 datasheet, 3.1 |
| RP2350A, dual Cortex-M33 or Hazard3 at 150 MHz, 520 kB SRAM, 4 MB flash (W25Q32RV) | Pico 2 datasheet, 1. About and 2. Differences from Raspberry Pi Pico |
| GPIO0-25 are "Digital IO (FT)": tolerate up to 5.5 V while IOVDD is powered at 3.3 V; GPIO26-29 (ADC) are not, and must stay ≤ IOVDD + ~300 mV | RP2350 datasheet, 14.8.2 Pin definitions, Table 1426/1427; Pico 2 datasheet, 5.2 |
| Erratum RP2350-E9 (A2 stepping): an input pin between VIL and VIH can leak ~120 µA and sit near 2.2 V, so the internal pull-down cannot pull it low; use an external pull-down ≤ 8.2 kΩ. Fixed in stepping A3/A4. | RP2350 datasheet, Errata RP2350-E9 and the stepping A3 change list |
| Per-GPIO UART/SPI/I2C/PWM functions (same as RP2040 for GPIO0-29) | RP2350 datasheet, 9.4 Function select |
| Arduino defaults: Wire GP4/GP5, Wire1 GP26/GP27, SPI GP16-19, Serial1 GP0/1, Serial2 GP8/9, LED GP25 | earlephilhower/arduino-pico `variants/rpipico2/pins_arduino.h` |
| FQBN `rp2040:rp2040:rpipico2` | arduino-pico `boards.txt` |
| USB ids: 2e8a:000f RP2350 boot (also `rpipico2.pid.0` for Arduino-Pico sketches), 2e8a:0009 Pico SDK CDC on RP2350 (`USBD_PID` in pico-sdk stdio_usb_descriptors.c), 2e8a:0005 MicroPython | raspberrypi/usb-pid; picotool `udev/60-picotool.rules`; arduino-pico `boards.txt`; pico-sdk; micropython rp2 port |

Notes on the layout:

- Same frame and positions as rpi-pico.json (USB left, GP0 bottom-left, VBUS top-left; SWD pads **estimated** 1.6 mm from the far edge, centred, 2.54 mm pitch).
- GP0-GP22 carry `five_volt_tolerant` with `maxVolt: 5` per the RP2350 FT pin type; the notes say this holds only while the board is powered.
- Component positions (BOOTSEL, LED, RP2350A, flash, RT6150 SMPS, crystal) are **estimated** (±1 mm) from Figure 3; the flash position is the least certain.
- VSYS `supplies: 4.7` is an **approximation** (VBUS minus the Schottky drop).
