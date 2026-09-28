// Board and part helpers shared by main and renderer. Pure functions only.

import type { BoardDef, PartDef, PinDef, Scene, PartPinRole, TargetRef } from './types';
import esp32Devkit30 from '../boards/esp32-devkitc-30.json';
export const BOARDS: Record<string, BoardDef> = {
  [esp32Devkit30.id]: esp32Devkit30 as unknown as BoardDef,
};

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

/* ---------- ESP32 chip rules (ESP32 Series Datasheet, "Pin Description" and "Strapping Pins") ---------- */

/** GPIO 6-11 are wired to the SPI flash inside the module. */
export const FLASH_GPIOS = [6, 7, 8, 9, 10, 11];
/** GPIO 34-39 are input only, with no internal pull-up/down (TRM, IO_MUX and GPIO Matrix). */
export const INPUT_ONLY_GPIOS = [34, 35, 36, 37, 38, 39];
/** Level at reset changes boot behaviour. */
export const STRAPPING_GPIOS = [0, 2, 5, 12, 15];
export const ADC1_GPIOS = [32, 33, 34, 35, 36, 37, 38, 39];
export const ADC2_GPIOS = [0, 2, 4, 12, 13, 14, 15, 25, 26, 27];

export const isAdcGpio = (g: number) => ADC1_GPIOS.includes(g) || ADC2_GPIOS.includes(g);
export const canOutput = (p: PinDef) => p.kind === 'gpio' && !p.flags.includes('input_only') && !p.flags.includes('flash');

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
  if (p.flags.includes('input_only')) return 'adc';
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
 * (USB end is -x), z across the width (front row is +z), y up.
 */
export function pinPositionMm(board: BoardDef, p: PinDef): [number, number, number] {
  const { length, thickness } = board.pcbMm;
  const x = board.header.firstPinOffsetMm - p.index * board.header.pitchMm - length / 2;
  const z = (p.row === 'front' ? 1 : -1) * (board.header.rowSpacingMm / 2);
  return [x, thickness / 2, z];
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
