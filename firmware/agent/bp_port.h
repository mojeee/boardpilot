// Portability layer: flash strings, pin number mapping and small per-core helpers.
//
// Strings: the ATmega328P has only 2 KB of RAM, and avr-gcc copies every string literal into RAM
// unless it is marked PROGMEM. So every constant text the agent prints goes through BPS("..."),
// which is PSTR() on AVR and a plain literal elsewhere. Functions whose parameter name ends in P
// (or that are documented as taking a "flash string") expect such a pointer.
#pragma once

#include <Arduino.h>
#include <stdio.h>
#include <string.h>

#include "bp_board.h"

#if defined(__AVR__)
#include <avr/pgmspace.h>
#define BP_AVR 1
#define BPS(s) PSTR(s)
#define BP_PROGMEM PROGMEM
#define bp_rd8(p) pgm_read_byte(p)
#define bp_strcmpP(ram, flash) strcmp_P((ram), (flash))
#define bp_strlenP(flash) strlen_P(flash)
#define bp_memcmpP(ram, flash, n) memcmp_P((ram), (flash), (n))
// snprintf with a literal format kept in flash. "%S" prints a flash string on AVR.
#define bp_snprintf(buf, n, fmt, ...) snprintf_P((buf), (n), PSTR(fmt), ##__VA_ARGS__)
#define BP_FMT_P "%S"
#else
#define BPS(s) (s)
#define BP_PROGMEM
#define bp_rd8(p) (*(const uint8_t*)(p))
#define bp_strcmpP(ram, flash) strcmp((ram), (flash))
#define bp_strlenP(flash) strlen(flash)
#define bp_memcmpP(ram, flash, n) memcmp((ram), (flash), (n))
#define bp_snprintf(buf, n, fmt, ...) snprintf((buf), (n), fmt, ##__VA_ARGS__)
#define BP_FMT_P "%s"
#endif

#if defined(ARDUINO_ARCH_ESP32)
#define BP_ESP32 1
#elif defined(ARDUINO_ARCH_RP2040)
#define BP_RP2040 1
#elif defined(ARDUINO_ARCH_STM32)
#define BP_STM32 1
#elif defined(TEENSYDUINO)
#define BP_TEENSY 1
#elif defined(ARDUINO_ARCH_NRF52) || defined(NRF52_SERIES)
#define BP_NRF52 1
#endif

// The serial port the agent talks on. BP_SERIAL_DEBUG_VCP (set in bp_board.h) selects the UART
// that the board's debug probe exposes as a virtual COM port. nRF52840 DK: the J-Link VCP is wired
// to P0.08 (RXD) / P0.06 (TXD) (nRF52840 DK User Guide, "Virtual COM port"), which the Adafruit
// core's pca10056 variant names Serial2 (PIN_SERIAL2_RX = 8); Serial there is the nRF USB port.
#if defined(BP_SERIAL_DEBUG_VCP) && defined(PIN_SERIAL2_RX) && (PIN_SERIAL2_RX == 8)
#define BpSerial Serial2
#define BP_SERIAL_UART 1
#elif defined(BP_SERIAL_DEBUG_VCP) && defined(PIN_SERIAL1_RX) && (PIN_SERIAL1_RX == 8)
#define BpSerial Serial1
#define BP_SERIAL_UART 1
#else
#define BpSerial Serial
#endif

// Serial is a native USB CDC port (no UART bridge): the host may connect after boot, so the boot
// event is sent again whenever a host opens the port.
#if defined(BP_SERIAL_UART)
// A UART: always "connected".
#elif defined(BP_RP2040) || defined(BP_TEENSY) || (defined(BP_STM32) && defined(USBCON) && defined(USBD_USE_CDC)) || \
    (defined(BP_NRF52) && defined(USE_TINYUSB))
#define BP_SERIAL_USB 1
#endif

// Protocol pin numbers are PinDef.gpio. They are the Arduino pin numbers on every core except
// STM32duino, where the board files use the PinName value (port * 16 + pin: PA0 = 0, PB0 = 16,
// PC13 = 45) because Arduino pin numbers differ between STM32 variants.
#if defined(BP_STM32)
inline uint32_t bpNative(int g) { return pinNametoDigitalPin((PinName)g); }
#else
inline int bpNative(int g) { return g; }
#endif

// A macro, because the mode type differs between cores (uint8_t, PinMode enum, uint32_t).
#define bpPinMode(g, m) pinMode(bpNative(g), (m))
inline int bpRead(int g) { return digitalRead(bpNative(g)) == HIGH ? 1 : 0; }
inline void bpWrite(int g, uint8_t v) { digitalWrite(bpNative(g), v ? HIGH : LOW); }

namespace bpport {

// Free RAM in bytes, the best estimate the core offers (0 if unknown).
unsigned long heapFree();

}  // namespace bpport
