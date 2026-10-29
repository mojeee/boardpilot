import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeLicenseKey, verifyLicenseKey } from '../app/main/license/keys';
import { License } from '../app/main/license/license';
import { BETA_FREE } from '../shared/brand';
import { betaNoticeDue, licenseGate } from '../shared/betaNotice';

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

describe('free public beta (BETA_FREE)', () => {
  it('shows a notice instead of the lock screen once the trial is over', () => {
    expect(licenseGate('expired', true)).toBe('notice');
    expect(licenseGate('expired', false)).toBe('lock');
    expect(licenseGate('trial', true)).toBe('none');
    expect(licenseGate('licensed', false)).toBe('none');
  });
  it('is on in this build, and the trial and key code still works underneath', async () => {
    expect(BETA_FREE).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'bp-lic-'));
    writeFileSync(join(dir, 'license.json'), JSON.stringify({ firstRun: '2026-09-01T10:00:00Z' }));
    // The state is still "expired": a paid model can come back by setting BETA_FREE to false.
    expect((await new License(dir, 30).status(new Date('2026-11-01T10:00:00Z'))).state).toBe('expired');
  });
  it('shows the notice at most once a week', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    expect(betaNoticeDue(null, now)).toBe(true);
    expect(betaNoticeDue('garbage', now)).toBe(true);
    expect(betaNoticeDue('2026-11-09T12:00:00Z', now)).toBe(false);
    expect(betaNoticeDue('2026-11-04T12:00:01Z', now)).toBe(false);
    expect(betaNoticeDue('2026-11-03T12:00:00Z', now)).toBe(true);
    expect(betaNoticeDue('2027-01-01T00:00:00Z', now)).toBe(true); // clock moved back
  });
  it('keeps LICENSE.md and the app in step', () => {
    const lic = readFileSync(join(__dirname, '..', 'LICENSE.md'), 'utf8');
    expect(lic).toMatch(/free to use during the public beta/);
    expect(lic).not.toMatch(/requires a paid license\./);
    expect(lic).toMatch(/terms may change for future versions/);
  });
});
