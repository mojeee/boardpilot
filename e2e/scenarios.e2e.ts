// One test per scenario, on the built app in simulator mode (docs/testing.md).
import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { confirmDialog, driveWizard, launch, logText, menu, type App } from './app';

let a: App;
test.afterEach(async ({}, info) => {
  if (a && info.status !== info.expectedStatus) await a.page.screenshot({ path: info.outputPath('failure.png') });
  await a?.close();
});

/** Load a simulator scenario from the developer menu, as a developer would. */
async function scenario(id: string) {
  await a.page.locator('.topbar .btn.icon[aria-label="Developer menu"]').click();
  await a.page.locator(`.devmenu .scenario[data-id="${id}"]`).click();
  await expect(a.page.locator(`.devmenu .scenario.on[data-id="${id}"]`)).toBeVisible();
  await a.page.locator('.devmenu .close').click();
}

test('opens on the project page: 3D board, assistant, Code and Log, project tab', async () => {
  a = await launch();
  const { page } = a;
  await expect(page.locator('.top-menu .menu-item.on')).toHaveText(/Project/);
  await expect(page.locator('.viewport canvas')).toBeVisible();
  await expect(page.locator('.right-tabs .tab.on')).toHaveText(/Assistant/);
  await expect(page.locator('.bottom-panel .tab', { hasText: 'Code' })).toBeVisible();
  await expect(page.locator('.ptab.on')).toHaveText(/Demo bench/);
  // Panels collapse and come back.
  await page.keyboard.press('Control+j');
  await expect(page.locator('.work.bottom-closed')).toBeVisible();
  await page.keyboard.press('Control+j');
  await expect(page.locator('.work.bottom-closed')).toHaveCount(0);
  await page.locator('.right').hover();
  await page.locator('.edge-toggle').click();
  await expect(page.locator('.right-strip')).toBeVisible();
  await page.locator('.right-strip button').click();
  await expect(page.locator('.right-tabs')).toBeVisible();
});

test('connect and identify', async () => {
  a = await launch();
  await menu(a.page, 'Connect');
  const title = await driveWizard(a.page);
  expect(title).toMatch(/is connected/);
  await expect(a.page.locator('.conn-status .dot.ok')).toBeVisible();
});

test('new project: blank', async () => {
  a = await launch();
  await a.page.locator('.ptab-new').click();
  await a.page.locator('.np-card', { hasText: 'Blank' }).click();
  await expect(a.page.locator('.ptab.on')).toHaveText(/Untitled/);
  await expect(a.page.locator('.project-tabs .ptab')).toHaveCount(2);
  expect(await logText(a.page)).toContain('New empty project');
});

test('new project: template, run in the simulator with the running line highlighted', async () => {
  a = await launch();
  const { page } = a;
  await page.locator('.ptab-new').click();
  await page.locator('.np-card', { hasText: 'Template' }).click();
  await page.locator('.np-templates .tpl-card', { hasText: 'Weather station' }).click();
  await expect(page.locator('.ptab.on')).toHaveText(/Weather station/);
  await expect(page.locator('.bottom-panel .tab.on')).toContainText('weather_station.ino');
  await page.locator('.bottom-panel .run-controls .btn', { hasText: 'Step' }).click();
  await expect(page.locator('.ce-line.run')).toHaveCount(1);
  await expect(page.locator('.code-debug')).toContainText('simulated');
  await page.locator('.bottom-panel .run-controls .btn.primary').click();
  // Running shows the story in the Log tab.
  await expect(page.locator('.bottom-panel .tab.on')).toHaveText(/Log/);
  await expect(page.locator('.run-story .story-line').first()).toBeVisible();
});

test('new project: read from port finds the board, the BME280 by its chip ID and the crossed wires', async () => {
  a = await launch();
  const { page } = a;
  await page.locator('.ptab-new').click();
  await page.locator('.np-card', { hasText: 'Read from port' }).click();
  // Installing the diagnostic agent needs the user's OK (backup first).
  await confirmDialog(page);
  const open = page.locator('.np-foot .btn.primary', { hasText: 'Open the project' });
  await expect(open).toBeEnabled({ timeout: 90_000 });
  await expect(page.locator('.np-steps')).toContainText('only with SDA and SCL exchanged');
  await expect(page.locator('.np-steps')).toContainText('chip ID 0x60');
  await open.click();
  await expect(page.locator('.ptab.on')).toHaveText(/read from port/);
  // The crossed wires are drawn as found: the banner offers to swap them back.
  await expect(page.locator('.warn-banner')).toContainText(/SDA/);
});

test('new project: describe it (without the AI) and create the project', async () => {
  a = await launch();
  const { page } = a;
  await page.locator('.ptab-new').click();
  await page.locator('.np-describe input').fill('weather station with a BME280 and an OLED display');
  await page.locator('.np-describe .btn.ai').click();
  await expect(page.locator('.np-proposal')).toContainText('GY-BME280');
  await expect(page.locator('.np-proposal')).toContainText('SSD1306');
  await page.locator('.np-proposal .btn.primary').click();
  await expect(page.locator('.project-tabs .ptab')).toHaveCount(2);
  await expect(page.locator('.bottom-panel .tab.on')).toContainText('.ino');
  expect(await logText(page)).toContain('built from your description');
});

test('flash firmware with a backup first', async () => {
  a = await launch();
  await menu(a.page, 'Flash');
  const title = await driveWizard(a.page);
  expect(title.length).toBeGreaterThan(3);
  const log = await logText(a.page);
  expect(log).toContain('Backup saved');
  expect(log).toMatch(/Writing|written|Flash/i);
});

test('debug: debug-board-not-detected ends with help, not a dead end', async () => {
  a = await launch();
  await scenario('no-board');
  await menu(a.page, 'Debug');
  await a.page.locator('.option, .task-card, .btn', { hasText: /The board is not detected/ }).first().click();
  // No board ever appears in this scenario: the flow walks through light, cable and driver, then
  // offers the assistant's help and "Check again" instead of stopping.
  for (let i = 0; i < 8; i++) {
    if (await a.page.locator('.step-card.s-failed').count()) break;
    const opt = a.page.locator('.step-card .options .option', { hasText: 'Yes' });
    if (await opt.count()) await opt.first().click();
    else if (await a.page.locator('.step-card .btn.primary').count()) await a.page.locator('.step-card .btn.primary').first().click();
    await a.page.waitForTimeout(800);
  }
  await expect(a.page.locator('.step-card.s-failed')).toBeVisible();
  await expect(a.page.locator('.step-card')).toContainText('Explain what went wrong');
  await expect(a.page.locator('.step-card')).toContainText('Check again');
});

const DEBUG: [string, string, string, RegExp][] = [
  ['debug-sensor-not-responding', 'weather-station-swapped', 'A sensor does not respond', /crossed|SDA/],
  ['debug-keeps-resetting', 'keeps-resetting', 'The board keeps restarting', /./],
  ['debug-garbage-on-serial', 'garbage-serial', 'garbage', /baud|./i],
];
for (const [flow, sc, label, expectTitle] of DEBUG) {
  test(`debug: ${flow}`, async () => {
    a = await launch();
    await scenario(sc);
    await menu(a.page, 'Debug');
    await a.page.locator('.option, .task-card, .btn', { hasText: new RegExp(label, 'i') }).first().click();
    const title = await driveWizard(a.page, { 'What happens': 'My code says the sensor is not found', 'light on the board': 'Yes' });
    expect(title).toMatch(expectTitle);
  });
}

test('monitor: serial output and live plots', async () => {
  a = await launch();
  await scenario('healthy');
  await menu(a.page, 'Connect');
  await driveWizard(a.page);
  await menu(a.page, 'Monitor');
  await a.page.locator('.monitor-bar .btn', { hasText: /Open serial|Open/ }).first().click();
  await expect(a.page.locator('.monitor-grid')).toContainText(/T=|°C|mV/, { timeout: 30_000 });
});

test('test hardware: I2C scan after installing the agent', async () => {
  a = await launch();
  const { page } = a;
  await menu(page, 'Connect');
  await driveWizard(page);
  await menu(page, 'Test');
  const install = page.locator('.gate .btn.primary');
  if (await install.count()) {
    await install.first().click();
    await confirmDialog(page);
  }
  // The simulator's bench has SDA and SCL crossed: the plain scan finds nothing, the swap test finds the BME280.
  await page.locator('.card .btn', { hasText: /^Scan$/ }).first().click();
  await page.locator('.card .btn', { hasText: 'Swap test' }).first().click();
  await expect(page.locator('.addr.swap').first()).toBeVisible({ timeout: 60_000 });
});

test('report', async () => {
  a = await launch();
  await menu(a.page, 'Connect');
  await driveWizard(a.page);
  await menu(a.page, 'Report');
  await expect(a.page.locator('.screen-scroll').first()).toContainText(/ESP32/);
});

test('export PDF: a drawing set on A3', async () => {
  a = await launch();
  const { page } = a;
  await page.locator('.topbar [data-where="top:export"]').click();
  await expect(page.locator('.ex')).toBeVisible();
  await page.locator('.ex-side .seg button', { hasText: 'A3' }).click();
  await page.locator('.ex-field input').nth(0).fill('E2E test');
  await page.locator('.ex-field input').nth(1).fill('Playwright');
  await page.locator('.ex-actions .btn.primary').click();
  await expect(page.locator('.ex')).toHaveCount(0);
  const files = readdirSync(a.saveDir).filter((f) => f.endsWith('.pdf'));
  expect(files).toEqual(['E2E test - electrical design.pdf']);
  const pdf = readFileSync(join(a.saveDir, files[0]));
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  // A3 landscape is 1190.55 × 841.89 pt; four sheets.
  expect(pdf.toString('latin1')).toMatch(/\/MediaBox \[0 0 119[01]\.\d+ 84[12]\.\d+\]/);
  expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(4);
});

test('ask AI or find anything (Cmd-K) runs an action without the AI', async () => {
  a = await launch();
  const { page } = a;
  await page.keyboard.press('Control+k');
  await page.locator('.cmd-in input').fill('back up my board');
  await page.keyboard.press('Enter');
  const card = page.locator('.ai-action').last();
  await expect(card).toContainText('Backup saved', { timeout: 60_000 });
  await card.locator('.btn', { hasText: 'Show me where it is' }).click();
  await expect(page.locator('.where-pulse')).toHaveCount(1);
});

/** A fake free-demo relay: the model asks the app to back up the board, then answers. */
function fakeRelay(): Promise<{ server: Server; url: string; calls: string[] }> {
  const calls: string[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push(body);
      const done = body.includes('"functionResponse"');
      const parts = done
        ? [{ text: JSON.stringify({ message: 'I started the backup for you. It only reads the board.', confidence: 'suggestion', sources: [], highlight: [], nextOptions: [] }) }]
        : [{ functionCall: { name: 'app_action', args: { action: 'backup_flash', arg: '' } } }];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}/api/demo-ai`, calls })));
}

test('the AI does an app action: "back up my board"', async () => {
  const relay = await fakeRelay();
  try {
    a = await launch({ env: { BOARDPILOT_DEMO_AI_URL: relay.url } });
    const { page } = a;
    await page.locator('.ask-box textarea').fill('I can’t find where to back up my board');
    await page.keyboard.press('Enter');
    await expect(page.locator('.ai-reply').last()).toContainText('started the backup');
    await expect(page.locator('.ai-action').last()).toContainText('Backup saved', { timeout: 60_000 });
    // The model saw the drawing and the tools it may use.
    expect(relay.calls[0]).toContain('app_action');
    expect(relay.calls[0]).toContain('Project scene');
  } finally {
    relay.server.close();
  }
});

test('the web demo build exists for the website', () => {
  expect(existsSync(join(__dirname, '../site/demo/index.html'))).toBe(true);
});
