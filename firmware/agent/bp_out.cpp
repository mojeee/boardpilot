#include "bp_out.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

#include "bp_req.h"

namespace bpout {

void raw(const char* s) { Serial.print(s); }

void ch(char c) { Serial.write((uint8_t)c); }

void num(long v) { Serial.print(v); }

void unum(unsigned long v) { Serial.print(v); }

void dec(double v) {
  if (!isfinite(v)) {
    raw("null");
    return;
  }
  if (v == floor(v) && fabs(v) < 2147483647.0) {
    Serial.print((long)v);
    return;
  }
  char buf[24];
  snprintf(buf, sizeof(buf), "%.3f", v);
  // Trim trailing zeros ("62.500" -> "62.5").
  char* e = buf + strlen(buf) - 1;
  while (e > buf && *e == '0') *e-- = '\0';
  if (*e == '.') *e = '\0';
  raw(buf);
}

void str(const char* s) {
  ch('"');
  if (s) {
    for (; *s; ++s) {
      const char c = *s;
      switch (c) {
        case '"': raw("\\\""); break;
        case '\\': raw("\\\\"); break;
        case '\n': raw("\\n"); break;
        case '\r': raw("\\r"); break;
        case '\t': raw("\\t"); break;
        default:
          if ((uint8_t)c < 0x20) {
            char b[8];
            snprintf(b, sizeof(b), "\\u%04x", (unsigned)(uint8_t)c);
            raw(b);
          } else {
            ch(c);
          }
      }
    }
  }
  ch('"');
}

void hexByte(uint8_t v) {
  char b[8];
  snprintf(b, sizeof(b), "\"0x%02X\"", (unsigned)v);
  raw(b);
}

void boolVal(bool b) { raw(b ? "true" : "false"); }

void key(const char* k) {
  ch(',');
  str(k);
  ch(':');
}

void pinKey(int gpio) {
  ch('"');
  num(gpio);
  raw("\":");
}

void begin(const BpReq& r, bool okFlag) {
  raw("{\"id\":");
  if (r.hasId) {
    num(r.id);
  } else {
    raw("null");
  }
  raw(",\"ok\":");
  boolVal(okFlag);
}

void end() { raw("}\n"); }

void error(const BpReq& r, const char* code, const char* msg, int pin) {
  begin(r, false);
  key("error");
  str(code);
  key("msg");
  str(msg);
  if (pin >= 0) {
    key("pin");
    num(pin);
  }
  end();
}

void errorNoId(const char* code, const char* msg) {
  BpReq r;
  r.hasId = false;
  r.id = 0;
  error(r, code, msg);
}

void ok(const BpReq& r) {
  begin(r, true);
  end();
}

}  // namespace bpout
