// Validates board definition files (boards/*.json). Used by tests and by hand:
//   node scripts/check-boards.mjs              all boards
//   node scripts/check-boards.mjs boards/x.json one board
// Prints every problem and exits 1 if there is any.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FLAGS = new Set([
  'input_only', 'flash', 'strapping', 'strapping_critical', 'adc1', 'adc2', 'adc', 'uart0', 'touch', 'dac',
  'onboard_led', 'no_internal_pull', 'five_volt_tolerant', 'reserved', 'usb', 'swd',
]);
const KINDS = new Set(['gpio', 'power', 'ground', 'enable']);
const MOUNTS = new Set(['male-down', 'female-up', 'male-up', 'pad']);
const COMPONENTS = new Set(['module', 'mcu', 'chip', 'usb', 'jack', 'button', 'led', 'regulator', 'bridge', 'crystal', 'antenna', 'connector', 'switch']);
const FAMILIES = new Set(['esp32', 'esp32s3', 'esp32c3', 'rp2040', 'rp2350', 'avr', 'stm32', 'nrf52', 'imxrt']);
const FLASHERS = new Set(['esptool', 'picotool', 'avrdude', 'stm32', 'nrfjprog', 'teensy']);
const LINKS = new Set(['usb-serial', 'usb-bootloader', 'debug-probe']);

/** Same maths as pinPositionMm in shared/board.ts, but in PCB-corner coordinates. */
export function pinCornerMm(board, p) {
  if (p.posMm) return p.posMm;
  const h = board.header;
  if (!h || p.row === undefined || p.index === undefined) return null;
  const x = h.firstPinOffsetMm - p.index * h.pitchMm;
  const z = board.pcbMm.width / 2 + (p.row === 'front' ? 1 : -1) * (h.rowSpacingMm / 2);
  return [x, z];
}

export function checkBoard(b) {
  const errs = [];
  const e = (m) => errs.push(m);
  for (const k of ['id', 'name', 'vendor', 'family', 'module', 'chip', 'cpu', 'summary']) if (typeof b[k] !== 'string' || !b[k]) e(`missing ${k}`);
  if (!FAMILIES.has(b.family)) e(`bad family ${b.family}`);
  if (!(b.logicVolt === 3.3 || b.logicVolt === 5)) e(`logicVolt must be 3.3 or 5`);
  const { length, width, thickness } = b.pcbMm ?? {};
  if (!(length > 10 && width > 10 && thickness > 0.5)) e('bad pcbMm');
  if (!(b.layoutPxPerMm > 0)) e('bad layoutPxPerMm');
  if (b.clocks !== undefined) {
    const c = b.clocks;
    for (const k of ['cpuHz', 'pwmHz', 'uartHz', 'adcHz']) if ((k === 'cpuHz' || c[k] !== undefined) && !(Number.isInteger(c[k]) && c[k] > 0)) e(`clocks.${k} must be a whole number of Hz`);
    if (!c.source?.title || !c.note) e('clocks needs a note and a source title');
  }
  if (b.power !== undefined) {
    const pw = b.power;
    if (!(typeof pw.typMa === 'number' && pw.typMa >= 0)) e('power.typMa must be a number of mA');
    for (const k of ['sleepMa', 'peakMa']) if (pw[k] !== undefined && !(typeof pw[k] === 'number' && pw[k] >= 0)) e(`power.${k} must be a number of mA`);
    if (!pw.source?.title || !pw.note) e('power needs a note and a source title');
  }
  if (b.cornerRadiusMm !== undefined && !(b.cornerRadiusMm >= 0 && b.cornerRadiusMm < Math.min(length, width) / 4)) e('bad cornerRadiusMm');
  for (const h of b.holesMm ?? []) {
    const [hx, hy, d] = Array.isArray(h) ? h : [];
    if (!(d > 0.5 && d < 5)) e(`hole ${JSON.stringify(h)}: bad diameter`);
    else if (!(hx - d / 2 > 0 && hy - d / 2 > 0 && hx + d / 2 < length && hy + d / 2 < width)) e(`hole ${JSON.stringify(h)}: outside the PCB`);
  }
  if (!MOUNTS.has(b.headerStyle)) e(`bad headerStyle ${b.headerStyle}`);
  if (!Array.isArray(b.pins) || b.pins.length < 8) e('too few pins');
  const ids = new Set();
  const gpios = new Map();
  const pos = [];
  for (const p of b.pins ?? []) {
    const where = `pin ${p.id}`;
    if (!p.id || ids.has(p.id)) e(`${where}: missing or duplicate id`);
    ids.add(p.id);
    if (!KINDS.has(p.kind)) e(`${where}: bad kind ${p.kind}`);
    if (typeof p.label !== 'string' || !p.label) e(`${where}: missing label`);
    if (!Array.isArray(p.functions)) e(`${where}: functions must be an array`);
    if (!Array.isArray(p.flags)) e(`${where}: flags must be an array`);
    for (const f of p.flags ?? []) if (!FLAGS.has(f)) e(`${where}: unknown flag ${f}`);
    if (p.mount && !MOUNTS.has(p.mount)) e(`${where}: bad mount`);
    if (typeof p.maxVolt !== 'number') e(`${where}: maxVolt must be a number`);
    if (p.kind === 'gpio') {
      if (!Number.isInteger(p.gpio)) e(`${where}: gpio pins need an integer gpio`);
      else if (!p.sameAs) {
        if (gpios.has(p.gpio)) e(`${where}: gpio ${p.gpio} also used by ${gpios.get(p.gpio)} (set sameAs if it is the same signal)`);
        gpios.set(p.gpio, p.id);
      }
      if (p.flags?.includes('input_only') && p.flags?.includes('flash')) e(`${where}: input_only and flash together`);
    } else {
      if (p.gpio !== null) e(`${where}: non-gpio pins must have gpio null`);
    }
    if (p.kind === 'power' && typeof p.supplies !== 'number') e(`${where}: power pins need supplies (volts)`);
    if (p.kind === 'ground' && p.maxVolt !== 0) e(`${where}: ground maxVolt must be 0`);
    const c = pinCornerMm(b, p);
    if (!c) e(`${where}: needs posMm (or row/index with board.header)`);
    else {
      const [x, z] = c;
      if (x < -0.5 || x > length + 0.5 || z < -0.5 || z > width + 0.5) e(`${where}: position ${x},${z} is outside the PCB`);
      pos.push({ id: p.id, x, z });
    }
  }
  for (const p of b.pins ?? []) {
    if (p.sameAs) {
      const o = b.pins.find((q) => q.id === p.sameAs);
      if (!o) e(`pin ${p.id}: sameAs ${p.sameAs} does not exist`);
      else if (o.gpio !== p.gpio) e(`pin ${p.id}: sameAs ${p.sameAs} but gpio differs`);
    }
  }
  for (let i = 0; i < pos.length; i++)
    for (let j = i + 1; j < pos.length; j++) {
      const d = Math.hypot(pos[i].x - pos[j].x, pos[i].z - pos[j].z);
      if (d < 2.0) e(`pins ${pos[i].id} and ${pos[j].id} are only ${d.toFixed(2)} mm apart`);
    }
  const pin = (id) => b.pins?.find((p) => p.id === id);
  const r = b.rules ?? {};
  if (typeof r.datasheet !== 'string') e('rules.datasheet missing');
  if (!r.i2c || !pin(r.i2c.sda) || !pin(r.i2c.scl)) e('rules.i2c sda/scl must be pin ids');
  if (r.i2c && pin(r.i2c.sda) && !pin(r.i2c.sda).functions.includes('I2C_SDA_default')) e(`rules.i2c.sda pin should have function I2C_SDA_default`);
  if (r.i2c && pin(r.i2c.scl) && !pin(r.i2c.scl).functions.includes('I2C_SCL_default')) e(`rules.i2c.scl pin should have function I2C_SCL_default`);
  if (r.spi) for (const k of ['mosi', 'miso', 'sck', 'cs']) if (!pin(r.spi[k])) e(`rules.spi.${k} is not a pin`);
  if (!Array.isArray(r.safeIo) || r.safeIo.length < 4) e('rules.safeIo needs at least 4 pins');
  for (const id of r.safeIo ?? []) {
    const p = pin(id);
    if (!p) e(`rules.safeIo: ${id} is not a pin`);
    else if (p.kind !== 'gpio' || p.flags.some((f) => ['input_only', 'flash', 'strapping_critical', 'usb', 'swd'].includes(f))) e(`rules.safeIo: ${id} cannot be a safe output`);
  }
  if (!Array.isArray(r.adcPins)) e('rules.adcPins missing');
  for (const id of r.adcPins ?? []) {
    const p = pin(id);
    if (!p) e(`rules.adcPins: ${id} is not a pin`);
    else if (!p.flags.some((f) => f === 'adc' || f === 'adc1' || f === 'adc2')) e(`rules.adcPins: ${id} has no adc flag`);
  }
  for (const id of r.inputPins ?? []) if (!pin(id)) e(`rules.inputPins: ${id} is not a pin`);
  if (!(r.adcMaxMv === 3300 || r.adcMaxMv === 5000 || r.adcMaxMv === 3000 || r.adcMaxMv === 3600)) e('rules.adcMaxMv must be 3000, 3300, 3600 or 5000');
  if (!b.pins?.some((p) => p.kind === 'ground')) e('no ground pin');
  if (!b.pins?.some((p) => p.kind === 'power')) e('no power pin');
  const tc = b.toolchain ?? {};
  if (!FLASHERS.has(tc.flasher)) e(`toolchain.flasher ${tc.flasher} unknown`);
  if (!LINKS.has(tc.link)) e(`toolchain.link ${tc.link} unknown`);
  if (typeof tc.fqbn !== 'string' || tc.fqbn.split(':').length < 3) e('toolchain.fqbn must look like vendor:arch:board');
  if (typeof tc.core !== 'string' || tc.core.split(':').length !== 2) e('toolchain.core must look like vendor:arch');
  if (!['bin', 'uf2', 'hex'].includes(tc.imageFormat)) e('toolchain.imageFormat must be bin, uf2 or hex');
  if (typeof tc.agent !== 'boolean') e('toolchain.agent must be boolean');
  if (tc.flasher === 'esptool' && !tc.esptoolChip) e('esptool boards need toolchain.esptoolChip');
  if (tc.flasher === 'avrdude' && !tc.avrdude) e('avrdude boards need toolchain.avrdude');
  const rp = b.family === 'rp2040' || b.family === 'rp2350';
  if (rp && !/^[a-z0-9_]+$/.test(tc.picoBoard ?? '')) e('RP2040/RP2350 boards need toolchain.picoBoard (the Pico SDK PICO_BOARD name, e.g. "pico")');
  if (!rp && tc.picoBoard !== undefined) e('toolchain.picoBoard is only for RP2040/RP2350 boards');
  if (!Array.isArray(b.usb) || !b.usb.length) e('usb ids missing');
  for (const u of b.usb ?? []) if (!/^[0-9a-f]{4}$/.test(u.vid) || (u.pid !== undefined && !/^[0-9a-f]{4}$/.test(u.pid))) e(`usb id ${u.vid}:${u.pid} must be 4 lower-case hex digits`);
  const s = b.layoutPxPerMm;
  for (const c of b.components ?? []) {
    if (!COMPONENTS.has(c.type)) e(`component type ${c.type} unknown`);
    if (!Array.isArray(c.rect) || c.rect.length !== 4) e(`component ${c.label ?? c.type}: rect must be [x,y,w,h]`);
    else {
      const [x, y, w, h] = c.rect.map((v) => v / s);
      if (w <= 0 || h <= 0) e(`component ${c.label ?? c.type}: empty rect`);
      if (x < -8 || y < -8 || x + w > length + 8 || y + h > width + 8) e(`component ${c.label ?? c.type}: rect far outside the PCB`);
    }
  }
  if (!Array.isArray(b.sources) || !b.sources.length) e('sources missing');
  return errs;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const files = process.argv.slice(2).length
    ? process.argv.slice(2)
    : readdirSync(join(root, 'boards')).filter((f) => f.endsWith('.json')).map((f) => join(root, 'boards', f));
  let bad = 0;
  for (const f of files) {
    const b = JSON.parse(readFileSync(f, 'utf8'));
    const errs = checkBoard(b);
    if (errs.length) {
      bad++;
      console.log(`✗ ${f}`);
      for (const x of errs) console.log(`   ${x}`);
    } else console.log(`✓ ${f} (${b.pins.length} pins)`);
  }
  process.exit(bad ? 1 : 0);
}
