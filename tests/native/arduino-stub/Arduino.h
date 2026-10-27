// Minimal Arduino API for building Adafruit GFX and Display Studio sketches on the computer
// (tests/display.test.ts, native pixel test). Only what the drawing code needs.
#pragma once
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>
#include <algorithm>
#include "Print.h"
#define PROGMEM
#define pgm_read_byte(addr) (*(const uint8_t *)(addr))
#define pgm_read_word(addr) (*(const uint16_t *)(addr))
#define pgm_read_dword(addr) (*(const uint32_t *)(addr))
#define pgm_read_pointer(addr) ((void *)*(addr))
#ifndef PI
#define PI 3.1415926535897932384626433832795
#endif
typedef bool boolean;
typedef uint8_t byte;
using std::min;
using std::max;
template <class T, class L, class H> T constrain(T v, L lo, H hi) { return v < lo ? lo : (v > hi ? hi : v); }
inline char *dtostrf(double val, signed char width, unsigned char prec, char *s) {
  sprintf(s, "%*.*f", width, prec, val);
  return s;
}
inline unsigned long millis() { return 0; }
inline void delay(unsigned long) {}
#define radians(deg) ((deg) * PI / 180.0)
#define degrees(rad) ((rad) * 180.0 / PI)
