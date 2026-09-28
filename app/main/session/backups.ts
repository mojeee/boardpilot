// Index of flash backups kept in the app data folder, so "Restore my firmware" works across restarts.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupInfo } from '@shared/types';

export class BackupStore {
  constructor(private readonly dir: string) {}

  private get indexPath() {
    return join(this.dir, 'index.json');
  }

  async list(): Promise<BackupInfo[]> {
    try {
      return JSON.parse(await readFile(this.indexPath, 'utf8')) as BackupInfo[];
    } catch {
      return [];
    }
  }

  async forMac(mac: string): Promise<BackupInfo[]> {
    return (await this.list()).filter((b) => b.mac === mac);
  }

  async add(b: BackupInfo): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const all = await this.list();
    all.unshift(b);
    await writeFile(this.indexPath, JSON.stringify(all, null, 2));
  }
}
