#include "bp_agent.h"

#include <Arduino.h>
#include <stdio.h>
#include <string.h>

#include "driver/gpio.h"
#include "esp_log.h"
#include "soc/soc.h"
#include "soc/gpio_reg.h"

#include "bp_commands.h"
#include "bp_config.h"
#include "bp_json.h"
#include "bp_out.h"
#include "bp_pins.h"
#include "bp_req.h"

// ---------------------------------------------------------------------------
// Strapping pins
// ---------------------------------------------------------------------------
//
// ESP32 Series Datasheet, section 2.4 "Strapping Pins": GPIO 0, 2, 5, 12 (MTDI)
// and 15 (MTDO) are sampled by the chip at reset and select the boot mode,
// the flash voltage (GPIO 12: HIGH selects 1.8 V, which stops a 3.3 V-flash
// module from booting), and debug-output behaviour.
//
// The chip latches these levels at the moment of reset, before this code
// runs. Reading the pins right after boot (before any pin is configured,
// with the default reset pulls still active) is a best effort: it shows what
// is connected to the pins now, which is normally what the chip saw at reset.
//
// We also report the raw GPIO_STRAP_REG value, which holds the levels the
// chip actually latched (ESP32 Technical Reference Manual, IO_MUX and GPIO
// Matrix chapter, register GPIO_STRAP_REG; the ROM prints the same value as
// "boot:0x.." on reset). The app decodes it; the agent does not guess.

static const uint8_t kStrapPins[] = {0, 2, 5, 12, 15};
static const size_t kStrapCount = sizeof(kStrapPins) / sizeof(kStrapPins[0]);
static uint8_t gStrapLevel[kStrapCount];
static uint32_t gStrapReg = 0;
static bool gHaveStrapReg = false;

static void captureStrapping() {
  for (size_t i = 0; i < kStrapCount; i++) {
    const gpio_num_t g = (gpio_num_t)kStrapPins[i];
    // Enables the input buffer only; pulls and pin function stay as reset
    // left them, and no output is driven.
    gpio_set_direction(g, GPIO_MODE_INPUT);
    gStrapLevel[i] = gpio_get_level(g) ? 1 : 0;
  }
#if defined(CONFIG_IDF_TARGET_ESP32) && defined(GPIO_STRAP_REG) && defined(REG_READ)
  gStrapReg = REG_READ(GPIO_STRAP_REG);
  gHaveStrapReg = true;
#endif
}

void bpPrintStrappingFields() {
  bpout::raw("\"strapping\":{");
  for (size_t i = 0; i < kStrapCount; i++) {
    if (i) bpout::ch(',');
    bpout::pinKey(kStrapPins[i]);
    bpout::num(gStrapLevel[i]);
  }
  bpout::ch('}');
  if (gHaveStrapReg) {
    char b[16];
    snprintf(b, sizeof(b), "0x%02lX", (unsigned long)(gStrapReg & 0xFF));
    bpout::key("strapReg");
    bpout::str(b);
  }
}

// ---------------------------------------------------------------------------
// Request line handling
// ---------------------------------------------------------------------------

namespace {

struct CmdEntry {
  const char* name;
  void (*fn)(const BpReq&);
};

const CmdEntry kCommands[] = {
    {"hello", cmdHello},
    {"pins", cmdPins},
    {"strapping", cmdStrapping},
    {"pullup_check", cmdPullupCheck},
    {"i2c_scan", cmdI2cScan},
    {"i2c_read", cmdI2cRead},
    {"adc", cmdAdc},
    {"pwm", cmdPwm},
    {"gpio_write", cmdGpioWrite},
    {"gpio_read", cmdGpioRead},
    {"stream", cmdStream},
    {"stream_stop", cmdStreamStop},
    {"reset_pins", cmdResetPins},
};

char gLine[AGENT_LINE_MAX];
size_t gLen = 0;
bool gOverflow = false;
BpReq gReq;  // static: keeps the ~260-byte field table off the loop stack

bool isBlank(const char* s, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (s[i] != ' ' && s[i] != '\t') return false;
  }
  return true;
}

void handleLine(const char* line, size_t len) {
  if (isBlank(line, len)) return;

  const char* err = nullptr;
  if (!bpjson::parse(line, len, gReq.doc, &err)) {
    bpout::errorNoId("bad_json", err ? err : "The request is not valid JSON.");
    return;
  }

  gReq.hasId = false;
  gReq.id = 0;
  const bpjson::Field* idf = bpjson::find(gReq.doc, "id");
  if (idf && idf->type != bpjson::T_NULL) {
    long id;
    if (!bpjson::getLong(gReq.doc, "id", id)) {
      bpout::errorNoId("bad_args", "\"id\" must be a whole number.");
      return;
    }
    gReq.hasId = true;
    gReq.id = id;
  }

  const bpjson::Field* cf = bpjson::find(gReq.doc, "cmd");
  if (!cf) {
    bpout::error(gReq, "bad_args", "The request has no \"cmd\". Example: {\"id\":1,\"cmd\":\"hello\"}");
    return;
  }
  if (cf->type != bpjson::T_STRING) {
    bpout::error(gReq, "bad_args", "\"cmd\" must be text, for example \"hello\".");
    return;
  }
  char cmd[24];
  if (bpjson::getString(gReq.doc, "cmd", cmd, sizeof(cmd))) {
    for (size_t i = 0; i < sizeof(kCommands) / sizeof(kCommands[0]); i++) {
      if (strcmp(cmd, kCommands[i].name) == 0) {
        kCommands[i].fn(gReq);
        return;
      }
    }
  }
  bpout::error(gReq, "unknown_cmd",
               "The agent does not know this command. Known commands: hello, pins, strapping, "
               "pullup_check, i2c_scan, i2c_read, adc, pwm, gpio_write, gpio_read, stream, "
               "stream_stop, reset_pins.");
}

void pollSerial() {
  // Bounded so a flood of input cannot starve the stream timer.
  int budget = 2 * AGENT_LINE_MAX;
  while (budget-- > 0 && Serial.available() > 0) {
    const int c = Serial.read();
    if (c < 0) break;
    if (c == '\n') {
      if (gOverflow) {
        bpout::errorNoId("too_long", "The request line is longer than 511 characters.");
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

}  // namespace

// ---------------------------------------------------------------------------
// Arduino entry points
// ---------------------------------------------------------------------------

void agentSetup() {
  // Must run before anything configures a pin (Serial.begin only touches
  // GPIO 1 and 3, but keep the order strict anyway).
  captureStrapping();

  Serial.setRxBufferSize(AGENT_SERIAL_RX_BUF);
  Serial.setTxBufferSize(AGENT_SERIAL_TX_BUF);
  Serial.begin(AGENT_BAUD);

  // Driver log lines on UART0 would corrupt the JSON protocol.
  esp_log_level_set("*", ESP_LOG_NONE);

  bppins::init();

  // The ROM bootloader prints plain text at reset. Start on a fresh line so
  // the boot event is always a clean JSON line.
  bpout::raw("\n{\"event\":\"boot\",\"agent\":");
  bpout::str(AGENT_NAME);
  bpout::raw(",\"ver\":");
  bpout::str(AGENT_VER);
  bpout::ch(',');
  bpPrintStrappingFields();
  bpout::raw("}\n");
}

void agentLoop() {
  pollSerial();
  bpStreamTick();
}
