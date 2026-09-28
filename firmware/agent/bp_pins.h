// Pin facts, safety checks and the table of modes the agent itself set.
// Board-specific facts come from bp_board.h (generated from boards/<id>.json).
#pragma once

#include <Arduino.h>

#include "bp_board.h"

enum BpMode : uint8_t { BP_IN = 0, BP_OUT, BP_PWM, BP_ADC, BP_I2C, BP_UART };

// Result of a safety check. code == nullptr means the pin may be used.
// code and msg are flash strings (bp_port.h).
struct BpPinCheck {
  const char* code;
  const char* msg;
};

namespace bppins {

static const int PIN_SLOTS = BP_GPIO_COUNT;  // pin numbers 0..PIN_SLOTS-1

// Pins on the board's header, in ascending order.
int headerCount();
int headerPin(int i);

bool exists(long gpio);
bool isFlash(long gpio);
bool isUart(long gpio);
// USB data lines and debug port pins (refused).
bool isBlocked(long gpio);
bool isInputOnly(long gpio);
bool isAdc(long gpio);
// Pins that can only be read by the ADC (no digital input), e.g. A6/A7 on the Arduino Nano.
bool isAnalogOnly(long gpio);
// Pins the agent may use at all (exists, not flash, not uart, not blocked).
bool isUsable(long gpio);
// Pins that have an internal pull-down the agent can switch on.
bool hasInternalPulldown(long gpio);

// Safety rules, checked for every pin a command touches.
// needOutput: the command drives the pin (gpio_write, pwm, I2C SDA/SCL).
BpPinCheck check(long gpio, bool needOutput);

// Puts every usable GPIO in plain INPUT mode. Call once in setup().
void init();

BpMode mode(int gpio);
// Flash string.
const char* modeName(BpMode m);

// Releases whatever the agent did on the pin (PWM, output, ADC) and leaves
// it as a plain input with no internal pull. Returns true if it was driven
// or claimed by the agent before.
bool release(int gpio);

// Marks a pin as used by the I2C bus while a bus command runs.
void markI2c(int gpio);

bool setOutput(int gpio, uint8_t level);

// duty in percent 0..100. On success returns nullptr and sets actualHz to the
// frequency the hardware really produces. On failure returns an error code
// (flash string): "pwm_failed" or "not_pwm".
const char* setPwm(int gpio, double duty, uint32_t hz, uint32_t& actualHz);
void markAdc(int gpio);

// One ADC reading. mv: on ESP32 calibrated by the core; elsewhere computed from
// raw and the nominal reference (see ADC_NOMINAL).
void adcRead(int gpio, uint32_t& mv, uint16_t& raw);

// true when mv comes from the nominal reference voltage, not a calibration.
#if defined(ARDUINO_ARCH_ESP32)
static const bool ADC_NOMINAL = false;
#else
static const bool ADC_NOMINAL = true;
#endif

// Digital level of an input or output pin (switches ADC pins back to input).
int readLevel(int gpio);

// Prints the pin state object, e.g. {"mode":"in","level":1}.
void printState(int gpio);

}  // namespace bppins
