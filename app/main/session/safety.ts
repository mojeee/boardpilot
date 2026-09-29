// One-time confirmation tokens. The renderer asks for one only when the user clicks Confirm in a
// confirmation dialog; every write to the board must present a fresh token of the right kind.
// The AI never receives tokens: its write tools only open the dialog.

import { randomUUID } from 'node:crypto';
import type { WriteRequest } from '@shared/types';
import { DriverError } from '../hardware/errors';
import { t } from '@shared/i18n';

type Kind = WriteRequest['kind'] | 'restore';
const TTL_MS = 5 * 60 * 1000;
const tokens = new Map<string, { kind: Kind; expires: number; uses: number }>();

/**
 * One confirmation, one token. `uses` (at most 10) lets a single confirmed action that the dialog
 * describes as a short series, such as a lab blinking an LED three times, make that many writes.
 */
export function grant(kind: Kind, uses = 1): string {
  const token = randomUUID();
  tokens.set(token, { kind, expires: Date.now() + TTL_MS, uses: Math.max(1, Math.min(10, Math.floor(uses) || 1)) });
  return token;
}

export function consume(token: string | undefined, kind: Kind): void {
  const entry = token ? tokens.get(token) : undefined;
  if (token && entry && entry.kind === kind && entry.uses > 1) entry.uses -= 1;
  else if (token) tokens.delete(token);
  if (!entry || entry.kind !== kind || entry.expires < Date.now()) {
    throw new DriverError(
      'not_confirmed',
      t('This would write to the board, and it was not confirmed.'),
      t('Use the Confirm button in the dialog to allow it.'),
    );
  }
}
