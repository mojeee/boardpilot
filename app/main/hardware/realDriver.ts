// Real hardware: serialport for discovery and the agent link, esptool for chip work.

import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { SerialPort } from 'serialport';
import type { BackupInfo, ChipInfo, FirmwareImage, PortInfo } from '@shared/types';
import type { AgentClient, HardwareDriver, SerialStream } from './driver';
import { DriverError } from './errors';
import { bridgeFromUsb, isUsefulMacPort } from './ports';
import { commandName, esptool, findEsptool, parseChipInfo } from './esptool';
import { AGENT_BAUD, SerialAgentClient, SerialLineStream, openPort } from './agentClient';

const FAST_BAUD = 460800;

export class RealDriver implements HardwareDriver {
  readonly kind = 'real' as const;
  private bridges = new Map<string, PortInfo['bridge']>();

  constructor(private readonly backupDir: string) {}

  async listPorts(): Promise<PortInfo[]> {
    const list = await SerialPort.list();
    const ports = list
      .filter((p) => process.platform !== 'darwin' || isUsefulMacPort(p.path))
      .map((p) => {
        const bridge = bridgeFromUsb(p.vendorId, p.productId);
        this.bridges.set(p.path, bridge);
        return {
          path: p.path,
          manufacturer: p.manufacturer,
          vendorId: p.vendorId,
          productId: p.productId,
          serialNumber: p.serialNumber,
          bridge,
          likelyEsp32: bridge !== 'unknown',
        };
      });
    return ports.sort((a, b) => Number(b.likelyEsp32) - Number(a.likelyEsp32));
  }

  async identify(port: string): Promise<ChipInfo> {
    const tool = await findEsptool();
    const out = await esptool(port, [commandName(tool, 'flash-id')], { timeoutMs: 30000 });
    return parseChipInfo(out, port, this.bridges.get(port) ?? 'unknown');
  }

  async backupFlash(port: string, chip: ChipInfo, onProgress?: (pct: number) => void): Promise<BackupInfo> {
    const tool = await findEsptool();
    const size = chip.flashBytes ?? 4 * 1024 * 1024;
    await mkdir(this.backupDir, { recursive: true });
    const id = `${chip.mac.replace(/:/g, '')}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const path = join(this.backupDir, `${id}.bin`);
    // 4 MB at 460800 baud takes roughly 90 s; allow plenty.
    await esptool(port, [commandName(tool, 'read-flash'), '0', `0x${size.toString(16)}`, path], {
      timeoutMs: 6 * 60 * 1000,
      baud: FAST_BAUD,
      onProgress,
    });
    const s = await stat(path);
    if (s.size !== size) {
      throw new DriverError('backup_incomplete', 'The backup file is smaller than the flash. It is not safe to continue.', 'Try the backup again with a shorter or better USB cable.');
    }
    return { id, port, chip: chip.chip, mac: chip.mac, sizeBytes: s.size, path, createdAt: new Date().toISOString() };
  }

  async restoreFlash(port: string, backup: BackupInfo, onProgress?: (pct: number) => void): Promise<void> {
    const tool = await findEsptool();
    await esptool(port, [commandName(tool, 'write-flash'), '0x0', backup.path], {
      timeoutMs: 6 * 60 * 1000,
      baud: FAST_BAUD,
      onProgress,
    });
  }

  async flash(port: string, image: FirmwareImage, onProgress?: (pct: number) => void): Promise<void> {
    const tool = await findEsptool();
    const args = [commandName(tool, 'write-flash')];
    for (const p of image.parts) args.push(`0x${p.offset.toString(16)}`, p.path);
    await esptool(port, args, { timeoutMs: 4 * 60 * 1000, baud: FAST_BAUD, onProgress });
  }

  async openAgent(port: string): Promise<AgentClient> {
    const sp = await openPort(port, AGENT_BAUD);
    return new SerialAgentClient(sp);
  }

  async openSerial(port: string, baud: number): Promise<SerialStream> {
    const sp = await openPort(port, baud);
    return new SerialLineStream(sp);
  }
}
