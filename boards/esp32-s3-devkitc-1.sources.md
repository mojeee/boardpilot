# Sources for esp32-s3-devkitc-1.json

Board: Espressif ESP32-S3-DevKitC-1 **v1.1**, reference variant ESP32-S3-DevKitC-1-N8R8 (ESP32-S3-WROOM-1-N8R8: 8 MB quad flash, 8 MB octal PSRAM, 3.3 V SPI).

| Fact | Source |
|---|---|
| All 44 header pins, order, names and functions (J1 1-22, J3 1-22) | *ESP32-S3-DevKitC-1 v1.1 user guide*, "Header Block" tables J1 and J3 |
| GPIO 35, 36, 37 are used for octal flash/PSRAM on N8R8 / R16V boards and are not available (flag `flash`) | User guide v1.1, note under "Description of Components"; *ESP32-S3-WROOM-1/1U Datasheet* v1.8, Pin Definitions note b |
| RGB LED on GPIO38 (v1.1), GPIO48 on v1.0 | User guide v1.1 "Description of Components" and "Hardware Revision Details"; schematic V1.1 sheet 2 (SK68XXMINI-HS on GPIO38); user guide v1.0 |
| USB-to-UART bridge is a CP2102N (CP2102N-A02-GQFN28); both USB connectors are **micro-USB** | Schematic `SCH_ESP32-S3-DevKitC-1_V1.1_20221130.pdf`, sheet 2; user guide v1.1 ("A Micro-USB port", "USB 2.0 cable (Standard-A to Micro-B)") |
| Native USB on GPIO19 (D-) / GPIO20 (D+) goes to the port labelled USB | User guide J3 pins 19-20; schematic sheet 2 (J4 "ESP USB") |
| BOOT button on GPIO0, auto-program circuit (DTR/RTS to EN/IO0) | Schematic sheet 2 |
| Strapping pins GPIO0, 3, 45, 46; defaults (GPIO0 pull-up, GPIO3 floating, GPIO45/46 pull-down); boot mode GPIO0/GPIO46; GPIO45 = 1 selects 1.8 V VDD_SPI; GPIO3 only matters with JTAG eFuses | *ESP32-S3 Series Datasheet* v2.2, Section 3 "Boot Configurations", Tables 3-1, 3-3, 3-4, 3-5 |
| WROOM-1-N8R8 flash runs at 3.3 V (only N16R16VA uses 1.8 V), so GPIO45 HIGH at reset breaks booting (flag `strapping_critical`) | *ESP32-S3-WROOM-1/1U Datasheet* v1.8, Table 1-1 note 7 and Section 4.2 |
| ADC1 = GPIO1-10, ADC2 = GPIO11-20; ADC2 is shared with Wi-Fi | User guide pin functions; *ESP-IDF Programming Guide* (ESP32-S3), ADC Oneshot "Hardware Limitations" |
| Default Arduino pins: SDA 8, SCL 9, SS 10, MOSI 11, MISO 13, SCK 12, TX 43, RX 44; RGB_BUILTIN = 48 (v1.0 pin) | arduino-esp32 `variants/esp32s3/pins_arduino.h` (master) |
| fqbn `esp32:esp32:esp32s3` ("ESP32S3 Dev Module"), variant `esp32s3` | arduino-esp32 `boards.txt` |
| USB ids: CP2102N `10c4:ea60`; ESP32-S3 USB Serial/JTAG `303a:1001` | CP2102N is the Silicon Labs default id; `303a:1001` from arduino-esp32 `pins_arduino.h` (USB_VID/USB_PID) |
| CH343 `1a86:55d3` (third-party copies of this board, usually with USB-C and N16R8 modules) | Not an Espressif source: WCH CH343 driver listings (hardware id `USB\VID_1A86&PID_55D3`). Espressif's own v1.1 board uses the CP2102N. |

## Mechanical

From the official dimension file `DXF_ESP32-S3-DevKitC-1_V1.1_20220429.dxf` (board drawn with the USB end at the bottom):

- Board outline 25.40 × 62.87 mm (chamfered corners). The drawing's dimension label reads 62.74 mm; the outline geometry is 62.87 mm, which is what is used here so pins and parts line up.
- Header pads at 2.54 mm pitch, rows 1.27 mm in from each long edge (22.86 mm apart). Pin 1 of J1 and J3 is at 61.30 mm from the USB edge, pin 22 at 7.96 mm.
- Module (ESP32-S3-WROOM-1, 18 × 25.5 mm) sits at the far end; its antenna overhangs the PCB edge by about 6.3 mm.
- USB connectors, buttons, CP2102N, LDO, RGB LED and power LED rectangles come from the placement outlines in the same file (rounded; the LDO and RGB LED boxes are simplified from their footprints, **estimated**).
- PCB thickness 1.6 mm is **estimated** (not stated in the drawing). PCB colour taken from product photos.

## Differences from the assignment

- The official v1.1 board has two **micro-USB** ports, not USB-C (USB-C boards are third-party copies).
- N16R8 is not an official DevKitC-1 v1.1 ordering code (official: N8R8, N32R16V, 1U-N8R8). The file describes N8R8 (8 MB flash). GPIO 35-37 are unavailable on all of them.
