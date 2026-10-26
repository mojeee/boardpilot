// Project memory on the built app: import a folder of old display code and a note, attach the
// memory to the project, ask how the ST7789 was initialised, and get an answer citing file:lines.
// The model is a fake demo relay that calls search_memory, then cites what came back.
import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, logText, type App } from './app';

let a: App;
test.afterEach(async ({}, info) => {
  if (a && info.status !== info.expectedStatus) await a.page.screenshot({ path: info.outputPath('failure.png') });
  await a?.close();
});

function oldProject(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'bp-e2e-mem-')), 'acme-display');
  mkdirSync(join(dir, 'drivers'), { recursive: true });
  mkdirSync(join(dir, 'build'), { recursive: true });
  writeFileSync(
    join(dir, 'drivers', 'st7789_init.c'),
    [
      '#define ST7789_MADCTL 0x36',
      '',
      '// Init sequence that worked on the Acme panel',
      'void st7789_init(void) {',
      '  gpio_set_level(PIN_RST, 0);',
      '  delay_ms(10);',
      '  gpio_set_level(PIN_RST, 1);',
      '  delay_ms(120);',
      '  st7789_cmd(0x11);',
      '  st7789_cmd(ST7789_MADCTL);',
      '  st7789_data(0x70);',
      '  st7789_cmd(0x29);',
      '}',
      '',
    ].join('\n'),
  );
  writeFileSync(join(dir, 'acme-display.ino'), 'void setup() {\n  st7789_init();\n}\n\nvoid loop() {}\n');
  writeFileSync(join(dir, 'build', 'old.c'), 'void stale(void) {}');
  return dir;
}

/** A demo relay that searches the memory first, then answers with the citation it got back. */
function memoryRelay(): Promise<{ server: Server; url: string; calls: string[] }> {
  const calls: string[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push(body);
      const cited = /memory · [^"\\]+?:\d+-\d+/.exec(body)?.[0];
      const parts =
        body.includes('"functionResponse"') && cited
          ? [
              {
                text: JSON.stringify({
                  message: `Last time (${cited.split(' · ').pop()}) you reset the panel, waited 120 ms, then sent SLPOUT, MADCTL 0x70 and DISPON.`,
                  confidence: 'documented',
                  sources: [{ kind: 'memory', label: cited }],
                  highlight: [],
                  nextOptions: [],
                }),
              },
            ]
          : [{ functionCall: { name: 'search_memory', args: { query: 'ST7789 init', limit: 5 } } }];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}/api/demo-ai`, calls })));
}

test('project memory: import old code and a note, attach, ask, answer with file:line citations', async () => {
  const relay = await memoryRelay();
  try {
    a = await launch({ env: { BOARDPILOT_DEMO_AI_URL: relay.url, BP_PICK_DIR: oldProject() } });
    const { page } = a;
    await page.locator('.right-tabs .tab', { hasText: 'Project tools' }).click();
    const panel = page.locator('details:has(.memory-panel)');
    await panel.locator('summary').click();
    await panel.locator('input[aria-label="New memory name"]').fill('acme-panels');
    await panel.locator('.btn', { hasText: 'Create' }).click();
    const card = panel.locator('.memory-card', { hasText: 'acme-panels' });
    await expect(card.locator('input[type="checkbox"]')).toBeChecked();
    await card.locator('.btn', { hasText: 'Add a code folder' }).click();
    await expect(panel).toContainText('Read 2 files');
    await card.locator('.btn', { hasText: 'Add a note' }).click();
    await card.locator('textarea').fill('This ST7789 needs 120 ms after reset');
    await card.locator('.btn', { hasText: 'Save note' }).click();
    await expect(card).toContainText('2 sources');
    // a search in the panel shows what the assistant will find
    await panel.locator('input[aria-label="Search the memory"]').fill('MADCTL');
    await panel.locator('input[aria-label="Search the memory"]').press('Enter');
    await expect(panel.locator('.memory-hit summary').first()).toContainText('acme-panels · drivers/st7789_init.c');
    await page.screenshot({ path: test.info().outputPath('memory-panel.png') });

    await page.locator('.right-tabs .tab', { hasText: 'Assistant' }).click();
    await page.locator('.ask-box textarea').fill('How did we initialise the ST7789 last time?');
    await page.keyboard.press('Enter');
    const reply = page.locator('.ai-reply').last();
    await expect(reply).toContainText('drivers/st7789_init.c:');
    await expect(reply.locator('.src-memory')).toContainText('acme-panels · drivers/st7789_init.c:');
    await expect(reply.locator('.conf')).toHaveText('From documentation');
    // the model was told what is attached, and got the init code back from search_memory
    expect(relay.calls[0]).toContain('Project memory attached');
    expect(relay.calls[1]).toContain('st7789_data(0x70)');
    expect(relay.calls[1]).not.toContain('stale');
    expect(await logText(page)).toContain('Read 2 files');
    await page.screenshot({ path: test.info().outputPath('memory-answer.png') });
  } finally {
    relay.server.close();
  }
});
