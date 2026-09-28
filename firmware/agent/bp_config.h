// BoardPilot diagnostic agent: build-time settings.
#pragma once

#ifndef AGENT_BAUD
#define AGENT_BAUD 115200
#endif

#define AGENT_NAME "bp-agent"
#define AGENT_VER "0.1"

// Longest request line we accept, including the terminating NUL.
// Longer lines are rejected with error "too_long".
#define AGENT_LINE_MAX 512

// Serial buffers (set before Serial.begin). A bigger TX buffer lets a
// full "pins" reply or a stream frame leave without blocking the loop.
#define AGENT_SERIAL_TX_BUF 1024
#define AGENT_SERIAL_RX_BUF 1024

#define AGENT_STREAM_MIN_HZ 1
#define AGENT_STREAM_MAX_HZ 50
#define AGENT_STREAM_MAX_PINS 25

#define AGENT_PIN_LIST_MAX 25

#define AGENT_I2C_DEFAULT_HZ 100000UL
#define AGENT_I2C_MIN_HZ 1000UL
#define AGENT_I2C_MAX_HZ 1000000UL
#define AGENT_I2C_READ_MAX 32
#define AGENT_I2C_TIMEOUT_MS 50
// 7-bit address range probed by i2c_scan (0x00-0x07 and 0x78-0x7F are
// reserved by the I2C specification, NXP UM10204 section 3.1.12).
#define AGENT_I2C_FIRST_ADDR 0x08
#define AGENT_I2C_LAST_ADDR 0x77

// LEDC (PWM) limits. The LEDC timer runs from the 80 MHz APB clock, so the
// highest frequency is 80 MHz / 2^resolution (ESP32 Technical Reference
// Manual, chapter "LED PWM Controller"): 10 bit -> 78.1 kHz, 8 bit -> 312.5 kHz.
#define AGENT_PWM_MIN_HZ 1UL
#define AGENT_PWM_10BIT_MAX_HZ 78000UL
#define AGENT_PWM_MAX_HZ 312000UL
