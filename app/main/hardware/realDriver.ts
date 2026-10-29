// Real hardware: serialport for discovery and the agent link; the board family's chip tool for
// identify, backup and flashing (esptool for ESP32 boards, avrdude, picotool, STM32 tools,
// nrfjprog or the Teensy loader for the others).

import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { SerialPort } from 'serialport';
import type { BackupInfo, BoardDef, ChipInfo, FirmwareImage, PortInfo } from '@shared/types';
import { boardsForUsb, getBoard } from '@shared/board';
import type { AgentClient, HardwareDriver, SerialStream } from './driver';
import { DriverError } from './errors';
import { t } from '@shared/i18n';
import { bridgeFromUsb, isUsefulMacPort } from './ports';
import { assertChipUnlocked, commandName, detectFlashBytes, esptool, findEsptool, parseChipInfo } from './esptool';
import { AGENT_BAUD, SerialAgentClient, SerialLineStream, openPort } from './agentClient';
import { chipTool } from './tools';
import type { ToolCtx } from './tools/proc';

const FAST_BAUD = 460800;

export class RealDriver implements HardwareDriver {
  readonly kind = 'real' as const;
  private ports = new Map<string, PortInfo>();
  private board: BoardDef = getBoard();

  constructor(private readonly backupDir: string) {}

  setBoard(board: BoardDef) {
    this.board = board;
  }

  private get usesEsptool() {
    return this.board.toolchain.flasher === 'esptool';
  }

  private ctx(port: string): ToolCtx {
    return { board: this.board, port, portInfo: this.ports.get(port) };
  }

  async listPorts(): Promise<PortInfo[]> {
    const list = await SerialPort.list();
    const ports = list
      .filter((p) => process.platform !== 'darwin' || isUsefulMacPort(p.path))
      .map((p) => {
        const bridge = bridgeFromUsb(p.vendorId, p.productId);
        const boardIds = boardsForUsb(p.vendorId, p.productId);
        const info: PortInfo = {
          path: p.path,
          manufacturer: p.manufacturer,
          vendorId: p.vendorId,
          productId: p.productId,
          serialNumber: p.serialNumber,
          bridge,
          likelyBoard: bridge !== 'unknown' || boardIds.length > 0,
          boardIds,
        };
        this.ports.set(p.path, info);
        return info;
      });
    // Ports that match the selected board first, then any dev board.
    const score = (p: PortInfo) => (p.boardIds?.includes(this.board.id) ? 2 : p.likelyBoard ? 1 : 0);
    return ports.sort((a, b) => score(b) - score(a));
  }

  async identify(port: string): Promise<ChipInfo> {
    if (!this.usesEsptool) return chipTool(this.board).identify(this.ctx(port));
    const tool = await findEsptool();
    const out = await esptool(port, [commandName(tool, 'flash-id')], { timeoutMs: 30000 });
    return parseChipInfo(out, port, this.ports.get(port)?.bridge ?? 'unknown');
  }

  async backupFlash(port: string, chip: ChipInfo, onProgress?: (pct: number) => void): Promise<BackupInfo> {
    await mkdir(this.backupDir, { recursive: true });
    const id = `${chip.mac.replace(/[^A-Za-z0-9-]/g, '')}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    if (!this.usesEsptool) {
      const tool = chipTool(this.board);
      const path = join(this.backupDir, `${id}${tool.backupExt}`);
      await tool.backup(this.ctx(port), chip, path, onProgress);
      const s = await stat(path).catch(() => null);
      if (!s || s.size === 0) {
        throw new DriverError('backup_incomplete', t('The backup file is empty. It is not safe to continue.'), t('Try the backup again with a shorter or better USB cable.'));
      }
      return { id, port, chip: chip.chip, mac: chip.mac, sizeBytes: s.size, path, createdAt: new Date().toISOString() };
    }
    // Secure boot or flash encryption: a raw read would be useless or unsafe, so stop before touching anything.
    await assertChipUnlocked(port);
    // Never assume a size: use what the chip reported, or ask it again.
    const size = chip.flashBytes ?? (await detectFlashBytes(port));
    const tool = await findEsptool();
    const path = join(this.backupDir, `${id}.bin`);
    // 4 MB at 460800 baud takes roughly 90 s; bigger flash takes longer, so scale the limit.
    await esptool(port, [commandName(tool, 'read-flash'), '0', `0x${size.toString(16)}`, path], {
      timeoutMs: Math.max(6, Math.ceil(size / (1024 * 1024)) * 1.5) * 60 * 1000,
      baud: FAST_BAUD,
      onProgress,
    });
    const s = await stat(path);
    if (s.size !== size) {
      throw new DriverError('backup_incomplete', t('The backup file is smaller than the flash. It is not safe to continue.'), t('Try the backup again with a shorter or better USB cable.'));
    }
    return { id, port, chip: chip.chip, mac: chip.mac, sizeBytes: s.size, path, createdAt: new Date().toISOString() };
  }

  async restoreFlash(port: string, backup: BackupInfo, onProgress?: (pct: number) => void): Promise<void> {
    if (!this.usesEsptool) return chipTool(this.board).restore(this.ctx(port), backup.path, onProgress);
    await assertChipUnlocked(port);
    // The backup must fit this chip, and the file must still be the size we recorded.
    const flashBytes = await detectFlashBytes(port);
    const onDisk = await stat(backup.path).catch(() => null);
    if (!onDisk || onDisk.size !== backup.sizeBytes) {
      throw new DriverError(
        'backup_corrupt',
        t('The backup file is missing or has changed since it was made, so it is not safe to restore.'),
        t('Nothing was written. Pick another backup, or make a new one while the board still works.'),
      );
    }
    if (backup.sizeBytes > flashBytes) {
      throw new DriverError(
        'backup_too_big',
        t('This backup is bigger than the flash memory on the connected board, so it cannot be restored here.'),
        t('Nothing was written. Connect the board the backup came from, or pick a backup made from this board.'),
      );
    }
    const tool = await findEsptool();
    await esptool(port, [commandName(tool, 'write-flash'), '0x0', backup.path], {
      timeoutMs: 6 * 60 * 1000,
      baud: FAST_BAUD,
      onProgress,
    });
  }

  async flash(port: string, image: FirmwareImage, onProgress?: (pct: number) => void): Promise<void> {
    if (!this.usesEsptool) {
      const tool = chipTool(this.board);
      // Non-ESP images are one file (uf2, hex or bin). Several parts are written in order.
      for (const p of image.parts) await tool.flash(this.ctx(port), p.path, p.offset, onProgress);
      return;
    }
    await assertChipUnlocked(port);
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
