// Board and part helpers shared by main and renderer. Pure functions only.

import type { BoardDef, PartDef, PinDef, Scene, PartPinRole, TargetRef } from './types';
/** Every JSON file in /boards is a board definition (Vite bundles them at build time). */
const BOARD_FILES = import.meta.glob<{ default: unknown }>('../boards/*.json', { eager: true });

export const BOARDS: Record<string, BoardDef> = Object.fromEntries(
  Object.values(BOARD_FILES)
    .map((m) => m.default as BoardDef)
    .filter((b) => b && typeof b.id === 'string' && Array.isArray(b.pins))
    .map((b) => [b.id, b]),
);

/** Board ids in picker order: the order families are listed in, then by name. */
const FAMILY_ORDER: BoardDef['family'][] = ['esp32', 'esp32s3', 'esp32c3', 'rp2040', 'rp2350', 'avr', 'stm32', 'nrf52', 'imxrt'];
export function boardList(): BoardDef[] {
  return Object.values(BOARDS).sort(
    (a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) || a.name.localeCompare(b.name),
  );
}

/** Family names for the picker. */
export const FAMILY_LABEL: Record<BoardDef['family'], string> = {
  esp32: 'ESP32',
  esp32s3: 'ESP32-S3',
  esp32c3: 'ESP32-C3',
  rp2040: 'Raspberry Pi RP2040',
  rp2350: 'Raspberry Pi RP2350',
  avr: 'Arduino (AVR)',
  stm32: 'STM32',
  nrf52: 'Nordic nRF52',
  imxrt: 'Teensy (i.MX RT)',
};

/**
 * Does the chip a tool reported fit the selected board? Used to warn when the project is set to one
 * board but another is plugged in. Unknown combinations count as a match (no false alarms).
 */
export function chipMatchesBoard(chip: string, board: BoardDef): boolean {
  const c = chip.toUpperCase();
  switch (board.family) {
    case 'esp32':
      return /ESP32/.test(c) && !/ESP32-(S2|S3|C2|C3|C5|C6|H2|P4)/.test(c);
    case 'esp32s3':
      return /ESP32-S3/.test(c);
    case 'esp32c3':
      return /ESP32-C3/.test(c);
    case 'rp2040':
      return /RP2040/.test(c) || !/RP2350/.test(c);
    case 'rp2350':
      return /RP2350/.test(c) || !/RP2040/.test(c);
    case 'avr':
      return !/^ATMEGA/.test(c) || c.replace(/[^A-Z0-9]/g, '').startsWith(board.chip.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9));
    case 'stm32': {
      const want = board.chip.toUpperCase().slice(0, 9);
      return !/STM32F\d/.test(c) || c.includes(want);
    }
    case 'nrf52':
      return !/NRF5/.test(c) || c.includes(board.chip.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
    default:
      return true;
  }
}

/** Teensy's bootloader can only write, so its program cannot be backed up (PJRC Teensy Loader docs). */
export const canBackupFlash = (b: BoardDef) => b.toolchain.flasher !== 'teensy';

export const isEspFamily = (b: BoardDef) => b.family === 'esp32' || b.family === 'esp32s3' || b.family === 'esp32c3';

/** Boards whose USB ids match a port, exact vid:pid matches first. */
export function boardsForUsb(vendorId?: string, productId?: string): string[] {
  const v = vendorId?.toLowerCase().replace(/^0x/, '').padStart(4, '0');
  const p = productId?.toLowerCase().replace(/^0x/, '').padStart(4, '0');
  if (!v) return [];
  const exact: string[] = [];
  const vendorOnly: string[] = [];
  for (const b of boardList()) {
    for (const u of b.usb) {
      if (u.vid !== v) continue;
      if (u.pid === p) {
        exact.push(b.id);
        break;
      }
      if (u.pid === undefined) vendorOnly.push(b.id);
    }
  }
  return [...new Set([...exact, ...vendorOnly])];
}

/** Every JSON file in /parts is a built-in part (Vite bundles them at build time). */
const PART_FILES = import.meta.glob<{ default: unknown }>('../parts/*.json', { eager: true });

export const PARTS: Record<string, PartDef> = Object.fromEntries(
  Object.values(PART_FILES)
    .map((m) => m.default as PartDef)
    .filter((p) => p && typeof p.id === 'string')
    .map((p) => [p.id, p]),
);

/** Parts shipped with the app. User parts are added with registerPart and can be removed. */
export const BUILTIN_PART_IDS = new Set(Object.keys(PARTS));

export function registerPart(def: PartDef) {
  PARTS[def.id] = def;
}

export function unregisterPart(id: string) {
  if (!BUILTIN_PART_IDS.has(id)) delete PARTS[id];
}

export const DEFAULT_BOARD_ID = 'esp32-devkitc-30';

export function getBoard(id: string = DEFAULT_BOARD_ID): BoardDef {
  return BOARDS[id] ?? BOARDS[DEFAULT_BOARD_ID];
}

export function pinById(board: BoardDef, id: string): PinDef | undefined {
  return board.pins.find((p) => p.id === id);
}

export function pinByGpio(board: BoardDef, gpio: number): PinDef | undefined {
  return board.pins.find((p) => p.gpio === gpio);
}

/* ---------- pin rules (read from the board file; each board cites its own datasheet) ---------- */

export const isAdcPin = (p: PinDef) => p.flags.includes('adc') || p.flags.includes('adc1') || p.flags.includes('adc2');
export const canOutput = (p: PinDef) => p.kind === 'gpio' && !p.flags.includes('input_only') && !p.flags.includes('flash');

/** GPIO numbers of pins on the board's headers, in board order, without duplicates. */
export function headerGpios(board: BoardDef): number[] {
  return [...new Set(board.pins.filter((p) => p.kind === 'gpio' && p.gpio !== null).map((p) => p.gpio as number))];
}

export function pinsWithFlag(board: BoardDef, flag: PinDef['flags'][number]): PinDef[] {
  return board.pins.filter((p) => p.flags.includes(flag));
}

/** Supply pin for a part: a pin supplying the part's voltage, the board's logic voltage first. */
export function powerPinFor(board: BoardDef, partVoltage: string): PinDef | undefined {
  const nums = partVoltage.split('-').map(Number).filter((n) => Number.isFinite(n));
  const lo = nums.length ? Math.min(...nums) : 3.3;
  const hi = nums.length ? Math.max(...nums) : 3.3;
  const supplies = board.pins.filter((p) => p.kind === 'power' && p.supplies !== undefined && !/VIN|VBAT|AREF|VREF|IOREF/i.test(p.id));
  const fits = supplies.filter((p) => (p.supplies as number) >= lo - 0.2 && (p.supplies as number) <= hi + 0.2);
  const pick = (list: PinDef[]) =>
    list.find((p) => p.supplies === board.logicVolt) ?? list.sort((a, b) => (a.supplies as number) - (b.supplies as number))[0];
  return pick(fits) ?? supplies.find((p) => p.supplies === 3.3) ?? supplies[0];
}

export function groundPins(board: BoardDef): PinDef[] {
  return board.pins.filter((p) => p.kind === 'ground' && !/AGND/i.test(p.id));
}

/* ---------- colors by role (design tokens) ---------- */

export type PinRoleColor = 'power' | 'ground' | 'sda' | 'scl' | 'spi' | 'uart' | 'gpio' | 'adc' | 'none';

export const ROLE_VAR: Record<PinRoleColor, string> = {
  power: '--pin-power',
  ground: '--pin-ground',
  sda: '--pin-sda',
  scl: '--pin-scl',
  spi: '--pin-spi',
  uart: '--pin-uart',
  gpio: '--pin-gpio',
  adc: '--pin-adc',
  none: '--dim',
};

/** Hex values mirrored from tokens.css, for three.js materials that cannot read CSS variables. */
export const ROLE_HEX: Record<PinRoleColor, string> = {
  power: '#FF6B5E',
  ground: '#8A96A3',
  sda: '#3FB6E8',
  scl: '#9ADCF7',
  spi: '#E07BD4',
  uart: '#F2A93B',
  gpio: '#5CCB8F',
  adc: '#E8D24A',
  none: '#7D8997',
};

export function partRoleColor(role: PartPinRole): PinRoleColor {
  switch (role) {
    case 'power':
      return 'power';
    case 'ground':
      return 'ground';
    case 'i2c_sda':
      return 'sda';
    case 'i2c_scl':
      return 'scl';
    case 'spi_mosi':
    case 'spi_miso':
    case 'spi_sck':
    case 'spi_cs':
      return 'spi';
    case 'analog_out':
      return 'adc';
    default:
      return 'gpio';
  }
}

/** Natural color of a board pin when nothing is wired to it. */
export function pinBaseRole(p: PinDef): PinRoleColor {
  if (p.kind === 'power') return 'power';
  if (p.kind === 'ground') return 'ground';
  if (p.kind === 'enable') return 'none';
  if (p.flags.includes('uart0')) return 'uart';
  if (p.flags.includes('input_only') || (p.flags.includes('adc') && /^A\d/.test(p.label))) return 'adc';
  return 'gpio';
}

/** Color of a board pin given the scene: the role of whatever part pin it is wired to wins. */
export function pinRoleInScene(board: BoardDef, scene: Scene, pinId: string): PinRoleColor {
  for (const w of scene.wires) {
    const boardEnd = w.from.part === 'board' ? w.from : w.to.part === 'board' ? w.to : null;
    const partEnd = w.from.part === 'board' ? w.to : w.from;
    if (!boardEnd || boardEnd.pin !== pinId || partEnd.part === 'board') continue;
    const sp = scene.parts.find((p) => p.id === partEnd.part);
    const def = sp && PARTS[sp.partId];
    const pp = def?.pins.find((x) => x.name === partEnd.pin);
    if (pp) return partRoleColor(pp.role);
  }
  const p = pinById(board, pinId);
  return p ? pinBaseRole(p) : 'none';
}

/* ---------- geometry ---------- */

/**
 * Position of a board pin in board millimetres. Origin at the PCB centre, x along the length
 * (USB end is -x), z across the width (front row / bottom edge is +z), y up.
 * Pins use posMm (from the PCB top-left corner) or, on legacy two-row boards, row and index.
 */
export function pinPositionMm(board: BoardDef, p: PinDef): [number, number, number] {
  const { length, width, thickness } = board.pcbMm;
  if (p.posMm) return [p.posMm[0] - length / 2, thickness / 2, p.posMm[1] - width / 2];
  const h = board.header ?? { pitchMm: 2.54, rowSpacingMm: width - 3, firstPinOffsetMm: length - 3 };
  const x = h.firstPinOffsetMm - (p.index ?? 0) * h.pitchMm - length / 2;
  const z = (p.row === 'front' ? 1 : -1) * (h.rowSpacingMm / 2);
  return [x, thickness / 2, z];
}

export function pinMount(board: BoardDef, p: PinDef) {
  return p.mount ?? board.headerStyle ?? 'male-down';
}

/**
 * Which way a pin's label goes: away from the board, towards the nearest edge. Pins with another
 * pin further out in the same direction (inner row of a double header) point inwards instead.
 */
export function pinOutward(board: BoardDef, p: PinDef): [number, number] {
  const { length, width } = board.pcbMm;
  const [x, , z] = pinPositionMm(board, p);
  // Nearest edge; the long edges win ties (corner pins belong to their header row). Pins far from
  // every edge (a column in the middle of the board) label to the right.
  const edges = [
    { dir: [0, -1] as [number, number], dist: z + width / 2 - 0.6 },
    { dir: [0, 1] as [number, number], dist: width / 2 - z - 0.6 },
    { dir: [-1, 0] as [number, number], dist: x + length / 2 },
    { dir: [1, 0] as [number, number], dist: length / 2 - x },
  ].sort((a, b) => a.dist - b.dist);
  const d: [number, number] = edges[0].dist > 6 ? [1, 0] : edges[0].dir;
  const blocked = board.pins.some((q) => {
    if (q === p) return false;
    const [qx, , qz] = pinPositionMm(board, q);
    const along = (qx - x) * d[0] + (qz - z) * d[1];
    const across = Math.abs((qx - x) * d[1] - (qz - z) * d[0]);
    return along > 1.5 && along < 3.5 && across < 0.8;
  });
  return blocked ? [-d[0], -d[1]] : d;
}

/** Board-layout rect (px) → centre and size in mm, in the same frame as pinPositionMm. */
export function rectToMm(board: BoardDef, rect: [number, number, number, number]) {
  const s = board.layoutPxPerMm;
  const [x, y, w, h] = rect.map((v) => v / s);
  return {
    cx: x + w / 2 - board.pcbMm.length / 2,
    cz: y + h / 2 - board.pcbMm.width / 2,
    w,
    h,
  };
}

export function targetLabel(board: BoardDef, scene: Scene, ref: TargetRef): string {
  const [kind, id] = ref.split(':') as [string, string];
  if (kind === 'pin') {
    const p = pinById(board, id);
    return p ? (p.gpio !== null ? `${p.label} (GPIO ${p.gpio})` : p.label) : id;
  }
  if (kind === 'part') {
    const sp = scene.parts.find((x) => x.id === id);
    return sp?.label ?? (sp ? PARTS[sp.partId]?.name ?? id : id);
  }
  return `wire ${id}`;
}

/** Find the board pin wired to a given part pin (e.g. which board pin goes to bme1.SDA). */
export function boardPinFor(scene: Scene, partId: string, partPin: string): string | null {
  for (const w of scene.wires) {
    if (w.from.part === partId && w.from.pin === partPin && w.to.part === 'board') return w.to.pin;
    if (w.to.part === partId && w.to.pin === partPin && w.from.part === 'board') return w.from.pin;
  }
  return null;
}

export function wireFor(scene: Scene, partId: string, partPin: string) {
  return scene.wires.find(
    (w) => (w.from.part === partId && w.from.pin === partPin) || (w.to.part === partId && w.to.pin === partPin),
  );
}
