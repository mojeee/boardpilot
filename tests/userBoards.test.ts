// Boards the user imports: validation with the rules of scripts/check-boards.mjs, the folder of user
// boards (like tests for the user parts library), registration, and the AI prompt's board list.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOARDS, BUILTIN_BOARD_IDS, boardList, getBoard, registerBoard, unregisterBoard } from '@shared/board';
import { validateBoardDef } from '@shared/boardSchema';
import { checkBoard } from '@shared/boardCheck.mjs';
// @ts-expect-error plain JS command line script
import { checkBoard as scriptCheck } from '../scripts/check-boards.mjs';
import type { BoardDef } from '@shared/types';
import { UserBoards } from '../app/main/boards/userBoards';
import { SYSTEM_PROMPT, systemPrompt } from '../app/main/ai/prompt';

const clone = (patch: Record<string, unknown> = {}) => ({ ...(JSON.parse(JSON.stringify(BOARDS['esp32-wroom-32-module'])) as Record<string, unknown>), id: 'acme-controller', name: 'Acme controller', ...patch });

afterEach(() => {
  for (const id of Object.keys(BOARDS)) if (!BUILTIN_BOARD_IDS.has(id)) unregisterBoard(id);
});

describe('validateBoardDef', () => {
  it('runs the same rules as the command line script', () => {
    expect(scriptCheck).toBe(checkBoard);
    for (const b of Object.values(BOARDS)) expect(validateBoardDef(b).ok).toBe(true);
  });

  it('accepts a good board and cleans the id', () => {
    const r = validateBoardDef(clone({ id: 'Acme Controller v2!' }));
    expect(r.ok && r.value.id).toBe('acme-controller-v2');
  });

  it('refuses things that are not boards, with a plain message', () => {
    for (const bad of [null, 'x', [], 5, {}, clone({ id: '' }), clone({ pins: [] }), clone({ family: 'z80' }), clone({ pins: 'no' })]) {
      const r = validateBoardDef(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.humanMessage.length).toBeGreaterThan(5);
        expect(r.error.hint.length).toBeGreaterThan(5);
      }
    }
  });

  it('names the problems of a board that fails the checker', () => {
    const b = clone() as unknown as { rules: { safeIo: string[] } };
    b.rules.safeIo = ['nope', 'nope2', 'nope3', 'nope4'];
    const r = validateBoardDef(b);
    expect(!r.ok && r.error.humanMessage).toContain('nope');
  });
});

describe('registerBoard', () => {
  it('adds and removes a board but never touches a built-in one', () => {
    const def = validateBoardDef(clone());
    if (!def.ok) throw new Error('should be valid');
    registerBoard(def.value);
    expect(getBoard('acme-controller').name).toBe('Acme controller');
    expect(boardList().some((b) => b.id === 'acme-controller')).toBe(true);
    unregisterBoard('acme-controller');
    expect(BOARDS['acme-controller']).toBeUndefined();
    registerBoard({ ...BOARDS['rpi-pico'], name: 'Hijacked' } as BoardDef);
    unregisterBoard('rpi-pico');
    expect(BOARDS['rpi-pico'].name).not.toBe('Hijacked');
  });
});

describe('user boards folder', () => {
  it('saves, renames on conflict, forces the agent off, refuses to delete built-ins, loads again', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bp-boards-'));
    const lib = new UserBoards(dir);
    const a = await lib.save(clone());
    expect(a.ok && a.value.id).toBe('acme-controller');
    expect(a.ok && a.value.toolchain.agent).toBe(false);
    const b = await lib.save(clone());
    expect(b.ok && b.value.id).toBe('acme-controller-2');
    const c = await lib.save(clone({ id: 'esp32-devkitc-30' }));
    expect(c.ok && c.value.id).toBe('esp32-devkitc-30-2');
    expect(BOARDS['esp32-devkitc-30'].name).toBe('ESP32 DevKit (30 pins)');
    expect(readdirSync(dir).sort()).toEqual(['acme-controller-2.json', 'acme-controller.json', 'esp32-devkitc-30-2.json']);
    expect(lib.list().map((x) => x.id).sort()).toEqual(['acme-controller', 'acme-controller-2', 'esp32-devkitc-30-2']);
    expect((await lib.save({ nonsense: true })).ok).toBe(false);
    expect((await lib.remove('esp32-devkitc-30')).ok).toBe(false);
    expect(BOARDS['esp32-devkitc-30']).toBeDefined();

    // a restart: nothing registered, then load() finds the files again (a broken file and a built-in id are skipped)
    for (const id of ['acme-controller', 'acme-controller-2', 'esp32-devkitc-30-2']) unregisterBoard(id);
    writeFileSync(join(dir, 'broken.json'), '{ not json');
    writeFileSync(join(dir, 'builtin.json'), JSON.stringify(BOARDS['arduino-uno-r3']));
    const loaded = await new UserBoards(dir).load();
    expect(loaded.map((x) => x.id).sort()).toEqual(['acme-controller', 'acme-controller-2', 'esp32-devkitc-30-2']);
    expect(BOARDS['acme-controller']).toBeDefined();

    expect((await lib.remove('acme-controller-2')).ok).toBe(true);
    expect(BOARDS['acme-controller-2']).toBeUndefined();
    expect(readdirSync(dir)).not.toContain('acme-controller-2.json');
  });
});

describe('AI prompt board list', () => {
  it('is the frozen text until a board is imported, then lists it, and stays the same string between calls', async () => {
    expect(systemPrompt()).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT).toContain('esp32-devkitc-30: ESP32 DevKit');
    const lib = new UserBoards(mkdtempSync(join(tmpdir(), 'bp-boards-')));
    await lib.save(clone());
    const withUser = systemPrompt();
    expect(withUser).not.toBe(SYSTEM_PROMPT);
    expect(withUser).toContain('acme-controller: Acme controller');
    expect(withUser.startsWith(SYSTEM_PROMPT.slice(0, SYSTEM_PROMPT.indexOf('Boards the app supports')))).toBe(true);
    expect(systemPrompt()).toBe(withUser);
    await lib.remove('acme-controller');
    expect(systemPrompt()).toBe(SYSTEM_PROMPT);
  });
});
