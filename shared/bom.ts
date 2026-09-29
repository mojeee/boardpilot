// Bill of materials: what to buy for the project in the scene. The parts come from the scene; the
// extras (pull-ups, dividers, level shifters, cable) come from the same rules as the wiring
// checker, and each extra says why it is on the list.

import type { BoardDef, PartDef, PartPinRole, Scene } from './types';
import { pinById } from './board';
import { t } from './i18n';

export interface BomRow {
  kind: 'board' | 'part' | 'extra' | 'wiring';
  item: string;
  qty: number;
  /** voltage, bus, address… */
  detail: string;
  /** why an extra is needed (empty for the parts you placed) */
  why: string;
}

/** Roles where only the part drives the line: a resistor divider is enough to bring 5 V down. */
const ONE_WAY_FROM_PART: PartPinRole[] = ['digital_out', 'analog_out', 'int', 'spi_miso'];

function partMin(v: string) {
  const n = v.split('-').map(Number).filter(Number.isFinite);
  return n.length ? Math.min(...n) : 3.3;
}
function partMax(v: string) {
  const n = v.split('-').map(Number).filter(Number.isFinite);
  return n.length ? Math.max(...n) : 3.3;
}

export function billOfMaterials(scene: Scene, board: BoardDef, parts: Record<string, PartDef>): BomRow[] {
  const rows: BomRow[] = [];
  rows.push({ kind: 'board', item: board.name, qty: 1, detail: `${board.chip} · ${board.logicVolt} V logic`, why: '' });
  const usb = board.components.find((c) => c.type === 'usb')?.label ?? '';
  const cable = /USB-C/i.test(usb) ? 'USB-C' : /mini/i.test(usb) ? 'mini-USB' : /USB-B|type-b/i.test(usb) ? 'USB-B' : /micro/i.test(usb) ? 'micro-USB' : 'USB';
  rows.push({ kind: 'board', item: t('{type} cable (data, not charge-only)', { type: cable }), qty: 1, detail: '', why: t('Charge-only cables have no data wires: the board is not found.') });

  // Parts, grouped by model.
  const counts = new Map<string, number>();
  for (const sp of scene.parts) counts.set(sp.partId, (counts.get(sp.partId) ?? 0) + 1);
  for (const [partId, qty] of counts) {
    const def = parts[partId];
    const detail = def ? [`${def.voltage} V`, def.bus?.toUpperCase(), def.addresses?.[0]].filter(Boolean).join(' · ') : '';
    rows.push({ kind: 'part', item: def?.name ?? partId, qty, detail, why: '' });
  }

  // Wires to the board: which part pin, which role, which board pin.
  const conns = scene.wires.flatMap((w) => {
    const be = w.from.part === 'board' ? w.from : w.to.part === 'board' ? w.to : null;
    const pe = w.from.part === 'board' ? w.to : w.from;
    const sp = scene.parts.find((p) => p.id === pe.part);
    const def = sp ? parts[sp.partId] : undefined;
    const pin = def?.pins.find((p) => p.name === pe.pin);
    return be && def && pin ? [{ sp, def, pin, boardPin: pinById(board, be.pin) }] : [];
  });

  // I2C pull-ups: needed once per bus when no part brings its own.
  const i2c = scene.parts.map((p) => parts[p.partId]).filter((d) => d?.bus === 'i2c');
  if (i2c.length && !i2c.some((d) => d?.pullupsOnBoard)) {
    rows.push({ kind: 'extra', item: t('4.7 kΩ resistor'), qty: 2, detail: 'SDA, SCL', why: t('No I2C part here has pull-up resistors on board; the bus needs one on SDA and one on SCL.') });
  }

  // 1-Wire pull-ups the part notes ask for (and that are not already on the module).
  for (const c of conns) {
    if (c.pin.role !== 'onewire') continue;
    const note = c.pin.notes ?? '';
    const m = /(\d+(?:\.\d+)?)\s*(?:to [\d.]+\s*)?kΩ pull-up/i.exec(note);
    if (!m || /included|already|on the module/i.test(note)) continue;
    rows.push({ kind: 'extra', item: t('{v} kΩ resistor', { v: m[1] }), qty: 1, detail: `${c.sp?.label ?? c.def.name} ${c.pin.name}`, why: t('{part}: {note}', { part: c.def.name, note: t(note) }) });
  }

  // Signal levels between 5 V and 3.3 V (same test as the wiring checker).
  let shifterLines = 0;
  const dividers: string[] = [];
  for (const c of conns) {
    if (!c.boardPin || c.pin.role === 'power' || c.pin.role === 'ground' || c.pin.role === 'passive') continue;
    const fiveVBoard = board.logicVolt >= 5 && partMax(c.def.voltage) < 4.5;
    const fiveVPart =
      board.logicVolt < 4 &&
      partMin(c.def.voltage) >= 4.5 &&
      c.boardPin.maxVolt < 5 &&
      !c.boardPin.flags.includes('five_volt_tolerant') &&
      ['digital_out', 'analog_out', 'int', 'spi_miso', 'onewire', 'i2c_sda', 'i2c_scl'].includes(c.pin.role);
    if (!fiveVBoard && !fiveVPart) continue;
    if (fiveVPart && ONE_WAY_FROM_PART.includes(c.pin.role)) dividers.push(`${c.def.name.split(/[ (]/)[0]} ${c.pin.name} → ${c.boardPin.label}`);
    else shifterLines++;
  }
  if (dividers.length) {
    rows.push({
      kind: 'extra',
      item: t('1 kΩ + 2 kΩ resistors (voltage divider)'),
      qty: dividers.length,
      detail: dividers.join(', '),
      why: t('These 5 V outputs go into 3.3 V pins; a divider brings 5 V down to about 3.3 V.'),
    });
  }
  if (shifterLines) {
    rows.push({
      kind: 'extra',
      item: t('Bidirectional logic level shifter, 4 channels'),
      qty: Math.ceil(shifterLines / 4),
      detail: t('{n} signal lines', { n: shifterLines }),
      why: board.logicVolt >= 5 ? t('3.3 V parts on a 5 V board: their signal pins must not get 5 V.') : t('5 V parts on a 3.3 V board, on lines that go both ways.'),
    });
  }

  if (scene.wires.length) {
    rows.push({ kind: 'wiring', item: t('Jumper wires (Dupont)'), qty: scene.wires.length, detail: t('one per wire in the drawing'), why: '' });
    rows.push({ kind: 'wiring', item: t('Breadboard'), qty: 1, detail: t('half size is enough'), why: '' });
  }
  return rows;
}

const csvCell = (s: string | number) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

export function bomToCsv(rows: BomRow[]): string {
  const head = [t('Item'), t('Quantity'), t('Details'), t('Why')];
  return [head, ...rows.map((r) => [r.item, r.qty, r.detail, r.why])].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

export function bomToMarkdown(rows: BomRow[]): string {
  const cell = (s: string | number) => String(s).replace(/\|/g, '\\|');
  return [`| ${t('Item')} | ${t('Quantity')} | ${t('Details')} | ${t('Why')} |`, '|---|---|---|---|', ...rows.map((r) => `| ${cell(r.item)} | ${r.qty} | ${cell(r.detail)} | ${cell(r.why)} |`)].join('\n');
}
