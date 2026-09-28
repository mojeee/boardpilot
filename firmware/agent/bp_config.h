// BoardPilot diagnostic agent: build-time settings.
#pragma once

#include "bp_board.h"

#ifndef AGENT_BAUD
#define AGENT_BAUD 115200
#endif

#define AGENT_NAME "bp-agent"
#define AGENT_VER "0.2"

// Buffer sizes (AGENT_LINE_MAX includes the terminating NUL; longer request
// lines are rejected with error "too_long"). The ATmega328P (Uno, Nano) has 2 KB of RAM in
// total (RAMEND 0x8FF), so that build uses smaller buffers. A request line with all the fields a
// command takes is under 130 characters, and a stream request with 20 pins is about 100.
#if defined(__AVR__)
#include <avr/io.h>
#endif
#if defined(__AVR__) && (RAMEND < 0x1000)
#define AGENT_SMALL_RAM 1
#define AGENT_LINE_MAX 192
#define AGENT_LINE_MAX_TEXT "191"
#define AGENT_PIN_LIST_MAX 20
#define AGENT_STREAM_MAX_PINS 20
#define AGENT_MSG_MAX 112
#define AGENT_JSON_MAX_FIELDS 12
#else
#define AGENT_LINE_MAX 512
#define AGENT_LINE_MAX_TEXT "511"
#define AGENT_PIN_LIST_MAX 25
#define AGENT_STREAM_MAX_PINS 25
#define AGENT_MSG_MAX 128
#define AGENT_JSON_MAX_FIELDS 16
#endif

// Serial buffers (ESP32 only: set before Serial.begin). A bigger TX buffer lets a
// full "pins" reply or a stream frame leave without blocking the loop.
#define AGENT_SERIAL_TX_BUF 1024
#define AGENT_SERIAL_RX_BUF 1024

#define AGENT_STREAM_MIN_HZ 1
#define AGENT_STREAM_MAX_HZ 50

#define AGENT_I2C_DEFAULT_HZ 100000UL
#define AGENT_I2C_MIN_HZ 1000UL
#define AGENT_I2C_MAX_HZ 1000000UL
#define AGENT_I2C_READ_MAX 32
#define AGENT_I2C_TIMEOUT_MS 50
// 7-bit address range probed by i2c_scan (0x00-0x07 and 0x78-0x7F are
// reserved by the I2C specification, NXP UM10204 section 3.1.12).
#define AGENT_I2C_FIRST_ADDR 0x08
#define AGENT_I2C_LAST_ADDR 0x77

// PWM limits.
#define AGENT_PWM_MIN_HZ 1UL
#if defined(ARDUINO_ARCH_ESP32)
// The LEDC timer runs from the 80 MHz APB clock, so the highest frequency is
// 80 MHz / 2^resolution (ESP32 Technical Reference Manual, chapter "LED PWM
// Controller"): 10 bit -> 78.1 kHz, 8 bit -> 312.5 kHz.
#define AGENT_PWM_10BIT_MAX_HZ 78000UL
#define AGENT_PWM_MAX_HZ 312000UL
#else
#define AGENT_PWM_MAX_HZ 1000000UL
#endif
