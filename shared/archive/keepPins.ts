// "Keep the project's pins": when an old project becomes a new one, its display pins (read from
// User_Setup.h, PlatformIO flags, LovyanGFX configs or the Adafruit constructors, see
// shared/displayPins.ts) are wired as they were, instead of letting the safe-pin rules pick new ones.
// Pure: the scene with the parts placed in, the wires for the recovered pins out. The caller runs
// assignPins afterwards for everything that was not recovered (power, ground, other parts).

import type { BoardDef, PartDef, PartPin, Scene, SceneWire } from '../types';
import { ROLE_HEX, partRoleColor } from '../board';
import { pinResolver } from '../codeCheck';
import type { DisplayPin, DisplayPinRole } from '../displayPins';
import { t } from '../i18n';

export interface KeptPins {
  wires: SceneWire[];
  /** One plain sentence per pin that was wired as in the project. */
  kept: string[];
  /** One plain sentence per recovered pin that could not be wired, and why. */
  skipped: string[];
}

const isTouchPin = (p: PartPin) => /^t_|touch/i.test(p.name) || /touch/i.test(p.notes ?? '');

/** The pins of a part that a recovered pin of this role goes to. */
function partPinsFor(def: PartDef, role: DisplayPinRole, sharedTouch: boolean): PartPin[] {
  const spi = (r: PartPin['role']) => def.pins.filter((p) => p.role === r);
  const main = (r: PartPin['role']) => spi(r).filter((p) => !isTouchPin(p));
  const touch = (r: PartPin['role']) => spi(r).filter(isTouchPin);
  switch (role) {
    // the touch controller shares the display's bus unless the project gives it pins of its own
    case 'sclk':
      return [...main('spi_sck'), ...(sharedTouch ? touch('spi_sck') : [])];
    case 'mosi':
      return [...main('spi_mosi'), ...(sharedTouch ? touch('spi_mosi') : [])];
    case 'miso':
      return [...main('spi_miso'), ...(sharedTouch ? touch('spi_miso') : [])];
    case 'cs':
      return main('spi_cs').slice(0, 1);
    case 'touch_cs':
      return touch('spi_cs').slice(0, 1);
    case 'touch_irq':
      return spi('int').slice(0, 1);
    case 'dc':
      return def.pins.filter((p) => /^(dc|rs|a0|d\/c|dc\/rs)$/i.test(p.name.trim())).slice(0, 1);
    case 'rst':
      return def.pins.filter((p) => /^(res|rst|reset|resetb)$/i.test(p.name.trim())).slice(0, 1);
    case 'touch_sclk':
      return touch('spi_sck');
    case 'touch_mosi':
      return touch('spi_mosi');
    case 'touch_miso':
      return touch('spi_miso');
    default:
      return []; // backlight (usually tied to 3V3 in the drawing) and touch I2C pins are left to the safe-pin rules
  }
}

/** Wires for the display pins `pins` onto the first display part of `scene` (a part with SPI clock and data pins). */
export function wireRecoveredPins(scene: Scene, board: BoardDef, parts: Record<string, PartDef>, pins: DisplayPin[]): KeptPins {
  const out: KeptPins = { wires: [], kept: [], skipped: [] };
  const inst = scene.parts.find((p) => parts[p.partId]?.pins.some((x) => x.role === 'spi_sck') && parts[p.partId]?.pins.some((x) => x.role === 'spi_mosi'));
  const def = inst ? parts[inst.partId] : undefined;
  if (!inst || !def) return out;
  const resolve = pinResolver(new Map(), board);
  const sharedTouch = !pins.some((p) => p.role === 'touch_sclk' || p.role === 'touch_mosi' || p.role === 'touch_miso');
  const taken = new Set<string>();
  for (const p of pins) {
    const target = partPinsFor(def, p.role, sharedTouch);
    if (!target.length) continue;
    const bp = resolve(String(p.gpio));
    if (!bp) {
      out.skipped.push(t('{name} is GPIO {gpio}, which is not a pin of {board}, so it was not wired.', { name: p.name, gpio: p.gpio, board: board.name }));
      continue;
    }
    if (bp.kind !== 'gpio') continue;
    for (const tp of target) {
      if (taken.has(tp.name)) continue;
      taken.add(tp.name);
      out.wires.push({ id: `k${out.wires.length}`, from: { part: 'board', pin: bp.id }, to: { part: inst.id, pin: tp.name }, color: ROLE_HEX[partRoleColor(tp.role)] });
    }
    out.kept.push(t('{part} {pin} to {boardPin} (GPIO {gpio}, from {name})', { part: inst.label ?? def.name, pin: target[0].name, boardPin: bp.label, gpio: p.gpio, name: p.name }));
  }
  return out;
}
