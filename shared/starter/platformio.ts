// PlatformIO export: the Code panel's files as a PlatformIO project.
//
// Output: platformio.ini, src/ (the sketch as src/main.cpp, .c/.cpp files), include/ (headers) and
// any other file at the top. The PlatformIO board id is the board file's `toolchain.pioBoard`
// (source: docs.platformio.org/en/latest/boards); the platform follows the board family. Libraries
// come from the #include lines of the code, looked up in PIO_LIBS (registry names from
// registry.platformio.org); an include with no known name is listed in a comment of the ini and in
// the notes instead of being guessed. A TFT_eSPI User_Setup.h (what Display Studio writes) becomes
// -D build flags, one per line, so the library reads its pins from platformio.ini.

import type { BoardDef, ProjectFile } from '../types';
import { t } from '../i18n';
import { isBuildIni, isHeaderFile } from '../codeProject';
import { slug, type StarterFile, type StarterProject } from './common';

/** Platform of each board family (PlatformIO's platform ids; RP2040/RP2350 use the Arduino-Pico core, as the app's arduino-cli core does). */
const PLATFORM: Record<BoardDef['family'], string[]> = {
  esp32: ['platform = espressif32'],
  esp32s3: ['platform = espressif32'],
  esp32c3: ['platform = espressif32'],
  rp2040: ['platform = https://github.com/maxgerhardt/platform-raspberrypi.git', 'board_build.core = earlephilhower'],
  rp2350: ['platform = https://github.com/maxgerhardt/platform-raspberrypi.git', 'board_build.core = earlephilhower'],
  avr: ['platform = atmelavr'],
  stm32: ['platform = ststm32'],
  nrf52: ['platform = nordicnrf52'],
  imxrt: ['platform = teensy'],
};

/** Library Manager names (owner/name) by header, lower-case, no path. Only entries whose registry name is known. */
const PIO_LIBS: Record<string, string> = {
  'adafruit_bme280.h': 'adafruit/Adafruit BME280 Library',
  'adafruit_bmp280.h': 'adafruit/Adafruit BMP280 Library',
  'adafruit_ssd1306.h': 'adafruit/Adafruit SSD1306',
  'adafruit_gfx.h': 'adafruit/Adafruit GFX Library',
  'adafruit_ili9341.h': 'adafruit/Adafruit ILI9341',
  'adafruit_st7789.h': 'adafruit/Adafruit ST7735 and ST7789 Library',
  'adafruit_st7735.h': 'adafruit/Adafruit ST7735 and ST7789 Library',
  'adafruit_gc9a01a.h': 'adafruit/Adafruit GC9A01A',
  'adafruit_neopixel.h': 'adafruit/Adafruit NeoPixel',
  'adafruit_mpu6050.h': 'adafruit/Adafruit MPU6050',
  'adafruit_sht31.h': 'adafruit/Adafruit SHT31 Library',
  'adafruit_ina219.h': 'adafruit/Adafruit INA219',
  'adafruit_unified_sensor.h': 'adafruit/Adafruit Unified Sensor',
  'dht.h': 'adafruit/DHT sensor library',
  'tft_espi.h': 'bodmer/TFT_eSPI',
  'lovyangfx.hpp': 'lovyan03/LovyanGFX',
  'lvgl.h': 'lvgl/lvgl@^8.3.11',
  'u8g2lib.h': 'olikraus/U8g2',
  'onewire.h': 'paulstoffregen/OneWire',
  'dallastemperature.h': 'milesburton/DallasTemperature',
  'pubsubclient.h': 'knolleary/PubSubClient',
};

/** Headers that come with the board's core (or with the Arduino framework): no lib_deps line. */
const CORE_HEADERS = new Set([
  'arduino.h', 'wire.h', 'spi.h', 'softwareserial.h', 'hardwareserial.h', 'wifi.h', 'wificlientsecure.h', 'webserver.h', 'httpclient.h', 'preferences.h', 'eeprom.h',
  'servo.h', 'ledc.h', 'sd.h', 'fs.h', 'spiffs.h', 'littlefs.h', 'ticker.h', 'update.h', 'esp_sleep.h', 'ble.h', 'bluetoothserial.h',
]);

/** Headers of the project's own files, so a local #include "pins.h" is never taken for a library. */
const baseName = (path: string) => path.replace(/^.*\//, '').toLowerCase();

/** `#define NAME value` lines of a User_Setup.h as -D flags (commented-out defines and comments dropped). */
export function userSetupFlags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    const m = /^#define\s+(\w+)(?:\s+(.+?))?$/.exec(line);
    if (!m) continue;
    const value = m[2]?.trim();
    // a value with spaces or quotes would need shell quoting in the ini: keep to plain tokens
    out.push(value && /^[\w.+-]+$/.test(value) ? `-D ${m[1]}=${value}` : value ? '' : `-D ${m[1]}`);
  }
  return out.filter(Boolean);
}

/** The Serial baud rate the code opens, or 115200. */
export function serialBaud(code: string): number {
  const m = /\bSerial\d?\.begin\s*\(\s*(\d{3,7})\s*[,)]/.exec(code);
  return m ? Number(m[1]) : 115200;
}

/** Every #include <...> / "..." header name of the code (lower-case, no path), in order of appearance. */
export function includedHeaders(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/^[ \t]*#[ \t]*include[ \t]*[<"]([^>"\n]+)[>"]/gm)) out.push(baseName(m[1]));
  return out;
}

export interface PlatformioOptions {
  /** Project name for the folder. */
  name?: string;
}

/**
 * The PlatformIO project for the Code panel's files. `files[0]` is the main sketch (the order
 * projectFiles gives). An existing platformio.ini in the project is kept as it is.
 */
export function generatePlatformio(files: ProjectFile[], board: BoardDef, opts: PlatformioOptions = {}): StarterProject {
  const notes: string[] = [];
  const mainName = files[0]?.name ?? 'sketch.ino';
  const own = new Set(files.map((f) => baseName(f.name)));
  const out: StarterFile[] = [];
  const flags: string[] = [];
  let ownIni: ProjectFile | undefined;
  let hasTft = false;
  const allCode: string[] = [];

  for (const f of files) {
    const base = f.name.replace(/^.*\//, '');
    if (isBuildIni(f.name)) {
      ownIni = f;
      continue;
    }
    if (base.toLowerCase() === 'user_setup.h') {
      // TFT_eSPI's setup file: PlatformIO passes the same lines as build flags
      flags.push(...userSetupFlags(f.text));
      hasTft = true;
      continue;
    }
    if (/\.(ino|pde)$/i.test(f.name)) {
      allCode.push(f.text);
      const isMain = f.name === mainName;
      const target = isMain ? 'src/main.cpp' : `src/${base.replace(/\.(ino|pde)$/i, '')}.cpp`;
      out.push({ name: target, text: `#include <Arduino.h>\n\n${f.text}` });
      continue;
    }
    if (/\.(c|cc|cpp|cxx)$/i.test(f.name)) {
      allCode.push(f.text);
      out.push({ name: f.name.includes('/') ? f.name : `src/${f.name}`, text: f.text });
    } else if (isHeaderFile(f.name)) {
      allCode.push(f.text);
      out.push({ name: f.name.includes('/') ? f.name : `include/${f.name}`, text: f.text });
    } else out.push({ name: f.name, text: f.text });
  }

  if (!out.some((f) => f.name === 'src/main.cpp')) notes.push(t('The main sketch is not an .ino file, so there is no src/main.cpp. Rename the file that holds setup() and loop() to main.cpp.'));
  if (files.filter((f) => /\.(ino|pde)$/i.test(f.name)).length > 1) {
    notes.push(t('PlatformIO does not join several .ino files into one. Each became its own .cpp file: declare the functions you share between them in a header.'));
  }
  if (/\.(ino|pde)$/i.test(mainName)) notes.push(t('The Arduino IDE adds function declarations for you; PlatformIO does not. If the build says a function “was not declared”, move it above the code that calls it or add its declaration at the top.'));

  // libraries: from the includes
  const deps: string[] = [];
  const unknown: string[] = [];
  for (const h of new Set(allCode.flatMap(includedHeaders))) {
    if (own.has(h) || CORE_HEADERS.has(h)) continue;
    const lib = PIO_LIBS[h];
    if (lib) {
      if (!deps.includes(lib)) deps.push(lib);
    } else if (!h.startsWith('esp_') && !h.startsWith('freertos/') && !unknown.includes(h)) unknown.push(h);
  }
  if (hasTft && !deps.includes('bodmer/TFT_eSPI')) deps.push('bodmer/TFT_eSPI');
  if (hasTft) flags.unshift('-D USER_SETUP_LOADED=1');
  if (hasTft) notes.push(t('TFT_eSPI reads its pins from platformio.ini here: User_Setup.h became -D build flags, so no library file needs editing.'));
  if (unknown.length) notes.push(t('No PlatformIO library name is known for: {headers}. If the build cannot find them, search for the library at registry.platformio.org and add it under lib_deps.', { headers: unknown.join(', ') }));

  const pio = board.toolchain.pioBoard;
  if (!pio) notes.push(t('This board file has no PlatformIO board id yet. Replace “board =” in platformio.ini with the id from docs.platformio.org/en/latest/boards.'));
  if (board.family === 'rp2040' || board.family === 'rp2350') notes.push(t('For the Raspberry Pi Pico boards the project uses the community Arduino-Pico platform (the same core BoardPilot builds with).'));

  const baud = serialBaud(allCode.join('\n'));
  if (ownIni) {
    notes.push(t('The project already has a platformio.ini: it is kept as it is.'));
    out.push({ name: 'platformio.ini', text: ownIni.text });
  } else {
    const ini = [
      '; PlatformIO project written by BoardPilot from the Code panel.',
      `; Board: ${board.name}`,
      '',
      `[env:${pio ?? 'board'}]`,
      ...PLATFORM[board.family],
      `board = ${pio ?? 'CHANGE_ME  ; the PlatformIO id of your board'}`,
      'framework = arduino',
      `monitor_speed = ${baud}`,
      ...(deps.length ? ['lib_deps =', ...deps.map((d) => `    ${d}`)] : []),
      ...(unknown.length ? [`; includes with no known library name: ${unknown.join(', ')}`] : []),
      ...(flags.length ? ['build_flags =', ...flags.map((f) => `    ${f}`)] : []),
      '',
    ].join('\n');
    out.unshift({ name: 'platformio.ini', text: ini });
  }
  return { folder: slug(opts.name?.trim() || mainName.replace(/\.\w+$/, '')) + '-pio', files: out, notes };
}
