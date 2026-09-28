// The user's own parts library: JSON files in the app data folder, validated on load and save.

import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PartDef, Result } from '@shared/types';
import { BUILTIN_PART_IDS, PARTS, registerPart, unregisterPart } from '@shared/board';
import { validatePartDef } from '@shared/partSchema';
import { t } from '@shared/i18n';

export class UserParts {
  constructor(private readonly dir: string) {}

  async load(): Promise<PartDef[]> {
    await mkdir(this.dir, { recursive: true });
    const out: PartDef[] = [];
    for (const f of await readdir(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const r = validatePartDef(JSON.parse(await readFile(join(this.dir, f), 'utf8')));
        if (r.ok && !BUILTIN_PART_IDS.has(r.value.id)) {
          registerPart(r.value);
          out.push(r.value);
        }
      } catch {
        /* skip unreadable files */
      }
    }
    return out;
  }

  async save(raw: unknown, replaceId?: string): Promise<Result<PartDef>> {
    const r = validatePartDef(raw);
    if (!r.ok) return r;
    const def = r.value;
    // never overwrite a built-in part; pick a free id for new parts
    if (BUILTIN_PART_IDS.has(def.id) || (def.id !== replaceId && PARTS[def.id])) {
      let n = 2;
      while (PARTS[`${def.id}-${n}`]) n++;
      def.id = `${def.id}-${n}`;
    }
    if (replaceId && replaceId !== def.id) await this.remove(replaceId);
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${def.id}.json`), JSON.stringify(def, null, 2));
    registerPart(def);
    return { ok: true, value: def };
  }

  async remove(id: string): Promise<Result<true>> {
    if (BUILTIN_PART_IDS.has(id)) {
      return { ok: false, error: { code: 'builtin', humanMessage: t('Built-in parts cannot be deleted.'), hint: t('You can remove it from your project instead.') } };
    }
    await unlink(join(this.dir, `${id}.json`)).catch(() => undefined);
    unregisterPart(id);
    return { ok: true, value: true };
  }
}
