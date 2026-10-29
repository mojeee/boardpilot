# Sources for esp32-wroom-32-module.json

A **bare** Espressif ESP32-WROOM-32 module (castellated pads, no USB chip, no regulator), for custom boards built around it. Pin 1 is at the antenna end of the module's left side; the file lists pins in the datasheet's pin order.

> **Needs review.** The pin order and functions were written from the datasheet's pin table by hand and have not been checked against the current PDF revision by a second person. The pad positions are estimated (see Mechanical). Check both against the datasheet before relying on them for a PCB.

| Fact | Source |
|---|---|
| 37 signal and power pads (pin 32 is NC; the exposed ground pad 39 is not drawn), their order: left side 1 to 14, bottom 15 to 24, right side 25 to 38 | Espressif, *ESP32-WROOM-32 Datasheet*, "Pin Definitions" (Table 2) and the pin layout figure |
| Module size 18.0 × 25.5 mm, 3.1 mm high; pad pitch 1.27 mm | *ESP32-WROOM-32 Datasheet*, "Dimensions and PCB Land Pattern" |
| Pins 17 to 22 (SD2, SD3, CMD, CLK, SD0, SD1 = GPIO 9, 10, 11, 6, 7, 8) connect to the flash inside the module; never use them (flag `flash`) | *ESP32-WROOM-32 Datasheet*, "Pin Definitions" note on SPI flash; *ESP32 Series Datasheet*, "Pin Description" |
| GPIO 34, 35, 36 (SENSOR_VP) and 39 (SENSOR_VN) are input only, no internal pull-up or pull-down | *ESP32 Technical Reference Manual*, "IO_MUX and GPIO Matrix"; *ESP32 Series Datasheet*, "Pin Description" |
| Strapping pins GPIO 0, 2, 5, 12 (MTDI), 15 and what their level at reset selects; GPIO 12 HIGH selects 1.8 V flash voltage | *ESP32 Series Datasheet*, "Strapping Pins" |
| IO_MUX functions per GPIO (ADC channel, touch channel, DAC, SPI, UART) | *ESP32 Series Datasheet*, "Pin Description" / IO_MUX table (same entries as `esp32-devkitc-30.json`) |
| Supply 3.0 to 3.6 V and at least 500 mA from the external supply; EN needs a pull-up | *ESP32-WROOM-32 Datasheet*, "Recommended Operating Conditions" and "Peripheral Schematics". **Value from memory of the datasheet, check the revision you use.** |
| ADC2 is unavailable while Wi-Fi is running; prefer ADC1 | *ESP-IDF Programming Guide*, "Analog to Digital Converter (ADC)" limitations |
| Default Arduino pins: SDA 21, SCL 22, VSPI MOSI 23, MISO 19, SCK 18, SS 5 | arduino-esp32, `pins_arduino.h` for the `esp32` variant |
| fqbn `esp32:esp32:esp32` ("ESP32 Dev Module"), esptool chip `esp32` | arduino-esp32 `boards.txt` |
| 4 MB flash | **Assumption.** The module is sold with different flash sizes; BoardPilot reads the real size from the chip when it can. GPIO 16 and 17 are free on WROOM-32 but are used by PSRAM on WROVER modules. |
| No USB ids | A bare module has no USB chip. The ids of the USB-serial adapter you use would identify the adapter, not the board, so none are listed. |

## Mechanical

- Board outline = the module outline: 25.5 mm long (antenna at the left end) by 18.0 mm wide. Thickness 3.1 mm is the datasheet's module height.
- **Estimated:** the pad positions. Pitch 1.27 mm is from the datasheet; the pad inset from the edge (0.6 mm) and where each row starts along the edge are estimates, so the 3D view is right in pad order and spacing but not to the tenth of a millimetre. Take exact coordinates from the datasheet's land pattern before using this for a PCB.
