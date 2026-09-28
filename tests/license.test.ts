import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeLicenseKey, verifyLicenseKey } from '../app/main/license/keys';
import { License } from '../app/main/license/license';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

describe('license keys', () => {
  it('verifies a signed key and rejects tampering', () => {
    const key = makeLicenseKey({ n: 'Ada', p: 'personal', i: '2026-09-28' }, priv);
    expect(verifyLicenseKey(key, pub)?.n).toBe('Ada');
    const [head, sig] = key.split('.');
    const forged = Buffer.from(JSON.stringify({ n: 'Mallory', p: 'commercial', i: '2026-09-28' })).toString('base64url');
    expect(verifyLicenseKey(`BP1-${forged}.${sig}`, pub)).toBeNull();
    expect(verifyLicenseKey(`${head}.AAAA`, pub)).toBeNull();
    expect(verifyLicenseKey('hello', pub)).toBeNull();
  });
  it('honours expiry dates', () => {
    const key = makeLicenseKey({ n: 'Ada', p: 'personal', i: '2026-01-01', x: '2026-06-01' }, priv);
    expect(verifyLicenseKey(key, pub, new Date('2026-05-01'))).not.toBeNull();
    expect(verifyLicenseKey(key, pub, new Date('2026-07-01'))).toBeNull();
  });
});

describe('trial', () => {
  it('counts 30 days from the first run, then expires', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bp-lic-'));
    writeFileSync(join(dir, 'license.json'), JSON.stringify({ firstRun: '2026-09-01T10:00:00Z' }));
    const lic = new License(dir, 30);
    expect(await lic.status(new Date('2026-09-11T10:00:00Z'))).toMatchObject({ state: 'trial', daysLeft: 20 });
    expect((await lic.status(new Date('2026-10-02T10:00:00Z'))).state).toBe('expired');
  });
  it('rejects keys not signed by BoardPilot', async () => {
    const lic = new License(mkdtempSync(join(tmpdir(), 'bp-lic-')), 30);
    const key = makeLicenseKey({ n: 'Ada', p: 'personal', i: '2026-09-28' }, priv); // signed by a test key
    expect((await lic.activate(key)).ok).toBe(false);
  });
});
