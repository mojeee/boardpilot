// Past projects: reading old projects from their files, finding similar ones, the scanner limits,
// the index with the user's edits, and the assistant tool.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PARTS } from '@shared/board';
import { analyzeProject, partForName, mcuFamily } from '@shared/archive/extract';
import { HEADERS } from '@shared/archive/includeMap';
import { similarProjects } from '@shared/archive/similarity';
import { applyEdit, cleanEdit, parseIndex } from '@shared/archive/entries';
import { SAMPLE_ARCHIVE } from '@shared/archive/sample';
import type { ArchiveEntry, ProjectFile } from '@shared/archive/types';
import { scanFolder } from '../app/main/archive/scanner';
import { ArchiveStore } from '../app/main/archive/archiveStore';
import { runTool, TOOLS, type ToolTurnState } from '../app/main/ai/tools';
import type { HardwareHub } from '../app/main/hardware/hub';

const file = (path: string, text: string, mtime = 1): ProjectFile => ({ path, text, size: text.length, mtime });
const analyze = (files: ProjectFile[], name = 'p') => analyzeProject('/x/' + name, '/x', name, files, PARTS, 0);
const values = <T,>(facts: { value: T }[]) => facts.map((f) => f.value);
const partIds = (p: { parts: { value: { partId?: string; name: string } }[] }) => p.parts.map((f) => f.value.partId ?? f.value.name);

describe('include map', () => {
  it('points only at parts that exist in the library', () => {
    for (const [h, f] of Object.entries(HEADERS)) if (f.partId) expect(PARTS[f.partId], h).toBeTruthy();
  });
});

describe('extractors', () => {
  it('reads a PlatformIO project: board, framework, lib_deps and the sources', () => {
    const p = analyze([
      file('platformio.ini', '[env:esp32dev]\nboard = esp32dev\nframework = arduino\nlib_deps =\n    adafruit/Adafruit SHT31 Library@^2.2\n    knolleary/PubSubClient\n'),
      file('src/main.cpp', '#include <Wire.h>\n#include <WiFi.h>\n#define RELAY_PIN 26\nvoid setup(){ Wire.begin(); pinMode(RELAY_PIN, OUTPUT); }\n'),
    ]);
    expect(p.framework.value).toBe('platformio');
    expect(p.board?.value).toEqual({ boardId: 'esp32-devkitc-30', mcu: 'ESP32' });
    expect(p.board?.evidence).toEqual({ file: 'platformio.ini', line: 2 });
    expect(partIds(p)).toEqual(expect.arrayContaining(['sht31', 'relay-1ch']));
    expect(values(p.protocols)).toEqual(expect.arrayContaining(['mqtt', 'wifi']));
    expect(values(p.buses)).toContain('i2c');
    expect(p.pins.map((f) => f.value)).toContainEqual({ pin: 'GPIO 26', use: 'relay (output)' });
    expect(p.mainSource).toBe('src/main.cpp');
    expect(p.kinds).toContain('firmware');
  });

  it('keeps an unknown board as the text the file gives, never forced onto a devkit', () => {
    const p = analyze([file('platformio.ini', '[env:custom]\nboard = giordano_ctrl_v3\nframework = arduino\n')]);
    expect(p.board?.value).toEqual({ boardId: undefined, mcu: 'giordano_ctrl_v3' });
  });

  it('reads a CubeMX .ioc: the exact MCU, pins with their labels, buses', () => {
    const p = analyze([
      file(
        'node.ioc',
        'Mcu.Name=STM32G071R(6-8-B)Tx\nMcu.UserName=STM32G071RBTx\nPA0.Signal=ADC1_IN0\nPA0.GPIO_Label=NTC_FLOW\nPA2.Signal=USART2_TX\nPB5.Signal=GPIO_Output\nPB5.GPIO_Label=RS485_DE\nPB7.Signal=I2C1_SDA\n',
      ),
    ]);
    expect(p.framework.value).toBe('stm32cube');
    expect(p.board?.value.mcu).toBe('STM32G071RBTx');
    expect(p.board?.value.boardId).toBeUndefined();
    expect(values(p.buses)).toEqual(expect.arrayContaining(['adc', 'uart', 'i2c', 'rs485']));
    expect(p.pins.map((f) => f.value)).toContainEqual({ pin: 'PA0', use: 'NTC_FLOW (ADC1_IN0)' });
    expect(partIds(p)).toEqual(expect.arrayContaining(['ntc-10k-probe', 'max485']));
  });

  it('reads ESP-IDF: the target from sdkconfig', () => {
    const p = analyze([file('sdkconfig', 'CONFIG_IDF_TARGET="esp32s3"\n'), file('main/main.c', '#include "freertos/FreeRTOS.h"\n#include "esp_wifi.h"\nvoid app_main(void){ esp_wifi_start(); }\n')]);
    expect(p.framework.value).toBe('esp-idf');
    expect(p.board?.value.mcu).toBe('ESP32-S3');
    expect(values(p.protocols)).toContain('wifi');
  });

  it('reads a KiCad schematic: placed symbols only, MCU as the board, generic parts skipped', () => {
    const sch = `(kicad_sch
  (lib_symbols (symbol "Sensor_Temperature:DS18B20" (property "Value" "DS18B20")) (symbol "Interface_UART:MAX485E"))
  (symbol (lib_id "MCU_ST_STM32G0:STM32G071RBTx") (property "Value" "STM32G071RBTx"))
  (symbol (lib_id "Interface_UART:MAX485E") (property "Value" "MAX485E"))
  (symbol (lib_id "Device:R") (property "Value" "120"))
)`;
    const p = analyze([file('board.kicad_sch', sch)]);
    expect(p.framework.value).toBe('kicad');
    expect(p.kinds).toContain('schematic');
    expect(p.board?.value.mcu).toBe('STM32G071RBTx');
    expect(partIds(p)).toEqual(['max485']); // DS18B20 is only in the library copies
    expect(values(p.buses)).toContain('rs485');
  });

  it('reads a BOM: recognised parts only, MCU rows give the chip', () => {
    const p = analyze([file('bom.csv', 'Reference,Qty,Value\nU1,1,ESP32-C3-MINI-1\nU2,1,DS18B20\nR1,1,4k7\nC1,2,100nF\nK2,1,G3MB-202P SSR\n')]);
    expect(p.board?.value.mcu).toBe('ESP32-C3-MINI-1');
    expect(partIds(p)).toEqual(['ds18b20-module', 'ssr-g3mb']);
    expect(p.parts[0].evidence).toEqual({ file: 'bom.csv', line: 3 });
  });

  it('reads a BoardPilot project: board, parts and the drawing', () => {
    const scene = { board: 'esp32-devkitc-30', parts: [{ id: 'a', partId: 'scd40', position: [0, 0, 0] }], wires: [] };
    const p = analyze([file('room.boardpilot.json', JSON.stringify({ format: 'boardpilot-project@1', scene }))]);
    expect(p.kinds).toContain('boardpilot');
    expect(p.board?.value.boardId).toBe('esp32-devkitc-30');
    expect(partIds(p)).toEqual(['scd40']);
    expect(p.scene?.parts).toHaveLength(1);
  });

  it('takes the README first paragraph as the summary, with its line', () => {
    const p = analyze([file('README.md', '# Termostato\n\nTermostato con relè e sonda NTC.\nSeconda riga.\n\n## Note\n')]);
    expect(p.summary).toEqual({ value: 'Termostato con relè e sonda NTC. Seconda riga.', source: 'detected', evidence: { file: 'README.md', line: 3 } });
    expect(p.keywords).toEqual(expect.arrayContaining(['termostato', 'ntc']));
    expect(p.docs).toEqual([{ path: 'README.md', type: 'md' }]);
  });

  it('does not take parts or protocols from words in a README', () => {
    const p = analyze([file('README.md', 'A Modbus node with a BME280 and an OLED.')]);
    expect(p.parts).toEqual([]);
    expect(p.protocols).toEqual([]);
  });

  it('matches part names with package suffixes and picks the most specific word', () => {
    expect(partForName('MAX485ESA', PARTS)).toBe('max485');
    expect(partForName('SSR G3MB-202P fan', PARTS)).toBe('ssr-g3mb');
    expect(partForName('100nF', PARTS)).toBeUndefined();
  });

  it('groups chips into families', () => {
    expect(mcuFamily('STM32G071RBTx')).toBe('stm32g0');
    expect(mcuFamily('ESP32-S3-WROOM-1')).toBe('esp32s3');
    expect(mcuFamily('ATmega328P')).toBe('avr');
  });
});

/* ---------------- the sample archive ---------------- */

const SAMPLE = resolve(__dirname, '../examples/archive-hvac');

async function sampleEntries(): Promise<ArchiveEntry[]> {
  const r = await scanFolder(SAMPLE, PARTS);
  return r.projects.map((p) => applyEdit(p, undefined));
}

describe('sample archive', () => {
  it('is bundled with every file', () => {
    expect(SAMPLE_ARCHIVE.map((f) => f.path)).toEqual(expect.arrayContaining(['termostato-wifi-2022/platformio.ini', 'nodo-modbus-caldaia/nodo-modbus-caldaia.ioc', 'qualita-aria-stanza/qualita-aria-stanza.boardpilot.json']));
  });

  it('has six projects, each with something found', async () => {
    const e = await sampleEntries();
    expect(e.map((p) => p.name).sort()).toEqual(['collaudo-fine-linea', 'controllo-pompa-ventola', 'gateway-opentherm', 'nodo-modbus-caldaia', 'qualita-aria-stanza', 'termostato-wifi-2022']);
    const by = Object.fromEntries(e.map((p) => [p.name, p]));
    expect(by['termostato-wifi-2022'].framework.value).toBe('platformio');
    expect(values(by['gateway-opentherm'].protocols)).toContain('opentherm');
    expect(values(by['nodo-modbus-caldaia'].protocols)).toContain('modbus');
    expect(by['controllo-pompa-ventola'].kinds).toContain('schematic');
    expect(by['collaudo-fine-linea'].kinds).toEqual(['docs']);
  });
});

describe('similar projects', () => {
  it('finds the thermostat and the Modbus node for an Italian description, with real reasons', async () => {
    const e = await sampleEntries();
    const m = similarProjects({ text: 'termostato Wi-Fi con sonda NTC e relè per la caldaia' }, e, PARTS);
    expect(m.map((x) => x.name).slice(0, 2)).toEqual(expect.arrayContaining(['termostato-wifi-2022', 'nodo-modbus-caldaia']));
    const thermo = m.find((x) => x.name === 'termostato-wifi-2022')!;
    expect(thermo.reasons).toContainEqual({ kind: 'protocol', value: 'wifi' });
    // every part reason is a part that project really has
    for (const x of m) {
      const p = e.find((y) => y.id === x.id)!;
      for (const r of x.reasons.filter((r) => r.kind === 'part')) expect(p.parts.map((f) => f.value.name)).toContain(r.value);
    }
  });

  it('uses the parts drawn and the board', async () => {
    const e = await sampleEntries();
    const scene = { board: 'esp32-devkitc-30', parts: [{ id: 'a', partId: 'sht31', position: [0, 0, 0] as [number, number, number] }, { id: 'b', partId: 'relay-1ch', position: [0, 0, 0] as [number, number, number] }], wires: [] };
    const m = similarProjects({ text: '', scene }, e, PARTS);
    expect(m[0].name).toBe('termostato-wifi-2022');
    expect(m[0].reasons).toContainEqual({ kind: 'board', value: 'ESP32 DevKit (30 pins)' });
  });

  it('finds nothing for an unrelated project', async () => {
    expect(similarProjects({ text: 'robot arm with servos' }, await sampleEntries(), PARTS)).toEqual([]);
  });
});

/* ---------------- scanner and store ---------------- */

function tempArchive() {
  const root = mkdtempSync(join(tmpdir(), 'bp-archive-'));
  const w = (rel: string, text: string) => {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  w('a/thermo.ino', '#include <Adafruit_SHT31.h>\nvoid setup(){}\nvoid loop(){}\n');
  w('a/build/junk.ino', '#include <Adafruit_BME280.h>\n'); // build output: skipped
  w('a/node_modules/x/index.ino', '#include <DHT.h>\n');
  w('docs-only/spec.md', '# Spec\n\nA heat pump controller.\n');
  w('saved/one.boardpilot.json', JSON.stringify({ scene: { board: 'esp32-devkitc-30', parts: [], wires: [] } }));
  w('saved/two.boardpilot.json', JSON.stringify({ scene: { board: 'rpi-pico', parts: [], wires: [] } }));
  return { root, w };
}

describe('scanner', () => {
  it('finds project roots, skips build and tool folders, splits a folder of saved projects', async () => {
    const { root } = tempArchive();
    const r = await scanFolder(root, PARTS);
    const names = r.projects.map((p) => p.name).sort();
    expect(names).toEqual(['a', 'docs-only', 'one', 'two']);
    const a = r.projects.find((p) => p.name === 'a')!;
    expect(partIds(a)).toEqual(['sht31']);
    expect(a.fileCount).toBe(1);
    expect(r.truncated).toBe(false);
  });

  it('reuses unchanged projects on a rescan and reads changed ones again', async () => {
    const { root, w } = tempArchive();
    const first = await scanFolder(root, PARTS, [], 1);
    const again = await scanFolder(root, PARTS, first.projects, 2);
    expect(again.projects.find((p) => p.name === 'a')!.scannedAt).toBe(1);
    w('a/thermo.ino', '#include <Adafruit_SHT31.h>\n#include <PubSubClient.h>\n');
    utimesSync(join(root, 'a/thermo.ino'), new Date(), new Date(Date.now() + 5000));
    const changed = await scanFolder(root, PARTS, again.projects, 3);
    const a = changed.projects.find((p) => p.name === 'a')!;
    expect(a.scannedAt).toBe(3);
    expect(values(a.protocols)).toContain('mqtt');
  });
});

describe('archive store', () => {
  it('keeps notes and corrections across rescans and forgets a removed folder', async () => {
    const { root } = tempArchive();
    const dir = mkdtempSync(join(tmpdir(), 'bp-archive-store-'));
    const store = new ArchiveStore(join(dir, 'index.json'), () => PARTS);
    expect((await store.addRoot(root)).found).toBe(4);
    const a = (await store.entries()).find((p) => p.name === 'a')!;
    await store.update(a.id, { notes: 'First prototype', tags: ['lab', ''], mcu: 'ESP32-C3', boardId: 'nope' });
    await store.rescan();
    const reopened = new ArchiveStore(join(dir, 'index.json'), () => PARTS);
    const b = (await reopened.entries()).find((p) => p.id === a.id)!;
    expect(b.notes).toBe('First prototype');
    expect(b.tags).toEqual(['lab']);
    expect(b.board).toEqual({ value: { mcu: 'ESP32-C3' }, source: 'user' });
    await reopened.removeRoot(root);
    expect(await reopened.entries()).toEqual([]);
  });

  it('cleans edits and ignores a foreign index file', () => {
    expect(cleanEdit({ notes: 3, tags: 'x', boardId: 'esp32-devkitc-30', addParts: [{ name: 'X', partId: 'nope' }] }, PARTS)).toEqual({ boardId: 'esp32-devkitc-30', addParts: [{ name: 'X' }] });
    expect(parseIndex({ format: 'other' }).projects).toEqual([]);
  });
});

/* ---------------- assistant tool ---------------- */

describe('find_similar_projects tool', () => {
  const turn = (): ToolTurnState => ({ calls: [] }) as unknown as ToolTurnState;
  const scene = { board: 'esp32-devkitc-30', parts: [], wires: [] };

  it('is offered to the model', () => expect(TOOLS.map((x) => x.name)).toContain('find_similar_projects'));

  it('returns sourced matches from the archive', async () => {
    const archive = await sampleEntries();
    const r = await runTool('find_similar_projects', { description: 'gateway OpenTherm verso MQTT' }, {} as HardwareHub, [], turn(), { scene, archive });
    expect(r.isError).toBe(false);
    const out = JSON.parse(r.content) as { matches: { project: { name: string; parts: string[] } }[] };
    expect(out.matches[0].project.name).toBe('gateway-opentherm');
    expect(out.matches[0].project.parts[0]).toMatch(/\[gateway-opentherm\.ino:\d+\]$/);
  });

  it('says there is no archive when there is none', async () => {
    const r = await runTool('find_similar_projects', { description: 'thermostat' }, {} as HardwareHub, [], turn(), { scene });
    expect(JSON.parse(r.content).matches).toEqual([]);
  });
});
