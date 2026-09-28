// Output helpers: write JSON reply lines straight to Serial (no big buffer).
// The agent is single-threaded, so pieces of one line never interleave.
#pragma once

#include <Arduino.h>

struct BpReq;

namespace bpout {

void raw(const char* s);
void ch(char c);
void num(long v);
void unum(unsigned long v);
// Prints a number, dropping the decimals when it is whole (62 or 62.5).
void dec(double v);
// Prints a quoted, escaped JSON string.
void str(const char* s);
// Prints a quoted byte as "0xNN".
void hexByte(uint8_t v);
void boolVal(bool b);
// Prints ,"key": (with the leading comma).
void key(const char* k);
// Prints "N": for a GPIO number used as an object key (no leading comma).
void pinKey(int gpio);

// {"id":N,"ok":true   (or "id":null when the request had no id)
void begin(const BpReq& r, bool ok);
// }\n
void end();

// Full error line: {"id":N,"ok":false,"error":code,"msg":msg[,"pin":N]}
void error(const BpReq& r, const char* code, const char* msg, int pin = -1);
// Same, for lines that could not be parsed (id is always null).
void errorNoId(const char* code, const char* msg);
// Plain success: {"id":N,"ok":true}
void ok(const BpReq& r);

}  // namespace bpout
