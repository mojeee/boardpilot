// Tiny JSON request parser for the BoardPilot agent (no heap, no libraries).
//
// It fully validates one JSON text (objects, arrays, strings, numbers,
// true/false/null, nesting depth limited) and records the fields of the
// top-level object. Values are not copied: each field points into the line
// buffer, so the buffer must outlive the Doc.
#pragma once

#include <stddef.h>
#include <stdint.h>

#include "bp_config.h"

namespace bpjson {

enum ValType : uint8_t { T_NONE = 0, T_STRING, T_NUMBER, T_BOOL, T_NULL, T_ARRAY, T_OBJECT };

struct Field {
  const char* key;   // raw key bytes (escapes not decoded), not NUL-terminated
  uint16_t keyLen;
  const char* val;   // strings: without quotes; arrays/objects: with brackets
  uint16_t valLen;
  ValType type;
};

static const int MAX_FIELDS = AGENT_JSON_MAX_FIELDS;
static const int MAX_DEPTH = 4;

struct Doc {
  Field f[MAX_FIELDS];
  int n;
};

// Parses `len` bytes at `s`. The text must be a single JSON object.
// On failure returns false and sets *err to a short plain-language reason
// (a flash string, see bp_port.h).
bool parse(const char* s, size_t len, Doc& doc, const char** err);

// Every `key` below is a flash string: pass BPS("name").
const Field* find(const Doc& doc, const char* key);
bool has(const Doc& doc, const char* key);

// Whole number only (e.g. 3 or 3.0; 3.5 fails).
bool getLong(const Doc& doc, const char* key, long& out);
bool getDouble(const Doc& doc, const char* key, double& out);
bool getBool(const Doc& doc, const char* key, bool& out);
// Decodes simple escapes. Fails if the string does not fit in buf.
bool getString(const Doc& doc, const char* key, char* buf, size_t bufLen);
// Accepts a number (118), a hex string ("0x76") or a decimal string ("118").
bool getLongOrHex(const Doc& doc, const char* key, long& out);

// Reads an array of whole numbers.
// Returns the element count (>= 0), -1 if the field is missing or not an
// array of whole numbers, -2 if it has more than `max` elements.
int getLongArray(const Doc& doc, const char* key, long* out, int max);

}  // namespace bpjson
