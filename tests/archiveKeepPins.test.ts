// "Use as start, keep its pins": reading all code files of an archived project, and wiring the display
// pins found in them before the safe-pin rules fill in the rest.

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PARTS, getBoard } from '@shared/board';
import { assignPins } from '@shared/assign';
import { stripComments } from '@shared/codeCheck';
import { combineSources } from '@shared/codeProject';
import { displayPinsFromCode } from '@shared/displayPins';
import { wireRecoveredPins } from '@shared/archive/keepPins';
import { checkWiring } from '@shared/wiring';
import type { Scene } from '@shared/types';
import { ArchiveStore } from '../app/main/archive/archiveStore';
import { SOURCE_LIMITS, makeArchiveApi } from '../app/main/archive/archiveApi';

const USER_SETUP = '#define ILI9341_DRIVER\n#define TFT_MISO 19\n#define TFT_MOSI 23\n#define TFT_SCLK 18\n#define TFT_CS 15\n#define TFT_DC 2\n#define TFT_RST 4\n#define TOUCH_CS 21\n';

function projectDir(extra: (dir: string) => void = () => undefined) {
  const dir = mkdtempSync(join(tmpdir(), 'bp-keep-'));
  mkdirSync(join(dir, 'proj', 'src'), { recursive: true });
  mkdirSync(join(dir, 'proj', 'include'), { recursive: true });
  mkdirSync(join(dir, 'proj', '.pio', 'build'), { recursive: true });
  writeFileSync(join(dir, 'proj', 'platformio.ini'), '[env:esp32dev]\nboard = esp32dev\nframework = arduino\nlib_deps = bodmer/TFT_eSPI\n');
  writeFileSync(join(dir, 'proj', 'src', 'main.cpp'), '#include <TFT_eSPI.h>\nTFT_eSPI tft;\nvoid setup(){ tft.init(); }\nvoid loop(){}\n');
  writeFileSync(join(dir, 'proj', 'include', 'User_Setup.h'), USER_SETUP);
  writeFileSync(join(dir, 'proj', 'include', 'notes.md'), 'not code');
  writeFileSync(join(dir, 'proj', '.pio', 'build', 'junk.cpp'), 'int junk;');
  extra(join(dir, 'proj'));
  return dir;
}

async function apiFor(dir: string) {
  const store = new ArchiveStore(join(dir, 'index.json'), () => PARTS);
  await store.addRoot(dir);
  const api = makeArchiveApi(store, { pickFolder: async () => null, reveal: () => undefined, sampleDir: join(dir, 'sample') });
  const e = (await store.entries())[0];
  return { api, e };
}

describe('archive readSources', () => {
  it('returns the code files with their paths, without build output or non-code files', async () => {
    const { api, e } = await apiFor(projectDir());
    const r = await api.readSources(e.id);
    if (!r.ok) throw new Error('failed');
    expect(r.value.files.map((f) => f.name).sort()).toEqual(['include/User_Setup.h', 'platformio.ini', 'src/main.cpp']);
    expect(r.value.files.find((f) => f.name === 'include/User_Setup.h')?.text).toContain('TFT_MOSI 23');
    expect(r.value.left).toEqual([]);
  });

  it('leaves out files that are too big, too deep or too many, and says so', async () => {
    const dir = projectDir((p) => {
      writeFileSync(join(p, 'src', 'big.cpp'), 'x'.repeat(SOURCE_LIMITS.fileBytes + 1));
      mkdirSync(join(p, 'lib', 'a', 'b'), { recursive: true });
      writeFileSync(join(p, 'lib', 'a', 'b', 'deep.cpp'), 'int deep;');
      for (let i = 0; i < SOURCE_LIMITS.files; i++) writeFileSync(join(p, 'src', `f${String(i).padStart(2, '0')}.cpp`), 'int a;');
    });
    const { api, e } = await apiFor(dir);
    const r = await api.readSources(e.id);
    if (!r.ok) throw new Error('failed');
    expect(r.value.files.length).toBeLessThanOrEqual(SOURCE_LIMITS.files);
    expect(r.value.left).toEqual(expect.arrayContaining(['src/big.cpp', 'lib/a/b/']));
    expect(r.value.left.length).toBeGreaterThan(2);
    expect(r.value.files.map((f) => f.name)).not.toContain('src/big.cpp');
  });

  it('refuses an id that is not in the archive', async () => {
    const { api } = await apiFor(projectDir());
    const r = await api.readSources('nope');
    expect(r.ok).toBe(false);
  });
});

describe('wireRecoveredPins', () => {
  const board = getBoard('esp32-devkitc-30');
  const placed: Scene = { board: board.id, parts: [{ id: 'tft1', partId: 'ili9341-tft-28', position: [0, 0, 60], label: 'TFT' }], wires: [] };
  const pins = displayPinsFromCode(stripComments(combineSources([{ name: 'include/User_Setup.h', text: USER_SETUP }], 'main.ino').text));

  it('wires the pins the project names, sharing the bus with the touch controller', () => {
    const k = wireRecoveredPins(placed, board, PARTS, pins);
    const to = (part: string) => k.wires.filter((w) => w.to.pin === part).map((w) => w.from.pin);
    expect(to('SDI(MOSI)')).toEqual(['D23']);
    expect(to('SCK')).toEqual(['D18']);
    expect(to('SDO(MISO)')).toEqual(['D19']);
    expect(to('CS')).toEqual(['D15']);
    expect(to('DC')).toEqual(['D2']);
    expect(to('RESET')).toEqual(['D4']);
    expect(to('T_CS')).toEqual(['D21']);
    // the touch controller shares clock and data with the display
    expect(to('T_CLK')).toEqual(['D18']);
    expect(to('T_DIN')).toEqual(['D23']);
    expect(k.kept).toHaveLength(7);
    expect(k.skipped).toEqual([]);
  });

  it('then the safe-pin rules fill in the rest without touching the kept pins, and the wiring check runs on it', () => {
    const k = wireRecoveredPins(placed, board, PARTS, pins);
    const { scene } = assignPins({ ...placed, wires: k.wires }, board, PARTS);
    for (const w of k.wires) expect(scene.wires).toContainEqual(w);
    // power and ground came from the rules
    expect(scene.wires.some((w) => w.to.pin === 'VCC')).toBe(true);
    // the chip select on GPIO 15 is a strapping pin: the wiring rules say so
    const f = checkWiring(scene, board, PARTS);
    expect(f.some((x) => x.rule === 'strapping_pin' && x.targets.includes('pin:D15'))).toBe(true);
    expect(f.filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('skips a pin the board does not have, and says which', () => {
    const wrong = displayPinsFromCode('#define TFT_CS 9\n#define TFT_DC 2\n');
    const k = wireRecoveredPins(placed, board, PARTS, wrong);
    expect(k.wires.map((w) => w.to.pin)).toEqual(['DC']);
    expect(k.skipped).toHaveLength(1);
    expect(k.skipped[0]).toContain('TFT_CS');
  });

  it('does nothing without a display part, or without recovered pins', () => {
    expect(wireRecoveredPins({ ...placed, parts: [] }, board, PARTS, pins).wires).toEqual([]);
    expect(wireRecoveredPins(placed, board, PARTS, []).wires).toEqual([]);
  });
});
