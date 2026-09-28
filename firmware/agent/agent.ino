// BoardPilot diagnostic agent "bp-agent" v0.2: ESP32, ESP32-S3/C3, RP2040/RP2350,
// AVR (Uno, Nano, Mega), STM32 (STM32duino) and Teensy 4.x.
//
// Talks newline-delimited JSON over Serial at AGENT_BAUD (115200) so the
// BoardPilot desktop app can read pin states, check pull-ups, scan and read
// I2C devices, read ADC voltages, and (after the user confirms in the app)
// drive outputs and PWM. See README.md in this folder for the protocol.
//
// Board facts come from bp_board.h, generated from boards/<id>.json by
// scripts/gen-agent-board.mjs (the committed copy is for the ESP32 DevKit).
//
// All logic lives in the bp_*.cpp files next to this one. Keeping this file
// tiny avoids surprises from the Arduino .ino prototype generator.

#include "bp_agent.h"

void setup() { agentSetup(); }

void loop() { agentLoop(); }
