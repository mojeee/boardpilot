#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>
class __FlashStringHelper;
class String {
 public:
  String(const char *s = "") : s_(s) {}
  const char *c_str() const { return s_; }
  unsigned int length() const { return (unsigned int)strlen(s_); }
 private:
  const char *s_;
};
class Print {
 public:
  virtual ~Print() {}
  virtual size_t write(uint8_t) = 0;
  virtual size_t write(const uint8_t *b, size_t n) { size_t k = 0; while (n--) k += write(*b++); return k; }
  size_t write(const char *s) { return write((const uint8_t *)s, strlen(s)); }
  size_t print(const char *s) { return write(s); }
};
