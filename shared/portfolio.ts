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
