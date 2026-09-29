// Guided portfolio projects (issue #16): a template built stage by stage (blink → UART → button →
// ADC → I2C sensor → display → the whole project → FreeRTOS). Each stage has hints first, finished
// reference code for the selected board, and a checkpoint verified with live data. The finished
// project exports as a GitHub README with the wiring diagram, pin table and shopping list.

import type { BoardDef, PartDef, Scene } from './types';
import { TEMPLATES, templateCode, templatePin, type TemplateDef } from './templates';
import { billOfMaterials, bomToMarkdown } from './bom';
import { isEspFamily } from './board';
import { t } from './i18n';

export type Checkpoint =
  /** a lesson lab flow (flows/labs.ts) must pass */
  | { kind: 'lab'; flow: 'lab-blink' | 'lab-button' | 'lab-adc' | 'lab-i2c' }
  /** the user's sketch prints every one of these texts on serial */
  | { kind: 'serial'; expect: string[]; baud: number }
  /** a device answers at this I2C address on the project's bus */
  | { kind: 'i2c'; addr: string };

export interface PortfolioStage {
  id: string;
  title: string;
  goal: string;
  /** shown before the reference code */
  hints: string[];
  /** the stage's own sketch, in template code format; omitted = the whole template */
  code?: TemplateDef['code'];
  check: Checkpoint;
  /** only on boards with this built in (FreeRTOS on ESP32) */
  espOnly?: boolean;
}

export interface PortfolioProject {
  id: string;
  template: string;
  name: string;
  summary: string;
  /** what the finished project shows an employer */
  shows: string[];
  stages: PortfolioStage[];
}

const probeless = (c: TemplateDef['code']): TemplateDef['code'] => c;

export const PORTFOLIO: PortfolioProject[] = [
  {
    id: 'room-monitor',
    template: 'smart-room-monitor',
    name: 'Smart room monitor',
    summary: 'A room monitor that you build in eight checked stages, from a blinking LED to FreeRTOS tasks.',
    shows: ['GPIO, UART, ADC and I2C in one device', 'Reading a datasheet (chip ID, addresses)', 'Structuring a program into tasks'],
    stages: [
      {
        id: 'blink',
        title: 'Blink the warning LED',
        goal: 'Make the LED blink once a second.',
        hints: ['pinMode(LED_PIN, OUTPUT) makes the pin an output.', 'digitalWrite(LED_PIN, HIGH) turns the LED on, LOW turns it off.', 'delay(500) waits half a second.'],
        code: probeless({
          globals: ['const int LED_PIN = {LED};'],
          setup: ['  pinMode(LED_PIN, OUTPUT);'],
          loop: ['  digitalWrite(LED_PIN, HIGH);', '  delay(500);', '  digitalWrite(LED_PIN, LOW);', '  delay(500);'],
        }),
        check: { kind: 'lab', flow: 'lab-blink' },
      },
      {
        id: 'uart',
        title: 'Say hello over serial',
        goal: 'Print “Room monitor: hello” once a second at 115200 baud.',
        hints: ['Serial.begin(115200) in setup() starts the UART at the monitor’s speed.', 'Serial.println() sends a line of text.', 'The checkpoint listens for 3 seconds, so print the line again and again.'],
        code: probeless({
          setup: ['  Serial.begin(115200);'],
          loop: ['  Serial.println("Room monitor: hello");', '  delay(1000);'],
        }),
        check: { kind: 'serial', expect: ['Room monitor: hello'], baud: 115200 },
      },
      {
        id: 'button',
        title: 'Read the page button',
        goal: 'Print “Button pressed” once per press.',
        hints: ['INPUT_PULLUP keeps the pin HIGH until the button pulls it to GND.', 'Pressed means digitalRead() == LOW.', 'Remember the last state, and act only when it changes from released to pressed.'],
        code: probeless({
          globals: ['const int BUTTON_PIN = {BUTTON};', 'bool wasPressed = false;'],
          setup: ['  Serial.begin(115200);', '  pinMode(BUTTON_PIN, INPUT_PULLUP);'],
          loop: ['  bool pressed = digitalRead(BUTTON_PIN) == LOW;', '  if (pressed && !wasPressed) Serial.println("Button pressed");', '  wasPressed = pressed;', '  delay(10);  // simple debounce'],
        }),
        check: { kind: 'lab', flow: 'lab-button' },
      },
      {
        id: 'knob',
        title: 'Read the comfort knob',
        goal: 'Print the knob’s voltage in millivolts twice a second.',
        hints: ['The knob’s middle leg goes to an ADC pin.', 'Read millivolts, not raw numbers, so the value means the same on every board.', 'Turn it end to end: the value should go from near 0 to near 3300.'],
        code: probeless({
          globals: ['const int KNOB_PIN = {KNOB};'],
          setup: ['  Serial.begin(115200);'],
          loop: ['  long mv = {READ_MV:KNOB};', '  Serial.print("Knob: ");', '  Serial.print(mv);', '  Serial.println(" mV");', '  delay(500);'],
        }),
        check: { kind: 'lab', flow: 'lab-adc' },
      },
      {
        id: 'sensor',
        title: 'Read the BME280',
        goal: 'Print the temperature every 2 seconds.',
        hints: ['Start I2C on the board’s SDA and SCL pins first.', 'bme.begin(0x76) returns false when nothing answers at that address: try 0x77 too.', 'If it is not found, run the checkpoint: it scans the bus and reads the chip ID.'],
        code: probeless({
          includes: ['#include <Wire.h>', '#include <Adafruit_BME280.h>'],
          globals: ['Adafruit_BME280 bme;'],
          setup: ['  Serial.begin(115200);', '{I2C_BEGIN}', '  if (!bme.begin(0x76) && !bme.begin(0x77)) Serial.println("BME280 not found");'],
          loop: ['  Serial.print("T=");', '  Serial.print(bme.readTemperature(), 1);', '  Serial.println(" C");', '  delay(2000);'],
        }),
        check: { kind: 'lab', flow: 'lab-i2c' },
      },
      {
        id: 'display',
        title: 'Show it on the OLED',
        goal: 'Show the temperature on the display.',
        hints: ['The display shares the I2C bus with the sensor.', 'Most small OLEDs answer at 0x3C (the board may print “0x78”, the same address shifted).', 'Nothing appears until you call display().'],
        code: probeless({
          includes: ['#include <Wire.h>', '#include <Adafruit_BME280.h>', '#include <Adafruit_SSD1306.h>'],
          globals: ['Adafruit_BME280 bme;', 'Adafruit_SSD1306 oled(128, 64, &Wire, -1);'],
          setup: ['  Serial.begin(115200);', '{I2C_BEGIN}', '  bme.begin(0x76);', '  if (!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) Serial.println("Display not found at 0x3C");', '  oled.setTextColor(SSD1306_WHITE);'],
          loop: ['  oled.clearDisplay();', '  oled.setTextSize(2);', '  oled.setCursor(0, 0);', '  oled.print(bme.readTemperature(), 1);', '  oled.println(" C");', '  oled.display();', '  delay(2000);'],
        }),
        check: { kind: 'i2c', addr: '0x3C' },
      },
      {
        id: 'whole',
        title: 'Put it all together',
        goal: 'The finished monitor: pages, the comfort limit from the knob, and the warm LED.',
        hints: ['Read the button on every loop, but the sensor only every 2 seconds, with millis() instead of delay().', 'The limit is 16 °C plus the knob’s millivolts divided by 250.', 'The LED is on when the temperature is above the limit.'],
        check: { kind: 'serial', expect: ['T=', 'limit='], baud: 115200 },
      },
      {
        id: 'rtos',
        title: 'Split it into FreeRTOS tasks',
        goal: 'One task reads the sensor, another updates the display.',
        hints: ['xTaskCreate() starts a task with its own loop and stack.', 'vTaskDelay(pdMS_TO_TICKS(2000)) waits without blocking the other task.', 'Share the reading through a global guarded by a mutex, or a queue.'],
        espOnly: true,
        code: probeless({
          includes: ['#include <Wire.h>', '#include <Adafruit_BME280.h>'],
          globals: [
            'Adafruit_BME280 bme;',
            'volatile float temperature = 0;',
            'SemaphoreHandle_t lock;',
            '',
            'void sensorTask(void *) {',
            '  for (;;) {',
            '    float t = bme.readTemperature();',
            '    xSemaphoreTake(lock, portMAX_DELAY);',
            '    temperature = t;',
            '    xSemaphoreGive(lock);',
            '    Serial.print("[task sensors] T=");',
            '    Serial.println(t, 1);',
            '    vTaskDelay(pdMS_TO_TICKS(2000));',
            '  }',
            '}',
            '',
            'void displayTask(void *) {',
            '  for (;;) {',
            '    xSemaphoreTake(lock, portMAX_DELAY);',
            '    float t = temperature;',
            '    xSemaphoreGive(lock);',
            '    Serial.print("[task display] showing ");',
            '    Serial.println(t, 1);',
            '    vTaskDelay(pdMS_TO_TICKS(1000));',
            '  }',
            '}',
          ],
          setup: [
            '  Serial.begin(115200);',
            '{I2C_BEGIN}',
            '  bme.begin(0x76);',
            '  lock = xSemaphoreCreateMutex();',
            '  xTaskCreate(sensorTask, "sensors", 4096, nullptr, 2, nullptr);',
            '  xTaskCreate(displayTask, "display", 4096, nullptr, 1, nullptr);',
          ],
          loop: ['  vTaskDelay(portMAX_DELAY);  // the tasks do the work'],
        }),
        check: { kind: 'serial', expect: ['[task sensors]', '[task display]'], baud: 115200 },
      },
    ],
  },
  {
    id: 'industrial-node',
    template: 'industrial-node',
    name: 'Industrial sensor node',
    summary: 'A node that watches a temperature, switches a fan relay and latches an alarm, built in seven checked stages.',
    shows: ['1-Wire, relays and latched alarms, as in real control panels', 'Safe output defaults at power-up', 'Structuring a program into tasks'],
    stages: [
      {
        id: 'blink',
        title: 'Blink the status LED',
        goal: 'Make the status LED blink once a second.',
        hints: ['pinMode(LED_PIN, OUTPUT) makes the pin an output.', 'digitalWrite(LED_PIN, HIGH) turns the LED on, LOW turns it off.', 'delay(500) waits half a second.'],
        code: { globals: ['const int LED_PIN = {LED};'], setup: ['  pinMode(LED_PIN, OUTPUT);'], loop: ['  digitalWrite(LED_PIN, HIGH);', '  delay(500);', '  digitalWrite(LED_PIN, LOW);', '  delay(500);'] },
        check: { kind: 'lab', flow: 'lab-blink' },
      },
      {
        id: 'uart',
        title: 'Say hello over serial',
        goal: 'Print “Sensor node: hello” once a second at 115200 baud.',
        hints: ['Serial.begin(115200) in setup() starts the UART at the monitor’s speed.', 'Serial.println() sends a line of text.', 'The checkpoint listens for 3 seconds, so print the line again and again.'],
        code: { setup: ['  Serial.begin(115200);'], loop: ['  Serial.println("Sensor node: hello");', '  delay(1000);'] },
        check: { kind: 'serial', expect: ['Sensor node: hello'], baud: 115200 },
      },
      {
        id: 'button',
        title: 'Read the alarm reset button',
        goal: 'Print “Button pressed” once per press.',
        hints: ['INPUT_PULLUP keeps the pin HIGH until the button pulls it to GND.', 'Pressed means digitalRead() == LOW.', 'Remember the last state, and act only when it changes from released to pressed.'],
        code: {
          globals: ['const int BUTTON_PIN = {BUTTON};', 'bool wasPressed = false;'],
          setup: ['  Serial.begin(115200);', '  pinMode(BUTTON_PIN, INPUT_PULLUP);'],
          loop: ['  bool pressed = digitalRead(BUTTON_PIN) == LOW;', '  if (pressed && !wasPressed) Serial.println("Button pressed");', '  wasPressed = pressed;', '  delay(10);  // simple debounce'],
        },
        check: { kind: 'lab', flow: 'lab-button' },
      },
      {
        id: 'probe',
        title: 'Read the temperature probe',
        goal: 'Print the temperature every 2 seconds, as “T=23.5 C”.',
        hints: ['The DS18B20 talks 1-Wire: one data pin, with a 4.7 kΩ pull-up to the probe’s supply.', 'requestTemperatures() starts a conversion that takes about 750 ms.', 'A reading of -127 means the probe did not answer: check the pull-up.'],
        code: {
          includes: ['#include <OneWire.h>', '#include <DallasTemperature.h>'],
          globals: ['OneWire oneWire({TEMP});', 'DallasTemperature probeT(&oneWire);'],
          setup: ['  Serial.begin(115200);', '  probeT.begin();'],
          loop: ['  probeT.requestTemperatures();', '  Serial.print("T=");', '  Serial.print(probeT.getTempCByIndex(0), 1);', '  Serial.println(" C");', '  delay(2000);'],
        },
        check: { kind: 'serial', expect: ['T='], baud: 115200 },
      },
      {
        id: 'relay',
        title: 'Switch the fan relay',
        goal: 'Switch the relay on and off every 2 seconds and print its state.',
        hints: ['Set the relay pin to “off” in setup() before anything else, so the fan never starts by surprise.', 'Many relay modules switch on with LOW: keep that in one constant.', 'You should hear the relay click.'],
        code: {
          globals: ['const int RELAY_PIN = {RELAY};', 'const int RELAY_ON = HIGH;  // set LOW if your module switches on with LOW', 'bool on = false;'],
          setup: ['  Serial.begin(115200);', '  pinMode(RELAY_PIN, OUTPUT);', '  digitalWrite(RELAY_PIN, !RELAY_ON);  // off first'],
          loop: ['  on = !on;', '  digitalWrite(RELAY_PIN, on ? RELAY_ON : !RELAY_ON);', '  Serial.println(on ? "Relay ON" : "Relay OFF");', '  delay(2000);'],
        },
        check: { kind: 'serial', expect: ['Relay ON', 'Relay OFF'], baud: 115200 },
      },
      {
        id: 'whole',
        title: 'Put it all together',
        goal: 'The finished node: fan above 30 °C, alarm latched until the button is pressed.',
        hints: ['Read the button on every loop, the probe every 2 seconds.', 'The alarm stays on after the temperature drops, until someone presses the button.', 'Print one line per reading: T, relay and alarm.'],
        check: { kind: 'serial', expect: ['T=', 'relay=', 'alarm='], baud: 115200 },
      },
      {
        id: 'rtos',
        title: 'Split it into FreeRTOS tasks',
        goal: 'One task reads the probe, another controls the relay and the alarm.',
        hints: ['xTaskCreate() starts a task with its own loop and stack.', 'Pass readings from the sensor task to the control task with a queue.', 'Give the control task the higher priority: it must react even while the probe converts.'],
        espOnly: true,
        code: {
          includes: ['#include <OneWire.h>', '#include <DallasTemperature.h>'],
          globals: [
            'OneWire oneWire({TEMP});',
            'DallasTemperature probeT(&oneWire);',
            'QueueHandle_t readings;',
            '',
            'void sensorTask(void *) {',
            '  for (;;) {',
            '    probeT.requestTemperatures();',
            '    float t = probeT.getTempCByIndex(0);',
            '    xQueueSend(readings, &t, 0);',
            '    Serial.print("[task sensor] T=");',
            '    Serial.println(t, 1);',
            '    vTaskDelay(pdMS_TO_TICKS(2000));',
            '  }',
            '}',
            '',
            'void controlTask(void *) {',
            '  float t;',
            '  for (;;) {',
            '    if (xQueueReceive(readings, &t, portMAX_DELAY) == pdTRUE) {',
            '      digitalWrite({RELAY}, t > 30.0 ? HIGH : LOW);',
            '      Serial.print("[task control] relay=");',
            '      Serial.println(t > 30.0 ? "ON" : "OFF");',
            '    }',
            '  }',
            '}',
          ],
          setup: [
            '  Serial.begin(115200);',
            '  pinMode({RELAY}, OUTPUT);',
            '  probeT.begin();',
            '  readings = xQueueCreate(4, sizeof(float));',
            '  xTaskCreate(sensorTask, "sensor", 4096, nullptr, 1, nullptr);',
            '  xTaskCreate(controlTask, "control", 4096, nullptr, 2, nullptr);',
          ],
          loop: ['  vTaskDelay(portMAX_DELAY);  // the tasks do the work'],
        },
        check: { kind: 'serial', expect: ['[task sensor]', '[task control]'], baud: 115200 },
      },
    ],
  },
  {
    id: 'vibration-monitor',
    template: 'vibration-monitor',
    name: 'Predictive-maintenance device',
    summary: 'A vibration monitor that learns a machine’s normal shaking and warns when it grows, built in seven checked stages.',
    shows: ['Reading a sensor through its registers, from the datasheet', 'Signal processing on a microcontroller (RMS)', 'Structuring a program into tasks'],
    stages: [
      {
        id: 'blink',
        title: 'Blink the fault LED',
        goal: 'Make the fault LED blink once a second.',
        hints: ['pinMode(LED_PIN, OUTPUT) makes the pin an output.', 'digitalWrite(LED_PIN, HIGH) turns the LED on, LOW turns it off.', 'delay(500) waits half a second.'],
        code: { globals: ['const int LED_PIN = {LED};'], setup: ['  pinMode(LED_PIN, OUTPUT);'], loop: ['  digitalWrite(LED_PIN, HIGH);', '  delay(500);', '  digitalWrite(LED_PIN, LOW);', '  delay(500);'] },
        check: { kind: 'lab', flow: 'lab-blink' },
      },
      {
        id: 'uart',
        title: 'Say hello over serial',
        goal: 'Print “Vibration monitor: hello” once a second at 115200 baud.',
        hints: ['Serial.begin(115200) in setup() starts the UART at the monitor’s speed.', 'Serial.println() sends a line of text.', 'The checkpoint listens for 3 seconds, so print the line again and again.'],
        code: { setup: ['  Serial.begin(115200);'], loop: ['  Serial.println("Vibration monitor: hello");', '  delay(1000);'] },
        check: { kind: 'serial', expect: ['Vibration monitor: hello'], baud: 115200 },
      },
      {
        id: 'button',
        title: 'Read the learn button',
        goal: 'Print “Button pressed” once per press.',
        hints: ['INPUT_PULLUP keeps the pin HIGH until the button pulls it to GND.', 'Pressed means digitalRead() == LOW.', 'Remember the last state, and act only when it changes from released to pressed.'],
        code: {
          globals: ['const int BUTTON_PIN = {BUTTON};', 'bool wasPressed = false;'],
          setup: ['  Serial.begin(115200);', '  pinMode(BUTTON_PIN, INPUT_PULLUP);'],
          loop: ['  bool pressed = digitalRead(BUTTON_PIN) == LOW;', '  if (pressed && !wasPressed) Serial.println("Button pressed");', '  wasPressed = pressed;', '  delay(10);  // simple debounce'],
        },
        check: { kind: 'lab', flow: 'lab-button' },
      },
      {
        id: 'sensor',
        title: 'Wake the MPU6050 and read it',
        goal: 'Wake the sensor and print the Z acceleration in g.',
        hints: ['The MPU6050 starts asleep: write 0 to PWR_MGMT_1 (0x6B) to wake it.', 'ACCEL_XOUT_H is at 0x3B; X, Y and Z follow, 2 bytes each, high byte first.', 'At ±2 g, 16384 counts are 1 g: lying flat, Z reads about 1.'],
        code: {
          includes: ['#include <Wire.h>'],
          globals: ['const uint8_t MPU = 0x68;'],
          setup: ['  Serial.begin(115200);', '{I2C_BEGIN}', '  Wire.beginTransmission(MPU);', '  Wire.write(0x6B);  // PWR_MGMT_1', '  Wire.write(0);     // wake up', '  Wire.endTransmission();'],
          loop: [
            '  Wire.beginTransmission(MPU);',
            '  Wire.write(0x3F);  // ACCEL_ZOUT_H',
            '  Wire.endTransmission(false);',
            '  Wire.requestFrom(MPU, (uint8_t)2);',
            '  int16_t z = (Wire.read() << 8) | Wire.read();',
            '  Serial.print("Z=");',
            '  Serial.print(z / 16384.0, 2);',
            '  Serial.println(" g");',
            '  delay(500);',
          ],
        },
        check: { kind: 'lab', flow: 'lab-i2c' },
      },
      {
        id: 'rms',
        title: 'Turn samples into one vibration number',
        goal: 'Print the vibration RMS once a second, as “rms=0.012”.',
        hints: ['Read the acceleration magnitude 100 times, a few milliseconds apart.', 'Subtract 1 g (gravity), square, average, and take the square root.', 'Tap the table: the number should jump.'],
        check: { kind: 'serial', expect: ['rms='], baud: 115200 },
      },
      {
        id: 'whole',
        title: 'Put it all together',
        goal: 'The finished device: press the button to learn normal vibration, fault LED and buzzer when it doubles.',
        hints: ['The baseline is the RMS at the moment the button is pressed.', 'A fault is an RMS more than twice the baseline.', 'Print one line per measurement: rms, baseline and fault.'],
        check: { kind: 'serial', expect: ['rms=', 'baseline=', 'fault='], baud: 115200 },
      },
      {
        id: 'rtos',
        title: 'Split it into FreeRTOS tasks',
        goal: 'One task samples the sensor, another decides and drives the LED and buzzer.',
        hints: ['A sampling task at a fixed rate gives better numbers than sampling in loop().', 'vTaskDelayUntil() keeps the rate steady.', 'Send each RMS to the decision task with a queue.'],
        espOnly: true,
        code: {
          includes: ['#include <Wire.h>'],
          globals: [
            'const uint8_t MPU = 0x68;',
            'QueueHandle_t results;',
            '',
            'float readG() {',
            '  Wire.beginTransmission(MPU);',
            '  Wire.write(0x3B);',
            '  Wire.endTransmission(false);',
            '  Wire.requestFrom(MPU, (uint8_t)6);',
            '  int16_t x = (Wire.read() << 8) | Wire.read();',
            '  int16_t y = (Wire.read() << 8) | Wire.read();',
            '  int16_t z = (Wire.read() << 8) | Wire.read();',
            '  return sqrt((float)x * x + (float)y * y + (float)z * z) / 16384.0;',
            '}',
            '',
            'void sampleTask(void *) {',
            '  TickType_t last = xTaskGetTickCount();',
            '  for (;;) {',
            '    float sum = 0;',
            '    for (int i = 0; i < 100; i++) {',
            '      float d = readG() - 1.0;',
            '      sum += d * d;',
            '      vTaskDelayUntil(&last, pdMS_TO_TICKS(5));',
            '    }',
            '    float rms = sqrt(sum / 100);',
            '    xQueueSend(results, &rms, 0);',
            '    Serial.print("[task sample] rms=");',
            '    Serial.println(rms, 3);',
            '  }',
            '}',
            '',
            'void decideTask(void *) {',
            '  float rms, baseline = 0;',
            '  for (;;) {',
            '    if (xQueueReceive(results, &rms, portMAX_DELAY) != pdTRUE) continue;',
            '    if (digitalRead({BUTTON}) == LOW) baseline = rms;',
            '    bool fault = baseline > 0 && rms > baseline * 2;',
            '    digitalWrite({LED}, fault);',
            '    digitalWrite({BUZZER}, fault);',
            '    Serial.print("[task decide] fault=");',
            '    Serial.println(fault ? 1 : 0);',
            '  }',
            '}',
          ],
          setup: [
            '  Serial.begin(115200);',
            '  pinMode({LED}, OUTPUT);',
            '  pinMode({BUZZER}, OUTPUT);',
            '  pinMode({BUTTON}, INPUT_PULLUP);',
            '{I2C_BEGIN}',
            '  Wire.beginTransmission(MPU);',
            '  Wire.write(0x6B);',
            '  Wire.write(0);',
            '  Wire.endTransmission();',
            '  results = xQueueCreate(4, sizeof(float));',
            '  xTaskCreate(sampleTask, "sample", 4096, nullptr, 2, nullptr);',
            '  xTaskCreate(decideTask, "decide", 4096, nullptr, 1, nullptr);',
          ],
          loop: ['  vTaskDelay(portMAX_DELAY);  // the tasks do the work'],
        },
        check: { kind: 'serial', expect: ['[task sample]', '[task decide]'], baud: 115200 },
      },
    ],
  },
];

export function portfolioTemplate(p: PortfolioProject): TemplateDef {
  const tpl = TEMPLATES.find((x) => x.id === p.template);
  if (!tpl) throw new Error(`portfolio ${p.id}: unknown template ${p.template}`);
  return tpl;
}

/** Stages that apply to this board (FreeRTOS only where the core has it). */
export function stagesFor(p: PortfolioProject, board: BoardDef): PortfolioStage[] {
  return p.stages.filter((s) => !s.espOnly || isEspFamily(board));
}

/** The reference sketch for one stage on this board, with the project's real pins. */
export function stageCode(p: PortfolioProject, stage: PortfolioStage, board: BoardDef, scene: Scene): string {
  const tpl = portfolioTemplate(p);
  if (!stage.code) return templateCode(tpl, board, scene);
  const code = templateCode({ ...tpl, name: `${tpl.name}: ${stage.title}`, summary: stage.goal, libraries: stage.code.includes?.some((l) => l.includes('Adafruit')) ? tpl.libraries : [], code: stage.code }, board, scene);
  // Stage sketches do not use the probe library: keep them short and dependency-free.
  return code
    .replace('#include <BoardPilotProbe.h>\n', '')
    .replace(/BoardPilotProbe probe\(Serial\);[^\n]*\n/, '')
    .replace(/, BoardPilotProbe\n/, '\n')
    .replace('// Library (Arduino Library Manager): BoardPilotProbe\n', '');
}

/** Does captured serial output pass a serial checkpoint? Returns the texts that were missing. */
export function serialMissing(check: Extract<Checkpoint, { kind: 'serial' }>, lines: string[]): string[] {
  const all = lines.join('\n');
  return check.expect.filter((e) => !all.includes(e));
}

export interface StageRecord {
  at: string;
  /** what verified it, e.g. "measured: lab-blink" */
  source: string;
}

/** README for GitHub: what it does, stages with how each was checked, wiring, pins, parts. */
export function portfolioReadme(
  p: PortfolioProject,
  board: BoardDef,
  scene: Scene,
  parts: Record<string, PartDef>,
  progress: Record<string, StageRecord>,
): string {
  const tpl = portfolioTemplate(p);
  const stages = stagesFor(p, board);
  const pinRows = Object.keys(tpl.pins).map((n) => {
    const ref = tpl.pins[n];
    const pin = templatePin(tpl, scene, board, n);
    const inst = tpl.parts.find((x) => x.id === ref.part);
    return `| ${n} | ${inst?.label ?? ref.part} ${ref.pin} | ${pin ? `${pin.label}${pin.gpio !== null ? ` (GPIO ${pin.gpio})` : ''}` : '?'} |`;
  });
  const done = stages.filter((s) => progress[s.id]).length;
  return [
    `# ${t(p.name)}`,
    '',
    t(tpl.summary),
    '',
    `Board: **${board.name}**. ${t('Built stage by stage with BoardPilot; each stage was checked on the board as listed below.')}`,
    '',
    `## ${t('What it shows')}`,
    '',
    ...p.shows.map((s) => `- ${t(s)}`),
    '',
    `## ${t('Stages')} (${done}/${stages.length})`,
    '',
    ...stages.map((s, i) => {
      const r = progress[s.id];
      return `${i + 1}. ${r ? '✅' : '⬜'} **${t(s.title)}**: ${t(s.goal)}${r ? ` ${t('Checked {date} ({source}).', { date: r.at.slice(0, 10), source: r.source })}` : ` ${t('Not checked yet.')}`}`;
    }),
    '',
    `## ${t('Wiring')}`,
    '',
    '![Wiring diagram](wiring.svg)',
    '',
    `| ${t('Signal')} | ${t('Part pin')} | ${t('Board pin')} |`,
    '|---|---|---|',
    ...pinRows,
    '',
    `## ${t('Parts')}`,
    '',
    bomToMarkdown(billOfMaterials(scene, board, parts)),
    '',
    `## ${t('Photos')}`,
    '',
    `<!-- ${t('Add a photo of your build here: ![My build](photo.jpg)')} -->`,
    '',
    `## ${t('Code')}`,
    '',
    `\`${p.template}.ino\`: ${t('the finished sketch, generated for this board and wiring.')}`,
    ...(tpl.libraries?.length ? ['', `${t('Libraries')}: ${tpl.libraries.join(', ')}.`] : []),
    '',
    `## ${t('Sources')}`,
    '',
    ...tpl.sources.map((s) => `- ${s.title}${s.section ? `, ${s.section}` : ''}`),
    '',
  ].join('\n');
}
