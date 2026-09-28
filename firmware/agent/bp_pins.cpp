#include "bp_pins.h"

#include <math.h>

#include "bp_config.h"
#include "bp_out.h"

namespace bppins {

// Header of the 30-pin ESP32 DevKit (ESP32-WROOM-32). GPIO 1 and 3 are the
// UART0 TX/RX lines wired to the USB-serial chip. GPIO 0 is only reachable
// through the BOOT button, so it is not listed here.
const uint8_t kHeaderPins[] = {1,  2,  3,  4,  5,  12, 13, 14, 15, 16, 17, 18, 19,
                               21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39};
const size_t kHeaderPinCount = sizeof(kHeaderPins) / sizeof(kHeaderPins[0]);

namespace {

struct PinState {
  uint8_t mode;   // BpMode
  uint8_t level;  // level the agent drives (BP_OUT)
  uint8_t res;    // LEDC resolution in bits (BP_PWM)
  float duty;     // percent (BP_PWM)
  uint32_t hz;    // PWM frequency (BP_PWM)
};

PinState st[GPIO_COUNT];

}  // namespace

// Which GPIO numbers exist.
// Source: ESP32 Series Datasheet, section 2.2 "Pin Description" (pin table)
// and section 4.1.1 "General Purpose Input / Output Interface (GPIO)":
// the ESP32 has GPIO 0-19, 21-23, 25-27 and 32-39. GPIO 20, 24 and 28-31
// are not bonded out on the ESP32-D0WD(-V3) used in ESP32-WROOM-32.
bool exists(long g) {
  return (g >= 0 && g <= 19) || (g >= 21 && g <= 23) || (g >= 25 && g <= 27) ||
         (g >= 32 && g <= 39);
}

// Flash pins.
// Source: ESP32-WROOM-32 datasheet, section "Pin Description", note on the
// SPI flash: pins SCK/CLK, SDO/SD0, SDI/SD1, SHD/SD2, SWP/SD3 and SCS/CMD,
// namely GPIO6 to GPIO11, are connected to the SPI flash integrated on the
// module and are not recommended for other uses. Touching them stops the
// CPU from fetching code and crashes the board.
bool isFlash(long g) { return g >= 6 && g <= 11; }

// GPIO 1 (U0TXD) and GPIO 3 (U0RXD) carry this serial link.
// Source: ESP32 Series Datasheet, section 2.2 "Pin Description" (U0TXD/U0RXD).
bool isUart(long g) { return g == 1 || g == 3; }

// Input-only pads.
// Source: ESP32 Series Datasheet, section 2.2 "Pin Description" and
// section 4.1.1 "GPIO & RTC_GPIO": GPIO34-39 are input-only and have no
// output driver and no internal pull-up/pull-down circuitry.
bool isInputOnly(long g) { return g >= 34 && g <= 39; }

bool hasInternalPulls(long g) { return exists(g) && !isInputOnly(g); }

// ADC-capable pads.
// Source: ESP32 Series Datasheet, section 4.1.2 "Analog-to-Digital Converter
// (ADC)" and table "Peripheral Pin Configurations":
//   ADC1: CH0 GPIO36, CH3 GPIO39, CH4 GPIO32, CH5 GPIO33, CH6 GPIO34, CH7 GPIO35
//         (CH1/CH2 = GPIO37/38 are not bonded out on ESP32-WROOM-32)
//   ADC2: CH0 GPIO4, CH1 GPIO0, CH2 GPIO2, CH3 GPIO15, CH4 GPIO13, CH5 GPIO12,
//         CH6 GPIO14, CH7 GPIO27, CH8 GPIO25, CH9 GPIO26
// ADC2 cannot be used while Wi-Fi is on. The agent never starts Wi-Fi.
bool isAdc(long g) {
  switch (g) {
    case 32: case 33: case 34: case 35: case 36: case 39:            // ADC1
    case 0: case 2: case 4: case 12: case 13: case 14: case 15:       // ADC2
    case 25: case 26: case 27:                                        // ADC2
      return true;
    default:
      return false;
  }
}

BpPinCheck check(long g, bool needOutput) {
  if (g < 0 || g >= GPIO_COUNT || !exists(g)) {
    return {"bad_pin", "This GPIO number does not exist on the ESP32."};
  }
  if (isFlash(g)) {
    return {"flash_pin", "GPIO 6 to 11 are wired to the internal flash. Using them would crash the board."};
  }
  if (isUart(g)) {
    return {"uart_pin", "GPIO 1 and 3 carry the serial link to the computer. Using them would cut the connection."};
  }
  if (needOutput && isInputOnly(g)) {
    return {"input_only", "GPIO 34 to 39 are input only. They cannot drive a signal or be used as I2C lines."};
  }
  return {nullptr, nullptr};
}

void init() {
  for (int g = 0; g < GPIO_COUNT; g++) {
    st[g].mode = isUart(g) ? BP_UART : BP_IN;
    st[g].level = 0;
    st[g].res = 0;
    st[g].duty = 0;
    st[g].hz = 0;
    if (exists(g) && !isFlash(g) && !isUart(g)) {
      // Plain input: no internal pull, nothing driven.
      pinMode(g, INPUT);
    }
  }
}

BpMode mode(int g) {
  if (g < 0 || g >= GPIO_COUNT) return BP_IN;
  return (BpMode)st[g].mode;
}

const char* modeName(BpMode m) {
  switch (m) {
    case BP_OUT: return "out";
    case BP_PWM: return "pwm";
    case BP_ADC: return "adc";
    case BP_I2C: return "i2c";
    case BP_UART: return "uart";
    case BP_IN:
    default: return "in";
  }
}

bool release(int g) {
  if (g < 0 || g >= GPIO_COUNT || !exists(g) || isFlash(g) || isUart(g)) return false;
  const bool wasUsed = st[g].mode != BP_IN;
  if (st[g].mode == BP_PWM) {
    ledcDetach(g);
  }
  // pinMode also detaches the pin from any other peripheral (ADC, I2C)
  // through the core 3.x peripheral manager.
  pinMode(g, INPUT);
  st[g].mode = BP_IN;
  st[g].level = 0;
  st[g].duty = 0;
  st[g].hz = 0;
  st[g].res = 0;
  return wasUsed;
}

void markI2c(int g) {
  if (g >= 0 && g < GPIO_COUNT) st[g].mode = BP_I2C;
}

bool setOutput(int g, uint8_t level) {
  if (st[g].mode == BP_PWM) ledcDetach(g);
  if (st[g].mode != BP_OUT) pinMode(g, OUTPUT);
  digitalWrite(g, level ? HIGH : LOW);
  st[g].mode = BP_OUT;
  st[g].level = level ? 1 : 0;
  return true;
}

bool setPwm(int g, double duty, uint32_t hz) {
  const uint8_t res = (hz <= AGENT_PWM_10BIT_MAX_HZ) ? 10 : 8;
  PinState& s = st[g];
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
      return false;
    }
  }
  const uint32_t maxv = (1UL << res) - 1;
  // Core 3.x ledcWrite treats maxv as "fully on", so 100 % is a steady HIGH.
  const uint32_t v = (uint32_t)lround(duty * (double)maxv / 100.0);
  ledcWrite(g, v);
  s.mode = BP_PWM;
  s.duty = (float)duty;
  s.hz = hz;
  s.res = res;
  return true;
}

void markAdc(int g) {
  if (st[g].mode == BP_PWM) ledcDetach(g);
  st[g].mode = BP_ADC;
}

int readLevel(int g) {
  switch (st[g].mode) {
    case BP_IN:
    case BP_OUT:
      // OUTPUT in core 3.x keeps the input buffer on, so this reads the pad.
      return digitalRead(g) ? 1 : 0;
    case BP_ADC:
      release(g);
      return digitalRead(g) ? 1 : 0;
    default:
      return -1;
  }
}

void printState(int g) {
  const PinState& s = st[g];
  bpout::raw("{\"mode\":");
  bpout::str(modeName((BpMode)s.mode));
  switch (s.mode) {
    case BP_IN:
      bpout::key("level");
      bpout::num(digitalRead(g) ? 1 : 0);
      break;
    case BP_OUT:
      // "level" is what the pad reads back, "set" is what the agent drives.
      // They differ when something outside pulls the pin (e.g. a short).
      bpout::key("level");
      bpout::num(digitalRead(g) ? 1 : 0);
      bpout::key("set");
      bpout::num(s.level);
      break;
    case BP_PWM:
      bpout::key("duty");
      bpout::dec(s.duty);
      bpout::key("hz");
      bpout::unum(s.hz);
      break;
    case BP_ADC:
      // Real measurement from the ADC (calibrated by the core).
      bpout::key("mv");
      bpout::unum(analogReadMilliVolts(g));
      break;
    default:
      // "uart" and "i2c": reading the pin would disturb the peripheral.
      break;
  }
  bpout::ch('}');
}

}  // namespace bppins
