# Sources for rpi-pico-w.json

Raspberry Pi Pico W (RP2040 + Infineon CYW43439). Same 40-pin header as the Pico; 3-pin SWD header moved towards the middle.

| Fact | Source |
|---|---|
| Board 51 × 21 × 1 mm; 2.54 mm grid; rows 17.78 mm apart; 48.26 mm pin span | Raspberry Pi Pico W datasheet, 2. Mechanical specification, Figure 3 |
| Debug header 19.8 mm from the antenna (far) edge; centre pad 7.3759 mm from the pin 21-40 edge | Pico W datasheet, Figure 3 |
| Antenna keep-out cutout 14 × 9 mm at the far edge | Pico W datasheet, 2.2.1 Keep-out area |
| Pin names/numbering, SWD order SWCLK, GND, SWDIO; LED on WL_GPIO0 | Pico W datasheet, Figure 2 (pinout) and Figure 4 |
| GPIO23 (wireless power on), GPIO24 (wireless SPI data/IRQ), GPIO25 (wireless SPI CS), GPIO29 (wireless SPI CLK / ADC3 VSYS/3) used internally, not on the header; WL_GPIO1 SMPS PS, WL_GPIO2 VBUS sense | Pico W datasheet, 2.1 Pico W pinout |
| VBUS, VSYS, 3V3_EN, 3V3(OUT), ADC_VREF, AGND, RUN descriptions | Pico W datasheet, 2.1 and 3.4 Powerchain |
| GPIO26-28 = ADC0-2, max IOVDD + ~300 mV | Pico W datasheet, 3.3 Using the ADC |
| Wi-Fi 802.11n and Bluetooth 5.2 | Pico W datasheet, 1. About; 3.8 Wireless interface |
| Per-GPIO UART/SPI/I2C/PWM functions | RP2040 datasheet, 2.19.2 Function Select |
| Arduino defaults (same as Pico): Wire GP4/GP5, SPI GP16-19, Serial1 GP0/1, Serial2 GP8/9; LED_BUILTIN = pin 64 (CYW43 GPIO) | earlephilhower/arduino-pico `variants/rpipicow/pins_arduino.h` |
| FQBN `rp2040:rp2040:rpipicow` | arduino-pico `boards.txt` |
| USB ids: 2e8a:f00a Arduino-Pico Pico W (`rpipicow.pid.0`), 2e8a:000a Pico SDK CDC, 2e8a:0003 RP2040 BOOTSEL, 2e8a:0005 MicroPython | arduino-pico `boards.txt`; raspberrypi/usb-pid; picotool udev rules; micropython rp2 port |

Notes on the layout:

- Same frame and edge pin positions as rpi-pico.json (USB left, GP0 bottom-left, VBUS top-left).
- SWD pads: x = 51 − 19.8 = 31.2 mm, GND pad 7.38 mm from the top edge, SWCLK/SWDIO ±2.54 mm (pad pitch **estimated** as 2.54 mm; the drawing shows the pads but no pitch dimension).
- The WL_GPIO0 LED is not a header pin, so it is only a component. Positions of the LED, BOOTSEL, RP2040, flash, RT6154 SMPS and the CYW43439 shield are **estimated** (±1 mm) from Figures 2 and 3.
- VSYS `supplies: 4.7` is an **approximation** (VBUS minus the Schottky drop).
