import { mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundledEsptoolDir, bundledEsptoolPath, parseFlashBytes, parseSecurityInfo, securityRefusal, commandName } from '../app/main/hardware/esptool';
import { sha256Hex, verifyAgentManifest, type AgentManifest } from '../app/main/hardware/agentManifest';
import { DriverError } from '../app/main/hardware/errors';

const V5_OFF = `esptool v5.0.2
Security Information:
=====================
Flags: 0x00000000 (0b0)
Chip ID: 9
API Version: 0
Secure Boot: Disabled
Secure Download Mode: Disabled
SPI Boot Crypt Count (SPI_BOOT_CRYPT_CNT): 0x0 (Disabled)
`;

describe('security info (secure boot, flash encryption)', () => {
  it('reads a chip with everything off', () => {
    const i = parseSecurityInfo(V5_OFF);
    expect(i).toEqual({ secureBoot: false, flashEncryption: false, secureDownload: false });
    expect(securityRefusal(i)).toBeNull();
  });
  it('refuses when secure boot is on, with a plain message', () => {
    const e = securityRefusal(parseSecurityInfo(V5_OFF.replace('Secure Boot: Disabled', 'Secure Boot: Enabled')));
    expect(e).toBeInstanceOf(DriverError);
    expect(e?.code).toBe('chip_locked');
    expect(e?.humanMessage).toMatch(/secure boot/);
    expect(e?.hint).toMatch(/Nothing was changed/);
  });
  it('treats an odd SPI_BOOT_CRYPT_CNT as flash encryption on', () => {
    expect(parseSecurityInfo(V5_OFF.replace('0x0 (Disabled)', '0x1 (Enabled)')).flashEncryption).toBe(true);
    expect(parseSecurityInfo(V5_OFF.replace('0x0 (Disabled)', '0x3 (Disabled)')).flashEncryption).toBe(false);
    expect(securityRefusal(parseSecurityInfo(V5_OFF.replace('0x0 (Disabled)', '0x7 (Enabled)')))?.humanMessage).toMatch(/flash encryption/);
  });
  it('reads an explicit Flash Encryption line and secure download mode', () => {
    const i = parseSecurityInfo('Flash Encryption: Enabled\nSecure Download Mode: Enabled');
    expect(i.flashEncryption).toBe(true);
    expect(securityRefusal(i)?.humanMessage).toMatch(/secure download mode/);
  });
  it('says unknown (null), not off, when the chip does not report it', () => {
    const i = parseSecurityInfo('Warning: ESP32 has no known security info');
    expect(i).toEqual({ secureBoot: null, flashEncryption: null, secureDownload: null });
    expect(securityRefusal(i)).toBeNull();
  });
  it('knows the get-security-info command name on v4 and v5', () => {
    expect(commandName({ cmd: 'esptool', baseArgs: [], major: 5, version: '5.0.0' }, 'get-security-info')).toBe('get-security-info');
    expect(commandName({ cmd: 'esptool.py', baseArgs: [], major: 4, version: '4.7.0' }, 'get-security-info')).toBe('get_security_info');
  });
});

describe('flash size', () => {
  it('parses MB and KB, and gives undefined instead of a guess', () => {
    expect(parseFlashBytes('Detected flash size: 16MB')).toBe(16 * 1024 * 1024);
    expect(parseFlashBytes('Detected flash size: 512KB')).toBe(512 * 1024);
    expect(parseFlashBytes('Hard resetting')).toBeUndefined();
  });
});

describe('bundled esptool lookup', () => {
  it('maps the OS to the resources/esptool folder', () => {
    expect(bundledEsptoolDir('win32')).toBe('win');
    expect(bundledEsptoolDir('darwin')).toBe('mac');
    expect(bundledEsptoolDir('linux')).toBeNull();
  });
  it('finds the binary under the packaged resources folder', () => {
    const want = join('/res', 'esptool', 'win', 'esptool.exe');
    expect(bundledEsptoolPath({ platform: 'win32', resourcesPath: '/res', exists: (p) => p === want })).toBe(want);
    const mac = join('/res', 'esptool', 'mac', 'esptool');
    expect(bundledEsptoolPath({ platform: 'darwin', resourcesPath: '/res', exists: (p) => p === mac })).toBe(mac);
  });
  it('returns null when this copy has no bundled tool', () => {
    expect(bundledEsptoolPath({ platform: 'win32', resourcesPath: '/res', exists: () => false })).toBeNull();
    expect(bundledEsptoolPath({ platform: 'linux', resourcesPath: '/res', exists: () => true })).toBeNull();
  });
});

describe('agent image checksums', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bp-agent-'));
  const data = Buffer.from('agent image');
  writeFileSync(join(dir, 'agent.bin'), data);
  const good: AgentManifest = { ver: '0.2', parts: [{ offset: '0x10000', file: 'agent.bin', sha256: sha256Hex(data) }] };

  it('accepts files that match and returns numeric offsets', () => {
    expect(verifyAgentManifest(dir, good)).toEqual([{ offset: 0x10000, path: join(dir, 'agent.bin') }]);
  });
  it('refuses a changed file', () => {
    writeFileSync(join(dir, 'changed.bin'), 'tampered');
    const e = (() => {
      try {
        verifyAgentManifest(dir, { parts: [{ offset: '0x0', file: 'changed.bin', sha256: sha256Hex(data) }] });
      } catch (x) {
        return x as DriverError;
      }
    })();
    expect(e?.code).toBe('agent_unverified');
    expect(e?.humanMessage).toMatch(/does not match its checksum/);
  });
  it('refuses a manifest without a checksum, and a missing file', () => {
    expect(() => verifyAgentManifest(dir, { parts: [{ offset: '0x0', file: 'agent.bin' }] })).toThrow(/no checksum/);
    expect(() => verifyAgentManifest(dir, { parts: [{ offset: '0x0', file: 'gone.bin', sha256: sha256Hex(data) }] })).toThrow(/could not be read/);
    expect(() => verifyAgentManifest(dir, { parts: [] })).toThrow();
  });
  it('every shipped manifest in resources/agent verifies', () => {
    const root = join(__dirname, '..', 'resources', 'agent');
    const boards = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'manifest.json')));
    expect(boards.length).toBeGreaterThan(0);
    for (const b of boards) {
      const m = JSON.parse(readFileSync(join(root, b.name, 'manifest.json'), 'utf8')) as AgentManifest;
      expect(() => verifyAgentManifest(join(root, b.name), m), b.name).not.toThrow();
    }
  });
});
