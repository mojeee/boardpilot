// Automatic pin assignment for New project. Avoids flash pins, input-only pins for outputs,
// strapping pins and the USB serial pins; shares one I2C bus on the default pins.

import type { BoardDef, PartDef, Scene, SceneWire } from './types';
import { ROLE_HEX, groundPins, partRoleColor, powerPinFor } from './board';
import { t } from './i18n';

export interface Assignment {
  scene: Scene;
  notes: string[];
}

export function assignPins(scene: Scene, board: BoardDef, parts: Record<string, PartDef>): Assignment {
  // Pin preferences come from the board file: output-capable pins with no side effects first,
  // ADC pins that keep working with Wi-Fi first, input-only pins for plain inputs.
  const SAFE_IO = board.rules.safeIo;
  const ADC_PINS = board.rules.adcPins;
  const INPUT_PINS = board.rules.inputPins ?? [];
  const grounds = groundPins(board).map((p) => p.id);
  const used = new Set<string>();
  const notes: string[] = [];
  for (const w of scene.wires) {
    if (w.from.part === 'board') used.add(w.from.pin);
    if (w.to.part === 'board') used.add(w.to.pin);
  }
  // Keep the I2C bus pins free for I2C parts.
  if (scene.parts.some((p) => parts[p.partId]?.bus === 'i2c')) {
    used.add(board.rules.i2c.sda);
    used.add(board.rules.i2c.scl);
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
          boardPin = powerPinFor(board, def.voltage)?.id;
          break;
        case 'ground':
          boardPin = grounds.length ? grounds[gndToggle++ % grounds.length] : undefined;
          break;
        case 'i2c_sda':
          boardPin = board.rules.i2c.sda;
          used.add(boardPin);
          break;
        case 'i2c_scl':
          boardPin = board.rules.i2c.scl;
          used.add(boardPin);
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
