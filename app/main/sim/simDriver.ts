// Simulated board. Implements the same HardwareDriver interface as the real one.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AgentReplyMap,
  AgentRequest,
  BackupInfo,
  ChipInfo,
  FirmwareImage,
  PortInfo,
  StreamFrame,
} from '@shared/types';
import type { AgentClient, HardwareDriver, SerialStream } from '../hardware/driver';
import { DriverError } from '../hardware/errors';
import { t } from '@shared/i18n';
import { bridgeFromUsb } from '../hardware/ports';
import { SimWorld, garble } from './simWorld';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SimDriver implements HardwareDriver {
  readonly kind = 'sim' as const;
  private openHolder: 'agent' | 'serial' | null = null;

  constructor(
    readonly world: SimWorld,
    private readonly backupDir: string,
  ) {}

  async listPorts(): Promise<PortInfo[]> {
    await sleep(250);
    return this.world.scenario.ports.map((p) => {
      const bridge = bridgeFromUsb(p.vendorId, p.productId);
      return { ...p, bridge, likelyEsp32: bridge !== 'unknown' };
    });
  }

  private checkPort(port: string) {
    if (!this.world.scenario.ports.some((p) => p.path === port)) {
      throw new DriverError('port_gone', t('The port {port} is not there any more.', { port }), t('Check the USB cable, then search for boards again.'));
    }
  }

  async identify(port: string): Promise<ChipInfo> {
    await sleep(900);
    this.checkPort(port);
    const s = this.world.scenario;
    if (s.identify === 'busy' || this.openHolder === 'serial') {
      throw new DriverError(
        'port_busy',
        t('Another program is using this port, so the app cannot talk to the board.'),
        t('Close any serial monitor (Arduino IDE, PlatformIO, screen) and try again.'),
      );
    }
    if (s.identify === 'no_sync') {
      throw new DriverError(
        'no_sync',
        t('The board did not answer when the app tried to wake it up.'),
        t('Hold the BOOT button, press and release EN, then release BOOT and try again.'),
      );
    }
    return { ...s.chip, port, bridge: s.bridge, toolVersion: 'simulator' };
  }

  async backupFlash(port: string, chip: ChipInfo, onProgress?: (pct: number) => void): Promise<BackupInfo> {
    this.checkPort(port);
    for (let p = 0; p <= 100; p += 10) {
      onProgress?.(p);
      await sleep(120);
    }
    await mkdir(this.backupDir, { recursive: true });
    const id = `sim-${chip.mac.replace(/:/g, '')}-${Date.now()}`;
    const path = join(this.backupDir, `${id}.json`);
    // The simulator has no real flash; we store a marker file so restore has something to point at.
    await writeFile(path, JSON.stringify({ simulated: true, scenario: this.world.scenario.id, firmware: 'user' }));
    return { id, port, chip: chip.chip, mac: chip.mac, sizeBytes: chip.flashBytes ?? 4194304, path, createdAt: new Date().toISOString() };
  }

  async restoreFlash(port: string, _backup: BackupInfo, onProgress?: (pct: number) => void): Promise<void> {
    this.checkPort(port);
    for (let p = 0; p <= 100; p += 10) {
      onProgress?.(p);
      await sleep(120);
    }
    this.world.firmware = 'user';
  }

  async flash(port: string, image: FirmwareImage, onProgress?: (pct: number) => void): Promise<void> {
    this.checkPort(port);
    for (let p = 0; p <= 100; p += 5) {
      onProgress?.(p);
      await sleep(70);
    }
    if (image.kind === 'agent') this.world.agentBoot();
    else this.world.firmware = 'user';
  }

  async openAgent(port: string): Promise<AgentClient> {
    this.checkPort(port);
    if (this.world.firmware !== 'agent') {
      throw new DriverError('agent_missing', t('The diagnostic agent is not on the board.'), t('Install it first. The app backs up your program before writing.'));
    }
    this.openHolder = 'agent';
    return new SimAgentClient(this.world, () => (this.openHolder = null));
  }

  async openSerial(port: string, baud: number): Promise<SerialStream> {
    this.checkPort(port);
    if (this.world.scenario.identify === 'busy') {
      throw new DriverError('port_busy', t('Another program is using this port.'), t('Close any other serial monitor and try again.'));
    }
    this.openHolder = 'serial';
    return new SimSerial(this.world, baud, () => (this.openHolder = null));
  }
}

class SimAgentClient implements AgentClient {
  private streamCbs = new Set<(f: StreamFrame) => void>();
  private eventCbs = new Set<(e: string, b: Record<string, unknown>) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly world: SimWorld,
    private readonly onClose: () => void,
  ) {
    setTimeout(() => {
      for (const cb of this.eventCbs)
        cb('boot', { event: 'boot', agent: 'bp-agent', ver: '0.1', strapping: world.scenario.strappingAtBoot });
    }, 50);
  }

  async request<K extends AgentRequest['cmd']>(req: Extract<AgentRequest, { cmd: K }>): Promise<AgentReplyMap[K]> {
    const r = req as AgentRequest;
    await sleep(r.cmd === 'i2c_scan' ? 400 : 60);
    const reply = this.world.handle(req);
    if (r.cmd === 'stream') {
      this.stopStream();
      if (r.hz > 0 && r.pins.length) {
        const hz = Math.max(1, Math.min(50, r.hz));
        this.timer = setInterval(() => {
          const f = this.world.frame(r.pins);
          for (const cb of this.streamCbs) cb(f);
        }, 1000 / hz);
      }
    }
    if (r.cmd === 'stream_stop') this.stopStream();
    return reply;
  }

  private stopStream() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  onStream(cb: (f: StreamFrame) => void) {
    this.streamCbs.add(cb);
    return () => this.streamCbs.delete(cb);
  }
  onEvent(cb: (e: string, b: Record<string, unknown>) => void) {
    this.eventCbs.add(cb);
    return () => this.eventCbs.delete(cb);
  }
  onText() {
    return () => {};
  }
  async close() {
    this.stopStream();
    this.onClose();
  }
}

class SimSerial implements SerialStream {
  private cbs = new Set<(l: string) => void>();
  private timer: ReturnType<typeof setInterval>;
  private tick = 0;

  constructor(
    world: SimWorld,
    baud: number,
    private readonly onClose: () => void,
  ) {
    this.timer = setInterval(() => {
      const lines =
        world.firmware === 'user'
          ? world.userFirmwareTick(this.tick)
          : this.tick % 20 === 0
            ? ['{"event":"idle","agent":"bp-agent"}']
            : [];
      this.tick++;
      const wrongBaud = baud !== world.scenario.serial.baud;
      for (const l of lines) {
        const out = wrongBaud ? garble(l, this.tick) : l;
        for (const cb of this.cbs) cb(out);
      }
    }, 100);
  }

  onLine(cb: (l: string) => void) {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }
  async write() {}
  async close() {
    clearInterval(this.timer);
    this.onClose();
  }
}
