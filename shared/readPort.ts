// "Read from port" (New project): find the board on USB, then look at what is connected to it and
// build a project from what was found. Look before asking: the port, the chip and the board come
// from the USB port and the chip tool; I2C parts come from a bus scan (as wired and with SDA/SCL
// exchanged, the swap test) and their ID registers from the parts library; knobs and analog sensors
// from steady ADC readings. Every result says how it was found. A part is "detected" when a chip ID
// confirmed it; anything else (an address shared by several parts, an analog reading) is a guess
// the user confirms before the project relies on it (honest AI rule, CLAUDE.md).

import type { AgentReplyMap, AgentRequest, BoardDef, ChipInfo, PartDef, PortInfo, Result, Scene, SceneWire } from './types';
import { ROLE_HEX, boardForChip, groundPins, partRoleColor, pinById, pinByGpio, powerPinFor } from './board';
import { t } from './i18n';

export interface ReadPortHw {
  listPorts(): Promise<Result<PortInfo[]>>;
  /** Point the chip tools at another board (the USB ids say which one is plugged in). */
  setBoard?(id: string): Promise<void>;
  identify(port: string): Promise<Result<ChipInfo>>;
  agentReady(): boolean;
  /** Ask (dialog) and install the diagnostic agent after a backup. False when the user says no. */
  installAgent(): Promise<boolean>;
  agent<K extends AgentRequest['cmd']>(req: Extract<AgentRequest, { cmd: K }>): Promise<Result<AgentReplyMap[K]>>;
}

export type ReadStepStatus = 'run' | 'ok' | 'warn' | 'fail' | 'skip';

export interface ReadStep {
  id: string;
  status: ReadStepStatus;
  text: string;
  /** where the fact comes from: a measurement, the parts library, or a suggestion */
  source?: string;
}

/** An I2C device that answered, and what it is. */
export interface FoundI2c {
  addr: string;
  /** the part it is: confirmed by its ID register (detected), or the most likely one (guess) */
  partId: string | null;
  guess: boolean;
  /** other parts that use the same address (for the user to pick from) */
  alternatives: string[];
  /** what the ID register said, when one was read */
  idRead?: { register: string; value: string };
  /** found only with SDA and SCL exchanged: the wires are crossed */
  crossed: boolean;
  evidence: string;
  /** a note from the parts library about the ID value (e.g. "This is a BMP280") */
  note?: string;
}

/** An ADC pin with a steady reading between the rails: maybe a knob or an analog sensor. */
export interface FoundAnalog {
  gpio: number;
  pinId: string;
  mv: number;
}

export interface ReadResult {
  port: string | null;
  chip: ChipInfo | null;
  board: BoardDef | null;
  /** the board had to be picked by hand (the chip did not say which one) */
  boardUnsure: boolean;
  agent: boolean;
  i2c: FoundI2c[];
  i2cPins: { sda: number; scl: number } | null;
  pullups: Record<string, boolean> | null;
  analog: FoundAnalog[];
}

/** Beginner parts first when an address is shared: the most likely guess comes first. */
const POPULAR = [
  'ssd1306-i2c',
  'bme280-gy',
  'bmp280-gy',
  'mpu6050',
  'bh1750-gy302',
  'aht20',
  'sht31',
  'ds3231-rtc',
  'ads1115',
  'ina219',
  'lcd1602-i2c',
  'vl53l0x',
  'hmc5883l-gy273',
  'qmc5883l-gy271',
  'sh1106-oled',
  'mcp23017-expander',
  'pca9685-servo',
  'at24c256-eeprom',
  'tca9548a-mux',
];

const hex = (v: string) => `0x${parseInt(v, 16).toString(16).padStart(2, '0').toUpperCase()}`;
const sameHex = (a: string, b: string) => parseInt(a, 16) === parseInt(b, 16);

/** Parts in the library that can answer at an address, the usual (first-listed) address and popular parts first. */
export function i2cCandidates(addr: string, parts: Record<string, PartDef>): PartDef[] {
  const rank = (p: PartDef) => {
    const i = POPULAR.indexOf(p.id);
    return i < 0 ? POPULAR.length : i;
  };
  return Object.values(parts)
    .filter((p) => p.bus === 'i2c' && (p.addresses ?? []).some((a) => sameHex(a, addr)))
    .sort((a, b) => {
      const da = sameHex(a.addresses?.[0] ?? '', addr) ? 0 : 1;
      const db = sameHex(b.addresses?.[0] ?? '', addr) ? 0 : 1;
      return da - db || rank(a) - rank(b) || a.id.localeCompare(b.id);
    });
}

/**
 * Which part answered at `addr`: reads each distinct ID register the candidates document (read-only)
 * and takes the part whose expected value came back. Without a match, the most likely candidate is
 * a guess.
 */
export async function identifyI2c(
  hw: Pick<ReadPortHw, 'agent'>,
  bus: { sda: number; scl: number },
  addr: string,
  parts: Record<string, PartDef>,
): Promise<Omit<FoundI2c, 'crossed'>> {
  const cands = i2cCandidates(addr, parts);
  const read = new Map<string, string | null>();
  for (const c of cands) {
    const reg = c.idCheck?.register;
    if (!reg || read.has(reg.toLowerCase())) continue;
    const r = await hw.agent({ cmd: 'i2c_read', sda: bus.sda, scl: bus.scl, addr, reg, len: 1 });
    read.set(reg.toLowerCase(), r.ok && r.value.data[0] ? r.value.data[0] : null);
  }
  for (const c of cands) {
    const reg = c.idCheck?.register;
    const got = reg ? read.get(reg.toLowerCase()) : null;
    if (reg && got && c.idCheck && sameHex(got, c.idCheck.expect)) {
      return {
        addr,
        partId: c.id,
        guess: false,
        alternatives: [],
        idRead: { register: hex(reg), value: hex(got) },
        evidence: t('Answers at {addr}; ID register {reg} = {value}, as the {part} datasheet says.', { addr, reg: hex(reg), value: hex(got), part: c.name }),
      };
    }
  }
  // No ID matched. A value named in a part's otherValues still tells the user something.
  let note: string | undefined;
  let idRead: FoundI2c['idRead'];
  for (const c of cands) {
    const reg = c.idCheck?.register;
    const got = reg ? read.get(reg.toLowerCase()) : null;
    if (!reg || !got) continue;
    idRead ??= { register: hex(reg), value: hex(got) };
    const other = Object.entries(c.idCheck?.otherValues ?? {}).find(([v]) => sameHex(v, got));
    if (other) note = other[1];
  }
  const pick = cands[0];
  return {
    addr,
    partId: pick?.id ?? null,
    guess: true,
    alternatives: cands.slice(1, 4).map((c) => c.id),
    idRead,
    note,
    evidence: pick
      ? t('Answers at {addr}. Several parts use this address; the most common is the {part}. Please confirm.', { addr, part: pick.name })
      : t('Answers at {addr}, but no part in the library uses this address. Add it from the parts library.', { addr }),
  };
}

/** The steps shown while reading, in order. */
export const READ_STEPS = ['port', 'chip', 'agent', 'pullups', 'i2c', 'ids', 'adc'] as const;

/**
 * Read the board on the USB port and what is connected. `onStep` reports progress for the UI and
 * the log. Only reads, except installing the diagnostic agent, which `hw.installAgent` asks for.
 */
export async function readFromPort(
  hw: ReadPortHw,
  opts: { currentBoard?: string; boards: (id: string) => BoardDef; parts: Record<string, PartDef>; pickBoard?: BoardDef | null },
  onStep: (s: ReadStep) => void,
): Promise<ReadResult> {
  const out: ReadResult = { port: null, chip: null, board: opts.pickBoard ?? null, boardUnsure: false, agent: false, i2c: [], i2cPins: null, pullups: null, analog: [] };

  /* ---- the port ---- */
  onStep({ id: 'port', status: 'run', text: t('Looking for a board on USB…') });
  const ports = await hw.listPorts();
  if (!ports.ok) {
    onStep({ id: 'port', status: 'fail', text: `${ports.error.humanMessage} ${ports.error.hint}`.trim() });
    return out;
  }
  const port =
    (opts.currentBoard ? ports.value.find((p) => p.boardIds?.includes(opts.currentBoard!)) : undefined) ??
    ports.value.find((p) => p.likelyBoard) ??
    (ports.value.length === 1 ? ports.value[0] : undefined);
  if (!port) {
    onStep({
      id: 'port',
      status: 'fail',
      text: ports.value.length
        ? t('{n} ports found, none looks like a board. Pick the board yourself, or use Connect to choose the port.', { n: ports.value.length })
        : t('No board on USB. Use a data cable (many only charge), plug it in directly, then try again.'),
      source: 'measured: USB port list',
    });
    return out;
  }
  out.port = port.path;
  onStep({
    id: 'port',
    status: 'ok',
    text: port.bridge !== 'unknown' ? t('Port found: {port} ({chip})', { port: port.path, chip: port.bridge }) : t('Port found: {port}', { port: port.path }),
    source: 'measured: USB port list',
  });

  /* ---- the chip and the board ---- */
  onStep({ id: 'chip', status: 'run', text: t('Reading the chip (only reads)…') });
  // Each family has its own chip tool: when the USB ids name another board, use its tool.
  let current = opts.pickBoard?.id ?? opts.currentBoard;
  const usbIds = port.boardIds ?? [];
  if (usbIds.length && !usbIds.includes(current ?? '') && hw.setBoard) {
    current = usbIds[0];
    await hw.setBoard(current);
  }
  const chip = await hw.identify(port.path);
  if (!chip.ok) {
    onStep({ id: 'chip', status: 'fail', text: `${chip.error.humanMessage} ${chip.error.hint}`.trim() });
    return out;
  }
  out.chip = chip.value;
  const detected = opts.pickBoard ?? boardForChip(chip.value.chip, usbIds, current);
  out.board = detected ?? (current ? opts.boards(current) : null);
  out.boardUnsure = !detected;
  onStep({
    id: 'chip',
    status: detected ? 'ok' : 'warn',
    text: detected
      ? t('Chip: {chip}, {flash} flash → {board}', { chip: chip.value.chip, flash: chip.value.flashSize, board: detected.name })
      : t('Chip: {chip}. Several boards use it: using the {board} for now. Pick yours if it is different.', { chip: chip.value.chip, board: out.board?.name ?? '?' }),
    source: `measured: ${chip.value.toolVersion ?? 'chip tool'}`,
  });
  const board = out.board;
  if (!board) return out;
  // The agent and the pin rules follow the board that answered.
  if (board.id !== current && hw.setBoard) await hw.setBoard(board.id);

  /* ---- the diagnostic agent ---- */
  if (!board.toolchain.agent) {
    onStep({ id: 'agent', status: 'skip', text: t('No diagnostic agent for this board yet, so the app cannot look at the pins. Add your parts by hand.'), source: `library: ${board.id}` });
    return out;
  }
  const installed = !hw.agentReady();
  if (installed) {
    onStep({ id: 'agent', status: 'run', text: t('To see what is connected, the app needs its diagnostic agent on the board (your firmware is backed up first).') });
    const ok = await hw.installAgent();
    if (!ok) {
      onStep({ id: 'agent', status: 'skip', text: t('Skipped: nothing was written. The project has the board only; add your parts by hand.') });
      return out;
    }
  }
  out.agent = true;
  onStep({
    id: 'agent',
    status: 'ok',
    text: installed ? t('Diagnostic agent installed and answering (your firmware was backed up first).') : t('Diagnostic agent answers.'),
    source: 'measured: agent hello',
  });

  /* ---- I2C: pull-ups, the scan as wired and exchanged (swap test), the ID registers ---- */
  const sdaPin = pinById(board, board.rules.i2c.sda);
  const sclPin = pinById(board, board.rules.i2c.scl);
  if (sdaPin?.gpio != null && sclPin?.gpio != null) {
    const sda = sdaPin.gpio;
    const scl = sclPin.gpio;
    out.i2cPins = { sda, scl };
    const pu = await hw.agent({ cmd: 'pullup_check', pins: [sda, scl] });
    if (pu.ok) {
      out.pullups = pu.value.external;
      const both = pu.value.external[String(sda)] && pu.value.external[String(scl)];
      onStep({
        id: 'pullups',
        status: both ? 'ok' : 'warn',
        text: both
          ? t('Pull-ups on {sda}/{scl}: yes (something is connected to the I2C pins)', { sda: sdaPin.label, scl: sclPin.label })
          : t('No pull-ups on {sda}/{scl}: nothing on the I2C bus, or a module without pull-ups', { sda: sdaPin.label, scl: sclPin.label }),
        source: 'measured: pullup_check',
      });
    } else onStep({ id: 'pullups', status: 'skip', text: `${pu.error.humanMessage}` });

    onStep({ id: 'i2c', status: 'run', text: t('Scanning I2C on {sda}/{scl}, as wired and exchanged…', { sda: sdaPin.label, scl: sclPin.label }) });
    const wired = await hw.agent({ cmd: 'i2c_scan', sda, scl, hz: 100000 });
    const swapped = board.rules.i2c.remappable ? await hw.agent({ cmd: 'i2c_scan', sda: scl, scl: sda, hz: 100000 }) : null;
    const asWired = wired.ok ? wired.value.found : [];
    const onlySwapped = swapped?.ok ? swapped.value.found.filter((a) => !asWired.some((b) => sameHex(a, b))) : [];
    if (!wired.ok) onStep({ id: 'i2c', status: 'fail', text: `${wired.error.humanMessage} ${wired.error.hint}`.trim() });
    else if (!asWired.length && !onlySwapped.length) onStep({ id: 'i2c', status: 'ok', text: t('Nothing answers on the I2C bus.'), source: 'measured: i2c_scan' });
    else
      onStep({
        id: 'i2c',
        status: onlySwapped.length ? 'warn' : 'ok',
        text: onlySwapped.length
          ? t('{list} answers only with SDA and SCL exchanged: the wires look crossed', { list: onlySwapped.map(hex).join(', ') })
          : t('I2C devices at {list}', { list: asWired.map(hex).join(', ') }),
        source: 'measured: i2c_scan (swap test)',
      });

    for (const [list, crossed] of [
      [asWired, false],
      [onlySwapped, true],
    ] as const) {
      for (const addr of list) {
        const bus = crossed ? { sda: scl, scl: sda } : { sda, scl };
        const f = await identifyI2c(hw, bus, hex(addr), opts.parts);
        out.i2c.push({ ...f, crossed });
        const name = f.partId ? (opts.parts[f.partId]?.name ?? f.partId) : t('unknown device');
        onStep({
          id: `ids:${addr}`,
          status: f.guess ? 'warn' : 'ok',
          text: f.guess
            ? t('{addr}: probably a {part} (guess, please confirm)', { addr: hex(addr), part: name })
            : t('{addr} answers, chip ID {value} → {part}', { addr: hex(addr), value: f.idRead?.value ?? '', part: name }),
          source: f.guess ? 'suggestion: parts library addresses' : `measured: i2c_read ${f.idRead?.register ?? ''}`.trim(),
        });
      }
    }
  }

  /* ---- ADC pins that read a real voltage (twice, steady) ---- */
  const i2cGpios = new Set([out.i2cPins?.sda, out.i2cPins?.scl]);
  const adcPins = board.rules.adcPins
    .map((id) => pinById(board, id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.gpio !== null && !i2cGpios.has(p.gpio) && !p.flags.includes('strapping_critical'))
    .slice(0, 8);
  if (adcPins.length) {
    onStep({ id: 'adc', status: 'run', text: t('Reading ADC pins for knobs and sensors…') });
    const full = board.rules.adcMaxMv;
    for (const p of adcPins) {
      const a = await hw.agent({ cmd: 'adc', pin: p.gpio as number });
      const b = await hw.agent({ cmd: 'adc', pin: p.gpio as number });
      if (!a.ok || !b.ok) continue;
      const steady = Math.abs(a.value.mv - b.value.mv) < full * 0.03;
      const mid = a.value.mv > full * 0.05 && a.value.mv < full * 0.95;
      if (steady && mid) out.analog.push({ gpio: p.gpio as number, pinId: p.id, mv: Math.round((a.value.mv + b.value.mv) / 2) });
    }
    onStep({
      id: 'adc',
      status: 'ok',
      text: out.analog.length
        ? t('Steady readings on {list}: maybe a knob or an analog sensor (you confirm)', { list: out.analog.map((x) => `${pinByGpio(board, x.gpio)?.label ?? x.pinId} ${x.mv} mV`).join(', ') })
        : t('No ADC pin reads a steady voltage: no knob or analog sensor found'),
      source: 'measured: adc (read twice)',
    });
  }
  return out;
}

/**
 * The project for what was found: the board, each I2C part on the wires it answered on (crossed
 * wires stay crossed, so the wiring check explains them), supply and ground (drawn to the usual pins:
 * those cannot be measured) and the analog parts the user confirmed.
 */
export function sceneFromRead(r: ReadResult, parts: Record<string, PartDef>, confirmedAnalog: { gpio: number; partId: string }[] = []): { scene: Scene; notes: string[] } {
  const board = r.board;
  if (!board) return { scene: { board: '', parts: [], wires: [] }, notes: [] };
  const scene: Scene = { board: board.id, parts: [], wires: [] };
  const notes: string[] = [];
  let n = 0;
  const wireId = () => `w${++n}`;
  const add = (partId: string, x: number, z: number, extra: { confirmed?: boolean; detected?: string }) => {
    const def = parts[partId];
    if (!def) return null;
    const base = partId.replace(/-.*$/, '').replace(/[^a-z0-9]/gi, '') || 'part';
    let k = 1;
    while (scene.parts.some((p) => p.id === `${base}${k}`)) k++;
    const id = `${base}${k}`;
    scene.parts.push({ id, partId, position: [x, 0, z], label: def.name.split(/[ (]/)[0], ...extra });
    return { id, def };
  };
  const power = (inst: { id: string; def: PartDef }) => {
    const grounds = groundPins(board);
    for (const pp of inst.def.pins) {
      const target = pp.role === 'power' ? powerPinFor(board, inst.def.voltage) : pp.role === 'ground' ? grounds[0] : undefined;
      if (target) scene.wires.push({ id: wireId(), from: { part: 'board', pin: target.id }, to: { part: inst.id, pin: pp.name }, color: ROLE_HEX[partRoleColor(pp.role)] });
    }
  };
  const spots = (i: number): [number, number] => [-70 + (i % 4) * 46, 62 + Math.floor(i / 4) * 40];
  let i = 0;
  const seen = new Set<string>();
  for (const f of r.i2c) {
    if (!f.partId || !r.i2cPins) continue;
    const [x, z] = spots(i++);
    const inst = add(f.partId, x, z, { confirmed: !f.guess, detected: f.evidence });
    if (!inst) continue;
    const sdaGpio = f.crossed ? r.i2cPins.scl : r.i2cPins.sda;
    const sclGpio = f.crossed ? r.i2cPins.sda : r.i2cPins.scl;
    const sda = pinByGpio(board, sdaGpio);
    const scl = pinByGpio(board, sclGpio);
    const wires: SceneWire[] = [];
    for (const pp of inst.def.pins) {
      const bp = pp.role === 'i2c_sda' ? sda : pp.role === 'i2c_scl' ? scl : undefined;
      if (bp) wires.push({ id: wireId(), from: { part: 'board', pin: bp.id }, to: { part: inst.id, pin: pp.name }, color: ROLE_HEX[partRoleColor(pp.role)] });
    }
    scene.wires.push(...wires);
    power(inst);
    if (f.crossed) notes.push(t('{part}: the wires are drawn crossed, as found on the bench. The wiring check explains how to fix them.', { part: inst.def.name }));
    if (!seen.has('power')) {
      seen.add('power');
      notes.push(t('Supply and ground wires are drawn to the usual pins: the app cannot measure which ones you used. Check them on your bench.'));
    }
  }
  for (const a of confirmedAnalog) {
    const [x, z] = spots(i++);
    const inst = add(a.partId, x, z, { confirmed: true, detected: t('Steady voltage on {pin}; you confirmed what it is.', { pin: pinByGpio(board, a.gpio)?.label ?? String(a.gpio) }) });
    if (!inst) continue;
    const pin = pinByGpio(board, a.gpio);
    const signal = inst.def.pins.find((p) => p.role === 'analog_out');
    if (pin && signal) scene.wires.push({ id: wireId(), from: { part: 'board', pin: pin.id }, to: { part: inst.id, pin: signal.name }, color: ROLE_HEX.adc });
    power(inst);
  }
  return { scene, notes };
}
