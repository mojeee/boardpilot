#include "bp_pins.h"

#include <math.h>

#include "bp_config.h"
#include "bp_out.h"
#include "bp_port.h"

#if defined(BP_STM32)
#include <analog.h>  // adc_read_value(PinName, bits), STM32duino SrcWrapper
#endif

#if defined(INPUT_PULLDOWN) || defined(BP_RP2040)
// INPUT_PULLDOWN is a macro on most cores and an enum value in ArduinoCore-API (RP2040).
#define BP_HAS_PULLDOWN 1
#endif

namespace bppins {

// ---------------------------------------------------------------------------
// Board facts (bp_board.h, generated from boards/<id>.json; the ESP32 facts
// are cited there and in scripts/gen-agent-board.mjs):
//   ESP32 Series Datasheet, section 2.2 "Pin Description": GPIO 0-19, 21-23,
//   25-27 and 32-39 exist; GPIO 1/3 are U0TXD/U0RXD; GPIO 34-39 are input only
//   with no internal pulls (section 4.1.1); ADC pads in section 4.1.2.
//   ESP32-WROOM-32 datasheet: GPIO 6-11 connect to the integrated SPI flash.
// ---------------------------------------------------------------------------

namespace {

const uint8_t kHeader[] BP_PROGMEM = BP_HEADER_PINS;
const uint8_t kValid[BP_MAP_BYTES] BP_PROGMEM = BP_MAP_VALID;
const uint8_t kFlash[BP_MAP_BYTES] BP_PROGMEM = BP_MAP_FLASH;
const uint8_t kUart[BP_MAP_BYTES] BP_PROGMEM = BP_MAP_UART;
const uint8_t kBlocked[BP_MAP_BYTES] BP_PROGMEM = BP_MAP_BLOCKED;
const uint8_t kInputOnly[BP_MAP_BYTES] BP_PROGMEM = BP_MAP_INPUT_ONLY;
const uint8_t kNoPull[BP_MAP_BYTES] BP_PROGMEM = BP_MAP_NO_PULL;
const uint8_t kAdc[BP_MAP_BYTES] BP_PROGMEM = BP_MAP_ADC;
const uint8_t kReserved[BP_MAP_BYTES] BP_PROGMEM = BP_MAP_RESERVED;

bool hasBit(const uint8_t* map, long g) {
  if (g < 0 || g >= PIN_SLOTS) return false;
  return (bp_rd8(&map[g >> 3]) >> (g & 7)) & 1;
}

struct PinState {
  uint8_t mode;   // BpMode
  uint8_t level;  // level the agent drives (BP_OUT)
  uint8_t res;    // PWM resolution in bits (BP_PWM, ESP32)
  float duty;     // percent (BP_PWM)
  uint32_t hz;    // PWM frequency (BP_PWM)
};

PinState st[PIN_SLOTS];

#if defined(BP_ESP32)
void pwmOff(int g) { ledcDetach(g); }
#elif defined(BP_NRF52)
void pwmOff(int g) {
  // Give the pin back from the PWM module (Adafruit core HardwarePWM).
  for (int i = 0; i < HWPWM_MODULE_NUM; i++) HwPWMx[i]->removePin((uint8_t)g);
}
#else
void pwmOff(int g) {
  // AVR: digitalWrite turns the timer output off (wiring_digital.c turnOffPWM).
  // RP2040, STM32, Teensy: pinMode() below gives the pad back to the GPIO block.
  bpWrite(g, LOW);
}
#endif

}  // namespace

int headerCount() { return BP_HEADER_PIN_COUNT; }

int headerPin(int i) { return bp_rd8(&kHeader[i]); }

bool exists(long g) { return hasBit(kValid, g); }
bool isFlash(long g) { return hasBit(kFlash, g); }
bool isUart(long g) { return hasBit(kUart, g); }
bool isBlocked(long g) { return hasBit(kBlocked, g); }
bool isInputOnly(long g) { return hasBit(kInputOnly, g); }
bool isAdc(long g) { return hasBit(kAdc, g); }

bool isAnalogOnly(long g) {
#if defined(BP_AVR) && defined(NUM_DIGITAL_PINS)
  // ATmega328P TQFP: ADC6 and ADC7 (Nano A6/A7) are analog inputs only, with no
  // digital port (ATmega328P datasheet, section 1.1.9 "ADC7:6"). The core
  // numbers them past NUM_DIGITAL_PINS.
  return exists(g) && isAdc(g) && g >= NUM_DIGITAL_PINS;
#else
  (void)g;
  return false;
#endif
}

bool isUsable(long g) { return exists(g) && !isFlash(g) && !isUart(g) && !isBlocked(g); }

bool hasInternalPulldown(long g) {
#if defined(PICO_RP2350)
  // RP2350 erratum RP2350-E9 (RP2350 datasheet, "Errata"): with the internal
  // pull-down on, a pad that nothing drives can latch at about 2 V and read
  // HIGH. The pull-down confirm would then report a floating pin as pulled up,
  // so it is not used on the RP2350.
  (void)g;
  return false;
#elif defined(BP_HAS_PULLDOWN)
  return exists(g) && !hasBit(kNoPull, g) && !isAnalogOnly(g);
#else
  // AVR has internal pull-ups only (ATmega328P datasheet, section 14.2 "Ports as General
  // Digital I/O").
  (void)g;
  return false;
#endif
}

BpPinCheck check(long g, bool needOutput) {
  if (g < 0 || g >= PIN_SLOTS || !exists(g)) {
    return {BPS("bad_pin"), BPS(BP_MSG_BAD_PIN)};
  }
  if (isFlash(g)) {
    return {BPS("flash_pin"), BPS(BP_MSG_FLASH)};
  }
  if (isUart(g)) {
    return {BPS("uart_pin"), BPS(BP_MSG_UART)};
  }
  if (isBlocked(g)) {
    return {BPS("reserved_pin"), BPS(BP_MSG_BLOCKED)};
  }
  if (needOutput && isInputOnly(g)) {
    return {BPS("input_only"), BPS(BP_MSG_INPUT_ONLY)};
  }
  return {nullptr, nullptr};
}

void init() {
#if defined(BP_RP2040) || defined(BP_TEENSY) || defined(BP_NRF52)
  // 12-bit readings (RP2040 datasheet section "ADC"; i.MX RT1060 and nRF52840 SAADC support it).
  analogReadResolution(BP_ADC_BITS);
#elif defined(BP_STM32)
  analogReadResolution(BP_ADC_BITS);
#endif
  for (int g = 0; g < PIN_SLOTS; g++) {
    st[g].mode = isUart(g) ? BP_UART : (isAnalogOnly(g) ? BP_ADC : BP_IN);
    st[g].level = 0;
    st[g].res = 0;
    st[g].duty = 0;
    st[g].hz = 0;
    if (isUsable(g) && !hasBit(kReserved, g) && !isAnalogOnly(g)) {
      // Plain input: no internal pull, nothing driven.
      bpPinMode(g, INPUT);
    }
  }
}

BpMode mode(int g) {
  if (g < 0 || g >= PIN_SLOTS) return BP_IN;
  return (BpMode)st[g].mode;
}

const char* modeName(BpMode m) {
  switch (m) {
    case BP_OUT: return BPS("out");
    case BP_PWM: return BPS("pwm");
    case BP_ADC: return BPS("adc");
    case BP_I2C: return BPS("i2c");
    case BP_UART: return BPS("uart");
    case BP_IN:
    default: return BPS("in");
  }
}

bool release(int g) {
  if (g < 0 || g >= PIN_SLOTS || !isUsable(g)) return false;
  if (isAnalogOnly(g)) return false;  // always an ADC input
  const bool wasUsed = st[g].mode != BP_IN;
  if (st[g].mode == BP_PWM) {
    pwmOff(g);
  }
#if !defined(BP_ESP32)
  // Clear the output latch so a later switch to OUTPUT (I2C bit-bang) starts LOW,
  // and on AVR make sure the internal pull-up is off.
  if (st[g].mode == BP_OUT) bpWrite(g, LOW);
#endif
  // On ESP32 pinMode also detaches the pin from any other peripheral (ADC,
  // I2C) through the core 3.x peripheral manager.
  bpPinMode(g, INPUT);
  st[g].mode = BP_IN;
  st[g].level = 0;
  st[g].duty = 0;
  st[g].hz = 0;
  st[g].res = 0;
  return wasUsed;
}

void markI2c(int g) {
  if (g >= 0 && g < PIN_SLOTS) st[g].mode = BP_I2C;
}

bool setOutput(int g, uint8_t level) {
  if (st[g].mode == BP_PWM) pwmOff(g);
#if defined(BP_ESP32)
  if (st[g].mode != BP_OUT) bpPinMode(g, OUTPUT);
  bpWrite(g, level);
#else
  if (st[g].mode != BP_OUT) {
    // Set the latch first where the core allows it, so the pin does not glitch.
    bpWrite(g, level);
    bpPinMode(g, OUTPUT);
  }
  bpWrite(g, level);
#endif
  st[g].mode = BP_OUT;
  st[g].level = level ? 1 : 0;
  return true;
}

const char* setPwm(int g, double duty, uint32_t hz, uint32_t& actualHz) {
  PinState& s = st[g];
#if defined(BP_ESP32)
  const uint8_t res = (hz <= AGENT_PWM_10BIT_MAX_HZ) ? 10 : 8;
  bool attached = false;
  if (s.mode == BP_PWM && s.res == res) {
    attached = true;
    if (s.hz != hz && ledcChangeFrequency(g, hz, res) == 0) {
      // Could not retune: fall back to a fresh attach.
      ledcDetach(g);
      attached = false;
    }
  } else if (s.mode == BP_PWM) {
    ledcDetach(g);
  }
  if (!attached) {
    if (!ledcAttach(g, hz, res)) {
      pinMode(g, INPUT);
      s.mode = BP_IN;
      return BPS("pwm_failed");
    }
  }
  const uint32_t maxv = (1UL << res) - 1;
  // Core 3.x ledcWrite treats maxv as "fully on", so 100 % is a steady HIGH.
  const uint32_t v = (uint32_t)lround(duty * (double)maxv / 100.0);
  ledcWrite(g, v);
  s.res = res;
  actualHz = hz;
#elif defined(BP_AVR)
#if defined(digitalPinHasPWM)
  if (!digitalPinHasPWM(g)) return BPS("not_pwm");
#endif
  // The Arduino AVR core (wiring.c init()) runs every timer with prescaler 64:
  // Timer0 in fast PWM (f = F_CPU / (64 * 256) = 977 Hz at 16 MHz), the other
  // timers in phase-correct PWM (f = F_CPU / (64 * 510) = 490 Hz). Formulas:
  // ATmega328P datasheet, sections 15.7.3 "Fast PWM Mode" and 15.7.4 "Phase
  // Correct PWM Mode". The frequency cannot be changed without breaking millis().
  const uint8_t t = digitalPinToTimer(g);
  const bool timer0 = (t == TIMER0A || t == TIMER0B);
  (void)hz;
  actualHz = timer0 ? (uint32_t)lround(F_CPU / (64.0 * 256.0)) : (uint32_t)lround(F_CPU / (64.0 * 510.0));
  // analogWrite(255) is a steady HIGH and analogWrite(0) a steady LOW.
  analogWrite(g, (int)lround(duty * 255.0 / 100.0));
#elif defined(BP_RP2040)
  // arduino-pico clamps analogWriteFreq to 100 Hz .. 10 MHz. The two pins of one
  // PWM slice (GPIO 2n and 2n+1) share one frequency (RP2040 datasheet, section
  // 4.5 "PWM").
  actualHz = hz < 100 ? 100 : (hz > 10000000UL ? 10000000UL : hz);
  analogWriteFreq(actualHz);
  analogWriteRange(1000);
  // Range 1000 = 0.1 % steps; a value equal to the range is a steady HIGH.
  analogWrite(g, (int)lround(duty * 10.0));
#elif defined(BP_STM32)
  const uint32_t pin = bpNative(g);
  if (!digitalPinHasPWM(pin)) return BPS("not_pwm");
  // Pins on the same timer share one frequency (STM32duino HardwareTimer).
  analogWriteFrequency(hz);
  analogWriteResolution(12);
  analogWrite(pin, (int)lround(duty * 4095.0 / 100.0));
  actualHz = hz;
#elif defined(BP_TEENSY)
#if defined(digitalPinHasPWM)
  if (!digitalPinHasPWM(g)) return BPS("not_pwm");
#endif
  // Pins on the same FlexPWM / QuadTimer module share one frequency (Teensy 4.1
  // pinout card; analogWriteFrequency in cores/teensy4/pwm.c).
  analogWriteFrequency(g, (float)hz);
  analogWriteResolution(12);
  analogWrite(g, (int)lround(duty * 4095.0 / 100.0));
  actualHz = hz;
#elif defined(BP_NRF52)
  // Adafruit core: analogWrite uses the PWM modules clocked at 16 MHz with
  // COUNTERTOP = 255 at 8-bit resolution (cores/nRF5/HardwarePWM.cpp); in
  // up-counting mode the period is COUNTERTOP clock ticks (nRF52840 Product
  // Specification, chapter "PWM"): 16 MHz / 255 = 62745 Hz, not adjustable here.
  (void)hz;
  analogWriteResolution(8);
  analogWrite(g, (int)lround(duty * 255.0 / 100.0));
  actualHz = 62745;
#else
  // Other cores: fixed frequency that the agent cannot read back.
  (void)hz;
  analogWrite(g, (int)lround(duty * 255.0 / 100.0));
  actualHz = 0;
#endif
  s.mode = BP_PWM;
  s.duty = (float)duty;
  s.hz = actualHz;
  return nullptr;
}

void markAdc(int g) {
  if (st[g].mode == BP_PWM) pwmOff(g);
  st[g].mode = BP_ADC;
}

void adcRead(int g, uint32_t& mv, uint16_t& raw) {
#if defined(BP_ESP32)
  // Both values come from the ADC. analogReadMilliVolts applies the chip's
  // factory calibration (eFuse). Default attenuation 11 dB: about 0.15-3.1 V.
  mv = analogReadMilliVolts(g);
  raw = analogRead(g);
#else
#if defined(BP_STM32)
  raw = adc_read_value((PinName)g, BP_ADC_BITS);
#else
  raw = (uint16_t)analogRead(g);
#endif
  // No calibration on these chips: mv is raw scaled by the nominal full scale
  // (rules.adcMaxMv, e.g. AVcc = 5000 mV on the Uno, 3300 mV on 3.3 V boards).
  // ADC = Vin * 2^bits / Vref (ATmega328P datasheet, section 24.7 "ADC
  // Conversion Result"; the RP2040, STM32F4 and i.MX RT ADCs use the same
  // straight-binary transfer function).
  mv = (uint32_t)(((uint32_t)raw * (uint32_t)BP_ADC_MAX_MV + (1UL << (BP_ADC_BITS - 1))) >> BP_ADC_BITS);
#endif
}

int readLevel(int g) {
  if (isAnalogOnly(g)) return -1;
  switch (st[g].mode) {
    case BP_IN:
    case BP_OUT:
      // OUTPUT keeps the input buffer on, so this reads the pad.
      return bpRead(g);
    case BP_ADC:
      release(g);
      return bpRead(g);
    default:
      return -1;
  }
}

void printState(int g) {
  const PinState& s = st[g];
  bpout::raw(BPS("{\"mode\":"));
  bpout::str(modeName((BpMode)s.mode));
  switch (s.mode) {
    case BP_IN:
      bpout::key(BPS("level"));
      bpout::num(bpRead(g));
      break;
    case BP_OUT:
      // "level" is what the pad reads back, "set" is what the agent drives.
      // They differ when something outside pulls the pin (e.g. a short).
      bpout::key(BPS("level"));
      bpout::num(bpRead(g));
      bpout::key(BPS("set"));
      bpout::num(s.level);
      break;
    case BP_PWM:
      bpout::key(BPS("duty"));
      bpout::dec(s.duty);
      bpout::key(BPS("hz"));
      bpout::unum(s.hz);
      break;
    case BP_ADC: {
      // Real measurement from the ADC.
#if defined(BP_ESP32)
      // Calibrated by the core (eFuse).
      const uint32_t mv = analogReadMilliVolts(g);
#else
      uint32_t mv;
      uint16_t raw;
      adcRead(g, mv, raw);
#endif
      bpout::key(BPS("mv"));
      bpout::unum(mv);
      break;
    }
    default:
      // "uart" and "i2c": reading the pin would disturb the peripheral.
      break;
  }
  bpout::ch('}');
}

}  // namespace bppins
