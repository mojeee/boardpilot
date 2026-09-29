// Wiring guides (/boards/<board>/<part>/): the 30 most searched parts on every board, with the
// board's own pins, default buses, voltage checks and Arduino code. Comparison pages
// (/compare/<a>-vs-<b>/). Per-board questions and answers. English and Italian.
// Everything comes from boards/*.json and parts/*.json, the same data the app uses.

import { boardPath } from './boards.mjs';
import { gotchaList, gotchasOn } from './parts.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/** The parts people search for most with a board name ("bme280 esp32", "hc-sr04 raspberry pi pico"…). */
export const POPULAR = [
  'bme280-gy', 'bmp280-gy', 'dht22', 'dht11', 'hc-sr04', 'ssd1306-i2c', 'mpu6050', 'ds18b20-probe', 'ws2812b-strip', 'servo-sg90',
  'relay-1ch', 'hc-sr501', 'lcd1602-i2c', 'ina219', 'vl53l0x', 'bh1750-gy302', 'max30102', 'rc522-rfid', 'neo-6m-gps',
  'soil-moisture-capacitive', 'ads1115', 'tm1637-4digit', 'stepper-28byj48-uln2003', 'l298n-driver', 'potentiometer', 'push-button',
  'led-resistor', 'joystick-ky023', 'sd-card-module', 'aht20',
];

/**
 * The model name people search for: "HC-SR04 ultrasonic distance" → "HC-SR04",
 * "GY-BME280 breakout" → "BME280", "SSD1306 OLED 128x64" → "SSD1306 OLED". Generic parts keep their name.
 */
const SEARCH_NAME = {
  en: {
    'lcd1602-i2c': 'LCD 1602 I2C', 'relay-1ch': 'Relay module', 'stepper-28byj48-uln2003': '28BYJ-48 stepper', 'servo-sg90': 'SG90 servo',
    'soil-moisture-capacitive': 'Capacitive soil moisture sensor', potentiometer: 'Potentiometer', 'led-resistor': 'LED', 'ws2812b-strip': 'WS2812B LED strip',
    'joystick-ky023': 'Joystick module', 'bh1750-gy302': 'BH1750',
  },
  it: {
    'lcd1602-i2c': 'LCD 1602 I2C', 'relay-1ch': 'Modulo relè', 'stepper-28byj48-uln2003': 'Motore passo-passo 28BYJ-48', 'servo-sg90': 'Servo SG90',
    'soil-moisture-capacitive': 'Sensore di umidità del terreno capacitivo', potentiometer: 'Potenziometro', 'led-resistor': 'LED', 'ws2812b-strip': 'Striscia LED WS2812B',
    'joystick-ky023': 'Modulo joystick', 'bh1750-gy302': 'BH1750', 'push-button': 'Pulsante', 'sd-card-module': 'Modulo scheda SD',
  },
};

export function shortPart(p, lang = 'en') {
  if (SEARCH_NAME[lang][p.id]) return SEARCH_NAME[lang][p.id];
  const name = p.name.replace(/\s*\(.*?\)/g, '');
  const words = name.split(/\s+/);
  const model = (w) => /\d/.test(w) && /[A-Z]/.test(w);
  if (!model(words[0])) return name;
  const out = [words[0].replace(/^GY-(?=[A-Z]{2,}\d)/, '')];
  if (words[1] && (model(words[1]) || /^[A-Z]{3,5}$/.test(words[1]))) out.push(words[1]);
  return out.join(' ');
}

/** Numbers the way each language writes them (3.3 V / 3,3 V). */
export const num = (lang, v) => (lang === 'it' ? String(v).replace('.', ',') : String(v));

/** Short board names for titles and sentences. */
export function shortName(b) {
  return b.name.replace(/\s*\(.*\)$/, '').replace(/^ST /, '');
}

export const guidePath = (lang, boardId, partId) => `${lang === 'it' ? '/it' : ''}/boards/${boardId}/${partId}/`;

/* ---------- wiring (same rules as shared/assign.ts, read from the board file) ---------- */

const range = (v) => {
  const n = String(v).split('-').map(Number).filter(Number.isFinite);
  return n.length ? [Math.min(...n), Math.max(...n)] : [3.3, 3.3];
};

function powerPin(b, voltage) {
  const [lo, hi] = range(voltage);
  // Supply outputs only: not inputs (VIN, E5V), references (AREF, IOREF) or the analog supply (AVDD).
  const supplies = b.pins.filter((p) => p.kind === 'power' && p.supplies > 0 && !/VIN|VBAT|AREF|VREF|IOREF|AVDD|E5V/i.test(p.id + ' ' + p.label) && !p.sameAs);
  const fits = supplies.filter((p) => p.supplies >= lo - 0.2 && p.supplies <= hi + 0.2);
  return fits.find((p) => p.supplies === b.logicVolt) ?? fits.sort((a, c) => a.supplies - c.supplies)[0] ?? supplies.find((p) => p.supplies === 3.3) ?? supplies[0];
}

export function wireFor(b, part) {
  const pin = (id) => b.pins.find((p) => p.id === id);
  const r = b.rules;
  const used = new Set([r.i2c.sda, r.i2c.scl]);
  const take = (list) => {
    const x = list.find((q) => pin(q) && !used.has(q));
    if (x) used.add(x);
    return x;
  };
  const ground = b.pins.find((p) => p.kind === 'ground' && !/AGND/i.test(p.id) && !p.sameAs);
  const spiDefaults = r.spi ? { spi_mosi: r.spi.mosi, spi_miso: r.spi.miso, spi_sck: r.spi.sck, spi_cs: r.spi.cs } : {};
  if (r.spi) for (const id of Object.values(r.spi)) used.add(id);
  const out = [];
  for (const q of part.pins) {
    let id = null;
    switch (q.role) {
      case 'power':
        id = powerPin(b, part.voltage)?.id ?? null;
        break;
      case 'ground':
        id = ground?.id ?? null;
        break;
      case 'i2c_sda':
        id = r.i2c.sda;
        break;
      case 'i2c_scl':
        id = r.i2c.scl;
        break;
      case 'spi_mosi':
      case 'spi_miso':
      case 'spi_sck':
      case 'spi_cs':
        id = spiDefaults[q.role] ?? take(r.safeIo);
        break;
      case 'analog_out':
        id = take(r.adcPins);
        break;
      case 'int':
        id = take([...(r.inputPins ?? []), ...r.safeIo]);
        break;
      case 'passive':
        id = null;
        break;
      default:
        id = take(r.safeIo);
    }
    out.push({ part: q, pin: id ? pin(id) : null });
  }
  // SoftwareSerial on the Mega can only receive on pins with pin-change interrupts
  // (ATmega2560 datasheet, PCINT0-23: D10-D13, D50-D53, A8-A15).
  if (b.id === 'arduino-mega-2560') {
    const rxWire = out.find((x) => x.part.role === 'digital_out' && /\bTX\b/.test(x.part.name) && /UART/i.test(x.part.notes ?? ''));
    const txWire = out.find((x) => x.part.role === 'digital_in' && /\bRX\b/.test(x.part.name) && /UART/i.test(x.part.notes ?? ''));
    if (rxWire && pin('D10')) rxWire.pin = pin('D10');
    if (txWire && pin('D11')) txWire.pin = pin('D11');
  }
  return out;
}

/* ---------- Arduino code, written the way each core expects ---------- */

const isEsp = (b) => ['esp32', 'esp32s3', 'esp32c3'].includes(b.family);

/** How a pin is written in code, or null when the pin numbering of the core cannot be stated reliably. */
function pinExpr(b, p) {
  if (!p || p.gpio === null || p.gpio === undefined) return null;
  if (b.family === 'stm32') return p.chipPin ?? [p.label, p.id].find((x) => /^P[A-H]\d{1,2}$/.test(x)) ?? null;
  if (b.family === 'nrf52') return null; // the Arduino core's pin numbers differ from P0.xx; not guessed
  return String(p.gpio);
}

function wireInit(b) {
  const sda = b.pins.find((p) => p.id === b.rules.i2c.sda);
  const scl = b.pins.find((p) => p.id === b.rules.i2c.scl);
  if (isEsp(b)) return `  Wire.begin(${sda.gpio}, ${scl.gpio});  // SDA = ${sda.label}, SCL = ${scl.label}`;
  return `  Wire.begin();  // SDA = ${sda.label}, SCL = ${scl.label} (the board's default I2C pins)`;
}

function readMv(b, expr) {
  if (isEsp(b)) return { setup: '', read: `analogReadMilliVolts(${expr})` };
  const bits = b.family === 'avr' ? 10 : 12;
  return {
    setup: b.family === 'avr' ? '' : '  analogReadResolution(12);\n',
    read: `(long)analogRead(${expr}) * ${b.rules.adcMaxMv}L / ${2 ** bits - 1}`,
  };
}

/**
 * Library-based examples for parts that need one (library names as in the Arduino Library Manager).
 * Each gets the pin expressions of the wired part pins by name, or returns null if a pin is missing.
 */
const LIB_CODE = {
  dht22: (P) => P.DATA && lib('DHT sensor library (Adafruit)', `#include <DHT.h>

DHT dht(${P.DATA}, DHT22);

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  delay(2000);  // the DHT22 needs 2 s between readings
  Serial.print(dht.readTemperature());
  Serial.print(" C  ");
  Serial.print(dht.readHumidity());
  Serial.println(" %");
}`),
  dht11: (P) => P.DATA && lib('DHT sensor library (Adafruit)', `#include <DHT.h>

DHT dht(${P.DATA}, DHT11);

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  delay(2000);
  Serial.print(dht.readTemperature());
  Serial.print(" C  ");
  Serial.print(dht.readHumidity());
  Serial.println(" %");
}`),
  'ds18b20-probe': (P) => P.DQ && lib('OneWire, DallasTemperature', `#include <OneWire.h>
#include <DallasTemperature.h>

OneWire bus(${P.DQ});  // needs a 4.7 kΩ pull-up from DQ to VDD
DallasTemperature sensors(&bus);

void setup() {
  Serial.begin(115200);
  sensors.begin();
  Serial.print("Sensors found: ");
  Serial.println(sensors.getDeviceCount());
}

void loop() {
  sensors.requestTemperatures();
  Serial.println(sensors.getTempCByIndex(0));
  delay(1000);
}`),
  'ws2812b-strip': (P) => P.DIN && lib('Adafruit NeoPixel', `#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel strip(8, ${P.DIN}, NEO_GRB + NEO_KHZ800);  // 8 LEDs

void setup() {
  strip.begin();
  strip.setBrightness(40);  // keep it low when powered from USB
}

void loop() {
  for (int i = 0; i < strip.numPixels(); i++) {
    strip.clear();
    strip.setPixelColor(i, strip.Color(0, 80, 255));
    strip.show();
    delay(100);
  }
}`),
  'servo-sg90': (P, b) => P.SIG && lib(isEsp(b) ? 'ESP32Servo' : 'Servo', `#include <${isEsp(b) ? 'ESP32Servo' : 'Servo'}.h>

Servo servo;

void setup() {
  servo.attach(${P.SIG});
}

void loop() {
  servo.write(0);
  delay(1000);
  servo.write(90);
  delay(1000);
  servo.write(180);
  delay(1000);
}`),
  'tm1637-4digit': (P) => P.CLK && P.DIO && lib('TM1637 (Avishay Orpaz)', `#include <TM1637Display.h>

TM1637Display display(${P.CLK}, ${P.DIO});  // CLK, DIO

void setup() {
  display.setBrightness(4);
}

void loop() {
  display.showNumberDec(millis() / 1000);  // seconds since start
  delay(200);
}`),
  'stepper-28byj48-uln2003': (P) => P.IN1 && P.IN2 && P.IN3 && P.IN4 && lib('Stepper (built in)', `#include <Stepper.h>

// 2048 steps per turn; note the IN1, IN3, IN2, IN4 order for this motor
Stepper motor(2048, ${P.IN1}, ${P.IN3}, ${P.IN2}, ${P.IN4});

void setup() {
  motor.setSpeed(10);  // rpm
}

void loop() {
  motor.step(2048);   // one turn
  delay(500);
  motor.step(-2048);  // and back
  delay(500);
}`),
  'l298n-driver': (P) => P.ENA && P.IN1 && P.IN2 && lib('', `// Motor A: ENA = speed (PWM), IN1/IN2 = direction. Remove the ENA jumper on the module.
void setup() {
  pinMode(${P.IN1}, OUTPUT);
  pinMode(${P.IN2}, OUTPUT);
  pinMode(${P.ENA}, OUTPUT);
}

void loop() {
  digitalWrite(${P.IN1}, HIGH);
  digitalWrite(${P.IN2}, LOW);
  analogWrite(${P.ENA}, 180);  // about 70% speed
  delay(2000);
  analogWrite(${P.ENA}, 0);    // stop
  delay(1000);
}`),
  'rc522-rfid': (P) => P.SDA && P.RST && lib('MFRC522 (miguelbalboa)', `#include <SPI.h>
#include <MFRC522.h>

MFRC522 rfid(${P.SDA}, ${P.RST});  // SDA is the SPI chip select

void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid.PCD_Init();
  rfid.PCD_DumpVersionToSerial();  // 0x91 or 0x92 means the reader answers
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;
  for (byte i = 0; i < rfid.uid.size; i++) Serial.print(rfid.uid.uidByte[i], HEX);
  Serial.println();
  rfid.PICC_HaltA();
}`),
  'sd-card-module': (P) => P.CS && lib('SD (built in)', `#include <SPI.h>
#include <SD.h>

void setup() {
  Serial.begin(115200);
  if (!SD.begin(${P.CS})) {
    Serial.println("No card: check wiring, the card format (FAT32) and power");
    return;
  }
  File f = SD.open("/test.txt", FILE_WRITE);
  f.println("Hello from the board");
  f.close();
  Serial.println("Wrote test.txt");
}

void loop() {}`),
  // UART on any pins: ESP32 hardware serial (any GPIO through the matrix), arduino-pico's SerialPIO,
  // SoftwareSerial on AVR. Other cores need their fixed UART pins, so no code is guessed for them.
  'neo-6m-gps': (P, b) => {
    const rx = P.TX; // the board receives on the pin wired to the GPS TX
    const tx = P.RX;
    if (!rx || !tx) return null;
    const read = `void loop() {
  while (gps.available()) Serial.write(gps.read());  // NMEA sentences, e.g. $GPGGA
}`;
    if (isEsp(b))
      return lib('', `HardwareSerial gps(1);

void setup() {
  Serial.begin(115200);
  gps.begin(9600, SERIAL_8N1, ${rx}, ${tx});  // RX, TX
}

${read}`);
    if (b.family === 'rp2040' || b.family === 'rp2350')
      return lib('', `SerialPIO gps(${tx}, ${rx});  // TX, RX: any pins, through the PIO

void setup() {
  Serial.begin(115200);
  gps.begin(9600);
}

${read}`);
    if (b.family === 'avr')
      return lib('SoftwareSerial (built in)', `#include <SoftwareSerial.h>

SoftwareSerial gps(${rx}, ${tx});  // RX, TX${b.id.includes('mega') ? ' (on the Mega, RX must be 10-13, 50-53 or A8-A15)' : ''}

void setup() {
  Serial.begin(115200);
  gps.begin(9600);
}

${read}`);
    return null;
  },
  'push-button': (P) => P['1'] && lib('', `void setup() {
  Serial.begin(115200);
  pinMode(${P['1']}, INPUT_PULLUP);  // pressed = LOW
}

void loop() {
  Serial.println(digitalRead(${P['1']}) == LOW ? "pressed" : "released");
  delay(100);
}`),
};

function lib(name, code) {
  return name ? `// Library: ${name}\n${code}` : code;
}

export function codeFor(b, part, wires) {
  const w = (role) => wires.find((x) => x.part.role === role);
  const baud = 115200;
  if (LIB_CODE[part.id]) {
    const P = Object.fromEntries(wires.filter((x) => x.pin && pinExpr(b, x.pin)).map((x) => [x.part.name, pinExpr(b, x.pin)]));
    return LIB_CODE[part.id](P, b) || null;
  }
  if (part.bus === 'i2c') {
    const addr = (part.addresses ?? [])[0] ?? '0x3C';
    return `#include <Wire.h>

void setup() {
  Serial.begin(${baud});
${wireInit(b)}
  Wire.beginTransmission(${addr});
  bool found = Wire.endTransmission() == 0;
  Serial.println(found ? "${part.name.replace(/"/g, '')} found at ${addr}" : "Not found: check power, GND and SDA/SCL");
}

void loop() {}`;
  }
  const a = w('analog_out');
  if (a?.pin && pinExpr(b, a.pin)) {
    const e = pinExpr(b, a.pin);
    const m = readMv(b, e);
    return `void setup() {
  Serial.begin(${baud});
${m.setup}}

void loop() {
  long mv = ${m.read};  // ${a.part.name} on ${a.pin.label}
  Serial.println(mv);
  delay(200);
}`;
  }
  const outs = wires.filter((x) => x.part.role === 'digital_out');
  const ins = wires.filter((x) => x.part.role === 'digital_in');
  if (outs.length === 1 && !ins.length && pinExpr(b, outs[0].pin)) {
    const e = pinExpr(b, outs[0].pin);
    return `void setup() {
  Serial.begin(${baud});
  pinMode(${e}, INPUT);  // ${outs[0].part.name} on ${outs[0].pin.label}
}

void loop() {
  Serial.println(digitalRead(${e}));
  delay(100);
}`;
  }
  if (ins.length === 1 && !outs.length && pinExpr(b, ins[0].pin)) {
    const e = pinExpr(b, ins[0].pin);
    return `void setup() {
  pinMode(${e}, OUTPUT);  // ${ins[0].part.name} on ${ins[0].pin.label}
}

void loop() {
  digitalWrite(${e}, HIGH);
  delay(500);
  digitalWrite(${e}, LOW);
  delay(500);
}`;
  }
  if (ins.length === 1 && outs.length === 1 && /TRIG/i.test(ins[0].part.name) && pinExpr(b, ins[0].pin) && pinExpr(b, outs[0].pin)) {
    const t = pinExpr(b, ins[0].pin);
    const e = pinExpr(b, outs[0].pin);
    return `void setup() {
  Serial.begin(${baud});
  pinMode(${t}, OUTPUT);  // TRIG on ${ins[0].pin.label}
  pinMode(${e}, INPUT);   // ECHO on ${outs[0].pin.label}
}

void loop() {
  digitalWrite(${t}, LOW);  delayMicroseconds(2);
  digitalWrite(${t}, HIGH); delayMicroseconds(10);
  digitalWrite(${t}, LOW);
  long us = pulseIn(${e}, HIGH, 30000);
  Serial.println(us / 58.0);  // distance in cm
  delay(200);
}`;
  }
  return null;
}

/* ---------- checks: what goes wrong with this part on this board ---------- */

const T = {
  en: {
    lang: 'en',
    title: '{part} with {board}: wiring and code',
    desc: 'How to connect the {part} to the {board}: which pins to use ({pins}), {v} V supply, the checks that matter on this board, and Arduino code to test it.',
    h1: '{part} with {board}',
    lead: 'Wiring for the {part} on the {board} ({chip}, {logic} V logic), chosen with the same pin rules BoardPilot uses: default buses first, and no pins that are used for flash, USB, the debugger or booting.',
    crumbs: 'Board pinouts',
    tableH: 'Wiring',
    cols: ['{part} pin', 'Role', '{board} pin', 'Notes'],
    none: 'not connected',
    checksH: 'Check before you power it on',
    codeH: 'Test code (Arduino)',
    codeNote: 'Arduino board: {fqbn}. {upload}',
    noCode: 'The Arduino core for this board numbers its pins differently from the chip names, so no code is shown here. Use the pin names from your core’s variant file.',
    faqH: 'Questions',
    otherBoards: 'The {part} on other boards',
    otherParts: 'Other parts on the {board}',
    boardPage: 'Full {board} pinout',
    partPage: '{part}: all pins and data',
    cta: 'BoardPilot checks this wiring in 3D as you build it, and finds crossed or missing wires on the real board.',
    ctaBtn: 'Download BoardPilot',
    roles: {
      power: 'Power', ground: 'Ground', i2c_sda: 'I2C data (SDA)', i2c_scl: 'I2C clock (SCL)', spi_mosi: 'SPI MOSI', spi_miso: 'SPI MISO', spi_sck: 'SPI clock',
      spi_cs: 'SPI chip select', digital_in: 'Input to the part', digital_out: 'Output from the part', analog_out: 'Analog output', onewire: 'One-wire data', int: 'Interrupt', passive: 'Not wired to the board',
    },
    chk: {
      lv33on5: 'The {part} is a {v} V part and the {board} uses 5 V signals. Power it from 3.3 V and put a level shifter on the signal wires, or buy a 5 V version of the module.',
      lv5on33: 'The {part} works at 5 V, so its output ({pins}) can reach 5 V. The {board} pins take only 3.3 V: add a voltage divider (for example 1 kΩ and 2 kΩ) or a level shifter on that wire.',
      lv5tol: 'The {part} works at 5 V. On the {board}, {pins} tolerate 5 V inputs, so a direct connection is fine while the board is powered.',
      i2cFixed: 'I2C uses the board’s default pins {sda} (SDA) and {scl} (SCL). Most modules include pull-up resistors; if the part is not found, check them and swap-test SDA/SCL.',
      i2cRemap: 'I2C can use almost any pins on the {board}; {sda} (SDA) and {scl} (SCL) are the defaults. If the part is not found, the wires may be crossed: try Wire.begin with the two exchanged.',
      power: 'Motors, servos, relays and LED strips can draw more current than the {board}’s pins or USB can give. Power them separately and connect the grounds together.',
      id: 'To make sure it is the real chip, read register {reg}: a genuine part answers {expect}.',
      supply: 'Supply: {v} V from the {pin} pin.',
    },
    faq: {
      pinsQ: 'Which {board} pins do I use for the {part}?',
      pinsA: '{list}.',
      voltQ: 'Does the {part} work with the {board} at {logic} V?',
      voltOk: 'Yes: the {part} runs at {v} V and the {board} uses {logic} V signals, so no level shifting is needed.',
      addrQ: 'What is the I2C address of the {part}?',
      addrA: '{addrs}. An I2C scan (BoardPilot does it for you) shows which one your module uses.',
    },
  },
  it: {
    lang: 'it',
    title: '{part} con {board}: collegamenti e codice',
    desc: 'Come collegare {part} a {board}: quali pin usare ({pins}), alimentazione {v} V, i controlli che contano su questa scheda e codice Arduino per provarlo.',
    h1: '{part} con {board}',
    lead: 'Collegamenti per {part} su {board} ({chip}, logica a {logic} V), scelti con le stesse regole dei pin di BoardPilot: prima i bus predefiniti, e nessun pin usato per la flash, l’USB, il debugger o l’avvio.',
    crumbs: 'Piedinature delle schede',
    tableH: 'Collegamenti',
    cols: ['Pin di {part}', 'Ruolo', 'Pin di {board}', 'Note'],
    none: 'non collegato',
    checksH: 'Controlla prima di alimentare',
    codeH: 'Codice di prova (Arduino)',
    codeNote: 'Scheda Arduino: {fqbn}. {upload}',
    noCode: 'Il core Arduino di questa scheda numera i pin in modo diverso dai nomi del chip, quindi qui non mostriamo codice. Usa i nomi dei pin del file variant del tuo core.',
    faqH: 'Domande',
    otherBoards: '{part} su altre schede',
    otherParts: 'Altri componenti su {board}',
    boardPage: 'Piedinatura completa di {board}',
    partPage: '{part}: tutti i pin e i dati',
    cta: 'BoardPilot controlla questi collegamenti in 3D mentre li fai, e trova fili invertiti o mancanti sulla scheda reale.',
    ctaBtn: 'Scarica BoardPilot',
    roles: {
      power: 'Alimentazione', ground: 'Massa', i2c_sda: 'Dati I2C (SDA)', i2c_scl: 'Clock I2C (SCL)', spi_mosi: 'SPI MOSI', spi_miso: 'SPI MISO', spi_sck: 'Clock SPI',
      spi_cs: 'Chip select SPI', digital_in: 'Ingresso del componente', digital_out: 'Uscita del componente', analog_out: 'Uscita analogica', onewire: 'Dati one-wire', int: 'Interrupt', passive: 'Non collegato alla scheda',
    },
    chk: {
      lv33on5: '{part} funziona a {v} V e {board} usa segnali a 5 V. Alimentalo a 3,3 V e metti un traslatore di livello sui fili dei segnali, oppure compra la versione del modulo a 5 V.',
      lv5on33: '{part} funziona a 5 V, quindi la sua uscita ({pins}) può arrivare a 5 V. I pin di {board} accettano solo 3,3 V: aggiungi un partitore di tensione (per esempio 1 kΩ e 2 kΩ) o un traslatore di livello su quel filo.',
      lv5tol: '{part} funziona a 5 V. Su {board} i pin {pins} tollerano ingressi a 5 V, quindi il collegamento diretto va bene mentre la scheda è alimentata.',
      i2cFixed: 'L’I2C usa i pin predefiniti della scheda {sda} (SDA) e {scl} (SCL). Quasi tutti i moduli hanno già le resistenze di pull-up; se il componente non viene trovato, controllale e prova a scambiare SDA e SCL.',
      i2cRemap: 'Su {board} l’I2C può usare quasi tutti i pin; {sda} (SDA) e {scl} (SCL) sono quelli predefiniti. Se il componente non viene trovato, i fili potrebbero essere invertiti: prova Wire.begin con i due scambiati.',
      power: 'Motori, servo, relè e strisce LED possono assorbire più corrente di quella che i pin o l’USB di {board} possono dare. Alimentali a parte e collega insieme le masse.',
      id: 'Per essere sicuro che sia il chip originale, leggi il registro {reg}: un componente originale risponde {expect}.',
      supply: 'Alimentazione: {v} V dal pin {pin}.',
    },
    faq: {
      pinsQ: 'Quali pin di {board} uso per {part}?',
      pinsA: '{list}.',
      voltQ: '{part} funziona con {board} a {logic} V?',
      voltOk: 'Sì: {part} funziona a {v} V e {board} usa segnali a {logic} V, quindi non serve adattare i livelli.',
      addrQ: 'Qual è l’indirizzo I2C di {part}?',
      addrA: '{addrs}. Una scansione I2C (BoardPilot la fa per te) mostra quale usa il tuo modulo.',
    },
  },
};

const HEAVY = /servo|relay|l298n|stepper|ws2812|motor/i;
const DRIVES = new Set(['digital_out', 'analog_out', 'int', 'spi_miso', 'onewire']);

function checksFor(b, part, wires, t, tr) {
  const out = [];
  const [lo, hi] = range(part.voltage);
  const bn = shortName(b);
  const pn = shortPart(part, t.lang);
  const supply = wires.find((w) => w.part.role === 'power')?.pin;
  if (supply) out.push(fill(t.chk.supply, { v: num(t.lang, supply.supplies), pin: supply.label }));
  if (b.logicVolt >= 5 && hi < 4.5) out.push(fill(t.chk.lv33on5, { part: pn, v: num(t.lang, part.voltage), board: bn }));
  if (b.logicVolt < 4 && lo >= 4.5) {
    const risky = wires.filter((w) => w.pin && DRIVES.has(w.part.role));
    const tolerant = risky.filter((w) => w.pin.flags.includes('five_volt_tolerant') || w.pin.maxVolt >= 5);
    if (risky.length && tolerant.length === risky.length) out.push(fill(t.chk.lv5tol, { part: pn, board: bn, pins: risky.map((w) => w.pin.label).join(', ') }));
    else if (risky.length) out.push(fill(t.chk.lv5on33, { part: pn, board: bn, pins: risky.filter((w) => !tolerant.includes(w)).map((w) => `${w.part.name} → ${w.pin.label}`).join(', ') }));
  }
  if (part.bus === 'i2c') {
    const lab = (id) => b.pins.find((p) => p.id === id)?.label ?? id;
    out.push(fill(b.rules.i2c.remappable ? t.chk.i2cRemap : t.chk.i2cFixed, { board: bn, sda: lab(b.rules.i2c.sda), scl: lab(b.rules.i2c.scl) }));
  }
  if (HEAVY.test(part.id)) out.push(fill(t.chk.power, { board: bn }));
  if (part.idCheck) out.push(fill(t.chk.id, { reg: part.idCheck.register, expect: part.idCheck.expect }));
  return out;
}

/* ---------- pages ---------- */

/**
 * A pin as users read it: the silkscreen label, plus the chip pin name when it differs (PA5, P0.13),
 * or the GPIO number on boards where code uses GPIO numbers (ESP32, RP2040). STM32 and nRF52 pins
 * never show the internal numbering the board files use.
 */
function pinText(p, b) {
  const chip = p.chipPin ?? (b && b.family === 'stm32' ? [p.id, p.label].find((x) => /^P[A-H]\d{1,2}$/.test(x)) : undefined);
  if (chip && chip !== p.label) return `${p.label} (${chip})`;
  if (b && (b.family === 'stm32' || b.family === 'nrf52')) return p.label;
  return p.gpio !== null && !new RegExp(`(^|\\D)${p.gpio}$`).test(p.label) ? `${p.label} (GPIO ${p.gpio})` : p.label;
}

export function buildGuides({ lang, boards, parts, site, head, header, footer, IT = {} }) {
  const t = T[lang];
  const tr = (s) => (lang === 'it' && s && IT[s]) || s;
  const pre = lang === 'it' ? '/it' : '';
  const home = lang === 'it' ? '/it/' : '/';
  const pages = {};
  const sitemap = [];
  const popular = POPULAR.map((id) => parts.find((p) => p.id === id)).filter(Boolean);
  const guideBoards = boards.filter((b) => b.id !== 'esp32-devkitc-30');
  const partUrl = (id) => `${pre}/parts/${id}/`;
  for (const b of guideBoards) {
    const bn = shortName(b);
    for (const part of popular) {
      const wires = wireFor(b, part);
      const code = codeFor(b, part, wires);
      const sp = shortPart(part, lang);
      const url = `${site}${guidePath(lang, b.id, part.id)}`;
      // Part notes were written for the ESP32 DevKit. Keep the ones that hold on any board, show
      // VIN as this board's real 5 V pin, and on Italian pages only notes that have a translation.
      const note = (n, w) => {
        if (!n || /GPIO\s*\d|ADC[12]\b|\bD\d{1,2}\b|strapping|input-only|DAC|ESP32/i.test(n)) return '';
        if (lang === 'it' && !IT[n]) return '';
        let text = tr(n);
        if (w.part.role === 'power' && w.pin) text = text.replace(/\bVIN\b/g, w.pin.label);
        return text;
      };
      const rows = wires
        .map(
          (w) =>
            `<tr><td class="mono">${esc(w.part.name)}</td><td>${esc(t.roles[w.part.role] ?? w.part.role)}</td><td class="mono">${w.pin ? esc(pinText(w.pin, b)) : `<span class="dim">${esc(t.none)}</span>`}</td><td>${esc(note(w.part.notes, w))}</td></tr>`,
        )
        .join('\n');
      const pinsShort = wires
        .filter((w) => w.pin && w.part.role !== 'power' && w.part.role !== 'ground')
        .map((w) => `${w.part.name} → ${w.pin.label}`)
        .join(', ');
      const checks = checksFor(b, part, wires, t, tr);
      const faq = [];
      faq.push([
        fill(t.faq.pinsQ, { board: bn, part: sp }),
        fill(t.faq.pinsA, { list: wires.filter((w) => w.pin).map((w) => `${w.part.name} → ${pinText(w.pin, b)}`).join(', ') }),
      ]);
      const [lo, hi] = range(part.voltage);
      const levelIssue = checks.find((c) => c.includes('level') || c.includes('livello') || c.includes('divider') || c.includes('partitore'));
      faq.push([
        fill(t.faq.voltQ, { board: bn, part: sp, logic: num(lang, b.logicVolt) }),
        levelIssue ?? fill(t.faq.voltOk, { board: bn, part: sp, v: num(lang, part.voltage), logic: num(lang, b.logicVolt) }),
      ]);
      if (part.addresses?.length) faq.push([fill(t.faq.addrQ, { part: sp }), fill(t.faq.addrA, { addrs: part.addresses.join(lang === 'it' ? ' o ' : ' or ') })]);
      void lo;
      void hi;
      const others = guideBoards.filter((x) => x.id !== b.id).map((x) => `<a href="${guidePath(lang, x.id, part.id)}">${esc(shortName(x))}</a>`);
      others.unshift(`<a href="${partUrl(part.id)}">ESP32 DevKit</a>`);
      const otherParts = popular.filter((x) => x.id !== part.id).map((x) => `<a href="${guidePath(lang, b.id, x.id)}">${esc(shortPart(x, lang))}</a>`);
      const title = fill(t.title, { part: sp, board: bn });
      const description = fill(t.desc, { part: sp, board: bn, pins: pinsShort || '—', v: num(lang, part.voltage) });
      const ld = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'HowTo',
            name: fill(t.h1, { part: sp, board: bn }),
            description,
            inLanguage: lang,
            url,
            tool: [{ '@type': 'HowToTool', name: b.name }, { '@type': 'HowToTool', name: part.name }],
            step: wires
              .filter((w) => w.pin)
              .map((w, i) => ({ '@type': 'HowToStep', position: i + 1, name: `${w.part.name} → ${w.pin.label}`, text: `${w.part.name} (${t.roles[w.part.role] ?? w.part.role}) → ${pinText(w.pin, b)}` })),
          },
          { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'BoardPilot', item: `${site}${home}` },
              { '@type': 'ListItem', position: 2, name: t.crumbs, item: `${site}${pre}/boards/` },
              { '@type': 'ListItem', position: 3, name: b.name, item: `${site}${boardPath(lang, b.id)}` },
              { '@type': 'ListItem', position: 4, name: part.name, item: url },
            ],
          },
        ],
      };
      const rel = `${lang === 'it' ? 'it/' : ''}boards/${b.id}/${part.id}/index.html`;
      pages[rel] = head({
        image: `/img/boards/${b.id}.jpg`,
        lang,
        title,
        description,
        url,
        alt: { en: `/boards/${b.id}/${part.id}/`, it: `/it/boards/${b.id}/${part.id}/` },
        ld,
        body: `${header}
    <main class="article">
      <div class="wrap narrow">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="${home}">BoardPilot</a> / <a href="${pre}/boards/">${esc(t.crumbs)}</a> / <a href="${boardPath(lang, b.id)}">${esc(b.name)}</a> / <span>${esc(part.name)}</span></nav>
        <h1>${esc(fill(t.h1, { part: sp, board: bn }))}</h1>
        <p class="lead">${esc(fill(t.lead, { part: part.name, board: bn, chip: b.chip, logic: num(lang, b.logicVolt) }))}</p>
        <h2>${esc(t.tableH)}</h2>
        <div class="table-wrap"><table class="pin-table">
          <thead><tr>${t.cols.map((c) => `<th>${esc(fill(c, { part: sp, board: bn }))}</th>`).join('')}</tr></thead>
          <tbody>
${rows}
          </tbody>
        </table></div>
        <h2>${esc(t.checksH)}</h2>
        <ul class="checks">${checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
        ${gotchaList(gotchasOn(part, b), lang, tr)}
        <h2>${esc(t.codeH)}</h2>
        ${code ? `<pre class="code"><code>${esc(code)}</code></pre>` : `<p>${esc(t.noCode)}</p>`}
        <p class="fine">${esc(fill(t.codeNote, { fqbn: b.toolchain.fqbn, upload: b.toolchain.uploadNote ? tr(b.toolchain.uploadNote) : '' }))}</p>
        <h2>${esc(t.faqH)}</h2>
        ${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n        ')}
        <div class="cta-box">
          <p>${esc(t.cta)}</p>
          <a class="btn primary" href="${home}#download">${esc(t.ctaBtn)}</a>
        </div>
        <p><a href="${boardPath(lang, b.id)}">${esc(fill(t.boardPage, { board: bn }))}</a> · <a href="${partUrl(part.id)}">${esc(fill(t.partPage, { part: part.name }))}</a></p>
        <h2>${esc(fill(t.otherBoards, { part: sp }))}</h2>
        <p class="link-cloud">${others.join(' ')}</p>
        <h2>${esc(fill(t.otherParts, { board: bn }))}</h2>
        <p class="link-cloud">${otherParts.join(' ')}</p>
      </div>
    </main>
${footer}`,
      });
      sitemap.push({ en: `/boards/${b.id}/${part.id}/`, it: `/it/boards/${b.id}/${part.id}/` });
    }
  }
  return { pages, sitemap: lang === 'en' ? sitemap : [] };
}

/** Links to the wiring guides, for a board page. */
export function guideLinks(lang, board, parts) {
  if (board.id === 'esp32-devkitc-30') return POPULAR.map((id) => parts.find((p) => p.id === id)).filter(Boolean).map((p) => `<a href="${lang === 'it' ? '/it' : ''}/parts/${p.id}/">${esc(shortPart(p, lang))}</a>`).join(' ');
  return POPULAR.map((id) => parts.find((p) => p.id === id)).filter(Boolean).map((p) => `<a href="${guidePath(lang, board.id, p.id)}">${esc(shortPart(p, lang))}</a>`).join(' ');
}

/** Links from a part page to the same part on every board. */
export function partBoardLinks(lang, part, boards) {
  if (!POPULAR.includes(part.id)) return '';
  return boards
    .filter((b) => b.id !== 'esp32-devkitc-30')
    .map((b) => `<a href="${guidePath(lang, b.id, part.id)}">${esc(shortName(b))}</a>`)
    .join(' ');
}

/* ---------- per-board questions and answers (board pages) ---------- */

const FQ = {
  en: {
    i2cQ: 'Which pins are I2C on the {board}?',
    i2cA: 'SDA is {sda} and SCL is {scl} (the defaults of the Arduino Wire library). {remap}',
    remapY: 'You can move I2C to other pins with Wire.begin(sda, scl).',
    remapN: 'Only certain pins support I2C in hardware, so use these unless you know your core allows others.',
    avoidQ: 'Which {board} pins should I avoid?',
    avoidA: '{list}.',
    avoidNone: 'No header pin is reserved for flash, USB or the debugger; the power and ground pins are the only ones that are not GPIO.',
    fiveQ: 'Is the {board} 5 V tolerant?',
    five5: 'The {board} runs at 5 V, so 5 V sensors connect directly. 3.3 V-only parts need a level shifter.',
    fiveSome: 'The chip runs at 3.3 V, but these pins tolerate 5 V inputs: {pins}. The others take at most 3.3 V.',
    fiveNone: 'No. The pins take at most {v} V. Use a level shifter or a voltage divider for 5 V signals.',
    adcQ: 'Which pins can read analog voltage on the {board}?',
    adcA: '{pins}, from 0 to {max} V.',
    uploadQ: 'How do I upload code to the {board}?',
    uploadA: 'In the Arduino IDE pick the board {fqbn} (core {core}). {note}',
  },
  it: {
    i2cQ: 'Quali sono i pin I2C di {board}?',
    i2cA: 'SDA è {sda} e SCL è {scl} (quelli predefiniti della libreria Wire di Arduino). {remap}',
    remapY: 'Puoi spostare l’I2C su altri pin con Wire.begin(sda, scl).',
    remapN: 'Solo alcuni pin supportano l’I2C in hardware, quindi usa questi a meno che il tuo core non ne permetta altri.',
    avoidQ: 'Quali pin di {board} devo evitare?',
    avoidA: '{list}.',
    avoidNone: 'Nessun pin del connettore è riservato a flash, USB o debugger; solo i pin di alimentazione e massa non sono GPIO.',
    fiveQ: '{board} tollera i 5 V?',
    five5: '{board} funziona a 5 V, quindi i sensori a 5 V si collegano direttamente. I componenti solo a 3,3 V richiedono un traslatore di livello.',
    fiveSome: 'Il chip funziona a 3,3 V, ma questi pin tollerano ingressi a 5 V: {pins}. Gli altri accettano al massimo 3,3 V.',
    fiveNone: 'No. I pin accettano al massimo {v} V. Per segnali a 5 V usa un traslatore di livello o un partitore di tensione.',
    adcQ: 'Quali pin di {board} leggono una tensione analogica?',
    adcA: '{pins}, da 0 a {max} V.',
    uploadQ: 'Come carico il codice su {board}?',
    uploadA: 'Nell’IDE Arduino scegli la scheda {fqbn} (core {core}). {note}',
  },
};

const AVOID = {
  en: { flash: 'flash memory', strapping_critical: 'stops booting if held at the wrong level', usb: 'native USB', swd: 'debug port', uart0: 'USB serial link', input_only: 'input only', reserved: 'used on the board' },
  it: { flash: 'memoria flash', strapping_critical: 'impedisce l’avvio se al livello sbagliato', usb: 'USB nativa', swd: 'porta di debug', uart0: 'seriale USB', input_only: 'sola lettura', reserved: 'usato sulla scheda' },
};

export function boardFaq(lang, b, tr = (s) => s) {
  const f = FQ[lang];
  const bn = shortName(b);
  const lab = (id) => b.pins.find((p) => p.id === id)?.label ?? id;
  const out = [];
  out.push([fill(f.i2cQ, { board: bn }), fill(f.i2cA, { sda: lab(b.rules.i2c.sda), scl: lab(b.rules.i2c.scl), remap: b.rules.i2c.remappable ? f.remapY : f.remapN })]);
  const groups = Object.entries(AVOID[lang])
    .map(([flag, what]) => {
      const ps = b.pins.filter((p) => p.flags.includes(flag) && !p.sameAs);
      return ps.length ? `${ps.map((p) => p.label).join(', ')} (${what})` : null;
    })
    .filter(Boolean);
  out.push([fill(f.avoidQ, { board: bn }), groups.length ? fill(f.avoidA, { list: groups.join('; ') }) : f.avoidNone]);
  const ft = b.pins.filter((p) => p.kind === 'gpio' && p.flags.includes('five_volt_tolerant') && !p.sameAs);
  out.push([
    fill(f.fiveQ, { board: bn }),
    b.logicVolt >= 5 ? fill(f.five5, { board: bn }) : ft.length ? fill(f.fiveSome, { pins: ft.map((p) => p.label).join(', ') }) : fill(f.fiveNone, { v: b.logicVolt }),
  ]);
  if (b.rules.adcPins.length) out.push([fill(f.adcQ, { board: bn }), fill(f.adcA, { pins: b.rules.adcPins.map(lab).join(', '), max: b.rules.adcMaxMv / 1000 })]);
  out.push([fill(f.uploadQ, { board: bn }), fill(f.uploadA, { fqbn: b.toolchain.fqbn, core: b.toolchain.core, note: b.toolchain.uploadNote ? tr(b.toolchain.uploadNote) : '' }).trim()]);
  return out;
}

/* ---------- comparison pages ---------- */

export const PAIRS = [
  ['esp32-devkitc-30', 'rpi-pico'],
  ['esp32-devkitc-30', 'arduino-uno-r3'],
  ['esp32-devkitc-30', 'esp32-s3-devkitc-1'],
  ['esp32-c3-devkitm-1', 'esp32-devkitc-30'],
  ['arduino-uno-r3', 'arduino-nano'],
  ['arduino-uno-r3', 'arduino-mega-2560'],
  ['rpi-pico', 'rpi-pico-2'],
  ['rpi-pico', 'rpi-pico-w'],
  ['rpi-pico', 'arduino-nano'],
  ['blackpill-f411ce', 'rpi-pico'],
  ['nucleo-f401re', 'blackpill-f411ce'],
  ['teensy-41', 'rpi-pico-2'],
];

const CQ = {
  en: {
    title: '{a} vs {b}: pins, voltage and features compared',
    desc: '{a} vs {b}: processor, logic voltage, GPIO and analog pins, I2C and SPI defaults, 5 V tolerance and flashing, side by side.',
    h1: '{a} vs {b}',
    lead: 'The two boards side by side, from the same board files BoardPilot uses to check your wiring.',
    crumbs: 'Comparisons',
    rows: ['Chip', 'Processor', 'Logic level', 'Header pins', 'GPIO pins', 'Analog inputs', 'Default I2C', 'Default SPI', '5 V tolerant inputs', 'Flashing tool', 'Arduino board'],
    yes: 'yes', no: 'no', some: '{n} pins',
    pick: 'Which one to pick?',
    pickA: 'Pick the {board} if you need {why}.',
    why: { wifi: 'Wi-Fi or Bluetooth', five: '5 V signals without level shifters', gpio: 'more GPIO pins ({n})', adc: 'more analog inputs ({n})', cpu: 'the faster processor' },
    full: 'Full pinout',
  },
  it: {
    title: '{a} vs {b}: pin, tensione e caratteristiche a confronto',
    desc: '{a} vs {b}: processore, tensione logica, pin GPIO e analogici, I2C e SPI predefiniti, tolleranza ai 5 V e programmazione, fianco a fianco.',
    h1: '{a} vs {b}',
    lead: 'Le due schede fianco a fianco, dagli stessi file che BoardPilot usa per controllare i collegamenti.',
    crumbs: 'Confronti',
    rows: ['Chip', 'Processore', 'Livello logico', 'Pin del connettore', 'Pin GPIO', 'Ingressi analogici', 'I2C predefinito', 'SPI predefinito', 'Ingressi che tollerano 5 V', 'Strumento di programmazione', 'Scheda Arduino'],
    yes: 'sì', no: 'no', some: '{n} pin',
    pick: 'Quale scegliere?',
    pickA: 'Scegli {board} se ti serve {why}.',
    why: { wifi: 'Wi-Fi o Bluetooth', five: 'usare segnali a 5 V senza traslatori di livello', gpio: 'più pin GPIO ({n})', adc: 'più ingressi analogici ({n})', cpu: 'il processore più veloce' },
    full: 'Piedinatura completa',
  },
};

const TOOL = { esptool: 'esptool', picotool: 'picotool (UF2)', avrdude: 'avrdude', stm32: 'STM32CubeProgrammer / stlink / dfu-util', nrfjprog: 'nrfjprog', teensy: 'Teensy Loader' };
const mhz = (b) => Number((/(\d+)\s*MHz/i.exec(b.cpu) ?? [])[1] ?? 0);
const wifi = (b) => /Wi-?Fi|Bluetooth|BLE/i.test(b.cpu + ' ' + b.summary);

export const comparePath = (lang, a, b) => `${lang === 'it' ? '/it' : ''}/compare/${a}-vs-${b}/`;

export function buildCompare({ lang, boards, site, head, header, footer }) {
  const c = CQ[lang];
  const pre = lang === 'it' ? '/it' : '';
  const home = lang === 'it' ? '/it/' : '/';
  const pages = {};
  const sitemap = [];
  const byId = Object.fromEntries(boards.map((b) => [b.id, b]));
  for (const [ia, ib] of PAIRS) {
    const A = byId[ia];
    const B = byId[ib];
    if (!A || !B) continue;
    const an = shortName(A);
    const bn = shortName(B);
    const lab = (b, id) => b.pins.find((p) => p.id === id)?.label ?? id;
    const gpio = (b) => new Set(b.pins.filter((p) => p.kind === 'gpio').map((p) => p.gpio)).size;
    const adc = (b) => new Set(b.pins.filter((p) => p.flags.some((f) => /^adc/.test(f))).map((p) => p.gpio)).size;
    const ft = (b) => (b.logicVolt >= 5 ? c.yes : (() => { const n = b.pins.filter((p) => p.kind === 'gpio' && p.flags.includes('five_volt_tolerant') && !p.sameAs).length; return n ? fill(c.some, { n }) : c.no; })());
    const cells = (b) => [
      b.chip,
      b.cpu,
      `${b.logicVolt} V`,
      String(b.pins.filter((p) => !p.sameAs).length),
      String(gpio(b)),
      String(adc(b)),
      `SDA ${lab(b, b.rules.i2c.sda)}, SCL ${lab(b, b.rules.i2c.scl)}`,
      b.rules.spi ? `MOSI ${lab(b, b.rules.spi.mosi)}, MISO ${lab(b, b.rules.spi.miso)}, SCK ${lab(b, b.rules.spi.sck)}` : '—',
      ft(b),
      TOOL[b.toolchain.flasher],
      b.toolchain.fqbn,
    ];
    const ca = cells(A);
    const cb = cells(B);
    const rows = c.rows.map((r, i) => `<tr><th>${esc(r)}</th><td>${esc(ca[i])}</td><td>${esc(cb[i])}</td></tr>`).join('\n');
    const picks = [];
    for (const [X, xn, Y] of [[A, an, B], [B, bn, A]]) {
      const why = [];
      if (wifi(X) && !wifi(Y)) why.push(c.why.wifi);
      if (X.logicVolt > Y.logicVolt) why.push(c.why.five);
      if (gpio(X) > gpio(Y) + 2) why.push(fill(c.why.gpio, { n: gpio(X) }));
      if (adc(X) > adc(Y) + 1) why.push(fill(c.why.adc, { n: adc(X) }));
      if (mhz(X) > mhz(Y) * 1.3) why.push(c.why.cpu);
      if (why.length) picks.push(fill(c.pickA, { board: xn, why: why.join(lang === 'it' ? ', ' : ', ') }));
    }
    const url = `${site}${comparePath(lang, ia, ib)}`;
    const title = fill(c.title, { a: an, b: bn });
    const description = fill(c.desc, { a: an, b: bn });
    pages[`${lang === 'it' ? 'it/' : ''}compare/${ia}-vs-${ib}/index.html`] = head({
      image: `/img/boards/${ia}.jpg`,
      lang,
      title,
      description,
      url,
      alt: { en: `/compare/${ia}-vs-${ib}/`, it: `/it/compare/${ia}-vs-${ib}/` },
      ld: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: fill(c.h1, { a: an, b: bn }),
        description,
        inLanguage: lang,
        url,
        about: [{ '@type': 'Product', name: A.name, brand: A.vendor }, { '@type': 'Product', name: B.name, brand: B.vendor }],
      },
      body: `${header}
    <main class="article">
      <div class="wrap narrow">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="${home}">BoardPilot</a> / <a href="${pre}/boards/">${esc(lang === 'it' ? 'Piedinature delle schede' : 'Board pinouts')}</a> / <span>${esc(fill(c.h1, { a: an, b: bn }))}</span></nav>
        <h1>${esc(fill(c.h1, { a: an, b: bn }))}</h1>
        <p class="lead">${esc(c.lead)}</p>
        <div class="table-wrap"><table class="pin-table compare-table">
          <thead><tr><th></th><th><a href="${boardPath(lang, ia)}">${esc(A.name)}</a></th><th><a href="${boardPath(lang, ib)}">${esc(B.name)}</a></th></tr></thead>
          <tbody>
${rows}
          </tbody>
        </table></div>
        ${picks.length ? `<h2>${esc(c.pick)}</h2><ul class="checks">${picks.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        <p><a href="${boardPath(lang, ia)}">${esc(c.full)}: ${esc(an)}</a> · <a href="${boardPath(lang, ib)}">${esc(c.full)}: ${esc(bn)}</a></p>
      </div>
    </main>
${footer}`,
    });
    if (lang === 'en') sitemap.push({ en: `/compare/${ia}-vs-${ib}/`, it: `/it/compare/${ia}-vs-${ib}/` });
  }
  return { pages, sitemap };
}

export function compareLinks(lang, boardId, boards) {
  const byId = Object.fromEntries(boards.map((b) => [b.id, b]));
  return PAIRS.filter(([a, b]) => (a === boardId || b === boardId) && byId[a] && byId[b])
    .map(([a, b]) => `<a href="${comparePath(lang, a, b)}">${esc(shortName(byId[a]))} vs ${esc(shortName(byId[b]))}</a>`)
    .join(' ');
}

/** Every comparison, for the boards index. */
export function allCompareLinks(lang, boards) {
  const byId = Object.fromEntries(boards.map((b) => [b.id, b]));
  return PAIRS.filter(([a, b]) => byId[a] && byId[b])
    .map(([a, b]) => `<a href="${comparePath(lang, a, b)}">${esc(shortName(byId[a]))} vs ${esc(shortName(byId[b]))}</a>`)
    .join(' ');
}
