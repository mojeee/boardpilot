// License keys: "BP1-<payload>.<signature>", both base64url. The payload is JSON signed with Ed25519.

import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export interface LicensePayload {
  /** licensee name */
  n: string;
  /** licensee email (optional) */
  e?: string;
  /** plan */
  p: 'personal' | 'commercial' | 'education';
  /** issued, ISO date */
  i: string;
  /** optional expiry, ISO date */
  x?: string;
}

export function makeLicenseKey(payload: LicensePayload, privateKeyPem: string): string {
  const data = Buffer.from(JSON.stringify(payload));
  const sig = sign(null, data, createPrivateKey(privateKeyPem));
  return `BP1-${data.toString('base64url')}.${sig.toString('base64url')}`;
}

export function verifyLicenseKey(key: string, publicKeyPem: string, now = new Date()): LicensePayload | null {
  const m = /^BP1-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(key.trim().replace(/\s+/g, ''));
  if (!m) return null;
  try {
    const data = Buffer.from(m[1], 'base64url');
    const ok = verify(null, data, createPublicKey(publicKeyPem), Buffer.from(m[2], 'base64url'));
    if (!ok) return null;
    const p = JSON.parse(data.toString('utf8')) as LicensePayload;
    if (typeof p.n !== 'string' || typeof p.i !== 'string') return null;
    if (p.x && new Date(p.x) < now) return null;
    return p;
  } catch {
    return null;
  }
}
