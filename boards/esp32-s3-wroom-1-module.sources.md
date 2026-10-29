# Sources for esp32-s3-wroom-1-module.json

A **bare** Espressif ESP32-S3-WROOM-1 module (castellated pads, no USB connector, no regulator), for custom boards built around it. The file lists pins in the datasheet's pin order.

> **Needs review.** The pin order was written from the datasheet's pin table by hand and has not been checked against the current PDF revision by a second person. Pad positions are estimated (see Mechanical).

| Fact | Source |
|---|---|
| 40 signal and power pads (the exposed ground pad 41 is not drawn): left side 1 to 14, bottom 15 to 26, right side 27 to 40 | Espressif, *ESP32-S3-WROOM-1 / 1U Datasheet*, "Pin Definitions" and the pin layout figure |
| Module size 18.0 × 25.5 mm, 3.1 mm high; pad pitch 1.27 mm | *ESP32-S3-WROOM-1 / 1U Datasheet*, "Dimensions and PCB Land Pattern" |
| GPIO 35, 36, 37 are used inside the module for octal PSRAM on R8 / R16V variants and are marked `flash` (conservative: a quad-PSRAM variant would have them free) | *ESP32-S3-WROOM-1 / 1U Datasheet*, Pin Definitions note b |
| Strapping pins GPIO 0, 3, 45, 46; GPIO 45 HIGH at reset selects 1.8 V flash voltage (critical on 3.3 V flash variants) | *ESP32-S3 Series Datasheet*, "Boot Configurations"; *ESP32-S3-WROOM-1 / 1U Datasheet*, Table 1-1 note and Section 4.2 |
| ADC1 = GPIO 1 to 10, ADC2 = GPIO 11 to 20; ADC2 is shared with Wi-Fi | *ESP32-S3 Series Datasheet*, pin functions; *ESP-IDF Programming Guide* (ESP32-S3), ADC Oneshot "Hardware Limitations" |
| Native USB: GPIO 19 (D-), GPIO 20 (D+) | *ESP32-S3 Series Datasheet*, IO MUX table |
| Supply 3.0 to 3.6 V and at least 500 mA from the external supply; EN needs a pull-up | *ESP32-S3-WROOM-1 / 1U Datasheet*, "Recommended Operating Conditions". **Value from memory of the datasheet, check the revision you use.** |
| Default Arduino pins: SDA 8, SCL 9, SS 10, MOSI 11, MISO 13, SCK 12, TX 43, RX 44 | arduino-esp32 `variants/esp32s3/pins_arduino.h` |
| 8 MB flash, 512 KB SRAM | **Assumption** (N8 variants). Flash and PSRAM differ by variant; BoardPilot reads the real size from the chip when it can. |
| No USB ids | A bare module has no USB chip on it; the native USB port id `303a:1001` belongs to the chip and is also used by the DevKit, so it is not used to pick this board. |

## Mechanical

Same as the ESP32-WROOM-32 module: 25.5 × 18.0 × 3.1 mm outline, pad pitch 1.27 mm from the datasheet. **Estimated:** pad inset (0.6 mm) and row start positions; take exact coordinates from the datasheet's land pattern before using this for a PCB.
