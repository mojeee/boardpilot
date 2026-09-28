// Automatic pin assignment for New project. Avoids flash pins, input-only pins for outputs,
// strapping pins and the USB serial pins; shares one I2C bus on the default pins.

import type { BoardDef, PartDef, Scene, SceneWire } from './types';
import { ROLE_HEX, partRoleColor } from './board';
import { t } from './i18n';

/** Output-capable, not strapping, not UART0, in order of preference. */
const SAFE_IO = ['D25', 'D26', 'D27', 'D32', 'D33', 'D23', 'D19', 'D18', 'D4', 'D13', 'D14', 'RX2', 'TX2'];
/** ADC1 first (works with Wi-Fi on). Input-only pins are fine for analog inputs. */
const ADC_PINS = ['D34', 'D35', 'VP', 'VN', 'D32', 'D33'];
/** Inputs that need no pull-up can use the input-only pins first. */
const INPUT_PINS = ['D35', 'VP', 'VN', 'D34'];

export interface Assignment {
  scene: Scene;
  notes: string[];
}

export function assignPins(scene: Scene, board: BoardDef, parts: Record<string, PartDef>): Assignment {
  const used = new Set<string>();
  const notes: string[] = [];
  for (const w of scene.wires) {
    if (w.from.part === 'board') used.add(w.from.pin);
    if (w.to.part === 'board') used.add(w.to.pin);
  }
  const wired = (partId: string, pin: string) =>
    scene.wires.some((w) => (w.from.part === partId && w.from.pin === pin) || (w.to.part === partId && w.to.pin === pin));
  const exists = (id: string) => board.pins.some((p) => p.id === id);
  const take = (list: string[]) => {
    const p = list.find((x) => exists(x) && !used.has(x));
    if (p) used.add(p);
    return p;
  };
  let gndToggle = 0;
  const wires: SceneWire[] = [...scene.wires];
  let n = 0;

  for (const inst of scene.parts) {
    const def = parts[inst.partId];
    if (!def) continue;
    for (const pp of def.pins) {
      if (wired(inst.id, pp.name)) continue;
      let boardPin: string | undefined;
      switch (pp.role) {
        case 'power':
          boardPin = '3V3';
          break;
        case 'ground':
          boardPin = gndToggle++ % 2 ? 'GND2' : 'GND1';
          break;
        case 'i2c_sda':
          boardPin = 'D21';
          used.add('D21');
          break;
        case 'i2c_scl':
          boardPin = 'D22';
          used.add('D22');
          break;
        case 'analog_out':
          boardPin = take(ADC_PINS);
          break;
        case 'int':
          boardPin = take([...INPUT_PINS, ...SAFE_IO]);
          break;
        case 'passive':
          boardPin = undefined;
          break;
        default:
          boardPin = take(SAFE_IO);
      }
      if (!boardPin) {
        if (pp.role !== 'passive') notes.push(t('No free pin left for {part} {pin}.', { part: inst.label ?? def.name, pin: pp.name }));
        continue;
      }
      wires.push({
        id: `a${Date.now().toString(36)}${n++}`,
        from: { part: 'board', pin: boardPin },
        to: { part: inst.id, pin: pp.name },
        color: ROLE_HEX[partRoleColor(pp.role)],
      });
      notes.push(`${inst.label ?? def.name} ${pp.name} → ${boardPin}`);
    }
  }
  return { scene: { ...scene, wires }, notes };
}
