// BoardPilotProbe: stream named values from your own sketch to the
// BoardPilot Monitor.
//
// Each batch is one line: the prefix "@bp " and a JSON object, so it can be
// mixed with your normal Serial prints. The Monitor reads only "@bp " lines.
//
//   @bp {"t":12345,"v":{"temperature":22.4,"humidity":41.2}}
//   @bp {"t":12345,"v":{"pot":1840},"pins":{"pot":34}}
//   @bp {"t":12345,"mem":{"heapFree":201344,"heapMin":190000,"heapSize":327680,"stackFree":6000}}
//
// Usage:
//   BoardPilotProbe probe(Serial);
//   void setup() { Serial.begin(115200); probe.begin(100); }
//   void loop()  { probe.value("pot", analogReadMilliVolts(34), 34); probe.loop(); }
#pragma once

#include <Arduino.h>

class BoardPilotProbe {
 public:
  static const uint8_t kMaxValues = 16;  // values per batch
  static const uint8_t kNameMax = 24;    // longest name, including the ending NUL

  explicit BoardPilotProbe(Print& out);

  // intervalMs: how often loop() sends the batch and the memory line.
  void begin(uint32_t intervalMs = 100);

  // Adds or updates a value in the current batch. `pin` is an optional GPIO
  // hint so the Monitor can color the plot like the pin and show it in 3D.
  // Returns false if the batch is full or the name is empty or too long.
  bool value(const char* name, float v, int pin = -1);

  // Sends the batched values as one line now and clears the batch.
  void send();

  // Sends one memory line now (heap and stack of the calling task).
  void memory();

  // Call often from loop(). Every interval it sends the batch and a memory line.
  void loop();

  void setInterval(uint32_t intervalMs);
  // Turns the automatic memory line in loop() on or off (default on).
  void setMemoryEnabled(bool on);

 private:
  struct Entry {
    char name[kNameMax];
    float v;
    int16_t pin;
  };

  void printName(const char* s);
  void printNumber(float v);

  Print& _out;
  Entry _e[kMaxValues];
  uint8_t _n;
  uint32_t _interval;
  uint32_t _last;
  bool _memEnabled;
};
