#include "bp_json.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

namespace bpjson {

namespace {

struct P {
  const char* p;
  const char* end;
  const char* err;
};

inline bool isDigit(char c) { return c >= '0' && c <= '9'; }

inline bool isHex(char c) {
  return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

inline void ws(P& s) {
  while (s.p < s.end && (*s.p == ' ' || *s.p == '\t' || *s.p == '\r' || *s.p == '\n')) s.p++;
}

bool fail(P& s, const char* msg) {
  if (!s.err) s.err = msg;
  return false;
}

// s.p is on the opening quote. On success s.p is just past the closing quote.
bool parseString(P& s, const char** start, size_t* len) {
  s.p++;
  const char* b = s.p;
  while (s.p < s.end) {
    char c = *s.p;
    if (c == '"') {
      *start = b;
      *len = (size_t)(s.p - b);
      s.p++;
      return true;
    }
    if ((uint8_t)c < 0x20) return fail(s, "A text value contains a control character.");
    if (c == '\\') {
      s.p++;
      if (s.p >= s.end) break;
      char e = *s.p;
      if (e == 'u') {
        for (int i = 0; i < 4; i++) {
          s.p++;
          if (s.p >= s.end || !isHex(*s.p)) return fail(s, "A \\u escape needs four hex digits.");
        }
      } else if (!(e == '"' || e == '\\' || e == '/' || e == 'b' || e == 'f' || e == 'n' ||
                   e == 'r' || e == 't')) {
        return fail(s, "A text value contains an unknown escape.");
      }
    }
    s.p++;
  }
  return fail(s, "A text value is missing its closing quote.");
}

bool parseNumber(P& s) {
  const char* p = s.p;
  const char* e = s.end;
  if (p < e && *p == '-') p++;
  if (p >= e) return fail(s, "A number is cut off.");
  if (*p == '0') {
    p++;
  } else if (*p >= '1' && *p <= '9') {
    while (p < e && isDigit(*p)) p++;
  } else {
    return fail(s, "A number is not written correctly.");
  }
  if (p < e && *p == '.') {
    p++;
    if (!(p < e && isDigit(*p))) return fail(s, "A number has no digits after the dot.");
    while (p < e && isDigit(*p)) p++;
  }
  if (p < e && (*p == 'e' || *p == 'E')) {
    p++;
    if (p < e && (*p == '+' || *p == '-')) p++;
    if (!(p < e && isDigit(*p))) return fail(s, "A number has a bad exponent.");
    while (p < e && isDigit(*p)) p++;
  }
  s.p = p;
  return true;
}

bool literal(P& s, const char* word) {
  size_t n = strlen(word);
  if ((size_t)(s.end - s.p) < n || memcmp(s.p, word, n) != 0) {
    return fail(s, "Unexpected word. Use true, false or null.");
  }
  s.p += n;
  return true;
}

bool parseValue(P& s, int depth, ValType* type, const char** vs, size_t* vl);

// s.p is on '{' or '['. On success s.p is just past the closing bracket.
bool parseContainer(P& s, int depth, bool isObj) {
  const char close = isObj ? '}' : ']';
  s.p++;
  ws(s);
  if (s.p < s.end && *s.p == close) {
    s.p++;
    return true;
  }
  for (;;) {
    if (isObj) {
      ws(s);
      if (s.p >= s.end || *s.p != '"') return fail(s, "Expected a key in double quotes.");
      const char* k;
      size_t kl;
      if (!parseString(s, &k, &kl)) return false;
      ws(s);
      if (s.p >= s.end || *s.p != ':') return fail(s, "Expected ':' after a key.");
      s.p++;
    }
    ValType t;
    const char* v;
    size_t n;
    if (!parseValue(s, depth, &t, &v, &n)) return false;
    ws(s);
    if (s.p >= s.end) return fail(s, "The line ends before the closing bracket.");
    if (*s.p == ',') {
      s.p++;
      continue;
    }
    if (*s.p == close) {
      s.p++;
      return true;
    }
    return fail(s, "Expected ',' or a closing bracket.");
  }
}

bool parseValue(P& s, int depth, ValType* type, const char** vs, size_t* vl) {
  ws(s);
  if (s.p >= s.end) return fail(s, "A value is missing.");
  const char c = *s.p;
  if (c == '"') {
    *type = T_STRING;
    return parseString(s, vs, vl);
  }
  if (c == '{' || c == '[') {
    if (depth >= MAX_DEPTH) return fail(s, "The request is nested too deeply.");
    const char* b = s.p;
    if (!parseContainer(s, depth + 1, c == '{')) return false;
    *type = (c == '{') ? T_OBJECT : T_ARRAY;
    *vs = b;
    *vl = (size_t)(s.p - b);
    return true;
  }
  if (c == '-' || isDigit(c)) {
    const char* b = s.p;
    if (!parseNumber(s)) return false;
    *type = T_NUMBER;
    *vs = b;
    *vl = (size_t)(s.p - b);
    return true;
  }
  const char* b = s.p;
  bool ok;
  if (c == 't') {
    ok = literal(s, "true");
    *type = T_BOOL;
  } else if (c == 'f') {
    ok = literal(s, "false");
    *type = T_BOOL;
  } else if (c == 'n') {
    ok = literal(s, "null");
    *type = T_NULL;
  } else {
    return fail(s, "Unexpected character.");
  }
  *vs = b;
  *vl = (size_t)(s.p - b);
  return ok;
}

// Converts a validated JSON number span to double.
bool spanToDouble(const char* v, size_t n, double& out) {
  char buf[40];
  if (n == 0 || n >= sizeof(buf)) return false;
  memcpy(buf, v, n);
  buf[n] = '\0';
  char* endp = nullptr;
  double d = strtod(buf, &endp);
  if (endp != buf + n || !isfinite(d)) return false;
  out = d;
  return true;
}

bool doubleToLong(double d, long& out) {
  if (d != floor(d)) return false;
  if (d < -2147483648.0 || d > 2147483647.0) return false;
  out = (long)d;
  return true;
}

}  // namespace

bool parse(const char* text, size_t len, Doc& doc, const char** err) {
  P s{text, text + len, nullptr};
  doc.n = 0;
  ws(s);
  if (s.p >= s.end || *s.p != '{') {
    *err = "A request must be a JSON object that starts with '{'.";
    return false;
  }
  s.p++;
  ws(s);
  bool done = false;
  if (s.p < s.end && *s.p == '}') {
    s.p++;
    done = true;
  }
  while (!done) {
    ws(s);
    if (s.p >= s.end || *s.p != '"') {
      fail(s, "Expected a key in double quotes.");
      break;
    }
    const char* k;
    size_t kl;
    if (!parseString(s, &k, &kl)) break;
    ws(s);
    if (s.p >= s.end || *s.p != ':') {
      fail(s, "Expected ':' after a key.");
      break;
    }
    s.p++;
    ValType t = T_NONE;
    const char* v = nullptr;
    size_t vl = 0;
    if (!parseValue(s, 1, &t, &v, &vl)) break;
    if (doc.n >= MAX_FIELDS) {
      fail(s, "The request has too many fields.");
      break;
    }
    Field& f = doc.f[doc.n++];
    f.key = k;
    f.keyLen = (uint16_t)kl;
    f.val = v;
    f.valLen = (uint16_t)vl;
    f.type = t;
    ws(s);
    if (s.p >= s.end) {
      fail(s, "The line ends before the closing '}'.");
      break;
    }
    if (*s.p == ',') {
      s.p++;
      continue;
    }
    if (*s.p == '}') {
      s.p++;
      done = true;
      break;
    }
    fail(s, "Expected ',' or '}' after a value.");
    break;
  }
  if (!done) {
    *err = s.err ? s.err : "The request is not valid JSON.";
    return false;
  }
  ws(s);
  if (s.p != s.end) {
    *err = "There is extra text after the closing '}'.";
    return false;
  }
  return true;
}

const Field* find(const Doc& doc, const char* key) {
  const size_t kl = strlen(key);
  for (int i = 0; i < doc.n; i++) {
    const Field& f = doc.f[i];
    if (f.keyLen == kl && memcmp(f.key, key, kl) == 0) return &f;
  }
  return nullptr;
}

bool has(const Doc& doc, const char* key) { return find(doc, key) != nullptr; }

bool getDouble(const Doc& doc, const char* key, double& out) {
  const Field* f = find(doc, key);
  if (!f || f->type != T_NUMBER) return false;
  return spanToDouble(f->val, f->valLen, out);
}

bool getLong(const Doc& doc, const char* key, long& out) {
  double d;
  if (!getDouble(doc, key, d)) return false;
  return doubleToLong(d, out);
}

bool getBool(const Doc& doc, const char* key, bool& out) {
  const Field* f = find(doc, key);
  if (!f || f->type != T_BOOL) return false;
  out = (f->val[0] == 't');
  return true;
}

bool getString(const Doc& doc, const char* key, char* buf, size_t bufLen) {
  const Field* f = find(doc, key);
  if (!f || f->type != T_STRING || bufLen == 0) return false;
  size_t o = 0;
  for (size_t i = 0; i < f->valLen; i++) {
    char c = f->val[i];
    if (c == '\\' && i + 1 < f->valLen) {
      char e = f->val[++i];
      switch (e) {
        case 'b': c = '\b'; break;
        case 'f': c = '\f'; break;
        case 'n': c = '\n'; break;
        case 'r': c = '\r'; break;
        case 't': c = '\t'; break;
        case 'u': {
          // Only plain ASCII is decoded; anything else becomes '?'.
          unsigned cp = 0;
          for (int j = 0; j < 4 && i + 1 < f->valLen; j++) {
            char h = f->val[++i];
            cp = cp * 16 + (unsigned)(isDigit(h) ? h - '0' : ((h | 0x20) - 'a' + 10));
          }
          c = (cp > 0 && cp < 0x80) ? (char)cp : '?';
          break;
        }
        default: c = e; break;  // '"', '\\', '/'
      }
    }
    if (o + 1 >= bufLen) return false;
    buf[o++] = c;
  }
  buf[o] = '\0';
  return true;
}

bool getLongOrHex(const Doc& doc, const char* key, long& out) {
  const Field* f = find(doc, key);
  if (!f) return false;
  if (f->type == T_NUMBER) return getLong(doc, key, out);
  if (f->type != T_STRING) return false;
  char buf[16];
  if (!getString(doc, key, buf, sizeof(buf)) || buf[0] == '\0') return false;
  const char* p = buf;
  int base = 10;
  if (p[0] == '0' && (p[1] == 'x' || p[1] == 'X')) {
    p += 2;
    base = 16;
  }
  if (*p == '\0') return false;
  for (const char* q = p; *q; q++) {
    if (base == 16 ? !isHex(*q) : !isDigit(*q)) return false;
  }
  char* endp = nullptr;
  long v = strtol(p, &endp, base);
  if (*endp != '\0') return false;
  out = v;
  return true;
}

int getLongArray(const Doc& doc, const char* key, long* out, int max) {
  const Field* f = find(doc, key);
  if (!f || f->type != T_ARRAY) return -1;
  // The span includes the brackets and was already validated by parse().
  P s{f->val + 1, f->val + f->valLen - 1, nullptr};
  int count = 0;
  ws(s);
  if (s.p >= s.end) return 0;
  for (;;) {
    ws(s);
    if (s.p >= s.end || !(*s.p == '-' || isDigit(*s.p))) return -1;
    const char* b = s.p;
    if (!parseNumber(s)) return -1;
    double d;
    long v;
    if (!spanToDouble(b, (size_t)(s.p - b), d) || !doubleToLong(d, v)) return -1;
    if (count >= max) return -2;
    out[count++] = v;
    ws(s);
    if (s.p >= s.end) return count;
    if (*s.p != ',') return -1;
    s.p++;
  }
}

}  // namespace bpjson
