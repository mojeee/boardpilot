#include "bp_commands.h"

#include <Arduino.h>
#include <Wire.h>
#include <stdio.h>

#include "bp_config.h"
#include "bp_json.h"
#include "bp_out.h"
#include "bp_pins.h"

using bpjson::getBool;
using bpjson::getDouble;
using bpjson::getLong;
using bpjson::getLongArray;
using bpjson::getLongOrHex;
using bpjson::has;

namespace {

char gMsg[128];

// ---------------------------------------------------------------------------
// Argument helpers. On failure they print the error reply and return false.
// ---------------------------------------------------------------------------

int pinForError(long v) { return (v >= 0 && v <= 9999) ? (int)v : -1; }

bool argPin(const BpReq& r, const char* key, bool needOutput, int& pin) {
  long v;
  if (!getLong(r.doc, key, v)) {
    snprintf(gMsg, sizeof(gMsg), "\"%s\" must be a GPIO number, for example 21.", key);
    bpout::error(r, "bad_args", gMsg);
    return false;
  }
  const BpPinCheck c = bppins::check(v, needOutput);
  if (c.code) {
    bpout::error(r, c.code, c.msg, pinForError(v));
    return false;
  }
  pin = (int)v;
  return true;
}

// Reads "pins":[...], checks every pin and drops duplicates.
bool argPinList(const BpReq& r, bool allowEmpty, int* pins, int& n) {
  long tmp[AGENT_PIN_LIST_MAX];
  const int c = getLongArray(r.doc, "pins", tmp, AGENT_PIN_LIST_MAX);
  if (c == -2) {
    snprintf(gMsg, sizeof(gMsg), "Too many pins in one request. The limit is %d.", AGENT_PIN_LIST_MAX);
    bpout::error(r, "bad_args", gMsg);
    return false;
  }
  if (c < 0) {
    bpout::error(r, "bad_args", "\"pins\" must be a list of GPIO numbers, for example [21,22].");
    return false;
  }
  if (c == 0 && !allowEmpty) {
    bpout::error(r, "bad_args", "\"pins\" is empty. Give at least one GPIO number.");
    return false;
  }
  n = 0;
  for (int i = 0; i < c; i++) {
    const BpPinCheck chk = bppins::check(tmp[i], false);
    if (chk.code) {
      bpout::error(r, chk.code, chk.msg, pinForError(tmp[i]));
      return false;
    }
    bool dup = false;
    for (int j = 0; j < n; j++) dup = dup || (pins[j] == (int)tmp[i]);
    if (!dup) pins[n++] = (int)tmp[i];
  }
  return true;
}

// Optional whole number with range check. Missing -> def.
bool argLongOpt(const BpReq& r, const char* key, long def, long lo, long hi, long& out) {
  if (!has(r.doc, key)) {
    out = def;
    return true;
  }
  long v;
  if (!getLong(r.doc, key, v) || v < lo || v > hi) {
    snprintf(gMsg, sizeof(gMsg), "\"%s\" must be a whole number from %ld to %ld.", key, lo, hi);
    bpout::error(r, "bad_args", gMsg);
    return false;
  }
  out = v;
  return true;
}

// ---------------------------------------------------------------------------
// I2C helpers
// ---------------------------------------------------------------------------
//
// The trace is rebuilt from the result of each transaction. The ESP-IDF I2C
// master driver checks the ACK bit after every byte the master writes and
// fails the transaction on a NACK, so a successful transaction means every
// written byte was ACKed. The master NACKs the last byte it reads, which is
// how the I2C specification ends a read (NXP UM10204, section 3.1.6).

bool gFirstStep = true;

void stepSep() {
  if (!gFirstStep) bpout::ch(',');
  gFirstStep = false;
}

void stepStart() {
  stepSep();
  bpout::raw("{\"t\":\"start\"}");
}

void stepRestart() {
  stepSep();
  bpout::raw("{\"t\":\"restart\"}");
}

void stepStop() {
  stepSep();
  bpout::raw("{\"t\":\"stop\"}");
}

void stepAddr(uint8_t addr, bool read, bool ack) {
  stepSep();
  bpout::raw("{\"t\":\"addr\",\"v\":");
  bpout::hexByte(addr);
  bpout::raw(read ? ",\"rw\":\"r\"" : ",\"rw\":\"w\"");
  bpout::key("ack");
  bpout::boolVal(ack);
  bpout::ch('}');
}

void stepData(uint8_t v, bool write, bool ack) {
  stepSep();
  bpout::raw("{\"t\":\"data\",\"v\":");
  bpout::hexByte(v);
  bpout::raw(write ? ",\"dir\":\"w\"" : ",\"dir\":\"r\"");
  bpout::key("ack");
  bpout::boolVal(ack);
  bpout::ch('}');
}

void traceBegin() {
  bpout::key("trace");
  bpout::ch('[');
  gFirstStep = true;
}

void traceEnd() { bpout::ch(']'); }

bool argI2cBus(const BpReq& r, int& sda, int& scl, uint32_t& hz) {
  // I2C lines are open-drain outputs, so input-only pins are refused.
  if (!argPin(r, "sda", true, sda)) return false;
  if (!argPin(r, "scl", true, scl)) return false;
  if (sda == scl) {
    bpout::error(r, "bad_args", "SDA and SCL must be two different pins.", sda);
    return false;
  }
  long h;
  if (!argLongOpt(r, "hz", (long)AGENT_I2C_DEFAULT_HZ, (long)AGENT_I2C_MIN_HZ, (long)AGENT_I2C_MAX_HZ, h)) {
    return false;
  }
  hz = (uint32_t)h;
  return true;
}

void i2cClose(int sda, int scl) {
  Wire.end();
  bppins::release(sda);
  bppins::release(scl);
}

bool i2cOpen(const BpReq& r, int sda, int scl, uint32_t hz) {
  bppins::release(sda);
  bppins::release(scl);
  if (!Wire.begin((int)sda, (int)scl, (uint32_t)hz)) {
    i2cClose(sda, scl);
    bpout::error(r, "i2c_init_failed", "The I2C driver could not start on these pins.");
    return false;
  }
  Wire.setTimeOut(AGENT_I2C_TIMEOUT_MS);
  bppins::markI2c(sda);
  bppins::markI2c(scl);
  return true;
}

const char* kBusErrorMsg =
    "The I2C bus stopped responding. SDA or SCL may be held low, shorted, or missing pull-up "
    "resistors.";

// ---------------------------------------------------------------------------
// Stream state
// ---------------------------------------------------------------------------

bool gStreamOn = false;
int gStreamPins[AGENT_STREAM_MAX_PINS];
int gStreamCount = 0;
uint32_t gStreamPeriodUs = 0;
uint32_t gStreamNextUs = 0;

void streamStop() {
  gStreamOn = false;
  gStreamCount = 0;
}

}  // namespace

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

void cmdHello(const BpReq& r) {
  bpout::begin(r, true);
  bpout::key("agent");
  bpout::str(AGENT_NAME);
  bpout::key("ver");
  bpout::str(AGENT_VER);
  bpout::key("chip");
  bpout::str(ESP.getChipModel());
  bpout::key("heapFree");
  bpout::unum(ESP.getFreeHeap());
  bpout::end();
}

void cmdPins(const BpReq& r) {
  bpout::begin(r, true);
  bpout::key("pins");
  bpout::ch('{');
  for (size_t i = 0; i < bppins::kHeaderPinCount; i++) {
    const int g = bppins::kHeaderPins[i];
    if (i) bpout::ch(',');
    bpout::pinKey(g);
    bppins::printState(g);
  }
  bpout::ch('}');
  bpout::end();
}

void cmdStrapping(const BpReq& r) {
  bpout::begin(r, true);
  bpout::ch(',');
  bpPrintStrappingFields();
  bpout::end();
}

// External pull-up check.
// Method (see CLAUDE.md "Measurement honesty"): switch off the internal
// pull-up and pull-down, let the line settle, read it. HIGH with nothing
// driving it means an external pull-up.
// A floating pin can also read HIGH by chance, so on pins that have an
// internal pull-down (not GPIO 34-39) we confirm by enabling the ~45 kOhm
// internal pull-down: a real external pull-up (typically 1-10 kOhm) still
// wins and the pin stays HIGH; a floating pin drops to LOW.
void cmdPullupCheck(const BpReq& r) {
  int pins[AGENT_PIN_LIST_MAX];
  int n = 0;
  if (!argPinList(r, false, pins, n)) return;

  uint8_t level[AGENT_PIN_LIST_MAX];
  bool external[AGENT_PIN_LIST_MAX];
  for (int i = 0; i < n; i++) {
    const int g = pins[i];
    bppins::release(g);  // plain INPUT, no internal pulls
    delay(2);
    const int a = digitalRead(g) ? 1 : 0;
    int b = a;
    if (a && bppins::hasInternalPulls(g)) {
      pinMode(g, INPUT_PULLDOWN);
      delay(2);
      b = digitalRead(g) ? 1 : 0;
      pinMode(g, INPUT);
    }
    level[i] = (uint8_t)a;
    external[i] = (a == 1 && b == 1);
  }

  bpout::begin(r, true);
  bpout::key("external");
  bpout::ch('{');
  for (int i = 0; i < n; i++) {
    if (i) bpout::ch(',');
    bpout::pinKey(pins[i]);
    bpout::boolVal(external[i]);
  }
  bpout::ch('}');
  bpout::key("levels");
  bpout::ch('{');
  for (int i = 0; i < n; i++) {
    if (i) bpout::ch(',');
    bpout::pinKey(pins[i]);
    bpout::num(level[i]);
  }
  bpout::ch('}');
  bpout::end();
}

void cmdI2cScan(const BpReq& r) {
  int sda, scl;
  uint32_t hz;
  if (!argI2cBus(r, sda, scl, hz)) return;
  if (!i2cOpen(r, sda, scl, hz)) return;

  uint8_t found[AGENT_I2C_LAST_ADDR - AGENT_I2C_FIRST_ADDR + 1];
  int nFound = 0;
  uint8_t busErr = 0;
  uint8_t busErrAddr = 0;
  for (uint16_t a = AGENT_I2C_FIRST_ADDR; a <= AGENT_I2C_LAST_ADDR; a++) {
    Wire.beginTransmission((uint8_t)a);
    // 0 = ACK, 2 = NACK, 4 = other error, 5 = timeout (core 3.x Wire).
    const uint8_t e = Wire.endTransmission(true);
    if (e == 0) {
      found[nFound++] = (uint8_t)a;
    } else if (e != 2) {
      busErr = e;
      busErrAddr = (uint8_t)a;
      break;
    }
  }
  i2cClose(sda, scl);

  bpout::begin(r, busErr == 0);
  if (busErr) {
    bpout::key("error");
    bpout::str("bus_error");
    bpout::key("msg");
    bpout::str(kBusErrorMsg);
    bpout::key("addr");
    bpout::hexByte(busErrAddr);
  }
  bpout::key("found");
  bpout::ch('[');
  for (int i = 0; i < nFound; i++) {
    if (i) bpout::ch(',');
    bpout::hexByte(found[i]);
  }
  bpout::ch(']');
  traceBegin();
  if (nFound > 0) {
    for (int i = 0; i < nFound; i++) {
      stepStart();
      stepAddr(found[i], false, true);
      stepStop();
    }
  } else if (!busErr) {
    // Nothing answered: show the first probe so the UI can draw something.
    stepStart();
    stepAddr(AGENT_I2C_FIRST_ADDR, false, false);
    stepStop();
  }
  traceEnd();
  bpout::end();
}

void cmdI2cRead(const BpReq& r) {
  int sda, scl;
  uint32_t hz;
  if (!argI2cBus(r, sda, scl, hz)) return;

  long addr, reg, len;
  if (!getLongOrHex(r.doc, "addr", addr) || addr < AGENT_I2C_FIRST_ADDR || addr > AGENT_I2C_LAST_ADDR) {
    bpout::error(r, "bad_args", "\"addr\" must be a 7-bit I2C address from \"0x08\" to \"0x77\", for example \"0x76\".");
    return;
  }
  if (!getLongOrHex(r.doc, "reg", reg) || reg < 0 || reg > 0xFF) {
    bpout::error(r, "bad_args", "\"reg\" must be a register number from \"0x00\" to \"0xFF\", for example \"0xD0\".");
    return;
  }
  if (!argLongOpt(r, "len", 1, 1, AGENT_I2C_READ_MAX, len)) return;

  if (!i2cOpen(r, sda, scl, hz)) return;

  uint8_t data[AGENT_I2C_READ_MAX];
  size_t got = 0;
  Wire.beginTransmission((uint8_t)addr);
  Wire.write((uint8_t)reg);
  // sendStop=false: core 3.x holds the register write and sends it together
  // with the read as write + repeated START + read.
  const uint8_t we = Wire.endTransmission(false);
  if (we == 0) {
    // (uint8_t, uint8_t, uint8_t) is the overload every core version has
    // (the same call Adafruit_BusIO makes), so there is no overload ambiguity.
    got = Wire.requestFrom((uint8_t)addr, (uint8_t)len, (uint8_t)1);
    if (got > (size_t)len) got = (size_t)len;
    for (size_t i = 0; i < got; i++) {
      const int c = Wire.read();
      if (c < 0) {
        got = i;
        break;
      }
      data[i] = (uint8_t)c;
    }
  }

  if (got == (size_t)len) {
    i2cClose(sda, scl);
    bpout::begin(r, true);
    bpout::key("data");
    bpout::ch('[');
    for (size_t i = 0; i < got; i++) {
      if (i) bpout::ch(',');
      bpout::hexByte(data[i]);
    }
    bpout::ch(']');
    traceBegin();
    stepStart();
    stepAddr((uint8_t)addr, false, true);
    stepData((uint8_t)reg, true, true);
    stepRestart();
    stepAddr((uint8_t)addr, true, true);
    for (size_t i = 0; i < got; i++) stepData(data[i], false, i + 1 < got);
    stepStop();
    traceEnd();
    bpout::end();
    return;
  }

  // The combined transaction failed and the driver does not say where.
  // Find out with one extra address-only transaction. The trace below shows
  // that check (what we actually observed), not a guess about the failed one.
  Wire.beginTransmission((uint8_t)addr);
  const uint8_t pe = Wire.endTransmission(true);
  i2cClose(sda, scl);

  bpout::begin(r, false);
  if (pe == 2) {
    snprintf(gMsg, sizeof(gMsg),
             "No device answered at address 0x%02lX. Check the wiring, the power and the address.",
             (unsigned long)addr);
    bpout::key("error");
    bpout::str("nack");
    bpout::key("msg");
    bpout::str(gMsg);
    bpout::key("nackAt");
    bpout::str("addr");
  } else if (pe == 0) {
    bpout::key("error");
    bpout::str(got > 0 ? "short_read" : "read_failed");
    bpout::key("msg");
    bpout::str("The device answered its address, but reading the register failed. The register may "
               "not exist on this device, or the bus is noisy.");
    if (got > 0) {
      bpout::key("data");
      bpout::ch('[');
      for (size_t i = 0; i < got; i++) {
        if (i) bpout::ch(',');
        bpout::hexByte(data[i]);
      }
      bpout::ch(']');
    }
  } else {
    bpout::key("error");
    bpout::str("bus_error");
    bpout::key("msg");
    bpout::str(kBusErrorMsg);
  }
  traceBegin();
  if (pe == 0 || pe == 2) {
    stepStart();
    stepAddr((uint8_t)addr, false, pe == 0);
    stepStop();
  }
  traceEnd();
  bpout::end();
}

void cmdAdc(const BpReq& r) {
  int g;
  if (!argPin(r, "pin", false, g)) return;
  if (!bppins::isAdc(g)) {
    snprintf(gMsg, sizeof(gMsg),
             "GPIO %d cannot measure voltage. Use an ADC pin, best GPIO 32 to 39.", g);
    bpout::error(r, "not_adc", gMsg, g);
    return;
  }
  if (bppins::mode(g) != BP_ADC) bppins::release(g);
  // Both values come from the ADC. analogReadMilliVolts applies the chip's
  // factory calibration (eFuse). Default attenuation 11 dB: about 0.15-3.1 V.
  const uint32_t mv = analogReadMilliVolts(g);
  const uint16_t raw = analogRead(g);
  bppins::markAdc(g);

  bpout::begin(r, true);
  bpout::key("mv");
  bpout::unum(mv);
  bpout::key("raw");
  bpout::unum(raw);
  bpout::end();
}

void cmdPwm(const BpReq& r) {
  int g;
  if (!argPin(r, "pin", true, g)) return;

  bool stop = false;
  if (has(r.doc, "stop") && !getBool(r.doc, "stop", stop)) {
    bpout::error(r, "bad_args", "\"stop\" must be true or false.");
    return;
  }
  if (stop) {
    bppins::release(g);
    bpout::ok(r);
    return;
  }

  double duty;
  if (!getDouble(r.doc, "duty", duty) || duty < 0.0 || duty > 100.0) {
    bpout::error(r, "bad_args", "\"duty\" must be a percentage from 0 to 100.");
    return;
  }
  long hz;
  if (!argLongOpt(r, "hz", 5000, (long)AGENT_PWM_MIN_HZ, (long)AGENT_PWM_MAX_HZ, hz)) return;

  if (!bppins::setPwm(g, duty, (uint32_t)hz)) {
    bpout::error(r, "pwm_failed", "The PWM driver could not start with this frequency. Try 1 Hz to 312 kHz.", g);
    return;
  }
  bpout::ok(r);
}

void cmdGpioWrite(const BpReq& r) {
  int g;
  if (!argPin(r, "pin", true, g)) return;
  long level;
  bool b;
  if (getBool(r.doc, "level", b)) {
    level = b ? 1 : 0;
  } else if (!getLong(r.doc, "level", level) || (level != 0 && level != 1)) {
    bpout::error(r, "bad_args", "\"level\" must be 0 (LOW) or 1 (HIGH).");
    return;
  }
  bppins::setOutput(g, (uint8_t)level);
  bpout::ok(r);
}

void cmdGpioRead(const BpReq& r) {
  int g;
  if (!argPin(r, "pin", false, g)) return;
  const BpMode m = bppins::mode(g);
  if (m == BP_PWM || m == BP_I2C) {
    bpout::error(r, "pin_busy",
                 "This pin is producing a PWM signal. Stop it first (pwm with \"stop\":true) or send reset_pins.", g);
    return;
  }
  const int level = bppins::readLevel(g);
  bpout::begin(r, true);
  bpout::key("pin");
  bpout::num(g);
  bpout::key("level");
  bpout::num(level);
  bpout::end();
}

void cmdStream(const BpReq& r) {
  int pins[AGENT_PIN_LIST_MAX];
  int n = 0;
  if (!argPinList(r, true, pins, n)) return;
  long hz;
  // "hz" defaults to 20 when missing; 0 stops the stream.
  if (!argLongOpt(r, "hz", 20, 0, AGENT_STREAM_MAX_HZ, hz)) return;

  if (n == 0 || hz == 0) {
    streamStop();
    bpout::ok(r);
    return;
  }
  if (hz < AGENT_STREAM_MIN_HZ) hz = AGENT_STREAM_MIN_HZ;

  gStreamCount = n > AGENT_STREAM_MAX_PINS ? AGENT_STREAM_MAX_PINS : n;
  for (int i = 0; i < gStreamCount; i++) gStreamPins[i] = pins[i];
  gStreamPeriodUs = 1000000UL / (uint32_t)hz;
  gStreamNextUs = micros();
  // Ack first, so the reply is never interleaved after a frame.
  bpout::ok(r);
  gStreamOn = true;
}

void cmdStreamStop(const BpReq& r) {
  streamStop();
  bpout::ok(r);
}

void cmdResetPins(const BpReq& r) {
  streamStop();
  bpout::begin(r, true);
  bpout::key("released");
  bpout::ch('[');
  bool first = true;
  for (int g = 0; g < bppins::GPIO_COUNT; g++) {
    if (!bppins::exists(g) || bppins::isFlash(g) || bppins::isUart(g)) continue;
    if (bppins::mode(g) == BP_IN) continue;
    bppins::release(g);
    if (!first) bpout::ch(',');
    bpout::num(g);
    first = false;
  }
  bpout::ch(']');
  bpout::end();
}

void bpStreamTick() {
  if (!gStreamOn) return;
  const uint32_t now = micros();
  if ((int32_t)(now - gStreamNextUs) < 0) return;
  gStreamNextUs += gStreamPeriodUs;
  // If we fell behind (slow serial), skip ahead instead of bursting frames.
  if ((int32_t)(now - gStreamNextUs) > 0) gStreamNextUs = now + gStreamPeriodUs;

  bpout::raw("{\"stream\":true,\"t\":");
  bpout::unum(millis());
  bpout::raw(",\"pins\":{");
  for (int i = 0; i < gStreamCount; i++) {
    if (i) bpout::ch(',');
    bpout::pinKey(gStreamPins[i]);
    bppins::printState(gStreamPins[i]);
  }
  bpout::raw("}}\n");
}
