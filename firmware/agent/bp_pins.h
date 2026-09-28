// Pin facts, safety checks and the table of modes the agent itself set.
#pragma once

#include <Arduino.h>

enum BpMode : uint8_t { BP_IN = 0, BP_OUT, BP_PWM, BP_ADC, BP_I2C, BP_UART };

// Result of a safety check. code == nullptr means the pin may be used.
struct BpPinCheck {
  const char* code;
  const char* msg;
};

namespace bppins {

static const int GPIO_COUNT = 40;

// GPIOs on the header of the 30-pin ESP32 DevKit (DevKitC / "DevKit V1").
extern const uint8_t kHeaderPins[];
extern const size_t kHeaderPinCount;

bool exists(long gpio);
bool isFlash(long gpio);
bool isUart(long gpio);
bool isInputOnly(long gpio);
bool isAdc(long gpio);
bool hasInternalPulls(long gpio);

// Safety rules, checked for every pin a command touches.
// needOutput: the command drives the pin (gpio_write, pwm, I2C SDA/SCL).
BpPinCheck check(long gpio, bool needOutput);

// Puts every usable GPIO in plain INPUT mode. Call once in setup().
void init();

BpMode mode(int gpio);
const char* modeName(BpMode m);

// Releases whatever the agent did on the pin (PWM, output, ADC) and leaves
// it as a plain input with no internal pull. Returns true if it was driven
// or claimed by the agent before.
bool release(int gpio);

// Marks a pin as used by the I2C peripheral while a bus command runs.
void markI2c(int gpio);

bool setOutput(int gpio, uint8_t level);
// duty in percent 0..100. Returns false if the LEDC driver refused.
bool setPwm(int gpio, double duty, uint32_t hz);
void markAdc(int gpio);

// Digital level of an input or output pin (switches ADC pins back to input).
int readLevel(int gpio);

// Prints the pin state object, e.g. {"mode":"in","level":1}.
void printState(int gpio);

}  // namespace bppins
