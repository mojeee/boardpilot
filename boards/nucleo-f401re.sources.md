# Sources for nucleo-f401re.json

Board: ST NUCLEO-F401RE (Nucleo-64, MB1136), MCU STM32F401RET6 (LQFP64).

| Fact | Source |
|---|---|
| Arduino connectors CN5, CN6, CN8, CN9: pin order, MCU pins (D0 PA3 ... D15 PB8, A0 PA0 ... A5 PC0), CN5 pin 8 = AREF/AVDD | ST UM1724 Rev 13, Table 16 "Arduino connectors on NUCLEO-F401RE and NUCLEO-F411RE", Figure 18 |
| ST morpho CN7/CN10 pin by pin, NC pins (CN7 9, 10, 11, 26; CN10 10, 18, 36, 38), U5V, E5V, BOOT0, AGND | UM1724 Table 29 "ST morpho connector on NUCLEO-F401RE, NUCLEO-F411RE, NUCLEO-F446RE" and its notes 1-4 |
| CN10 pin 1 is the inner column, CN7 pin 1 the outer column (square pads) | UM1724 Figure 5 and Figure 18 |
| PA2/PA3 = USART2 to the ST-LINK virtual COM port; D0/D1 are disconnected from the headers by default (SB13/SB14 ON, SB62/SB63 OFF) | UM1724 section 6.8 "USART communication", Table 10 "Solder bridges" |
| A4/A5 are PC1/PC0 by default; SB46/SB52 can route PB9/PB8 there instead | UM1724 Table 10 (SB56/SB51, SB46/SB52), Table 16 note 1 |
| LD2 green user LED on D13/PA5, HIGH = on (SB21) | UM1724 section 6.4 "LEDs", Table 10 |
| B1 USER on PC13 (SB17), B2 RESET on NRST | UM1724 section 6.5 "Push-buttons", Table 10 |
| PC14/PC15 used by the 32 kHz crystal X2 and disconnected from CN7 on MB1136 C-02 and later | UM1724 section 6.7.2, Table 10 (SB48/SB49) |
| PH0/PH1: 8 MHz MCO from the ST-LINK on MB1136 C-02 and later | UM1724 section 6.7.1 |
| PA13/PA14 carry SWD to the ST-LINK; do not use as I/O while the ST-LINK is attached | UM1724 Table 29 note 3 |
| VIN 7 to 12 V input, E5V 4.75 to 5.25 V input, U5V = ST-LINK USB 5 V, VBAT tied to VDD (SB45), VDDA tied to VDD (SB57) | UM1724 Table 7, Table 10, Table 29 note 2 |
| Every STM32F401 GPIO is FT (5 V tolerant), except in analog mode, and PC14/PC15/PH0/PH1 in oscillator mode. PC13-PC15 have limited drive (note 2). | STM32F401xD/xE datasheet DS10086 (DocID025644 Rev 3), Table 8 "pin definitions", I/O structure column and notes 2-4 |
| ADC1 channels (PA0-PA7 = IN0-7, PB0/PB1 = IN8/9, PC0-PC5 = IN10-15) and alternate functions | DS10086 Table 8 and Table 9 "Alternate function mapping" |
| Default Wire pins SDA = D14 (PB9), SCL = D15 (PB8); SPI SS/MOSI/MISO/SCK = D10/D11/D12/D13 | stm32duino Arduino_Core_STM32 `cores/arduino/pins_arduino.h` (PIN_WIRE_SDA 14, PIN_WIRE_SCL 15, PIN_SPI_* 10-13; the NUCLEO_F401RE variant does not override them) and `variants/STM32F4xx/F401R(B-C-D-E)T/variant_NUCLEO_F401RE.cpp` (D14 = PB_9, D15 = PB_8) |
| FQBN `STMicroelectronics:stm32:Nucleo_64:pnum=NUCLEO_F401RE` | stm32duino `boards.txt` (`Nucleo_64.menu.pnum.NUCLEO_F401RE`) |
| USB ids 0483:374b (ST-LINK/V2-1) and 0483:3752 (ST-LINK/V2-1 without mass storage) | OpenOCD `contrib/60-openocd.rules` ("ST-LINK/V2.1"), stlink-org `49-stlinkv2-1.rules`, stm32duino `boards.txt` Nucleo_64 vid/pid list |

## Layout (posMm)

The board is drawn with the ST-LINK end (mini-USB CN1) on the left: x runs from the ST-LINK edge
(the vertical axis of UM1724 Figure 5), z = 70 mm minus the distance from the CN7 edge, so CN10 is at
the top of the view and CN7 at the bottom.

From UM1724 Figure 5 "STM32 Nucleo board mechanical dimensions" (documented numbers):
- Board 70.00 x 82.50 mm.
- Morpho outer columns 63.50 mm apart (placed symmetrically, 3.25 mm from each long edge).
- CN6/CN8 column 10.87 mm from the CN7 edge; Arduino rows 48.26 mm apart (CN5/CN9 at 59.13 mm).
- Arduino power header to analog header gap 5.08 mm; D7 to D8 gap 4.06 mm (0.16 in).
- Morpho last row (pins 37/38), A5 and D0 on the same line, 5.08 mm from the bottom-most edge; CN6 pin 1 on the same line as morpho row 5 (pins 9/10); D15 1.02 mm past morpho row 1 (pins 1/2).

Estimated: the last-row-to-edge distance (5.08 mm) was read from the drawing's scale and checked
against the 57.54 / 71.12 / 3.56 / 13.97 mm dimensions; the 0.15 mm left/right asymmetry of the morpho
columns in the drawing was ignored. PCB thickness 1.6 mm is assumed (not stated in UM1724).
Component rectangles (ST-LINK MCU, target MCU, buttons, LEDs, regulator, crystal X2, CN2, CN4) are
estimated from Figure 5 and are only approximate. The board outline is modelled as a plain rectangle
(the real PCB has a slot between the ST-LINK part and the target part and a tab on the bottom edge).

## Choices

- `gpio` = port x 16 + pin (STM32duino PinName, PH0 = 112). Note: `digitalRead(13)` in STM32duino uses the
  Arduino pin number (D13 = PA5), not this value; generated code should use the `PA5` / `D13` names.
- `maxVolt` is 5 for FT pins, but 3.3 on ADC-capable pins (FT does not apply in analog mode) and on the
  crystal pins.
- VIN and E5V have `supplies: 0` because they are inputs and carry nothing when the board runs from USB.
- BOOT0 (CN7 pin 7) is modelled as kind `enable` with the `strapping` flag (it is not a GPIO).
