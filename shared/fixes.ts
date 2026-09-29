// One-click fixes for wiring findings (the warnings banner's "Fix"). Each fix is a plain change to
// the drawing that the rules can make safely: move a wire off a pin that must not be used (the
// safe-pin rules pick the new pin), swap SDA/SCL back at the part, or add the missing supply and
// ground wires. Findings that need a decision (a level shifter, another address) have no fix.

import type { BoardDef, PartDef, Scene, WiringFinding } from './types';
import { assignPins } from './assign';
import { t } from './i18n';

export interface WiringFix {
  /** what the fix does, in plain words, for the button's tooltip and the log */
  text: string;
  scene: Scene;
}

/** Rules where moving the wire to another (safe) pin is the fix. */
const MOVE: WiringFinding['rule'][] = ['flash_pin', 'strapping_pin', 'output_on_input_only', 'uart0_pin', 'not_adc', 'adc2_wifi', 'wrong_pin_type', 'reserved_pin', 'shared_pin_conflict', 'unknown_pin'];

/** The wires a finding is about: named in its targets, or else the wires on the board pins it names. */
function wireIds(f: WiringFinding, scene: Scene): string[] {
  const named = f.targets.filter((x) => x.startsWith('wire:')).map((x) => x.slice(5));
  if (named.length) return named;
  const pins = f.targets.filter((x) => x.startsWith('pin:')).map((x) => x.slice(4));
  return scene.wires.filter((w) => (w.from.part === 'board' && pins.includes(w.from.pin)) || (w.to.part === 'board' && pins.includes(w.to.pin))).map((w) => w.id);
}

export function wiringFix(f: WiringFinding, scene: Scene, board: BoardDef, parts: Record<string, PartDef>): WiringFix | null {
  if (f.rule === 'i2c_swapped' && f.targets.some((x) => x.startsWith('wire:'))) {
    const [a, b] = wireIds(f, scene)
      .map((id) => scene.wires.find((w) => w.id === id))
      .filter((w): w is NonNullable<typeof w> => !!w);
    if (!a || !b) return null;
    // Exchange the part ends of the two wires: the board pins stay, SDA goes back to SDA.
    const partEnd = (w: typeof a) => (w.from.part === 'board' ? 'to' : 'from');
    const ea = a[partEnd(a)];
    const eb = b[partEnd(b)];
    if (ea.part !== eb.part) return null;
    return {
      text: t('Swap the two wires at the part, so SDA and SCL match the board.'),
      scene: {
        ...scene,
        wires: scene.wires.map((w) => (w.id === a.id ? { ...w, [partEnd(a)]: eb, color: b.color } : w.id === b.id ? { ...w, [partEnd(b)]: ea, color: a.color } : w)),
      },
    };
  }
  if (f.rule === 'missing_ground' || f.rule === 'missing_power') {
    const partIds = f.targets.filter((x) => x.startsWith('part:')).map((x) => x.slice(5));
    const role = f.rule === 'missing_ground' ? 'ground' : 'power';
    const added = newWires(scene, board, parts, partIds, (partId, pin) => parts[scene.parts.find((p) => p.id === partId)?.partId ?? '']?.pins.find((x) => x.name === pin)?.role === role);
    if (!added.length) return null;
    return { text: f.rule === 'missing_ground' ? t('Add the ground wire.') : t('Add the supply wire.'), scene: { ...scene, wires: [...scene.wires, ...added] } };
  }
  if (MOVE.includes(f.rule)) {
    // shared_pin_conflict lists every wire on the pin: move all but the first.
    const ids = f.rule === 'shared_pin_conflict' ? wireIds(f, scene).slice(1) : wireIds(f, scene);
    if (!ids.length) return null;
    const moved = scene.wires.filter((w) => ids.includes(w.id)).map((w) => (w.from.part === 'board' ? w.to : w.from));
    const without = { ...scene, wires: scene.wires.filter((w) => !ids.includes(w.id)) };
    const added = newWires(without, board, parts, [...new Set(moved.map((e) => e.part))], (partId, pin) => moved.some((e) => e.part === partId && e.pin === pin));
    if (!added.length) return null;
    const pins = added.map((w) => (w.from.part === 'board' ? w.from.pin : w.to.pin)).join(', ');
    return { text: t('Move the wire to a safe pin ({pins}). Update the pin in your code too.', { pins }), scene: { ...without, wires: [...without.wires, ...added] } };
  }
  return null;
}

/**
 * Wires the safe-pin rules would add for some part pins only (not every unwired pin of the
 * project: a free INT or address pin stays free).
 */
function newWires(scene: Scene, board: BoardDef, parts: Record<string, PartDef>, partIds: string[], want: (partId: string, pin: string) => boolean) {
  const r = assignPins({ ...scene, parts: scene.parts.filter((p) => partIds.includes(p.id)) }, board, parts);
  return r.scene.wires.filter((w) => !scene.wires.some((x) => x.id === w.id)).filter((w) => {
    const end = w.from.part === 'board' ? w.to : w.from;
    return want(end.part, end.pin);
  });
}
