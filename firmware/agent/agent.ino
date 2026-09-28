// BoardPilot diagnostic agent "bp-agent" v0.1 for ESP32 (Arduino core 3.x).
//
// Talks newline-delimited JSON over Serial at AGENT_BAUD (115200) so the
// BoardPilot desktop app can read pin states, check pull-ups, scan and read
// I2C devices, read ADC voltages, and (after the user confirms in the app)
// drive outputs and PWM. See README.md in this folder for the protocol.
//
// All logic lives in the bp_*.cpp files next to this one. Keeping this file
// tiny avoids surprises from the Arduino .ino prototype generator.

#include "bp_agent.h"

void setup() { agentSetup(); }

void loop() { agentLoop(); }
