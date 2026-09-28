// Trial and license state. The app is free to use for TRIAL_DAYS from the first start; after that
// it asks for a license key. Keys are verified offline with the public key in shared/brand.ts.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LicenseStatus, Result } from '@shared/types';
import { LICENSE_PUBLIC_KEY_PEM, TRIAL_DAYS } from '@shared/brand';
import { verifyLicenseKey } from './keys';

interface Stored {
  firstRun: string;
  key?: string;
}

const DAY = 24 * 60 * 60 * 1000;

export class License {
  private stored: Stored | null = null;

  constructor(
    private readonly dir: string,
    private readonly trialDays = Number(process.env.BOARDPILOT_TRIAL_DAYS ?? TRIAL_DAYS),
  ) {}

  private get file() {
    return join(this.dir, 'license.json');
  }

  private async read(): Promise<Stored> {
    if (this.stored) return this.stored;
    try {
      this.stored = JSON.parse(await readFile(this.file, 'utf8')) as Stored;
      if (!this.stored.firstRun || Number.isNaN(Date.parse(this.stored.firstRun))) throw new Error('bad');
    } catch {
      this.stored = { firstRun: new Date().toISOString() };
      await this.write();
    }
    return this.stored;
  }

  private async write() {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file, JSON.stringify(this.stored, null, 2));
  }

  async status(now = new Date()): Promise<LicenseStatus> {
    const s = await this.read();
    const p = s.key ? verifyLicenseKey(s.key, LICENSE_PUBLIC_KEY_PEM, now) : null;
    const used = Math.max(0, Math.floor((now.getTime() - Date.parse(s.firstRun)) / DAY));
    const daysLeft = Math.max(0, this.trialDays - used);
    if (p) return { state: 'licensed', daysLeft, trialDays: this.trialDays, licensee: p.n, plan: p.p, firstRun: s.firstRun };
    return { state: daysLeft > 0 ? 'trial' : 'expired', daysLeft, trialDays: this.trialDays, firstRun: s.firstRun };
  }

  async activate(key: string): Promise<Result<LicenseStatus>> {
    const p = verifyLicenseKey(key, LICENSE_PUBLIC_KEY_PEM);
    if (!p) {
      return {
        ok: false,
        error: { code: 'bad_key', humanMessage: 'This license key is not valid.', hint: 'Copy the whole key, starting with BP1-. If it still fails, contact us from the website.' },
      };
    }
    const s = await this.read();
    s.key = key.trim();
    await this.write();
    return { ok: true, value: await this.status() };
  }
}
