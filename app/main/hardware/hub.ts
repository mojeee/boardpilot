// HardwareHub: the one place that owns the active driver, the selected port, the agent link and the
// serial monitor. IPC handlers and the AI tools both go through it, so the safety rules live here once.

import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { preflightImage, type PreflightReport } from '@shared/preflight';
import { join } from 'node:path';
import type {
  AgentReplyMap,
  AgentRequest,
  BackupInfo,
  BoardDef,
  ChipInfo,
  ConnectionState,
  FirmwareImage,
  HardwareMode,
  HelloReply,
  LiveFrame,
  LogEntry,
  PortInfo,
  ProbeFrame,
  Result,
  ScenarioInfo,
} from '@shared/types';
import { parseProbeLine } from '@shared/probe';
import { canBackupFlash, getBoard, isEspFamily, pinByGpio, BOARDS } from '@shared/board';
import { t } from '@shared/i18n';
import type { AgentClient, HardwareDriver, SerialStream } from './driver';
import { DriverError, guard, toAppError } from './errors';
import { RealDriver } from './realDriver';
import { SimDriver } from '../sim/simDriver';
import { SimWorld, DEFAULT_SCENARIO } from '../sim/simWorld';
import { consume } from '../session/safety';
import { BackupStore } from '../session/backups';

export interface HubEvents {
  state: [ConnectionState];
  live: [LiveFrame];
  serial: [string[]];
  probe: [ProbeFrame];
  log: [Omit<LogEntry, 'id' | 't'>];
  progress: [{ task: string; pct: number } | null];
  trace: [{ cmd: string; sda: number; scl: number; trace: AgentReplyMap['i2c_scan']['trace'] }];
}

const WRITE_CMDS = new Set(['gpio_write', 'pwm']);

/**
 * Where the user's firmware file goes. ESP32: a single app .bin at 0x10000 (after bootloader and
 * partition table); merged images at 0x0. STM32 .bin files at the start of internal flash
 * (0x08000000). uf2 and hex files carry their own addresses.
 */
export function userImageOffset(board: BoardDef, filePath: string): number {
  if (/\.(uf2|hex)$/i.test(filePath)) return 0;
  if (board.toolchain.flasher === 'esptool') return /merged|factory/i.test(filePath) ? 0 : 0x10000;
  if (board.toolchain.flasher === 'stm32') return 0x08000000;
  if (board.toolchain.flasher === 'picotool') return 0x10000000;
  return 0;
}

export class HardwareHub extends EventEmitter<HubEvents> {
  private driver: HardwareDriver;
  private readonly world = new SimWorld(DEFAULT_SCENARIO);
  private readonly backups: BackupStore;
  private agentClient: AgentClient | null = null;
  private serial: SerialStream | null = null;
  private serialBatch: string[] = [];
  private serialFlush: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private st: ConnectionState;

  constructor(
    private readonly dataDir: string,
    private readonly agentDir: string,
    mode: HardwareMode,
  ) {
    super();
    this.backups = new BackupStore(join(dataDir, 'backups'));
    this.driver = this.makeDriver(mode);
    this.st = {
      mode,
      board: this.world.board.id,
      port: null,
      chip: null,
      agent: null,
      streaming: false,
      serialOpen: false,
      scenario: mode === 'sim' ? this.world.scenario.id : null,
      backups: [],
    };
  }

  private makeDriver(mode: HardwareMode): HardwareDriver {
    const dir = join(this.dataDir, 'backups');
    const d = mode === 'sim' ? new SimDriver(this.world, dir) : new RealDriver(dir);
    d.setBoard(this.board);
    return d;
  }

  get board() {
    return getBoard(this.st?.board ?? this.world.board.id);
  }

  /** The user picked another board: tools, pin rules and the simulated bench follow it. */
  async setBoard(boardId: string): Promise<Result<ConnectionState>> {
    if (!BOARDS[boardId]) return { ok: false, error: { code: 'unknown_board', humanMessage: t('This board is not in the library.'), hint: t('Pick a board from the list.') } };
    if (boardId === this.st.board) return { ok: true, value: this.st };
    await this.closeLinks();
    const board = getBoard(boardId);
    this.driver.setBoard(board);
    this.patch({
      board: boardId,
      port: null,
      chip: null,
      agent: null,
      streaming: false,
      serialOpen: false,
      backups: [],
      scenario: this.st.mode === 'sim' ? this.world.scenario.id : null,
    });
    this.log('info', t('Board set to {name}.', { name: board.name }), `library: ${board.id}`);
    return { ok: true, value: this.st };
  }

  get state(): ConnectionState {
    return this.st;
  }

  private patch(p: Partial<ConnectionState>) {
    this.st = { ...this.st, ...p };
    this.emit('state', this.st);
  }

  private log(type: LogEntry['type'], text: string, source?: string, target?: LogEntry['target']) {
    this.emit('log', { type, text, source, target });
  }

  /** A log line from outside the hub (MCP calls), shown in the session log like the hub's own. */
  note(type: LogEntry['type'], text: string, source?: string, target?: LogEntry['target']) {
    this.log(type, text, source, target);
  }

  private async closeLinks() {
    if (this.agentClient) await this.agentClient.close().catch(() => {});
    if (this.serial) await this.serial.close().catch(() => {});
    if (this.serialFlush) clearInterval(this.serialFlush);
    this.agentClient = null;
    this.serial = null;
    this.serialFlush = null;
  }

  /* ---------- mode and simulator ---------- */

  async setMode(mode: HardwareMode): Promise<Result<ConnectionState>> {
    await this.closeLinks();
    this.driver = this.makeDriver(mode);
    this.patch({ mode, port: null, chip: null, agent: null, streaming: false, serialOpen: false, backups: [], scenario: mode === 'sim' ? this.world.scenario.id : null });
    this.log('info', mode === 'sim' ? t('Switched to simulator mode. No real board is used.') : t('Switched to real hardware mode.'));
    return { ok: true, value: this.st };
  }

  scenarios(): ScenarioInfo[] {
    return this.world.scenarios.map((s) => ({ id: s.id, name: t(s.name), description: t(s.description) }));
  }

  scenarioScene() {
    return this.world.scenario.scene;
  }

  async loadScenario(id: string): Promise<Result<ConnectionState>> {
    await this.closeLinks();
    this.world.load(id);
    this.patch({ scenario: id, port: null, chip: null, agent: null, streaming: false, serialOpen: false, backups: [] });
    this.log('info', t('Simulator scenario: {name}', { name: t(this.world.scenario.name) }));
    return { ok: true, value: this.st };
  }

  simControl(action: 'fixWiring' | 'turnKnob' | 'pressButton'): Result<true> {
    if (this.st.mode !== 'sim') return { ok: false, error: { code: 'not_sim', humanMessage: t('This only works in simulator mode.'), hint: t('Switch to the simulator in the developer menu.') } };
    if (action === 'fixWiring') {
      this.world.fixWiring();
      this.log('action', t('Simulator: the wiring on the bench was fixed.'));
    } else if (action === 'pressButton') {
      this.world.pressButton();
      this.log('action', t('Simulator: holding the button down for 4 seconds.'));
    } else {
      this.world.turnKnob();
      this.log('action', t('Simulator: turning the knob from one end to the other.'));
    }
    return { ok: true, value: true };
  }

  /* ---------- discovery ---------- */

  listPorts(): Promise<Result<PortInfo[]>> {
    return guard(() => this.driver.listPorts(), 10000, t('Looking for boards'));
  }

  async identify(port: string): Promise<Result<ChipInfo>> {
    // esptool needs the port; the agent (if any) stays on the board and is reconnected afterwards.
    const hadAgent = !!this.st.agent && this.st.port === port;
    if (this.agentClient || this.serial) await this.closeLinks();
    this.patch({ agent: null, streaming: false, serialOpen: false });
    const r = await guard(() => this.driver.identify(port), 45000, t('Identifying the board'));
    if (r.ok) {
      const backups = await this.backups.forMac(r.value.mac);
      this.patch({ port, chip: r.value, backups });
      if (hadAgent) await this.connectAgentInner().catch(() => undefined);
    }
    return r;
  }

  /* ---------- writes (all need a confirmation token) ---------- */

  private async ensureBackup(): Promise<BackupInfo | null> {
    const { port, chip } = this.st;
    if (!port || !chip) throw new DriverError('not_identified', t('The board has not been identified yet.'), t('Run “Connect and identify” first.'));
    const existing = await this.backups.forMac(chip.mac);
    if (existing.length) return existing[0];
    if (!canBackupFlash(this.board)) {
      // The confirmation dialog told the user that this board cannot be backed up.
      this.log('warning', t('This board cannot read its program back, so no backup was made. The confirmation you gave covered this.'), `library: ${this.board.id}`);
      return null;
    }
    this.log('action', t('Backing up the program currently on the board, so it can be restored with one click.'));
    const b = await this.driver.backupFlash(port, chip, (pct) => this.emit('progress', { task: t('Backing up your firmware'), pct }));
    await this.backups.add(b);
    this.patch({ backups: await this.backups.forMac(chip.mac) });
    this.log('found', t('Backup saved ({mb} MB).', { mb: (b.sizeBytes / 1024 / 1024).toFixed(1) }), `backup: ${b.path}`);
    return b;
  }

  private agentImage(token: string): FirmwareImage {
    const board = this.board;
    if (!board.toolchain.agent) {
      throw new DriverError(
        'agent_unavailable',
        t('The diagnostic agent is not available for the {board} yet.', { board: board.name }),
        t('You can still check the wiring in 3D, flash your own firmware and use the serial monitor.'),
      );
    }
    if (this.st.mode === 'sim') return { name: 'bp-agent 0.2 (simulated)', kind: 'agent', parts: [], confirmToken: token };
    // resources/agent/<board id>/manifest.json; builds before 0.5 kept the ESP32 DevKit agent at the top level.
    let dir = join(this.agentDir, board.id);
    if (!existsSync(join(dir, 'manifest.json')) && board.id === 'esp32-devkitc-30') dir = this.agentDir;
    const manifestPath = join(dir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new DriverError(
        'agent_not_built',
        t('The diagnostic agent firmware is not included in this copy of the app yet.'),
        t('Build it once with “npm run build:agent” (needs arduino-cli and the board’s core), then try again.'),
      );
    }
    const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as { ver?: string; parts: { offset: string; file: string }[] };
    return {
      name: `bp-agent ${m.ver ?? ''}`.trim(),
      kind: 'agent',
      parts: m.parts.map((p) => ({ offset: parseInt(p.offset, 16), path: join(dir, p.file) })),
      confirmToken: token,
    };
  }

  private async exclusive<T>(fn: () => Promise<T>, ms: number, what: string): Promise<Result<T>> {
    if (this.busy) return { ok: false, error: { code: 'busy', humanMessage: t('The app is still busy with the board.'), hint: t('Wait for the current task to finish.') } };
    this.busy = true;
    try {
      return await guard(fn, ms, what);
    } finally {
      this.busy = false;
      this.emit('progress', null);
    }
  }

  installAgent(token: string): Promise<Result<HelloReply>> {
    return this.exclusive(
      async () => {
        consume(token, 'flash_agent');
        const port = this.st.port;
        if (!port) throw new DriverError('not_identified', t('No board selected.'), t('Run “Connect and identify” first.'));
        await this.closeLinks();
        await this.ensureBackup();
        const image = this.agentImage(token);
        this.log('action', t('Writing the diagnostic agent to the board.'));
        await this.driver.flash(port, image, (pct) => this.emit('progress', { task: t('Installing the diagnostic agent'), pct }));
        return this.connectAgentInner();
      },
      8 * 60 * 1000,
      t('Installing the diagnostic agent'),
    );
  }

  /**
   * Back up the program on the board now ("back up my board"). Only reads the flash, so no
   * confirmation is needed; the agent reconnects afterwards when it was running.
   */
  backup(): Promise<Result<BackupInfo>> {
    return this.exclusive(
      async () => {
        const { port, chip } = this.st;
        if (!port || !chip) throw new DriverError('not_identified', t('The board has not been identified yet.'), t('Run “Connect and identify” first.'));
        if (!canBackupFlash(this.board)) {
          throw new DriverError('backup_unsupported', t('This board cannot read its program back, so it cannot be backed up.'), t('Keep a copy of your code on this computer instead.'));
        }
        const hadAgent = !!this.st.agent;
        await this.closeLinks();
        this.log('action', t('Backing up the program currently on the board, so it can be restored with one click.'));
        const b = await this.driver.backupFlash(port, chip, (pct) => this.emit('progress', { task: t('Backing up your firmware'), pct }));
        await this.backups.add(b);
        this.patch({ backups: await this.backups.forMac(chip.mac) });
        this.log('found', t('Backup saved ({mb} MB).', { mb: (b.sizeBytes / 1024 / 1024).toFixed(1) }), `backup: ${b.path}`);
        if (hadAgent) await this.connectAgentInner();
        return b;
      },
      8 * 60 * 1000,
      t('Backing up your firmware'),
    );
  }

  /** Connect to an agent that is already on the board (no writing). */
  connectAgent(): Promise<Result<HelloReply>> {
    return this.exclusive(() => this.connectAgentInner(), 15000, t('Connecting to the agent'));
  }

  private async connectAgentInner(): Promise<HelloReply> {
    const port = this.st.port;
    if (!port) throw new DriverError('not_identified', t('No board selected.'), t('Run “Connect and identify” first.'));
    await this.closeLinks();
    const client = await this.driver.openAgent(port);
    this.agentClient = client;
    client.onEvent((event, body) => {
      if (event === 'boot' && typeof body.strapping === 'object' && body.strapping && Object.keys(body.strapping).length) {
        const s = body.strapping as Record<string, number>;
        // ESP32 only: MTDI (GPIO 12) HIGH at reset selects 1.8 V flash (ESP32 Series Datasheet, "Strapping Pins").
        const high12 = this.board.family === 'esp32' && isEspFamily(this.board) && s['12'] === 1;
        const pin12 = pinByGpio(this.board, 12);
        this.log(
          high12 ? 'warning' : 'info',
          t('Strapping pins at reset: {pins}.', {
            pins: Object.entries(s)
              .map(([g, v]) => `${pinByGpio(this.board, Number(g))?.label ?? `GPIO ${g}`}=${v}`)
              .join(', '),
          }) +
            (high12 ? ' ' + t('GPIO 12 was HIGH at reset: this can select the wrong flash voltage.') : ''),
          'measured: agent boot report',
          high12 && pin12 ? `pin:${pin12.id}` : undefined,
        );
      }
    });
    client.onStream((f) => this.emit('live', f));
    let hello: HelloReply | null = null;
    let lastErr: unknown = null;
    for (let i = 0; i < 6 && !hello; i++) {
      try {
        hello = await client.request({ cmd: 'hello' }, 1500);
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    if (!hello) {
      await client.close();
      this.agentClient = null;
      throw lastErr instanceof DriverError
        ? lastErr
        : new DriverError('agent_no_hello', t('The board did not answer as the diagnostic agent.'), t('Install the agent (the app asks first), or press EN to restart the board.'));
    }
    this.patch({ agent: hello });
    this.log('found', t('Diagnostic agent {ver} running on {chip}. Free memory: {kb} KB.', { ver: hello.ver, chip: hello.chip, kb: Math.round(hello.heapFree / 1024) }), 'measured: agent hello');
    return hello;
  }

  /** Read-only agent commands. Writes go through agentWrite with a token. */
  async agent<K extends AgentRequest['cmd']>(req: Extract<AgentRequest, { cmd: K }>): Promise<Result<AgentReplyMap[K]>> {
    if (WRITE_CMDS.has(req.cmd)) {
      return { ok: false, error: { code: 'not_confirmed', humanMessage: t('Driving a pin needs your confirmation.'), hint: t('Use the button in the app, which asks first.') } };
    }
    return this.agentInner(req);
  }

  async agentWrite<K extends AgentRequest['cmd']>(req: Extract<AgentRequest, { cmd: K }>, token: string): Promise<Result<AgentReplyMap[K]>> {
    try {
      consume(token, 'gpio_write');
    } catch (e) {
      return { ok: false, error: toAppError(e) };
    }
    return this.agentInner(req);
  }

  private async agentInner<K extends AgentRequest['cmd']>(req: Extract<AgentRequest, { cmd: K }>): Promise<Result<AgentReplyMap[K]>> {
    const client = this.agentClient;
    if (!client) {
      return { ok: false, error: { code: 'agent_missing', humanMessage: t('The diagnostic agent is not connected.'), hint: t('Start a check that installs it. The app asks before writing anything.') } };
    }
    const timeout = req.cmd === 'i2c_scan' ? 8000 : 3000;
    const r = await guard(() => client.request(req, timeout), timeout + 500, t('Agent command “{cmd}”', { cmd: req.cmd }));
    const any = req as AgentRequest;
    if (r.ok && (any.cmd === 'i2c_scan' || any.cmd === 'i2c_read')) {
      const trace = (r.value as AgentReplyMap['i2c_scan']).trace;
      this.emit('trace', { cmd: any.cmd, sda: any.sda, scl: any.scl, trace });
    }
    if (any.cmd === 'stream') this.patch({ streaming: any.hz > 0 && any.pins.length > 0 });
    if (any.cmd === 'stream_stop') this.patch({ streaming: false });
    return r;
  }

  async restore(backupId: string, token: string): Promise<Result<true>> {
    return this.exclusive(
      async () => {
        consume(token, 'restore');
        const port = this.st.port;
        const chip = this.st.chip;
        if (!port || !chip) throw new DriverError('not_identified', t('No board selected.'), t('Run “Connect and identify” first.'));
        const b = (await this.backups.forMac(chip.mac)).find((x) => x.id === backupId);
        if (!b) throw new DriverError('backup_missing', t('That backup belongs to another board or was deleted.'), t('Pick a backup made from this board.'));
        await this.closeLinks();
        this.patch({ agent: null, streaming: false });
        this.log('action', t('Restoring your firmware from the backup.'));
        await this.driver.restoreFlash(port, b, (pct) => this.emit('progress', { task: t('Restoring your firmware'), pct }));
        this.log('found', t('Your firmware is back on the board.'), `backup: ${b.id}`);
        return true as const;
      },
      8 * 60 * 1000,
      t('Restoring your firmware'),
    );
  }

  /** Reads the firmware file and checks it against the board before anything is written (read-only). */
  async preflight(filePath: string): Promise<Result<PreflightReport>> {
    try {
      const bytes = await readFile(filePath);
      return { ok: true, value: preflightImage(new Uint8Array(bytes), filePath.split(/[\\/]/).pop() ?? filePath, this.board) };
    } catch {
      return { ok: false, error: { code: 'read_failed', humanMessage: t('The file could not be read.'), hint: t('Check that the file still exists and try again.') } };
    }
  }

  flashUser(token: string, filePath: string): Promise<Result<{ bytes: number }>> {
    return this.exclusive(
      async () => {
        consume(token, 'flash_user');
        const port = this.st.port;
        if (!port) throw new DriverError('not_identified', t('No board selected.'), t('Run “Connect and identify” first.'));
        await this.closeLinks();
        this.patch({ agent: null, streaming: false });
        await this.ensureBackup();
        const size = this.st.mode === 'sim' ? 262144 : readFileSync(filePath).length;
        const offset = userImageOffset(this.board, filePath);
        this.log('action', t('Writing {file} at {offset}.', { file: filePath.split('/').pop() ?? filePath, offset: `0x${offset.toString(16)}` }));
        await this.driver.flash(port, { name: filePath, kind: 'user', parts: [{ offset, path: filePath }], confirmToken: token }, (pct) =>
          this.emit('progress', { task: t('Flashing your firmware'), pct }),
        );
        return { bytes: size };
      },
      6 * 60 * 1000,
      t('Flashing firmware'),
    );
  }

  /* ---------- serial (the user's own firmware) ---------- */

  async openSerial(baud: number): Promise<Result<true>> {
    const port = this.st.port;
    if (!port) return { ok: false, error: { code: 'not_identified', humanMessage: t('No board selected.'), hint: t('Run “Connect and identify” first.') } };
    await this.closeLinks();
    this.patch({ agent: null, streaming: false });
    const r = await guard(() => this.driver.openSerial(port, baud), 8000, t('Opening the serial monitor'));
    if (!r.ok) return r;
    this.serial = r.value;
    r.value.onLine((l) => {
      this.serialBatch.push(l);
      const p = parseProbeLine(l);
      if (p) this.emit('probe', p);
    });
    // Batch lines so a chatty sketch does not flood IPC.
    this.serialFlush = setInterval(() => {
      if (this.serialBatch.length) {
        this.emit('serial', this.serialBatch);
        this.serialBatch = [];
      }
    }, 50);
    this.patch({ serialOpen: true });
    return { ok: true, value: true };
  }

  async closeSerial(): Promise<Result<true>> {
    if (this.serial) await this.serial.close().catch(() => {});
    if (this.serialFlush) clearInterval(this.serialFlush);
    this.serial = null;
    this.serialFlush = null;
    this.patch({ serialOpen: false });
    return { ok: true, value: true };
  }

  async writeSerial(text: string): Promise<Result<true>> {
    if (!this.serial) return { ok: false, error: { code: 'serial_closed', humanMessage: t('The serial monitor is not open.'), hint: t('Open it first.') } };
    return guard(async () => {
      await this.serial?.write(text);
      return true as const;
    }, 3000, t('Sending to the board'));
  }

  /** Open serial briefly, collect lines, close. Used by the debug flows. */
  async captureSerial(baud: number, ms: number): Promise<Result<string[]>> {
    const port = this.st.port;
    if (!port) return { ok: false, error: { code: 'not_identified', humanMessage: t('No board selected.'), hint: t('Run “Connect and identify” first.') } };
    await this.closeLinks();
    this.patch({ agent: null, streaming: false, serialOpen: false });
    return guard(
      async () => {
        const s = await this.driver.openSerial(port, baud);
        const lines: string[] = [];
        s.onLine((l) => lines.push(l));
        await new Promise((r) => setTimeout(r, ms));
        await s.close();
        return lines;
      },
      ms + 8000,
      t('Reading serial output'),
    );
  }

  async shutdown() {
    await this.closeLinks();
  }
}
