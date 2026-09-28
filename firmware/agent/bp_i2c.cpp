#include "bp_i2c.h"

#include "bp_config.h"
#include "bp_port.h"

#if !defined(BP_I2C_BITBANG)
// ---------------------------------------------------------------------------
// ESP32: Wire (ESP-IDF I2C master driver, routed to any GPIO pair through the
// GPIO matrix).
// ---------------------------------------------------------------------------
#include <Wire.h>

namespace bpi2c {

bool open(int sda, int scl, uint32_t hz) {
  if (!Wire.begin((int)sda, (int)scl, (uint32_t)hz)) {
    Wire.end();
    return false;
  }
  Wire.setTimeOut(AGENT_I2C_TIMEOUT_MS);
  return true;
}

void close() { Wire.end(); }

uint8_t probe(uint8_t addr) {
  Wire.beginTransmission(addr);
  // 0 = ACK, 2 = NACK, 4 = other error, 5 = timeout (core 3.x Wire).
  return Wire.endTransmission(true);
}

size_t readReg(uint8_t addr, uint8_t reg, uint8_t* data, size_t len) {
  size_t got = 0;
  Wire.beginTransmission(addr);
  Wire.write(reg);
  // sendStop=false: core 3.x holds the register write and sends it together
  // with the read as write + repeated START + read.
  const uint8_t we = Wire.endTransmission(false);
  if (we == 0) {
    // (uint8_t, uint8_t, uint8_t) is the overload every core version has
    // (the same call Adafruit_BusIO makes), so there is no overload ambiguity.
    got = Wire.requestFrom(addr, (uint8_t)len, (uint8_t)1);
    if (got > len) got = len;
    for (size_t i = 0; i < got; i++) {
      const int c = Wire.read();
      if (c < 0) {
        got = i;
        break;
      }
      data[i] = (uint8_t)c;
    }
  }
  return got;
}

}  // namespace bpi2c

#else
// ---------------------------------------------------------------------------
// Bit-banged open-drain I2C master.
//
// Open drain (NXP UM10204 "I2C-bus specification", section 3.1.1): a line is
// either pulled LOW by a device or released and pulled HIGH by a resistor. The
// agent drives LOW with pinMode(OUTPUT) + LOW and releases with pinMode(INPUT)
// with no internal pull-up, so the bus only works when real pull-up resistors
// are present. That is deliberate: the result honestly shows the wiring.
//
// Timing: half a clock period per phase, from "hz"; the pinMode() calls add a
// few microseconds on slow cores, so the real clock is a bit slower than asked
// (typically 50-100 kHz for 100000).
// Clock stretching (UM10204 section 3.1.9) is honoured with a timeout.
// A slave holding SDA LOW is freed with up to nine clocks (section 3.1.16).
// ---------------------------------------------------------------------------

namespace bpi2c {

namespace {

int gSda = -1;
int gScl = -1;
uint16_t gHalfUs = 5;
uint8_t gErr = OK;

const uint32_t kStretchTimeoutUs = (uint32_t)AGENT_I2C_TIMEOUT_MS * 1000UL;

inline void half() { delayMicroseconds(gHalfUs); }

inline void sdaLow() {
  bpPinMode(gSda, OUTPUT);
  bpWrite(gSda, LOW);
}

inline void sdaRelease() { bpPinMode(gSda, INPUT); }

inline void sclLow() {
  bpPinMode(gScl, OUTPUT);
  bpWrite(gScl, LOW);
}

// Releases SCL and waits until it is really HIGH (a slave may stretch the clock).
bool sclRelease() {
  bpPinMode(gScl, INPUT);
  const uint32_t t0 = micros();
  while (!bpRead(gScl)) {
    if ((uint32_t)(micros() - t0) > kStretchTimeoutUs) {
      gErr = TIMEOUT;
      return false;
    }
  }
  return true;
}

void releaseAll() {
  sdaRelease();
  bpPinMode(gScl, INPUT);
}

bool writeBit(bool b) {
  if (b) {
    sdaRelease();
  } else {
    sdaLow();
  }
  half();
  if (!sclRelease()) return false;
  // We released SDA but it reads LOW while SCL is HIGH: something else holds
  // the line (a stuck slave, a short, or a missing pull-up).
  if (b && !bpRead(gSda)) {
    gErr = BUS_ERROR;
    return false;
  }
  half();
  sclLow();
  return true;
}

bool readBit(bool& b) {
  sdaRelease();
  half();
  if (!sclRelease()) return false;
  b = bpRead(gSda) != 0;
  half();
  sclLow();
  return true;
}

// ack is true when the receiver pulled SDA LOW in the ninth clock.
bool writeByte(uint8_t v, bool& ack) {
  for (int i = 7; i >= 0; i--) {
    if (!writeBit((v >> i) & 1)) return false;
  }
  bool nack;
  if (!readBit(nack)) return false;
  ack = !nack;
  return true;
}

// ack: the master ACKs every byte but the last one (UM10204 section 3.1.6).
bool readByte(uint8_t& v, bool ack) {
  v = 0;
  for (int i = 0; i < 8; i++) {
    bool b;
    if (!readBit(b)) return false;
    v = (uint8_t)((v << 1) | (b ? 1 : 0));
  }
  return writeBit(!ack);
}

// START: SDA falls while SCL is HIGH (UM10204 section 3.1.4).
bool start() {
  sdaRelease();
  if (!sclRelease()) return false;
  half();
  if (!bpRead(gSda)) {
    // SDA held LOW: clock up to nine times so a slave that was cut off mid-byte
    // can finish and release it (UM10204 section 3.1.16 "Bus clear").
    for (int i = 0; i < 9 && !bpRead(gSda); i++) {
      sclLow();
      half();
      if (!sclRelease()) return false;
      half();
    }
    if (!bpRead(gSda)) {
      gErr = BUS_ERROR;
      return false;
    }
  }
  sdaLow();
  half();
  sclLow();
  half();
  return true;
}

// Repeated START, called with SCL LOW.
bool restart() {
  sdaRelease();
  half();
  if (!sclRelease()) return false;
  if (!bpRead(gSda)) {
    gErr = BUS_ERROR;
    return false;
  }
  half();
  sdaLow();
  half();
  sclLow();
  half();
  return true;
}

// STOP: SDA rises while SCL is HIGH. Called with SCL LOW.
bool stop() {
  sdaLow();
  half();
  if (!sclRelease()) return false;
  half();
  sdaRelease();
  half();
  if (!bpRead(gSda)) {
    gErr = BUS_ERROR;
    return false;
  }
  return true;
}

}  // namespace

bool open(int sda, int scl, uint32_t hz) {
  gSda = sda;
  gScl = scl;
  uint32_t h = 500000UL / (hz ? hz : 1);
  if (h < 1) h = 1;
  if (h > 500) h = 500;
  gHalfUs = (uint16_t)h;
  // Output latches LOW, then both lines released.
  bpWrite(sda, LOW);
  bpWrite(scl, LOW);
  releaseAll();
  return true;
}

void close() {
  if (gSda >= 0) releaseAll();
  gSda = gScl = -1;
}

uint8_t probe(uint8_t addr) {
  gErr = OK;
  bool ack = false;
  if (!start() || !writeByte((uint8_t)(addr << 1), ack) || !stop()) {
    releaseAll();
    return gErr ? gErr : BUS_ERROR;
  }
  return ack ? OK : NACK_ADDR;
}

size_t readReg(uint8_t addr, uint8_t reg, uint8_t* data, size_t len) {
  gErr = OK;
  bool ack = false;
  if (!start()) {
    releaseAll();
    return 0;
  }
  if (!writeByte((uint8_t)(addr << 1), ack)) {
    releaseAll();
    return 0;
  }
  if (ack && !writeByte(reg, ack)) {
    releaseAll();
    return 0;
  }
  if (ack && (!restart() || !writeByte((uint8_t)((addr << 1) | 1), ack))) {
    releaseAll();
    return 0;
  }
  if (!ack) {
    if (!stop()) releaseAll();
    return 0;
  }
  size_t got = 0;
  for (; got < len; got++) {
    if (!readByte(data[got], got + 1 < len)) {
      releaseAll();
      return got;
    }
  }
  if (!stop()) releaseAll();
  return got;
}

}  // namespace bpi2c

#endif
