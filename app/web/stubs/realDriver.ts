// Web build only: stands in for app/main/hardware/realDriver.ts (serialport and the chip tools
// cannot run in a browser). vite.web.config.ts swaps it in; the Electron app never sees it.

import type { BackupInfo, BoardDef, ChipInfo, PortInfo } from '@shared/types';
import type { AgentClient, HardwareDriver, SerialStream } from '../../main/hardware/driver';
import { DriverError } from '../../main/hardware/errors';
import { t } from '@shared/i18n';

function noUsb(): never {
  throw new DriverError(
    'needs_app',
    t('A real board needs the BoardPilot app: a web page cannot reach USB ports or run the chip tools.'),
    t('Download BoardPilot (free for 30 days) to do this on your computer.'),
  );
}

export class RealDriver implements HardwareDriver {
  readonly kind = 'real' as const;

  constructor(_backupDir: string) {}

  setBoard(_board: BoardDef) {}
  async listPorts(): Promise<PortInfo[]> {
    return noUsb();
  }
  async identify(): Promise<ChipInfo> {
    return noUsb();
  }
  async backupFlash(): Promise<BackupInfo> {
    return noUsb();
  }
  async restoreFlash(): Promise<void> {
    noUsb();
  }
  async flash(): Promise<void> {
    noUsb();
  }
  async openAgent(): Promise<AgentClient> {
    return noUsb();
  }
  async openSerial(): Promise<SerialStream> {
    return noUsb();
  }
}
