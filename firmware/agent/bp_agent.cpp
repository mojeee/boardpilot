#include "bp_agent.h"

#include <Arduino.h>
#include <stdio.h>
#include <string.h>

#include "bp_port.h"

#if defined(BP_NRF52) && defined(USE_TINYUSB)
// Adafruit nRF52 core: the USB stack (and its Serial object, which the core's
// serialEvent code references) comes from this bundled library.
#include <Adafruit_TinyUSB.h>
#endif

#if defined(BP_ESP32)
#include "driver/gpio.h"
#include "esp_log.h"
#include "soc/gpio_reg.h"
#include "soc/soc.h"
#endif

#include "bp_commands.h"
#include "bp_config.h"
#include "bp_json.h"
#include "bp_out.h"
#include "bp_pins.h"
#include "bp_req.h"

// ---------------------------------------------------------------------------
// Strapping pins (bp_board.h: BP_STRAP_PINS; none on non-ESP boards)
// ---------------------------------------------------------------------------
//
// ESP32 Series Datasheet, section 2.4 "Strapping Pins": GPIO 0, 2, 5, 12 (MTDI)
// and 15 (MTDO) are sampled by the chip at reset and select the boot mode,
// the flash voltage (GPIO 12: HIGH selects 1.8 V, which stops a 3.3 V-flash
// module from booting), and debug-output behaviour. (ESP32-S3: GPIO 0, 3, 45,
// 46; ESP32-C3: GPIO 2, 8, 9, from their datasheets' "Strapping Pins" sections.)
//
// The chip latches these levels at the moment of reset, before this code
// runs. Reading the pins right after boot (before any pin is configured,
// with the default reset pulls still active) is a best effort: it shows what
// is connected to the pins now, which is normally what the chip saw at reset.
//
// On the ESP32 we also report the raw GPIO_STRAP_REG value, which holds the
// levels the chip actually latched (ESP32 Technical Reference Manual, IO_MUX
// and GPIO Matrix chapter, register GPIO_STRAP_REG; the ROM prints the same
// value as "boot:0x.." on reset). The app decodes it; the agent does not guess.

#if BP_STRAP_COUNT > 0
static const uint8_t kStrapPins[] = BP_STRAP_PINS;
static const size_t kStrapCount = sizeof(kStrapPins) / sizeof(kStrapPins[0]);
static uint8_t gStrapLevel[kStrapCount];
#endif
static uint32_t gStrapReg = 0;
static bool gHaveStrapReg = false;

static void captureStrapping() {
#if BP_STRAP_COUNT > 0
  for (size_t i = 0; i < kStrapCount; i++) {
#if defined(BP_ESP32)
    const gpio_num_t g = (gpio_num_t)kStrapPins[i];
    // Enables the input buffer only; pulls and pin function stay as reset
    // left them, and no output is driven.
    gpio_set_direction(g, GPIO_MODE_INPUT);
    gStrapLevel[i] = gpio_get_level(g) ? 1 : 0;
#else
    bpPinMode(kStrapPins[i], INPUT);
    gStrapLevel[i] = (uint8_t)bpRead(kStrapPins[i]);
#endif
  }
#endif
#if defined(CONFIG_IDF_TARGET_ESP32) && defined(GPIO_STRAP_REG) && defined(REG_READ)
  gStrapReg = REG_READ(GPIO_STRAP_REG);
  gHaveStrapReg = true;
#endif
}

void bpPrintStrappingFields() {
  bpout::raw(BPS("\"strapping\":{"));
#if BP_STRAP_COUNT > 0
  for (size_t i = 0; i < kStrapCount; i++) {
    if (i) bpout::ch(',');
    bpout::pinKey(kStrapPins[i]);
    bpout::num(gStrapLevel[i]);
  }
#endif
  bpout::ch('}');
  if (gHaveStrapReg) {
    char b[16];
    bp_snprintf(b, sizeof(b), "0x%02lX", (unsigned long)(gStrapReg & 0xFF));
    bpout::key(BPS("strapReg"));
    bpout::strRam(b);
  }
}

// ---------------------------------------------------------------------------
// Request line handling
// ---------------------------------------------------------------------------

namespace {

char gLine[AGENT_LINE_MAX];
size_t gLen = 0;
bool gOverflow = false;
BpReq gReq;  // static: keeps the field table off the loop stack

bool isBlank(const char* s, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (s[i] != ' ' && s[i] != '\t') return false;
  }
  return true;
}

// Command names live in flash (on AVR a RAM table of names would cost ~100 bytes).
#define BP_CMD(name, fn)                   \
  if (bp_strcmpP(cmd, BPS(name)) == 0) {   \
    fn(gReq);                              \
    return true;                           \
  }

bool dispatch(const char* cmd) {
  BP_CMD("hello", cmdHello)
  BP_CMD("pins", cmdPins)
  BP_CMD("strapping", cmdStrapping)
  BP_CMD("pullup_check", cmdPullupCheck)
  BP_CMD("i2c_scan", cmdI2cScan)
  BP_CMD("i2c_read", cmdI2cRead)
  BP_CMD("adc", cmdAdc)
  BP_CMD("pwm", cmdPwm)
  BP_CMD("gpio_write", cmdGpioWrite)
  BP_CMD("gpio_read", cmdGpioRead)
  BP_CMD("stream", cmdStream)
  BP_CMD("stream_stop", cmdStreamStop)
  BP_CMD("reset_pins", cmdResetPins)
  return false;
}

void handleLine(const char* line, size_t len) {
  if (isBlank(line, len)) return;

  const char* err = nullptr;
  if (!bpjson::parse(line, len, gReq.doc, &err)) {
    bpout::errorNoId(BPS("bad_json"), err ? err : BPS("The request is not valid JSON."));
    return;
  }

  gReq.hasId = false;
  gReq.id = 0;
  const bpjson::Field* idf = bpjson::find(gReq.doc, BPS("id"));
  if (idf && idf->type != bpjson::T_NULL) {
    long id;
    if (!bpjson::getLong(gReq.doc, BPS("id"), id)) {
      bpout::errorNoId(BPS("bad_args"), BPS("\"id\" must be a whole number."));
      return;
    }
    gReq.hasId = true;
    gReq.id = id;
  }

  const bpjson::Field* cf = bpjson::find(gReq.doc, BPS("cmd"));
  if (!cf) {
    bpout::error(gReq, BPS("bad_args"), BPS("The request has no \"cmd\". Example: {\"id\":1,\"cmd\":\"hello\"}"));
    return;
  }
  if (cf->type != bpjson::T_STRING) {
    bpout::error(gReq, BPS("bad_args"), BPS("\"cmd\" must be text, for example \"hello\"."));
    return;
  }
  char cmd[24];
  if (bpjson::getString(gReq.doc, BPS("cmd"), cmd, sizeof(cmd)) && dispatch(cmd)) return;
  bpout::error(gReq, BPS("unknown_cmd"),
               BPS("The agent does not know this command. Known commands: hello, pins, strapping, "
                   "pullup_check, i2c_scan, i2c_read, adc, pwm, gpio_write, gpio_read, stream, "
                   "stream_stop, reset_pins."));
}

void pollSerial() {
  // Bounded so a flood of input cannot starve the stream timer.
  int budget = 2 * AGENT_LINE_MAX;
  while (budget-- > 0 && BpSerial.available() > 0) {
    const int c = BpSerial.read();
    if (c < 0) break;
    if (c == '\n') {
      if (gOverflow) {
        bpout::errorNoId(BPS("too_long"), BPS("The request line is longer than " AGENT_LINE_MAX_TEXT " characters."));
      } else if (gLen > 0) {
        gLine[gLen] = '\0';
        handleLine(gLine, gLen);
      }
      gLen = 0;
      gOverflow = false;
    } else if (c == '\r') {
      // Accept CRLF line endings.
    } else if (gOverflow) {
      // Drop the rest of an over-long line.
    } else if (gLen < AGENT_LINE_MAX - 1) {
      gLine[gLen++] = (char)c;
    } else {
      gOverflow = true;
    }
  }
}

void printBootEvent() {
  // The ROM bootloader (ESP32) prints plain text at reset. Start on a fresh
  // line so the boot event is always a clean JSON line.
  bpout::raw(BPS("\n{\"event\":\"boot\",\"agent\":"));
  bpout::str(BPS(AGENT_NAME));
  bpout::raw(BPS(",\"ver\":"));
  bpout::str(BPS(AGENT_VER));
  bpout::key(BPS("board"));
  bpout::str(BPS(BP_BOARD_ID));
#if BP_STRAP_COUNT > 0
  bpout::ch(',');
  bpPrintStrappingFields();
#endif
  bpout::raw(BPS("}\n"));
}

#if defined(BP_SERIAL_USB)
bool gHostWasConnected = false;
#endif

}  // namespace

// ---------------------------------------------------------------------------
// Arduino entry points
// ---------------------------------------------------------------------------

void agentSetup() {
  // Must run before anything configures a pin (Serial.begin only touches
  // the UART pins, but keep the order strict anyway).
  captureStrapping();

#if defined(BP_ESP32)
  BpSerial.setRxBufferSize(AGENT_SERIAL_RX_BUF);
  BpSerial.setTxBufferSize(AGENT_SERIAL_TX_BUF);
#endif
  BpSerial.begin(AGENT_BAUD);

#if defined(BP_ESP32)
  // Driver log lines on UART0 would corrupt the JSON protocol.
  esp_log_level_set("*", ESP_LOG_NONE);
#endif

  bppins::init();

#if defined(BP_SERIAL_USB)
  // Native USB: nothing is listening yet. The boot event is sent when a host
  // opens the port (agentLoop).
#else
  printBootEvent();
#endif
}

void agentLoop() {
#if defined(BP_SERIAL_USB)
  // On a native USB port the host opens the port after boot, so send the boot
  // event each time a host connects (DTR raised). It still describes this boot.
  const bool connected = (bool)BpSerial;
  if (connected && !gHostWasConnected) printBootEvent();
  gHostWasConnected = connected;
#endif
  pollSerial();
  bpStreamTick();
}
