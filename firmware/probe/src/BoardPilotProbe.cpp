#include "BoardPilotProbe.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

BoardPilotProbe::BoardPilotProbe(Print& out)
    : _out(out), _n(0), _interval(100), _last(0), _memEnabled(true) {}

void BoardPilotProbe::begin(uint32_t intervalMs) {
  setInterval(intervalMs);
  _n = 0;
  _last = millis();
}

void BoardPilotProbe::setInterval(uint32_t intervalMs) { _interval = intervalMs ? intervalMs : 1; }

void BoardPilotProbe::setMemoryEnabled(bool on) { _memEnabled = on; }

bool BoardPilotProbe::value(const char* name, float v, int pin) {
  if (!name || !name[0] || strlen(name) >= kNameMax) return false;
  for (uint8_t i = 0; i < _n; i++) {
    if (strcmp(_e[i].name, name) == 0) {
      _e[i].v = v;  // latest value wins
      if (pin >= 0) _e[i].pin = (int16_t)pin;
      return true;
    }
  }
  if (_n >= kMaxValues) return false;
  Entry& e = _e[_n++];
  strncpy(e.name, name, kNameMax - 1);
  e.name[kNameMax - 1] = '\0';
  e.v = v;
  e.pin = (int16_t)(pin >= 0 ? pin : -1);
  return true;
}

void BoardPilotProbe::printName(const char* s) {
  _out.print('"');
  for (; *s; ++s) {
    const char c = *s;
    if (c == '"' || c == '\\') {
      _out.print('\\');
      _out.print(c);
    } else if ((uint8_t)c < 0x20) {
      _out.print(' ');  // keep the line valid JSON and on one line
    } else {
      _out.print(c);
    }
  }
  _out.print('"');
}

void BoardPilotProbe::printNumber(float v) {
  if (isnan(v) || isinf(v)) {
    _out.print("null");  // JSON has no NaN or Infinity
    return;
  }
  char buf[24];
  snprintf(buf, sizeof(buf), "%.7g", (double)v);
  _out.print(buf);
}

void BoardPilotProbe::send() {
  if (_n == 0) return;
  _out.print("@bp {\"t\":");
  _out.print((unsigned long)millis());
  _out.print(",\"v\":{");
  bool anyPin = false;
  for (uint8_t i = 0; i < _n; i++) {
    if (i) _out.print(',');
    printName(_e[i].name);
    _out.print(':');
    printNumber(_e[i].v);
    anyPin = anyPin || _e[i].pin >= 0;
  }
  _out.print('}');
  if (anyPin) {
    _out.print(",\"pins\":{");
    bool first = true;
    for (uint8_t i = 0; i < _n; i++) {
      if (_e[i].pin < 0) continue;
      if (!first) _out.print(',');
      first = false;
      printName(_e[i].name);
      _out.print(':');
      _out.print((int)_e[i].pin);
    }
    _out.print('}');
  }
  _out.print("}\n");
  _n = 0;
}

void BoardPilotProbe::memory() {
  _out.print("@bp {\"t\":");
  _out.print((unsigned long)millis());
  _out.print(",\"mem\":{\"heapFree\":");
  _out.print((unsigned long)ESP.getFreeHeap());
  _out.print(",\"heapMin\":");
  _out.print((unsigned long)ESP.getMinFreeHeap());
  _out.print(",\"heapSize\":");
  _out.print((unsigned long)ESP.getHeapSize());
  // Smallest free stack the calling task has had so far. On ESP-IDF the
  // unit is bytes (StackType_t is 8 bits wide there), not words.
  _out.print(",\"stackFree\":");
  _out.print((unsigned long)uxTaskGetStackHighWaterMark(NULL));
  _out.print("}}\n");
}

void BoardPilotProbe::loop() {
  const uint32_t now = millis();
  if ((uint32_t)(now - _last) < _interval) return;
  _last = now;
  send();
  if (_memEnabled) memory();
}
