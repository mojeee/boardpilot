// Starts the built app (out/) in simulator mode with a fresh profile, and small helpers that drive
// it the way a user does: menus, the wizard, the confirmation dialog.
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(__dirname, '..');

export interface App {
  app: ElectronApplication;
  page: Page;
  /** where files saved by the app go (BP_SAVE_DIR) */
  saveDir: string;
  close(): Promise<void>;
}

/** Launch BoardPilot. `hash` starts it on a screen or a scripted demo (#screen=…, #demo=…). */
export async function launch(opts: { hash?: string; env?: Record<string, string> } = {}): Promise<App> {
  const profile = mkdtempSync(join(tmpdir(), 'bp-e2e-'));
  const saveDir = mkdtempSync(join(tmpdir(), 'bp-e2e-save-'));
  const app = await electron.launch({
    args: ['.', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    cwd: root,
    env: {
      ...process.env,
      BP_PROFILE: profile,
      BP_SAVE_DIR: saveDir,
      BOARDPILOT_MODE: 'sim',
      // No network AI unless a test points the demo relay at its own fake server.
      BOARDPILOT_DEMO_AI_URL: 'off',
      BP_SNAPSHOT_HASH: opts.hash ?? '',
      ...opts.env,
    },
  });
  const page = await app.firstWindow();
  await page.waitForSelector('.topbar', { timeout: 60_000 });
  // The simulator's bench is loaded once the tab has its name.
  await expect(page.locator('.ptab.on')).toBeVisible();
  return { app, page, saveDir, close: () => app.close() };
}

/** Click a top-menu item by its visible name. */
export async function menu(page: Page, name: string) {
  await page.locator('.top-menu .menu-item', { hasText: name }).first().click();
}

/** Confirm the app's "write to the board?" dialog (the user's click). */
export async function confirmDialog(page: Page) {
  const dlg = page.locator('.modal-back[role="dialog"] .modal');
  await expect(dlg).toBeVisible();
  await dlg.locator('.btn.primary').click();
}

/**
 * Drive the wizard on the right until it shows its result: pick options (by text when given,
 * else the first), confirm writes, press Done on physical steps. Returns the result card's title.
 */
export async function driveWizard(page: Page, pick: Record<string, string> = {}, limit = 40): Promise<string> {
  for (let i = 0; i < limit; i++) {
    const result = page.locator('.result-card h3');
    if (await result.count()) return (await result.first().textContent()) ?? '';
    const dialog = page.locator('.modal-back[role="dialog"] .modal .btn.primary');
    if (await dialog.count()) {
      await dialog.first().click();
      continue;
    }
    const options = page.locator('.step-card .options .option');
    if (await options.count()) {
      const title = ((await page.locator('.step-card h3').first().textContent()) ?? '').trim();
      const want = Object.entries(pick).find(([k]) => title.includes(k))?.[1];
      await (want ? options.filter({ hasText: want }).first() : options.first()).click();
      continue;
    }
    const primary = page.locator('.step-card .btn.primary');
    if ((await primary.count()) && (await primary.first().isEnabled())) {
      await primary.first().click();
      continue;
    }
    await page.waitForTimeout(700);
  }
  throw new Error('the wizard did not reach a result');
}

/** The session log's rows as text. */
export async function logText(page: Page): Promise<string> {
  await page.locator('.bottom-panel .tab', { hasText: 'Log' }).click();
  return (await page.locator('.log-list').textContent()) ?? '';
}
