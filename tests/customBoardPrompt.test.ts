// What the assistant is told about a customer's own board (a project on a bare module) and about the
// display pins the project's code names.

import { describe, expect, it } from 'vitest';
import { getBoard } from '@shared/board';
import type { AiContext, ProjectSketch, Scene } from '@shared/types';
import { SYSTEM_PROMPT, buildContextBlock, customBoardBlock } from '../app/main/ai/prompt';

const sketch: ProjectSketch = {
  name: 'controller.ino',
  text: '#include <TFT_eSPI.h>\nTFT_eSPI tft;\nvoid setup(){ tft.init(); }\n',
  files: [{ name: 'User_Setup.h', text: '#define ILI9341_DRIVER\n#define TFT_MOSI 23\n#define TFT_SCLK 18\n//#define TFT_CS 5\n#define TFT_CS 15\n#define TFT_RST -1\n' }],
};
const ctx = (board: string, sk?: ProjectSketch): AiContext => ({ screen: 'new-project', answers: {}, log: [], live: null, scene: { board, parts: [], wires: [], ...(sk ? { sketch: sk } : {}) } as Scene });

describe('custom board context', () => {
  it('says what is and is not known about a project on a bare module', () => {
    const b = getBoard('esp32-wroom-32-module');
    const lines = customBoardBlock(b, ctx(b.id));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Custom board');
    expect(lines[0]).toContain('ESP32-WROOM-32');
    expect(lines[0]).toMatch(/schematic is not in the library/);
    expect(lines[1]).toContain('reserved');
  });

  it('lists the display pins the code names, with the role and the name used, and leaves out comments and -1', () => {
    const b = getBoard('esp32-wroom-32-module');
    const lines = customBoardBlock(b, ctx(b.id, sketch));
    const pins = lines.find((l) => l.startsWith('Display pins named'))!;
    expect(pins).toContain('"gpio":23');
    expect(pins).toContain('"as":"TFT_SCLK"');
    expect(pins).toContain('"gpio":15');
    expect(pins).not.toContain('"gpio":5,');
    expect(pins).not.toContain('TFT_RST');
    expect(pins).toMatch(/documented from that file/);
  });

  it('adds nothing for a DevKit without display code, but still names display pins found in the code', () => {
    const dk = getBoard('esp32-devkitc-30');
    expect(customBoardBlock(dk, ctx(dk.id))).toEqual([]);
    expect(customBoardBlock(dk, ctx(dk.id, { name: 'a.ino', text: 'void setup(){}' }))).toEqual([]);
    expect(customBoardBlock(dk, ctx(dk.id, sketch))).toHaveLength(1);
  });

  it('is part of the context block, before the board facts, with the rules for talking about it', () => {
    const b = getBoard('esp32-s3-wroom-1-module');
    const block = buildContextBlock(b, ctx(b.id, sketch));
    expect(block).toContain('Custom board: the project is on the bare module ESP32-S3-WROOM-1');
    expect(block.indexOf('Custom board')).toBeLessThan(block.indexOf('Board pins:'));
    expect(block).toMatch(/Offer once, early, to add their firmware to project memory/);
    expect(block).toMatch(/a suggestion until the user confirms it/);
    // the frozen system prompt only lists the board (it stays small for the free demo's 48 KB limit)
    expect(SYSTEM_PROMPT).toContain('esp32-wroom-32-module');
  });
});
