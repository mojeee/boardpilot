# Sources for esp32-c3-devkitm-1.json

Board: Espressif ESP32-C3-DevKitM-1 (V1, the only revision), with ESP32-C3-MINI-1 (ESP32-C3FN4: 4 MB flash inside the chip package).

| Fact | Source |
|---|---|
| All 30 header pins, order, names and functions (J1 1-15, J3 1-15) | *ESP32-C3-DevKitM-1 user guide*, "Header Block" tables J1 and J3 |
| Strapping pins GPIO2, GPIO8, GPIO9 | User guide, Header Block footnote 2; *ESP32-C3 Series Datasheet* v2.4, Section 3 "Boot Configurations" |
| Defaults: GPIO9 weak pull-up, GPIO2/GPIO8 floating; download mode needs GPIO9 = 0 and GPIO8 = 1; GPIO2 recommended HIGH | *ESP32-C3 Series Datasheet* v2.4, Tables 3-1 and 3-3 |
| No flash pins on the header: flash is inside the chip package, GPIO 11-17 are not broken out | User guide ("All available GPIO pins (except for the SPI bus for flash)"), MINI-1 module in-package flash |
| RGB LED on GPIO8; BOOT button on GPIO9 | User guide "Description of Components"; schematic sheet 2 (SK68XXMINI-HS, SW1 to GPIO9) |
| USB-to-UART bridge is a CP2102N (CP2102N-A02-GQFN28) on a single micro-USB port | Schematic `SCH_ESP32-C3-DEVKITM-1_V1_20200915A.pdf`, sheet 2; user guide |
| GPIO18/19 are the chip's native USB D-/D+. On this board they only go to the header (the micro-USB port uses the CP2102N). At start-up they are in USB mode with the USB pull-up | User guide J3 pins 13-14; schematic sheet 2 (the 0 Ω links between the micro-USB data lines and GPIO18/19 are marked NC, not fitted); *ESP32-C3 Series Datasheet* v2.4, IO pin notes ("USB_PU", "By default, the USB function is enabled for USB pins") |
| ADC1 = GPIO0-4, ADC2 = GPIO5 only; ADC2 oneshot is not supported on ESP32-C3 because results are not stable | User guide pin functions; *ESP-IDF Programming Guide* (ESP32-C3), ADC Oneshot "Hardware Limitations" (refers to the ESP32-C3 errata) |
| Default Arduino pins: SDA 8, SCL 9, SS 7, MOSI 6, MISO 5, SCK 4, TX 21, RX 20, RGB LED 8 | arduino-esp32 `variants/esp32c3/pins_arduino.h` (master) |
| fqbn `esp32:esp32:esp32c3` ("ESP32C3 Dev Module") | arduino-esp32 `boards.txt` |
| USB ids: CP2102N `10c4:ea60`; ESP32-C3 USB Serial/JTAG `303a:1001` | Silicon Labs default id; Espressif USB Serial/JTAG id (same as ESP32-S3, arduino-esp32) |

## Mechanical

From the official dimension file `DIMENSION_ESP32-C3-DEVKITM-1_V1_20200915AA.dxf` (board drawn with the USB end at the bottom):

- Board outline 38.91 × 25.40 mm (the assignment's 45.5 mm guess was wrong; with the module's antenna overhang the total is about 44.3 mm).
- Header pads at 2.54 mm pitch, rows 1.27 mm in from each long edge (22.86 mm apart). Pin 1 of J1 and J3 is 36.85 mm from the USB edge, pin 15 at 1.29 mm.
- Module ESP32-C3-MINI-1 (13.2 × 16.6 mm) at the far end, overhanging the PCB by about 5.3 mm.
- USB connector, buttons, CP2102N, LDO, RGB LED and power LED rectangles come from the pad and placement outlines in the same file (rounded, **estimated** body sizes).
- PCB thickness 1.6 mm is **estimated** (not stated in the drawing). PCB colour taken from product photos.
