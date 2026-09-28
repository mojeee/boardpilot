# Sources for esp32-devkitc-30.json

Pin order and labels follow the common 30-pin "ESP32 DEVKIT V1" layout (USB at one end, antenna at the other).

| Fact | Source |
|---|---|
| Pin functions per GPIO (ADC channels, touch, SPI, UART) | Espressif, *ESP32 Series Datasheet*, "Pin Description" / IO_MUX table |
| GPIO 6 to 11 connect to the SPI flash inside the WROOM-32 module; never use them. Not broken out on this board. | *ESP32 Series Datasheet*, "Pin Description" note on SPI flash; *ESP32-WROOM-32 Datasheet*, "Pin Definitions" |
| GPIO 34 to 39 are input only and have no internal pull-up or pull-down | *ESP32 Technical Reference Manual*, "IO_MUX and GPIO Matrix", GPIO 34-39 |
| Strapping pins GPIO 0, 2, 5, 12, 15 and what their level at reset selects. GPIO 12 (MTDI) HIGH selects 1.8 V flash voltage. | *ESP32 Series Datasheet*, "Strapping Pins" |
| ADC2 is unavailable while Wi-Fi is running; prefer ADC1 (GPIO 32 to 39) | *ESP-IDF Programming Guide*, "Analog to Digital Converter (ADC)" limitations |
| GPIO 1 / 3 carry UART0 (USB serial) | *ESP32 Series Datasheet*, IO_MUX table (U0TXD / U0RXD) |
| Default Arduino I2C pins SDA = 21, SCL = 22 | arduino-esp32 core, `pins_arduino.h` for the `esp32` variant |

Mechanical dimensions (51.5 × 28.5 mm, 2.54 mm pitch, rows 25.4 mm apart) are approximate; vendors differ slightly. The 3D view is generated from these numbers.
