// Builds Display Studio's drawing code with the real Adafruit GFX library on this computer and
// returns the frames it draws, to compare pixel by pixel with the app's renderer
// (tests/display.test.ts and the live AI evaluation). Available only when the library
// (arduino-cli lib install "Adafruit GFX Library") and a C++ compiler are installed.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { PARTS, getBoard } from '@shared/board';
import { generateDisplayCode } from '@shared/displayCode';
import { DisplaySim, Framebuffer } from '@shared/displayRender';
import type { DisplaySpec, PanelInfo } from '@shared/displaySpec';

const GFX = join(homedir(), 'Documents/Arduino/libraries/Adafruit_GFX_Library');
const CXX = ['clang++', 'g++'].find((c) => spawnSync(c, ['--version']).status === 0);
const STUB = join(__dirname, 'arduino-stub');

export const nativeAvailable = !!CXX && existsSync(join(GFX, 'Adafruit_GFX.cpp'));

/** The frames the generated sketch draws at each time (ms), as stored pixel values. */
export function nativeFrames(spec: DisplaySpec, panel: PanelInfo, times: number[]): number[][] {
  const dir = mkdtempSync(join(tmpdir(), 'bp-display-'));
  const board = getBoard('esp32-devkitc-30');
  const { code } = generateDisplayCode(spec, panel, PARTS['st7789-240'], { board: board.id, parts: [], wires: [] }, board, { host: true });
  const mono = panel.color !== 'rgb565';
  const main = [
    '#include "Arduino.h"',
    code,
    'int main(int argc, char **argv) {',
    '  for (int a = 1; a < argc; a++) {',
    '    unsigned long ms = strtoul(argv[a], 0, 10);',
    '    changeScreens(ms); readValues(ms); drawScreen(ms);',
    `    for (int y = 0; y < gfx.height(); y++) for (int x = 0; x < gfx.width(); x++) printf("%x,", ${mono ? 'gfx.getPixel(x, y) ? 1 : 0' : 'gfx.getBuffer()[y * gfx.width() + x]'});`,
    '    printf("\\n");',
    '  }',
    '}',
  ].join('\n');
  writeFileSync(join(dir, 'main.cpp'), main);
  const exe = join(dir, 'frames');
  execFileSync(CXX!, ['-std=c++17', '-O1', '-w', '-DARDUINO=100', `-I${STUB}`, `-I${GFX}`, join(GFX, 'Adafruit_GFX.cpp'), join(dir, 'main.cpp'), '-o', exe], { stdio: 'pipe' });
  const out = execFileSync(exe, times.map(String), { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return out.trim().split('\n').map((l) => l.split(',').filter(Boolean).map((h) => parseInt(h, 16)));
}

/** Compare the sketch with the renderer at each time; returns the first difference, or null. */
export function firstPixelDifference(spec: DisplaySpec, panel: PanelInfo, times: number[]): string | null {
  const native = nativeFrames(spec, panel, times);
  const sim = new DisplaySim(spec, panel);
  for (const [i, ms] of times.entries()) {
    const fb = new Framebuffer(panel, spec.rotation);
    sim.frame(fb, ms);
    const k = [...fb.px].findIndex((v, j) => v !== native[i][j]);
    if (k >= 0) return `at ${ms} ms, pixel (${k % fb.w}, ${Math.floor(k / fb.w)}): app ${fb.px[k]}, sketch ${native[i][k]}`;
  }
  return null;
}
