// Reads a prebuilt diagnostic agent manifest and checks every image file against the SHA-256
// written into it by scripts/build-agent.mjs. Nothing is handed to a flasher unless all hashes match.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '@shared/i18n';
import { DriverError } from './errors';

export interface AgentManifestPart {
  offset: string;
  file: string;
  sha256?: string;
}

export interface AgentManifest {
  ver?: string;
  parts: AgentManifestPart[];
}

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function unverified(file: string, why: 'missing' | 'mismatch' | 'unreadable'): DriverError {
  const what =
    why === 'missing'
      ? t('The diagnostic agent file {file} has no checksum in its manifest.', { file })
      : why === 'unreadable'
        ? t('The diagnostic agent file {file} could not be read.', { file })
        : t('The diagnostic agent file {file} does not match its checksum.', { file });
  return new DriverError(
    'agent_unverified',
    t('{what} It was not written to the board.', { what }),
    t('Install BoardPilot again, or rebuild the agent with “npm run build:agent”. Your board was not changed.'),
  );
}

/** Returns the manifest parts with absolute paths once every file matches its recorded SHA-256. */
export function verifyAgentManifest(dir: string, m: AgentManifest): { offset: number; path: string }[] {
  if (!Array.isArray(m.parts) || m.parts.length === 0) throw unverified('manifest.json', 'missing');
  return m.parts.map((p) => {
    const path = join(dir, p.file);
    if (!p.sha256 || !/^[0-9a-f]{64}$/i.test(p.sha256)) throw unverified(p.file, 'missing');
    let data: Buffer;
    try {
      data = readFileSync(path);
    } catch {
      throw unverified(p.file, 'unreadable');
    }
    if (sha256Hex(data) !== p.sha256.toLowerCase()) throw unverified(p.file, 'mismatch');
    return { offset: parseInt(p.offset, 16), path };
  });
}
