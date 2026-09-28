# Sources for blackpill-f411ce.json

Board: WeAct Studio "Black Pill" MiniF4x1Cx V3.1 with STM32F411CEU6 (UFQFPN48).
Repository: https://github.com/WeActStudio/WeActStudio.MiniSTM32F4x1

| Fact | Source |
|---|---|
| Board size 52.81 x 20.78 mm, rows 15.22 mm apart, USB-C at one end, SWD header at the other; pin order of both rows | `Hardware/MiniF4x1Cx_V31 Board Shape 外形.pdf` (top view, page 1; rendered top view page 2) |
| Header P1: 5V, GND, 3V3, PB10, PB2, PB1, PB0, PA7 ... PA0, NRST, PC15, PC14, PC13, VB. Header P2: PB12 ... PA15, PB3 ... PB9, 5V, GND, 3V3. SWD header P3: 3V3 (pin 1), SWDIO, SWCLK, GND | `Hardware/MiniF4x1Cx_V31 SchDoc.pdf` (P1, P2, P3) |
| KEY button: PA0 through 330 ohm to GND (active low). BOOT0: 10 kohm to GND, button to 3.3 V. PB2 (BOOT1): 10 kohm to GND. NRST button to GND | Schematic, "User KEY", "BOOT Settings", "Reset circuit" |
| Blue LED: 3.3 V, 1.5 kohm, LED, PC13 (active low). Red PWR LED | Schematic, "Indicator light" |
| Y1 32.768 kHz on PC14/PC15; Y2 25 MHz on PH0/PH1 (not on the headers) | Schematic, U1A |
| USB-C: PA12 = D+, PA11 = D-; 5V pin fed from VBUS through diode D4 | Schematic, "Type-C interface" |
| VB feeds VBAT through BAT54C together with 3.3 V (battery input) | Schematic, "RTC circuit" |
| U3 SPI flash footprint on PA4 (CS), PA5 (SCK), PA6 (MISO), PA7 (MOSI), not fitted by default ("buy and solder yourself") | Schematic, "FLASH" block; `Hardware/README.md` V2.1 note |
| Board thickness 1.6 mm, V3.1 same size and pinout as V3.0 | `Hardware/README.md` (V2.0, V3.1) |
| FT on all pins except PA0 and PB5 (TC) on the F411 | STM32F411xC/xE datasheet DS10314 (DocID026289 Rev 7), Table 8 "pin definitions", I/O structure column; also the WeAct pinout note "Pins 10 and 41 on F411 are 3.3V only" (`General document/STM32F4x1 v2.0+ Pin Layout.pdf`) |
| ADC1 channels and alternate functions | DS10314 Table 8 and Table 9 "Alternate function mapping" |
| Default Wire SDA = PB7, SCL = PB6; SPI MOSI/MISO/SCK/SS = PA7/PA6/PA5/PA4; LED_BUILTIN PC13; USER_BTN PA0 | stm32duino Arduino_Core_STM32 `variants/STM32F4xx/F411C(C-E)(U-Y)/variant_BLACKPILL_F411CE.h` |
| FQBN board `GenF4`, `pnum=BLACKPILL_F411CE`, menus `usb=CDCgen`, `upload_method=dfuMethod` | stm32duino `boards.txt` (`GenF4.menu.pnum.BLACKPILL_F411CE`, `GenF4.menu.usb.CDCgen`, `GenF4.menu.upload_method.dfuMethod`) |
| USB ids 0483:5740 (STM32duino USB CDC) and 0483:df11 (DFU upload target) | stm32duino `platform.txt` (`pid.0=0x5740`, `upload.pid.0=0xdf11`) and `boards.txt` (`GenF4.pid.0=0x5740`) |
| DFU entry: hold BOOT0, press NRST, release BOOT0 | `Hardware/README.md` (V1.2 note), AN2606 in the repo `General document/` |

## Layout (posMm)

USB-C on the left, component side up. Measured on the vector Board Shape drawing (scale taken from its
52.81 mm dimension):
- Top row (5V ... VB) at z = 2.78 mm, bottom row (B12 ... 3V3) at z = 18.00 mm (15.22 mm apart, centred).
- First column at x = 1.40 mm, 2.54 mm pitch, last column at x = 49.66 mm (measured, estimated to about 0.1 mm).
- SWD header column at x = 45.88 mm, pins at z = 6.58 / 9.12 / 11.66 / 14.20 mm (GND, SWCLK, SWDIO, 3V3), centred on the board (measured, estimated).
- Component rectangles (USB-C, LDO, buttons, MCU, crystals, LEDs, SWD connector body) are estimated from the rendered top view.
  The MCU is drawn axis-aligned although it is rotated 45 degrees on the real board.

## Choices

- `gpio` = port x 16 + pin (STM32duino PinName). STM32duino `digitalRead(n)` uses Arduino pin numbers,
  so generated code should use the `PA5`-style names.
- `maxVolt` is 5 for FT pins, 3.3 for PA0 and PB5 (TC), for ADC-capable pins (FT does not apply in analog
  mode) and for the crystal pins PC14/PC15.
- SWD pins PA13/PA14 are gpio pins with the `swd` flag, mount `male-up` (the SWD header is a right-angle
  header on top of the board).
- VB has `supplies: 0` (it is a battery input).
- The FQBN adds `usb=CDCgen` so `Serial` goes over USB-C (otherwise the board has no USB serial port)
  and `upload_method=dfuMethod` to match the USB bootloader link.
