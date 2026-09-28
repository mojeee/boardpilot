// Starter Arduino sketch for a scene. Uses BoardPilotProbe so Monitor can plot the values.

import type { BoardDef, PartDef, Scene } from './types';
import { boardPinFor, isEspFamily, pinById } from './board';

const ident = (s: string) => s.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();

export function generateSketch(scene: Scene, board: BoardDef, parts: Record<string, PartDef>): string {
  const includes = new Set<string>(['#include <Wire.h>', '#include <BoardPilotProbe.h>']);
  const globals: string[] = ['BoardPilotProbe probe(Serial);'];
  const defines: string[] = [];
  const setup: string[] = ['  Serial.begin(115200);', '  probe.begin(100);'];
  const loop: string[] = [];
  const libs = new Set<string>();
  let wireBegun = false;

  const gpio = (instId: string, pin: string) => {
    const bp = boardPinFor(scene, instId, pin);
    const p = bp ? pinById(board, bp) : undefined;
    return p?.gpio ?? null;
  };
  /** How the pin is written in code: the GPIO number, or the pin name on STM32 (STM32duino macros like PA5). */
  const expr = (g: number) => {
    const p = board.pins.find((x) => x.gpio === g && x.kind === 'gpio');
    return board.family === 'stm32' && p?.chipPin ? p.chipPin : String(g);
  };
  const esp = isEspFamily(board);
  const avr = board.family === 'avr';
  let adcSetup = false;
  const readMv = (pinConst: string) => {
    if (esp) return `analogReadMilliVolts(${pinConst})`;
    if (!avr && !adcSetup) {
      setup.push('  analogReadResolution(12);');
      adcSetup = true;
    }
    // Nominal reference: the result is only as exact as the board's supply.
    return `(long)analogRead(${pinConst}) * ${board.rules.adcMaxMv}L / ${avr ? 1023 : 4095}`;
  };
  const defaultSda = pinById(board, board.rules.i2c.sda);
  const defaultScl = pinById(board, board.rules.i2c.scl);

  for (const inst of scene.parts) {
    const def = parts[inst.partId];
    if (!def) continue;
    const N = ident(inst.id);
    if (def.bus === 'i2c') {
      const sda = gpio(inst.id, 'SDA') ?? defaultSda?.gpio ?? 0;
      const scl = gpio(inst.id, 'SCL') ?? defaultScl?.gpio ?? 0;
      if (!wireBegun) {
        defines.push(`#define I2C_SDA ${expr(sda)}`, `#define I2C_SCL ${expr(scl)}`);
        if (esp) setup.push('  Wire.begin(I2C_SDA, I2C_SCL);');
        else if (board.family === 'rp2040' || board.family === 'rp2350' || board.family === 'stm32') {
          setup.push('  Wire.setSDA(I2C_SDA);', '  Wire.setSCL(I2C_SCL);', '  Wire.begin();');
        } else {
          setup.push(`  Wire.begin();  // this board's I2C pins are fixed: SDA = ${defaultSda?.label ?? '?'}, SCL = ${defaultScl?.label ?? '?'}`);
        }
        wireBegun = true;
      }
    }
    switch (def.starterSketch) {
      case 'bme280':
        includes.add('#include <Adafruit_BME280.h>');
        libs.add('Adafruit BME280 Library');
        globals.push(`Adafruit_BME280 ${inst.id};`);
        setup.push(
          `  if (!${inst.id}.begin(0x76, &Wire) && !${inst.id}.begin(0x77, &Wire)) {`,
          `    Serial.println("BME280 not found. Run Debug > A sensor does not respond in BoardPilot.");`,
          '  }',
        );
        {
          const g = gpio(inst.id, 'SDA') ?? defaultSda?.gpio ?? 0;
          loop.push(
            `  probe.value("temperature", ${inst.id}.readTemperature(), ${g});`,
            `  probe.value("humidity", ${inst.id}.readHumidity(), ${g});`,
            `  probe.value("pressure", ${inst.id}.readPressure() / 100.0F, ${g});`,
          );
        }
        break;
      case 'ssd1306':
        includes.add('#include <Adafruit_SSD1306.h>');
        libs.add('Adafruit SSD1306');
        globals.push(`Adafruit_SSD1306 ${inst.id}(128, 64, &Wire, -1);`);
        setup.push(`  ${inst.id}.begin(SSD1306_SWITCHCAPVCC, 0x3C);`, `  ${inst.id}.clearDisplay();`, `  ${inst.id}.display();`);
        break;
      case 'led': {
        const g = gpio(inst.id, 'A');
        if (g === null) break;
        defines.push(`#define ${N}_PIN ${expr(g)}`);
        setup.push(`  pinMode(${N}_PIN, OUTPUT);`);
        loop.push(`  digitalWrite(${N}_PIN, (millis() / 500) % 2);  // blink`);
        break;
      }
      case 'button': {
        const g = gpio(inst.id, '1');
        if (g === null) break;
        defines.push(`#define ${N}_PIN ${expr(g)}`);
        setup.push(`  pinMode(${N}_PIN, INPUT_PULLUP);  // pressed = LOW`);
        loop.push(`  probe.value("${inst.id}", digitalRead(${N}_PIN) == LOW ? 1 : 0, ${g});`);
        break;
      }
      case 'pot': {
        const g = gpio(inst.id, 'OUT');
        if (g === null) break;
        defines.push(`#define ${N}_PIN ${expr(g)}`);
        loop.push(`  probe.value("${inst.id}", ${readMv(`${N}_PIN`)}, ${g});  // mV`);
        break;
      }
      case 'mpu6050':
        setup.push(`  Wire.beginTransmission(0x68); Wire.write(0x6B); Wire.write(0); Wire.endTransmission();  // wake up`);
        loop.push(
          `  Wire.beginTransmission(0x68); Wire.write(0x3B); Wire.endTransmission(false);`,
          `  Wire.requestFrom((uint8_t)0x68, (uint8_t)6);`,
          `  int16_t ax = (Wire.read() << 8) | Wire.read(); Wire.read(); Wire.read(); Wire.read(); Wire.read();`,
          `  probe.value("accel_x", ax / 16384.0);`,
        );
        break;
      case 'dht22': {
        const g = gpio(inst.id, 'DATA');
        if (g === null) break;
        includes.add('#include <DHT.h>');
        libs.add('DHT sensor library');
        defines.push(`#define ${N}_PIN ${expr(g)}`);
        globals.push(`DHT ${inst.id}(${N}_PIN, DHT22);`);
        setup.push(`  ${inst.id}.begin();`);
        loop.push(`  probe.value("dht_temperature", ${inst.id}.readTemperature(), ${g});`, `  probe.value("dht_humidity", ${inst.id}.readHumidity(), ${g});`);
        break;
      }
    }
  }

  return [
    `// Starter sketch generated by BoardPilot for ${board.name}.`,
    `// Arduino board: ${board.toolchain.fqbn} (core ${board.toolchain.core}).`,
    `// Libraries to install (Arduino Library Manager): BoardPilotProbe (firmware/probe)${[...libs].map((l) => `, ${l}`).join('')}`,
    '',
    ...includes,
    '',
    ...defines,
    '',
    ...globals,
    '',
    'void setup() {',
    ...setup,
    '}',
    '',
    'void loop() {',
    ...loop,
    '  probe.loop();  // sends the values and memory info to BoardPilot Monitor',
    '  delay(50);',
    '}',
    '',
  ].join('\n');
}
