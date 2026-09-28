#include "bp_port.h"

#if defined(BP_STM32) || defined(BP_NRF52)
#include <malloc.h>
#include <unistd.h>
#endif

#if defined(BP_AVR)
// avr-libc malloc state (avr-libc manual, "Memory Areas and Using malloc()").
extern char __heap_start;
extern char* __brkval;
#elif defined(BP_TEENSY)
// Teensy 4 heap bounds (cores/teensy4/startup.c).
extern unsigned long _heap_end;
extern char* __brkval;
#endif

namespace bpport {

unsigned long heapFree() {
#if defined(BP_ESP32)
  return ESP.getFreeHeap();
#elif defined(BP_AVR)
  // Free RAM between the top of the heap and the stack pointer.
  char top;
  const char* heapEnd = __brkval ? __brkval : &__heap_start;
  return (unsigned long)(&top - heapEnd);
#elif defined(BP_RP2040)
  return (unsigned long)rp2040.getFreeHeap();
#elif defined(BP_TEENSY)
  return (unsigned long)((char*)&_heap_end - __brkval);
#elif defined(BP_STM32) || defined(BP_NRF52)
  // Unused space between the heap end and the stack, plus freed heap blocks.
  char top;
  const char* brk = (const char*)sbrk(0);
  const struct mallinfo mi = mallinfo();
  return (unsigned long)(&top - brk) + (unsigned long)mi.fordblks;
#else
  return 0;
#endif
}

}  // namespace bpport
