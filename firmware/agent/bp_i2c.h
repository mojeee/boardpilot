// I2C master used by i2c_scan and i2c_read.
//
// ESP32: the core's Wire driver, which can be routed to any pair of GPIOs.
// Other boards: a bit-banged open-drain master (bp_i2c.cpp), so the SDA/SCL swap
// test works on any two pins. Hardware I2C on AVR, RP2040 and STM32 is tied to
// fixed pins. Define BP_I2C_BITBANG to use the bit-banged master on ESP32 too.
#pragma once

#include <Arduino.h>

#if !defined(ARDUINO_ARCH_ESP32) && !defined(BP_I2C_BITBANG)
#define BP_I2C_BITBANG 1
#endif

namespace bpi2c {

// Result codes, the same numbers Wire.endTransmission() uses.
enum : uint8_t { OK = 0, NACK_ADDR = 2, NACK_DATA = 3, BUS_ERROR = 4, TIMEOUT = 5 };

// Starts the bus on these pins. false if the driver refused (ESP32 only).
bool open(int sda, int scl, uint32_t hz);
void close();

// START, address + W, STOP. Returns OK, NACK_ADDR, BUS_ERROR or TIMEOUT.
uint8_t probe(uint8_t addr);

// START, address + W, reg, repeated START, address + R, len bytes, STOP.
// Returns the number of bytes read (len on success, fewer on any failure).
size_t readReg(uint8_t addr, uint8_t reg, uint8_t* data, size_t len);

}  // namespace bpi2c
