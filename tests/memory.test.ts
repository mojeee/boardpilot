// Project memory: chunking, code-aware tokens, BM25 ranking, citations, the store (folder import,
// notes, export / import), attaching to a project, and the assistant citing what search_memory found.

import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addNote,
  attachMemory,
  buildIndex,
  chunkCode,
  chunkText,
  citationBacked,
  detachMemory,
  emptyMemory,
  memoryCitation,
  parseMemoryCitation,
  parseMemoryFile,
  readRange,
  searchIndex,
  skipMemoryDir,
  tokenize,
  memoryFileKind,
} from '@shared/memory';
import type { AiContext, Scene } from '@shared/types';
import { MemoryStore, readSourceFolder } from '../app/main/memory/store';
import { runTool, TOOLS, type ToolTurnState } from '../app/main/ai/tools';
import type { ChatRequest, ChatResponse } from '../app/main/ai/providers';

/* ---------------- a folder of old display driver code ---------------- */

const ST7789 = `// ST7789 240x240 panel, Acme rev B
#include "st7789.h"

#define ST7789_SWRESET 0x01
#define ST7789_SLPOUT  0x11
#define ST7789_COLMOD  0x3A
#define ST7789_MADCTL  0x36
#define ST7789_DISPON  0x29

static void st7789_cmd(uint8_t c) {
  gpio_set_level(PIN_DC, 0);
  spi_write(&c, 1);
}

static void st7789_data(uint8_t d) {
  gpio_set_level(PIN_DC, 1);
  spi_write(&d, 1);
}

// Init sequence that finally worked on the Acme panel (2024-03).
void st7789_init(void) {
  gpio_set_level(PIN_RST, 0);
  delay_ms(10);
  gpio_set_level(PIN_RST, 1);
  delay_ms(120);              // panel needs 120 ms after reset, 5 ms was not enough
  st7789_cmd(ST7789_SWRESET);
  delay_ms(150);
  st7789_cmd(ST7789_SLPOUT);
  delay_ms(10);
  st7789_cmd(ST7789_COLMOD);
  st7789_data(0x55);          // 16-bit colour
  st7789_cmd(ST7789_MADCTL);
  st7789_data(0x70);          // landscape, RGB order
  st7789_cmd(0x21);           // INVON: this panel shows inverted colours without it
  st7789_cmd(ST7789_DISPON);
}
`;

const ILI9341 = `// ILI9341 320x240
void ili9341_init(void) {
  ili_cmd(0x01);
  delay_ms(5);
  ili_cmd(0x36); ili_data(0x48);
  ili_cmd(0x3A); ili_data(0x55);
  ili_cmd(0x11);
  delay_ms(120);
  ili_cmd(0x29);
}

void ili9341_set_rotation(uint8_t r) {
  ili_cmd(0x36);
  ili_data(r == 1 ? 0x28 : 0x48);
}
`;

const FONT = `// 8x16 font
const uint8_t font8x16[] = {
${Array.from({ length: 120 }, (_, i) => '  ' + Array.from({ length: 16 }, (_, j) => `0x${((i * 16 + j) * 37 % 256).toString(16).padStart(2, '0')}`).join(', ') + ',').join('\n')}
};
`;

const SKETCH = `#include <SPI.h>
#include "st7789.h"

void setup() {
  Serial.begin(115200);
  st7789_init();
}

void loop() {
  delay(1000);
}
`;

function fixtureFolder(): string {
  const root = mkdtempSync(join(tmpdir(), 'bp-mem-src-'));
  const dir = join(root, 'acme-display');
  mkdirSync(join(dir, 'drivers'), { recursive: true });
  mkdirSync(join(dir, 'build'), { recursive: true });
  mkdirSync(join(dir, '.git'), { recursive: true });
  mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
  mkdirSync(join(dir, 'Vendor', 'STM32F4xx_HAL_Driver'), { recursive: true });
  writeFileSync(join(dir, 'drivers', 'st7789_init.c'), ST7789);
  writeFileSync(join(dir, 'drivers', 'ili9341.c'), ILI9341);
  writeFileSync(join(dir, 'drivers', 'font8x16.h'), FONT);
  writeFileSync(join(dir, 'acme-display.ino'), SKETCH);
  writeFileSync(join(dir, 'README.md'), '# Acme display\n\nST7789 panel on SPI. Backlight on GPIO 4 through a transistor.\n');
  // never read: build output, git, dependencies, ST's own HAL, binaries, big files, other types
  writeFileSync(join(dir, 'build', 'st7789_init.c'), 'void st7789_init(void) { /* stale copy */ }');
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main');
  writeFileSync(join(dir, 'node_modules', 'x', 'index.h'), 'int x;');
  writeFileSync(join(dir, 'Vendor', 'STM32F4xx_HAL_Driver', 'stm32f4xx_hal_spi.c'), 'void HAL_SPI_Init(void) {}');
  writeFileSync(join(dir, 'drivers', 'logo.h'), Buffer.from([0x23, 0x00, 0x01, 0x02]));
  writeFileSync(join(dir, 'drivers', 'huge.c'), 'x'.repeat(600 * 1024));
  writeFileSync(join(dir, 'photo.png'), 'not code');
  return dir;
}

/* ---------------- chunking ---------------- */

describe('chunking', () => {
  it('cuts code at top-level blocks and covers every line in order', () => {
    const big = Array.from({ length: 6 }, (_, k) => `// function ${k}\nvoid f${k}(void) {\n${Array.from({ length: 15 }, (_, i) => `  step(${k}, ${i});`).join('\n')}\n}\n`).join('\n');
    const chunks = chunkCode(big);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].start).toBe(1);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].start).toBe(chunks[i - 1].end + 1);
    expect(chunks.at(-1)!.end).toBe(big.split('\n').length - 1);
    // a function is never split when it fits: each chunk starts with a comment line of a function
    for (const c of chunks) expect(c.text.trimStart().startsWith('// function')).toBe(true);
  });

  it('splits a very long function under the maximum size', () => {
    const long = `void big(void) {\n${Array.from({ length: 300 }, (_, i) => (i % 25 === 24 ? '' : `  x(${i});`)).join('\n')}\n}\n`;
    const chunks = chunkCode(long);
    expect(Math.max(...chunks.map((c) => c.end - c.start + 1))).toBeLessThanOrEqual(80);
    expect(chunks.at(-1)!.end).toBe(302);
  });

  it('ignores braces in strings and comments', () => {
    const src = 'const char *s = "{";\n// }\nvoid a(void) {\n}\n\nvoid b(void) {\n}\n';
    const chunks = chunkCode(src, 3, 6);
    expect(chunks.map((c) => c.start)).toEqual([1, 6]);
  });

  it('chunks notes by paragraph', () => {
    const text = Array.from({ length: 8 }, (_, i) => `Paragraph ${i}\n${'line\n'.repeat(9)}`).join('\n');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.startsWith('Paragraph')).toBe(true);
  });
});

/* ---------------- tokens ---------------- */

describe('code-aware tokens', () => {
  it('keeps identifiers whole and split, part numbers with and without suffix, hex normalised', () => {
    expect(tokenize('ST7789_MADCTL')).toEqual(expect.arrayContaining(['st7789_madctl', 'st7789', 'madctl']));
    expect(tokenize('setAddrWindow')).toEqual(expect.arrayContaining(['setaddrwindow', 'set', 'addr', 'window']));
    expect(tokenize('ST7789V')).toEqual(expect.arrayContaining(['st7789v', 'st7789']));
    expect(tokenize('0x36 0X0036 36h 0x5')).toEqual(['0x36', '0x36', '0x36', '0x05']);
    expect(tokenize('How did we initialise the ST7789 last time?')).toEqual(['init', 'st7789']);
    expect(tokenize('come abbiamo inizializzato il ST7789')).toEqual(['init', 'st7789']);
    expect(tokenize('each high')).toEqual(['each', 'high']);
  });

  it('reads source files only and skips build, vendor and hidden folders', () => {
    expect(memoryFileKind('st7789_init.c')).toBe('code');
    expect(memoryFileKind('main.ino')).toBe('code');
    expect(memoryFileKind('CMakeLists.txt')).toBe('code');
    expect(memoryFileKind('board.ioc')).toBe('code');
    expect(memoryFileKind('notes.md')).toBe('text');
    expect(memoryFileKind('firmware.bin')).toBeNull();
    for (const d of ['.git', 'node_modules', 'build', '.pio', 'cmake-build-debug', 'STM32F4xx_HAL_Driver', 'managed_components']) expect(skipMemoryDir(d)).toBe(true);
    expect(skipMemoryDir('drivers')).toBe(false);
  });
});

/* ---------------- ranking and citations ---------------- */

describe('search', () => {
  const mem = () => {
    let m = emptyMemory('acme-panels');
    m = { ...m, sources: [{ id: 's1', kind: 'code', label: 'acme-display', addedAt: '', files: 4, bytes: 1, skipped: 0 }] };
    const files = [
      ['drivers/st7789_init.c', ST7789],
      ['drivers/ili9341.c', ILI9341],
      ['drivers/font8x16.h', FONT],
      ['acme-display.ino', SKETCH],
    ];
    let n = 0;
    for (const [file, text] of files) for (const c of chunkCode(text)) m.chunks.push({ id: `s1-${++n}`, source: 's1', file, ...c });
    return addNote(m, 'This ST7789 needs 120 ms after reset.\nThe cheap one from the market needs INVON too.');
  };

  it('finds the ST7789 init sequence by register name, by value and by question', () => {
    const m = mem();
    const index = buildIndex([m]);
    const top = (q: string) => searchIndex(index, q, 5)[0];
    expect(top('MADCTL').file).toBe('drivers/st7789_init.c');
    expect(top('MADCTL').text).toContain('st7789_data(0x70)');
    expect(top('ST7789 init').text).toContain('void st7789_init(void)');
    expect(top('how did we initialise the ST7789 last time?').text).toContain('void st7789_init(void)');
    // a register value: the init code, not the font table full of hex bytes
    const hex = searchIndex(index, '0x36', 5).map((h) => h.file);
    expect(hex[0]).not.toBe('drivers/font8x16.h');
    expect(hex).toContain('drivers/ili9341.c');
    // the note is found by its words
    expect(searchIndex(index, '120 ms after reset', 3).map((h) => h.file)).toContain('notes/st7789-needs-120-ms-after-reset.txt');
    expect(searchIndex(index, 'zigbee', 3)).toEqual([]);
  });

  it('cites "memory · name · file:lines" and parses it back', () => {
    const hit = searchIndex(buildIndex([mem()]), 'MADCTL', 1)[0];
    expect(hit.citation).toBe(memoryCitation('acme-panels', 'drivers/st7789_init.c', hit.start, hit.end));
    expect(hit.citation).toMatch(/^memory · acme-panels · drivers\/st7789_init\.c:\d+-\d+$/);
    expect(memoryCitation('acme-panels', 'st7789_init.c', 40, 58)).toBe('memory · acme-panels · st7789_init.c:40-58');
    expect(memoryCitation('acme-panels', 'note.txt', 3, 3)).toBe('memory · acme-panels · note.txt:3');
    expect(parseMemoryCitation('memory · acme-panels · st7789_init.c:40-58')).toEqual({ memory: 'acme-panels', file: 'st7789_init.c', start: 40, end: 58 });
    // only lines a tool returned (or a part of them) count
    expect(citationBacked('memory · acme-panels · st7789_init.c:45-50', ['memory · acme-panels · st7789_init.c:40-58'])).toBe(true);
    expect(citationBacked('memory · acme-panels · st7789_init.c:90-99', ['memory · acme-panels · st7789_init.c:40-58'])).toBe(false);
    expect(citationBacked('memory · other · st7789_init.c:40-58', ['memory · acme-panels · st7789_init.c:40-58'])).toBe(false);
    expect(citationBacked('st7789_init.c:40-58', ['memory · acme-panels · st7789_init.c:40-58'])).toBe(false);
  });

  it('reads a file back by lines across chunks', () => {
    const m = mem();
    const r = readRange(m, 'st7789_init.c', 1, 400)!;
    expect(r.file).toBe('drivers/st7789_init.c');
    expect(r.text).toBe(ST7789.trimEnd());
    expect(readRange(m, 'drivers/st7789_init.c', 21, 22)!.text).toBe('void st7789_init(void) {\n  gpio_set_level(PIN_RST, 0);');
    expect(readRange(m, 'nope.c', 1, 2)).toBeNull();
  });
});

/* ---------------- projects ---------------- */

describe('attach to projects', () => {
  it('attaches a memory once, to several projects, and detaches it', () => {
    const a: Scene = { board: 'esp32-devkitc-30', parts: [], wires: [] };
    const b: Scene = { board: 'pico', parts: [], wires: [], memories: ['m-other'] };
    const a2 = { ...a, memories: attachMemory(attachMemory(a.memories, 'm1'), 'm1') };
    const b2 = { ...b, memories: attachMemory(b.memories, 'm1') };
    expect(a2.memories).toEqual(['m1']);
    expect(b2.memories).toEqual(['m-other', 'm1']);
    expect(detachMemory(b2.memories, 'm1')).toEqual(['m-other']);
    expect(detachMemory(undefined, 'm1')).toEqual([]);
    // the attachment is plain data in the scene, so it is saved with the project file
    expect(JSON.parse(JSON.stringify(b2)).memories).toEqual(['m-other', 'm1']);
  });
});

/* ---------------- the store ---------------- */

const tempStore = () => new MemoryStore(join(mkdtempSync(join(tmpdir(), 'bp-mem-')), 'memory'));

describe('memory store', () => {
  it('imports a folder with the caps and skips, and re-imports it in place', async () => {
    const dir = fixtureFolder();
    const read = await readSourceFolder(dir);
    expect(read.files.map((f) => f.path).sort()).toEqual(['README.md', 'acme-display.ino', 'drivers/font8x16.h', 'drivers/ili9341.c', 'drivers/st7789_init.c']);
    expect(read.skipped).toBe(2); // the binary logo.h and the 600 KB huge.c
    expect(read.skippedDirs).toEqual(expect.arrayContaining(['build', 'node_modules', 'Vendor/STM32F4xx_HAL_Driver']));

    const store = tempStore();
    const m = await store.create('acme-panels');
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = await store.importFolder(m.value.id, dir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.files).toBe(5);
    expect(r.value.memory.sources).toHaveLength(1);
    const again = await store.importFolder(m.value.id, dir);
    expect(again.ok && again.value.memory.sources.length).toBe(1);
    expect(again.ok && again.value.memory.chunks).toBe(r.value.memory.chunks);

    const missing = await store.importFolder(m.value.id, join(dir, 'nope'));
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.error.humanMessage).toBeTruthy();
  });

  it('keeps memories on disk, searches only the ones asked for, reads by ref and by file:lines', async () => {
    const dirPath = mkdtempSync(join(tmpdir(), 'bp-mem-'));
    const store = new MemoryStore(join(dirPath, 'memory'));
    const m = await store.create('acme-panels');
    const other = await store.create('other');
    if (!m.ok || !other.ok) throw new Error('create failed');
    await store.importFolder(m.value.id, fixtureFolder());
    await store.addNote(other.value.id, 'ST7789 MADCTL is 0x00 on the round panel');

    const fresh = new MemoryStore(join(dirPath, 'memory'));
    expect((await fresh.list()).map((x) => x.name)).toEqual(['acme-panels', 'other']);
    const hits = await fresh.search('ST7789 MADCTL', [m.value.id], 5);
    expect(hits.every((h) => h.memory === 'acme-panels')).toBe(true);
    expect(hits[0].file).toBe('drivers/st7789_init.c');
    expect((await fresh.search('ST7789', [], 5))).toEqual([]);

    const byRef = await fresh.read(hits[0].ref, [m.value.id]);
    expect(byRef?.citation).toBe(hits[0].citation);
    const byLines = await fresh.read('st7789_init.c:21-30', [m.value.id]);
    expect(byLines?.text.split('\n')[0]).toBe('void st7789_init(void) {');
    expect(byLines?.citation).toBe('memory · acme-panels · drivers/st7789_init.c:21-30');
    expect(await fresh.read('st7789_init.c:1-5', [other.value.id])).toBeNull();
  });

  it('exports one file without local paths and imports it back (as a copy when it exists)', async () => {
    const a = tempStore();
    const m = await a.create('acme-panels');
    if (!m.ok) throw new Error('create failed');
    const dir = fixtureFolder();
    await a.importFolder(m.value.id, dir);
    await a.addNote(m.value.id, 'This ST7789 needs 120 ms after reset');
    const exp = await a.exportText(m.value.id);
    expect(exp.ok).toBe(true);
    if (!exp.ok) return;
    expect(exp.value.text).not.toContain(dir);
    const parsed = parseMemoryFile(JSON.parse(exp.value.text))!;
    expect(parsed.chunks.length).toBe((await a.list())[0].chunks);

    // a colleague's computer
    const b = tempStore();
    const imp = await b.importText(exp.value.text);
    expect(imp.ok && imp.value.id).toBe(m.value.id);
    expect(imp.ok && imp.value.chunks).toBe(parsed.chunks.length);
    expect((await b.search('MADCTL', [m.value.id], 1))[0].citation).toBe((await a.search('MADCTL', [m.value.id], 1))[0].citation);
    // importing it where it already exists makes a copy with its own id and name
    const copy = await a.importText(exp.value.text);
    expect(copy.ok && copy.value.id).not.toBe(m.value.id);
    expect(copy.ok && copy.value.name).toBe('acme-panels (2)');
    // not a memory file
    expect((await b.importText('{"format":"boardpilot-project@1"}')).ok).toBe(false);
    expect((await b.importText('not json')).ok).toBe(false);
  });
});

/* ---------------- the assistant ---------------- */

const turn = (): ToolTurnState => ({ highlight: [], calls: [] });

describe('memory tools', () => {
  it('are offered to the model', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(expect.arrayContaining(['search_memory', 'read_memory']));
  });

  it('say so when nothing is attached, and return hits with citations when it is', async () => {
    const store = tempStore();
    const m = await store.create('acme-panels');
    if (!m.ok) throw new Error('create failed');
    await store.importFolder(m.value.id, fixtureFolder());
    const scene: Scene = { board: 'esp32-devkitc-30', parts: [], wires: [] };
    const none = await runTool('search_memory', { query: 'ST7789', limit: 3 }, {} as never, [], turn(), { scene, memory: { access: store, ids: [] } });
    expect(JSON.parse(none.content).note).toMatch(/No project memory is attached/);
    const tt = turn();
    const r = await runTool('search_memory', { query: 'ST7789 init', limit: 3 }, {} as never, [], tt, { scene, memory: { access: store, ids: [m.value.id] } });
    const body = JSON.parse(r.content) as { results: { citation: string; text: string; ref: string }[] };
    expect(body.results[0].text).toContain('void st7789_init(void)');
    expect(tt.memoryCited).toEqual(body.results.map((x) => x.citation));
    const more = await runTool('read_memory', { ref: body.results[0].ref }, {} as never, [], tt, { scene, memory: { access: store, ids: [m.value.id] } });
    expect(more.isError).toBe(false);
    const bad = await runTool('read_memory', { ref: 'nope.c:1-3' }, {} as never, [], turn(), { scene, memory: { access: store, ids: [m.value.id] } });
    expect(bad.isError).toBe(true);
  });
});

const script: ChatResponse[] = [];
const seen: ChatRequest[] = [];
vi.mock('../app/main/ai/providers/anthropic', () => ({
  AnthropicProvider: class {
    readonly id = 'anthropic';
    async chat(req: ChatRequest) {
      seen.push(structuredClone(req));
      const next = script.shift();
      if (!next) throw new Error('script ended');
      return next;
    }
    complete(req: ChatRequest) {
      return this.chat(req);
    }
    async listModels() {
      return [];
    }
  },
}));

const call = (name: string, input: Record<string, unknown>): ChatResponse => ({ text: '', toolCalls: [{ id: name, name, input }], stop: 'tool_use', raw: { provider: 'demo', data: null } });
const final = (reply: Record<string, unknown>): ChatResponse => ({ text: JSON.stringify(reply), toolCalls: [], stop: 'end', raw: { provider: 'demo', data: null } });

async function makeAssistant(store: MemoryStore) {
  const { Assistant } = await import('../app/main/ai/assistant');
  const { AiSettingsStore } = await import('../app/main/settings/settings');
  const box = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() };
  const env = { BOARDPILOT_DEMO_AI_URL: 'off' };
  const settings = new AiSettingsStore(join(mkdtempSync(join(tmpdir(), 'bp-mem-ai-')), 'settings.json'), box, env);
  expect(settings.save({ provider: 'anthropic', model: 'claude-test', apiKey: 'sk-ant-test-000000000000000000' }).ok).toBe(true);
  const a = new Assistant({} as never, settings, env);
  a.setMemory(store);
  return a;
}

describe('Assistant answers from the attached memory (scripted model)', () => {
  it('"how did we initialise the ST7789 last time?" → search_memory → an answer citing file:lines', async () => {
    const store = tempStore();
    const m = await store.create('acme-panels');
    if (!m.ok) throw new Error('create failed');
    await store.importFolder(m.value.id, fixtureFolder());
    await store.addNote(m.value.id, 'This ST7789 needs 120 ms after reset');
    const [hit] = await store.search('ST7789 init', [m.value.id], 1);
    const a = await makeAssistant(store);
    seen.length = 0;
    script.push(
      call('search_memory', { query: 'ST7789 init', limit: 5 }),
      final({
        message: `Last time (${hit.file}:${hit.start}-${hit.end}) you held reset low 10 ms, waited 120 ms, then SWRESET, SLPOUT, COLMOD 0x55, MADCTL 0x70 and INVON.`,
        confidence: 'documented',
        sources: [
          { kind: 'memory', label: hit.citation },
          { kind: 'memory', label: 'memory · acme-panels · drivers/made_up.c:1-9' },
        ],
        highlight: [],
        nextOptions: ['Write it for this project'],
      }),
    );
    const ctx: AiContext = { screen: 'newProject', answers: {}, log: [], scene: { board: 'esp32-devkitc-30', parts: [], wires: [], memories: [m.value.id] } };
    const r = await a.ask('How did we initialise the ST7789 last time?', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // the context told the model what is attached
    const firstUser = seen[0].messages[0];
    expect(firstUser.role === 'user' && JSON.stringify(firstUser.content)).toContain('Project memory attached (search it with search_memory): acme-panels');
    // the search result reached the model
    const toolMsg = seen[1].messages.find((x) => x.role === 'tool');
    expect(toolMsg && toolMsg.role === 'tool' && toolMsg.results[0].content).toContain('st7789_data(0x70)');
    // the reply keeps the real citation, drops the invented one, and stays documented
    expect(r.value.sources).toEqual([{ kind: 'memory', label: hit.citation }]);
    expect(r.value.confidence).toBe('documented');
    expect(r.value.message).toContain('st7789_init.c');

    // next turn: citing what the earlier search returned is still fine; an invented one alone is not documented
    script.push(final({ message: 'Use the same order.', confidence: 'documented', sources: [{ kind: 'memory', label: hit.citation }], highlight: [], nextOptions: [] }));
    const r2 = await a.ask('And the order?', ctx);
    expect(r2.ok && r2.value.confidence).toBe('documented');
    script.push(final({ message: 'You used 0x00.', confidence: 'documented', sources: [{ kind: 'memory', label: 'memory · acme-panels · drivers/other.c:1-3' }], highlight: [], nextOptions: [] }));
    const r3 = await a.ask('And MADCTL on the round panel?', ctx);
    expect(r3.ok && r3.value.confidence).toBe('suggestion');
    expect(r3.ok && r3.value.sources).toEqual([]);
  });

  it('puts memory hits into a code suggestion and keeps only their citations', async () => {
    const store = tempStore();
    const m = await store.create('acme-panels');
    if (!m.ok) throw new Error('create failed');
    await store.importFolder(m.value.id, fixtureFolder());
    const a = await makeAssistant(store);
    seen.length = 0;
    const [hit] = await store.search('ST7789 init display', [m.value.id], 3);
    script.push(
      final({
        title: 'Init the ST7789',
        afterLine: 0,
        replace: false,
        text: 'void tft_init() {}',
        explanation: 'From your old driver.',
        sources: [{ kind: 'memory', label: hit.citation }, { kind: 'memory', label: 'memory · acme-panels · x.c:1-2' }],
      }),
    );
    const ctx: AiContext = { screen: 'newProject', answers: {}, log: [], scene: { board: 'esp32-devkitc-30', parts: [], wires: [], memories: [m.value.id] } };
    const r = await a.suggestCode(ctx, { code: '', cursorLine: 1, request: 'init the ST7789 display' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(seen[0])).toContain("From the user's project memory");
    expect(r.value.sources).toEqual([{ kind: 'memory', label: hit.citation }]);
  });
});
