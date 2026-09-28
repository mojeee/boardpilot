#include "bp_out.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

#include "bp_port.h"
#include "bp_req.h"

namespace bpout {

namespace {

void escChar(char c) {
  switch (c) {
    case '"': BpSerial.print('\\'); BpSerial.print('"'); break;
    case '\\': BpSerial.print('\\'); BpSerial.print('\\'); break;
    case '\n': BpSerial.print('\\'); BpSerial.print('n'); break;
    case '\r': BpSerial.print('\\'); BpSerial.print('r'); break;
    case '\t': BpSerial.print('\\'); BpSerial.print('t'); break;
    default:
      if ((uint8_t)c < 0x20) {
        char b[8];
        bp_snprintf(b, sizeof(b), "\\u%04x", (unsigned)(uint8_t)c);
        BpSerial.print(b);
      } else {
        BpSerial.write((uint8_t)c);
      }
  }
}

}  // namespace

void raw(const char* s) {
#if defined(BP_AVR)
  BpSerial.print((const __FlashStringHelper*)s);
#else
  BpSerial.print(s);
#endif
}

void rawRam(const char* s) { BpSerial.print(s); }

void ch(char c) { BpSerial.write((uint8_t)c); }

void num(long v) { BpSerial.print(v); }

void unum(unsigned long v) { BpSerial.print(v); }

void dec(double v) {
  if (!isfinite(v)) {
    raw(BPS("null"));
    return;
  }
  if (v == floor(v) && fabs(v) < 2147483647.0) {
    BpSerial.print((long)v);
    return;
  }
  // Three decimals, trailing zeros trimmed ("62.500" -> "62.5"). Written by hand because the
  // AVR printf has no %f.
  if (v < 0) {
    ch('-');
    v = -v;
  }
  unsigned long ip = (unsigned long)v;
  unsigned long frac = (unsigned long)lround((v - (double)ip) * 1000.0);
  if (frac >= 1000) {
    ip++;
    frac -= 1000;
  }
  BpSerial.print(ip);
  if (frac == 0) return;
  char d[4] = {(char)('0' + frac / 100), (char)('0' + (frac / 10) % 10), (char)('0' + frac % 10), 0};
  for (int i = 2; i > 0 && d[i] == '0'; i--) d[i] = 0;
  ch('.');
  BpSerial.print(d);
}

void str(const char* s) {
  ch('"');
  if (s) {
    for (;; ++s) {
      const char c = (char)bp_rd8(s);
      if (!c) break;
      escChar(c);
    }
  }
  ch('"');
}

void strRam(const char* s) {
  ch('"');
  if (s) {
    for (; *s; ++s) escChar(*s);
  }
  ch('"');
}

void hexByte(uint8_t v) {
  char b[8];
  bp_snprintf(b, sizeof(b), "\"0x%02X\"", (unsigned)v);
  BpSerial.print(b);
}

void boolVal(bool b) { raw(b ? BPS("true") : BPS("false")); }

void key(const char* k) {
  ch(',');
  str(k);
  ch(':');
}

void pinKey(int gpio) {
  ch('"');
  num(gpio);
  ch('"');
  ch(':');
}

static void beginId(bool hasId, long id, bool okFlag) {
  raw(BPS("{\"id\":"));
  if (hasId) {
    num(id);
  } else {
    raw(BPS("null"));
  }
  raw(BPS(",\"ok\":"));
  boolVal(okFlag);
}

void begin(const BpReq& r, bool okFlag) { beginId(r.hasId, r.id, okFlag); }

void end() { raw(BPS("}\n")); }

static void errorImpl(bool hasId, long id, const char* code, const char* msg, bool msgInRam, int pin) {
  beginId(hasId, id, false);
  key(BPS("error"));
  str(code);
  key(BPS("msg"));
  if (msgInRam) {
    strRam(msg);
  } else {
    str(msg);
  }
  if (pin >= 0) {
    key(BPS("pin"));
    num(pin);
  }
  end();
}

void error(const BpReq& r, const char* code, const char* msg, int pin) {
  errorImpl(r.hasId, r.id, code, msg, false, pin);
}

void errorRam(const BpReq& r, const char* code, const char* msg, int pin) {
  errorImpl(r.hasId, r.id, code, msg, true, pin);
}

void errorNoId(const char* code, const char* msg) { errorImpl(false, 0, code, msg, false, -1); }

void ok(const BpReq& r) {
  begin(r, true);
  end();
}

}  // namespace bpout
