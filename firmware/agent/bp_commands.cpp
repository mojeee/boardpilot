#include "bp_commands.h"

#include <Arduino.h>
#include <stdio.h>

#include "bp_config.h"
#include "bp_i2c.h"
#include "bp_json.h"
#include "bp_out.h"
#include "bp_pins.h"
#include "bp_port.h"

using bpjson::getBool;
using bpjson::getDouble;
using bpjson::getLong;
using bpjson::getLongArray;
using bpjson::getLongOrHex;
using bpjson::has;

namespace {

char gMsg[AGENT_MSG_MAX];

// ---------------------------------------------------------------------------
// Argument helpers. On failure they print the error reply and return false.
// `key` arguments are flash strings (BPS("...")).
// ---------------------------------------------------------------------------

int pinForError(long v) { return (v >= 0 && v <= 9999) ? (int)v : -1; }

bool argPin(const BpReq& r, const char* key, bool needOutput, int& pin) {
  long v;
  if (!getLong(r.doc, key, v)) {
    bp_snprintf(gMsg, sizeof(gMsg), "\"" BP_FMT_P "\" must be a " BP_PIN_NOUN " number, for example %d.", key,
                (int)BP_EXAMPLE_SDA);
    bpout::errorRam(r, BPS("bad_args"), gMsg);
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
  const int c = getLongArray(r.doc, BPS("pins"), tmp, AGENT_PIN_LIST_MAX);
  if (c == -2) {
    bp_snprintf(gMsg, sizeof(gMsg), "Too many pins in one request. The limit is %d.", AGENT_PIN_LIST_MAX);
    bpout::errorRam(r, BPS("bad_args"), gMsg);
    return false;
  }
  if (c < 0) {
    bp_snprintf(gMsg, sizeof(gMsg), "\"pins\" must be a list of " BP_PIN_NOUN " numbers, for example [%d,%d].",
                (int)BP_EXAMPLE_SDA, (int)BP_EXAMPLE_SCL);
    bpout::errorRam(r, BPS("bad_args"), gMsg);
    return false;
  }
  if (c == 0 && !allowEmpty) {
    bp_snprintf(gMsg, sizeof(gMsg), "\"pins\" is empty. Give at least one " BP_PIN_NOUN " number.");
    bpout::errorRam(r, BPS("bad_args"), gMsg);
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
    bp_snprintf(gMsg, sizeof(gMsg), "\"" BP_FMT_P "\" must be a whole number from %ld to %ld.", key, lo, hi);
    bpout::errorRam(r, BPS("bad_args"), gMsg);
    return false;
  }
  out = v;
  return true;
}

void analogOnlyError(const BpReq& r, int g) {
  bpout::error(r, BPS("analog_only"),
               BPS("This pin can only measure voltage (it has no digital input). Use the adc command."), g);
}

// ---------------------------------------------------------------------------
// I2C trace
// ---------------------------------------------------------------------------
//
// The trace is rebuilt from the result of each transaction. Both I2C masters
// (the ESP-IDF driver and the bit-banged one in bp_i2c.cpp) check the ACK bit
// after every byte the master writes and stop the transaction on a NACK, so a
// successful transaction means every written byte was ACKed. The master NACKs
// the last byte it reads, which is how the I2C specification ends a read (NXP
// UM10204, section 3.1.6).

bool gFirstStep = true;

void stepSep() {
  if (!gFirstStep) bpout::ch(',');
  gFirstStep = false;
}

void stepStart() {
  stepSep();
  bpout::raw(BPS("{\"t\":\"start\"}"));
}

void stepRestart() {
  stepSep();
  bpout::raw(BPS("{\"t\":\"restart\"}"));
}

void stepStop() {
  stepSep();
  bpout::raw(BPS("{\"t\":\"stop\"}"));
}

void stepAddr(uint8_t addr, bool read, bool ack) {
  stepSep();
  bpout::raw(BPS("{\"t\":\"addr\",\"v\":"));
  bpout::hexByte(addr);
  bpout::raw(read ? BPS(",\"rw\":\"r\"") : BPS(",\"rw\":\"w\""));
  bpout::key(BPS("ack"));
  bpout::boolVal(ack);
  bpout::ch('}');
}

void stepData(uint8_t v, bool write, bool ack) {
  stepSep();
  bpout::raw(BPS("{\"t\":\"data\",\"v\":"));
  bpout::hexByte(v);
  bpout::raw(write ? BPS(",\"dir\":\"w\"") : BPS(",\"dir\":\"r\""));
  bpout::key(BPS("ack"));
  bpout::boolVal(ack);
  bpout::ch('}');
}

void traceBegin() {
  bpout::key(BPS("trace"));
  bpout::ch('[');
  gFirstStep = true;
}

void traceEnd() { bpout::ch(']'); }

bool argI2cBus(const BpReq& r, int& sda, int& scl, uint32_t& hz) {
  // I2C lines are open-drain outputs, so input-only pins are refused.
  if (!argPin(r, BPS("sda"), true, sda)) return false;
  if (!argPin(r, BPS("scl"), true, scl)) return false;
  if (sda == scl) {
    bpout::error(r, BPS("bad_args"), BPS("SDA and SCL must be two different pins."), sda);
    return false;
  }
  long h;
  if (!argLongOpt(r, BPS("hz"), (long)AGENT_I2C_DEFAULT_HZ, (long)AGENT_I2C_MIN_HZ, (long)AGENT_I2C_MAX_HZ, h)) {
    return false;
  }
  hz = (uint32_t)h;
  return true;
}

void i2cClose(int sda, int scl) {
  bpi2c::close();
  bppins::release(sda);
  bppins::release(scl);
}

bool i2cOpen(const BpReq& r, int sda, int scl, uint32_t hz) {
  bppins::release(sda);
  bppins::release(scl);
  if (!bpi2c::open(sda, scl, hz)) {
    i2cClose(sda, scl);
    bpout::error(r, BPS("i2c_init_failed"), BPS("The I2C driver could not start on these pins."));
    return false;
  }
  bppins::markI2c(sda);
  bppins::markI2c(scl);
  return true;
}

void busErrorMsg() {
  bpout::key(BPS("msg"));
  bpout::str(BPS("The I2C bus stopped responding. SDA or SCL may be held low, shorted, or missing pull-up "
                 "resistors."));
}

// ---------------------------------------------------------------------------
// Stream state
// ---------------------------------------------------------------------------

bool gStreamOn = false;
uint8_t gStreamPins[AGENT_STREAM_MAX_PINS];
uint8_t gStreamCount = 0;
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
  bpout::key(BPS("agent"));
  bpout::str(BPS(AGENT_NAME));
  bpout::key(BPS("ver"));
  bpout::str(BPS(AGENT_VER));
  bpout::key(BPS("chip"));
#if defined(BP_ESP32)
  bpout::strRam(ESP.getChipModel());
#else
  bpout::str(BPS(BP_CHIP_NAME));
#endif
  bpout::key(BPS("heapFree"));
  bpout::unum(bpport::heapFree());
  bpout::key(BPS("board"));
  bpout::str(BPS(BP_BOARD_ID));
  bpout::end();
}

void cmdPins(const BpReq& r) {
  bpout::begin(r, true);
  bpout::key(BPS("pins"));
  bpout::ch('{');
  bool first = true;
  for (int i = 0; i < bppins::headerCount(); i++) {
    const int g = bppins::headerPin(i);
    // USB data lines and debug-port pins are left alone entirely.
    if (bppins::isBlocked(g)) continue;
    if (!first) bpout::ch(',');
    first = false;
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
// internal pull-down we confirm by enabling it (ESP32: about 45 kOhm; RP2040,
// STM32 and i.MX RT are in the same 30-100 kOhm range): a real external pull-up
// (typically 1-10 kOhm) still wins and the pin stays HIGH; a floating pin
// drops to LOW. Pins with no usable internal pull-down (ESP32 GPIO 34-39, every
// RP2350 pin because of erratum RP2350-E9, every AVR
// pin) cannot be confirmed; they are listed in "unconfirmed".
void cmdPullupCheck(const BpReq& r) {
  int pins[AGENT_PIN_LIST_MAX];
  int n = 0;
  if (!argPinList(r, false, pins, n)) return;
  for (int i = 0; i < n; i++) {
    if (bppins::isAnalogOnly(pins[i])) {
      analogOnlyError(r, pins[i]);
      return;
    }
  }

  uint8_t level[AGENT_PIN_LIST_MAX];
  bool external[AGENT_PIN_LIST_MAX];
  bool confirmed[AGENT_PIN_LIST_MAX];
  bool anyUnconfirmed = false;
  for (int i = 0; i < n; i++) {
    const int g = pins[i];
    bppins::release(g);  // plain INPUT, no internal pulls
    delay(2);
    const int a = bpRead(g);
    int b = a;
    confirmed[i] = true;
    if (a) {
      if (bppins::hasInternalPulldown(g)) {
#if defined(INPUT_PULLDOWN) || defined(BP_RP2040)
        bpPinMode(g, INPUT_PULLDOWN);
        delay(2);
        b = bpRead(g);
        bpPinMode(g, INPUT);
#endif
      } else {
        confirmed[i] = false;
        anyUnconfirmed = true;
      }
    }
    level[i] = (uint8_t)a;
    external[i] = (a == 1 && b == 1);
  }

  bpout::begin(r, true);
  bpout::key(BPS("external"));
  bpout::ch('{');
  for (int i = 0; i < n; i++) {
    if (i) bpout::ch(',');
    bpout::pinKey(pins[i]);
    bpout::boolVal(external[i]);
  }
  bpout::ch('}');
  bpout::key(BPS("levels"));
  bpout::ch('{');
  for (int i = 0; i < n; i++) {
    if (i) bpout::ch(',');
    bpout::pinKey(pins[i]);
    bpout::num(level[i]);
  }
  bpout::ch('}');
  if (anyUnconfirmed) {
    // HIGH, but no internal pull-down to rule out a floating pin.
    bpout::key(BPS("unconfirmed"));
    bpout::ch('[');
    bool first = true;
    for (int i = 0; i < n; i++) {
      if (confirmed[i]) continue;
      if (!first) bpout::ch(',');
      first = false;
      bpout::num(pins[i]);
    }
    bpout::ch(']');
  }
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
    const uint8_t e = bpi2c::probe((uint8_t)a);
    if (e == bpi2c::OK) {
      found[nFound++] = (uint8_t)a;
    } else if (e != bpi2c::NACK_ADDR) {
      busErr = e;
      busErrAddr = (uint8_t)a;
      break;
    }
  }
  i2cClose(sda, scl);

  bpout::begin(r, busErr == 0);
  if (busErr) {
    bpout::key(BPS("error"));
    bpout::str(BPS("bus_error"));
    busErrorMsg();
    bpout::key(BPS("addr"));
    bpout::hexByte(busErrAddr);
  }
  bpout::key(BPS("found"));
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
  if (!getLongOrHex(r.doc, BPS("addr"), addr) || addr < AGENT_I2C_FIRST_ADDR || addr > AGENT_I2C_LAST_ADDR) {
    bpout::error(r, BPS("bad_args"),
                 BPS("\"addr\" must be a 7-bit I2C address from \"0x08\" to \"0x77\", for example \"0x76\"."));
    return;
  }
  if (!getLongOrHex(r.doc, BPS("reg"), reg) || reg < 0 || reg > 0xFF) {
    bpout::error(r, BPS("bad_args"),
                 BPS("\"reg\" must be a register number from \"0x00\" to \"0xFF\", for example \"0xD0\"."));
    return;
  }
  if (!argLongOpt(r, BPS("len"), 1, 1, AGENT_I2C_READ_MAX, len)) return;

  if (!i2cOpen(r, sda, scl, hz)) return;

  uint8_t data[AGENT_I2C_READ_MAX];
  const size_t got = bpi2c::readReg((uint8_t)addr, (uint8_t)reg, data, (size_t)len);

  if (got == (size_t)len) {
    i2cClose(sda, scl);
    bpout::begin(r, true);
    bpout::key(BPS("data"));
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
  const uint8_t pe = bpi2c::probe((uint8_t)addr);
  i2cClose(sda, scl);

  bpout::begin(r, false);
  if (pe == bpi2c::NACK_ADDR) {
    bp_snprintf(gMsg, sizeof(gMsg),
                "No device answered at address 0x%02lX. Check the wiring, the power and the address.",
                (unsigned long)addr);
    bpout::key(BPS("error"));
    bpout::str(BPS("nack"));
    bpout::key(BPS("msg"));
    bpout::strRam(gMsg);
    bpout::key(BPS("nackAt"));
    bpout::str(BPS("addr"));
  } else if (pe == bpi2c::OK) {
    bpout::key(BPS("error"));
    bpout::str(got > 0 ? BPS("short_read") : BPS("read_failed"));
    bpout::key(BPS("msg"));
    bpout::str(BPS("The device answered its address, but reading the register failed. The register may "
                   "not exist on this device, or the bus is noisy."));
    if (got > 0) {
      bpout::key(BPS("data"));
      bpout::ch('[');
      for (size_t i = 0; i < got; i++) {
        if (i) bpout::ch(',');
        bpout::hexByte(data[i]);
      }
      bpout::ch(']');
    }
  } else {
    bpout::key(BPS("error"));
    bpout::str(BPS("bus_error"));
    busErrorMsg();
  }
  traceBegin();
  if (pe == bpi2c::OK || pe == bpi2c::NACK_ADDR) {
    stepStart();
    stepAddr((uint8_t)addr, false, pe == bpi2c::OK);
    stepStop();
  }
  traceEnd();
  bpout::end();
}

void cmdAdc(const BpReq& r) {
  int g;
  if (!argPin(r, BPS("pin"), false, g)) return;
  if (!bppins::isAdc(g)) {
    bp_snprintf(gMsg, sizeof(gMsg), BP_MSG_NOT_ADC_FMT, g);
    bpout::errorRam(r, BPS("not_adc"), gMsg, g);
    return;
  }
  if (bppins::mode(g) != BP_ADC) bppins::release(g);
  uint32_t mv;
  uint16_t raw;
  bppins::adcRead(g, mv, raw);
  bppins::markAdc(g);

  bpout::begin(r, true);
  bpout::key(BPS("mv"));
  bpout::unum(mv);
  bpout::key(BPS("raw"));
  bpout::unum(raw);
  if (bppins::ADC_NOMINAL) {
    // mv = raw scaled by the nominal full scale; the reference itself was not measured.
    bpout::key(BPS("ref"));
    bpout::str(BPS("nominal"));
    bpout::key(BPS("fullScaleMv"));
    bpout::unum(BP_ADC_MAX_MV);
    bpout::key(BPS("bits"));
    bpout::unum(BP_ADC_BITS);
  }
  bpout::end();
}

void cmdPwm(const BpReq& r) {
  int g;
  if (!argPin(r, BPS("pin"), true, g)) return;

  bool stop = false;
  if (has(r.doc, BPS("stop")) && !getBool(r.doc, BPS("stop"), stop)) {
    bpout::error(r, BPS("bad_args"), BPS("\"stop\" must be true or false."));
    return;
  }
  if (stop) {
    bppins::release(g);
    bpout::ok(r);
    return;
  }

  double duty;
  if (!getDouble(r.doc, BPS("duty"), duty) || duty < 0.0 || duty > 100.0) {
    bpout::error(r, BPS("bad_args"), BPS("\"duty\" must be a percentage from 0 to 100."));
    return;
  }
  long hz;
  if (!argLongOpt(r, BPS("hz"), 5000, (long)AGENT_PWM_MIN_HZ, (long)AGENT_PWM_MAX_HZ, hz)) return;

  uint32_t actual = 0;
  const char* err = bppins::setPwm(g, duty, (uint32_t)hz, actual);
  if (err) {
    if (bp_strcmpP("not_pwm", err) == 0) {
      bpout::error(r, err,
                   BPS("This pin cannot make a PWM signal. Pick a PWM pin (on Arduino boards they are marked ~)."),
                   g);
    } else {
#if defined(BP_ESP32)
      bpout::error(r, err, BPS("The PWM driver could not start with this frequency. Try 1 Hz to 312 kHz."), g);
#else
      bpout::error(r, err, BPS("The PWM driver could not start with this frequency."), g);
#endif
    }
    return;
  }
  bpout::begin(r, true);
  if (actual != (uint32_t)hz) {
    // The hardware runs at a different frequency than asked (fixed on AVR,
    // clamped on RP2040, unknown = 0 on other cores).
    bpout::key(BPS("hz"));
    bpout::unum(actual);
  }
  bpout::end();
}

void cmdGpioWrite(const BpReq& r) {
  int g;
  if (!argPin(r, BPS("pin"), true, g)) return;
  long level;
  bool b;
  if (getBool(r.doc, BPS("level"), b)) {
    level = b ? 1 : 0;
  } else if (!getLong(r.doc, BPS("level"), level) || (level != 0 && level != 1)) {
    bpout::error(r, BPS("bad_args"), BPS("\"level\" must be 0 (LOW) or 1 (HIGH)."));
    return;
  }
  bppins::setOutput(g, (uint8_t)level);
  bpout::ok(r);
}

void cmdGpioRead(const BpReq& r) {
  int g;
  if (!argPin(r, BPS("pin"), false, g)) return;
  if (bppins::isAnalogOnly(g)) {
    analogOnlyError(r, g);
    return;
  }
  const BpMode m = bppins::mode(g);
  if (m == BP_PWM || m == BP_I2C) {
    bpout::error(r, BPS("pin_busy"),
                 BPS("This pin is producing a PWM signal. Stop it first (pwm with \"stop\":true) or send reset_pins."),
                 g);
    return;
  }
  const int level = bppins::readLevel(g);
  bpout::begin(r, true);
  bpout::key(BPS("pin"));
  bpout::num(g);
  bpout::key(BPS("level"));
  bpout::num(level);
  bpout::end();
}

void cmdStream(const BpReq& r) {
  int pins[AGENT_PIN_LIST_MAX];
  int n = 0;
  if (!argPinList(r, true, pins, n)) return;
  long hz;
  // "hz" defaults to 20 when missing; 0 stops the stream.
  if (!argLongOpt(r, BPS("hz"), 20, 0, AGENT_STREAM_MAX_HZ, hz)) return;

  if (n == 0 || hz == 0) {
    streamStop();
    bpout::ok(r);
    return;
  }
  if (hz < AGENT_STREAM_MIN_HZ) hz = AGENT_STREAM_MIN_HZ;

  gStreamCount = (uint8_t)(n > AGENT_STREAM_MAX_PINS ? AGENT_STREAM_MAX_PINS : n);
  for (int i = 0; i < gStreamCount; i++) gStreamPins[i] = (uint8_t)pins[i];
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
  bpout::key(BPS("released"));
  bpout::ch('[');
  bool first = true;
  for (int g = 0; g < bppins::PIN_SLOTS; g++) {
    if (!bppins::isUsable(g) || bppins::isAnalogOnly(g)) continue;
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

  bpout::raw(BPS("{\"stream\":true,\"t\":"));
  bpout::unum(millis());
  bpout::raw(BPS(",\"pins\":{"));
  for (int i = 0; i < gStreamCount; i++) {
    if (i) bpout::ch(',');
    bpout::pinKey(gStreamPins[i]);
    bppins::printState(gStreamPins[i]);
  }
  bpout::raw(BPS("}}\n"));
}
