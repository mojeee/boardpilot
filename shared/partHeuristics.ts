// Offline fallback for "add a part from a link": guesses a draft part from page text with simple
// rules. Everything it produces is a suggestion the user checks in the part editor.

import type { PartDef, PartPinRole } from './types';
import { t } from './i18n';

const PIN_WORDS: [RegExp, string, PartPinRole][] = [
  [/\bVIN\b/, 'VIN', 'power'],
  [/\bVCC\b/, 'VCC', 'power'],
  [/\bVDD\b/, 'VDD', 'power'],
  [/\b3V3\b|\b3\.3V\b/, 'VCC', 'power'],
  [/\bGND\b/, 'GND', 'ground'],
  [/\bSDA\b/, 'SDA', 'i2c_sda'],
  [/\bSCL\b/, 'SCL', 'i2c_scl'],
  [/\bMOSI\b|\bSDI\b|\bDIN\b/, 'MOSI', 'spi_mosi'],
  [/\bMISO\b|\bSDO\b/, 'MISO', 'spi_miso'],
  [/\bSCK\b|\bSCLK\b|\bCLK\b/, 'SCK', 'spi_sck'],
  [/\bCS\b|\bSS\b|\bNSS\b/, 'CS', 'spi_cs'],
  [/\bINT\b|\bIRQ\b/, 'INT', 'int'],
  [/\bAOUT\b|\bA0\b|\bANALOG OUT/i, 'AOUT', 'analog_out'],
  [/\bDOUT\b|\bD0\b|\bOUT\b/, 'OUT', 'digital_out'],
  [/\bDATA\b/, 'DATA', 'onewire'],
];

export function guessPartFromText(title: string, text: string, url: string): { draft: Partial<PartDef>; notes: string[] } {
  const notes: string[] = [];
  const hay = `${title}\n${text}`.slice(0, 60000);
  const name = title.split(/\s[|–—-]\s|\|/)[0].trim().slice(0, 60) || 'New part';
  const pins: { name: string; role: PartPinRole }[] = [];
  for (const [re, pname, role] of PIN_WORDS) {
    if (re.test(hay) && !pins.some((p) => p.name === pname || (role === 'power' && p.role === 'power'))) pins.push({ name: pname, role });
  }
  if (!pins.some((p) => p.role === 'power')) pins.unshift({ name: 'VCC', role: 'power' });
  if (!pins.some((p) => p.role === 'ground')) pins.splice(1, 0, { name: 'GND', role: 'ground' });
  const hasI2c = /\bI2C\b|\bI²C\b|\bIIC\b|\bTWI\b/i.test(hay) || pins.some((p) => p.role === 'i2c_sda');
  const hasSpi = /\bSPI\b/.test(hay) && pins.some((p) => p.role.startsWith('spi'));
  let bus: PartDef['bus'] = hasI2c ? 'i2c' : hasSpi ? 'spi' : pins.some((p) => p.role === 'analog_out') ? 'analog' : 'gpio';
  if (bus === 'i2c') {
    if (!pins.some((p) => p.role === 'i2c_sda')) pins.push({ name: 'SDA', role: 'i2c_sda' });
    if (!pins.some((p) => p.role === 'i2c_scl')) pins.push({ name: 'SCL', role: 'i2c_scl' });
    for (const p of pins) if (p.role.startsWith('spi')) p.role = 'passive';
    if (hasSpi) notes.push(t('The page mentions both I2C and SPI. I chose I2C; change it if you wire it as SPI.'));
  } else if (!hasSpi) {
    for (const p of pins) if (p.role.startsWith('spi')) p.role = 'passive';
  }
  const addresses = [...new Set((hay.match(/\b0x[0-7][0-9A-Fa-f]\b/g) ?? []).map((a) => '0x' + a.slice(2).toUpperCase()))]
    .filter((a) => parseInt(a, 16) >= 0x08 && parseInt(a, 16) <= 0x77)
    .slice(0, 4);
  if (bus === 'i2c' && addresses.length) {
    notes.push(t('Possible I2C addresses found in the text: {list}. Check them in the datasheet.', { list: addresses.join(', ') }));
  }
  const v5 = /\b5\s?V\b/.test(hay);
  const v33 = /\b3\.3\s?V\b|\b3V3\b/.test(hay);
  const voltage = v33 && v5 ? '3.3-5' : v5 ? '5' : '3.3';
  const lower = hay.toLowerCase();
  const category: PartDef['category'] = /display|oled|lcd|screen/.test(lower)
    ? 'display'
    : /sensor|measure|temperature|humidity|pressure|distance|accelero/.test(lower)
      ? 'sensor'
      : /button|switch|joystick|keypad|encoder/.test(lower)
        ? 'input'
        : 'output';
  const shape = category === 'display' ? 'oled' : /relay/.test(lower) ? 'relay' : /motor|servo/.test(lower) ? 'motor' : 'breakout';
  if (bus === 'gpio' && pins.length <= 2) bus = undefined;
  notes.push(t('Made without the AI assistant, from keywords on the page. Check every pin and its role before saving.'));
  return {
    draft: {
      name,
      category,
      bus,
      voltage,
      addresses: bus === 'i2c' ? addresses : undefined,
      pins,
      model: { shape, size: [Math.max(12, Math.ceil(pins.length * 2.54 + 4)), 16, 1.6], color: '#2E6FD8' },
      keywords: name.toLowerCase().split(/\s+/).filter((w) => w.length > 2).slice(0, 6),
      sources: [{ title: title || url, section: url }],
      origin: { url, importedAt: new Date().toISOString(), method: 'manual' },
    },
    notes,
  };
}

/* ---------- richer "add from a link": library match and dimensions ---------- */

/** Chip or module names inside a part's name/keywords, e.g. "bme280", "hc-sr04", "vl53l0x". */
function chipTokens(def: PartDef): string[] {
  const words = [def.name, ...def.keywords].join(' ').toLowerCase().split(/[\s,()/]+/);
  return [...new Set(words.filter((w) => w.length >= 4 && /[a-z]/.test(w) && /\d/.test(w)))];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Find the built-in part a product page is about, by the chip names it mentions.
 * A mention in the page title counts much more than one in the body text.
 */
export function findLibraryMatch(title: string, text: string, parts: PartDef[]): { part: PartDef; token: string } | null {
  const t = title.toLowerCase();
  const body = text.toLowerCase().slice(0, 60000);
  let best: { part: PartDef; token: string; score: number } | null = null;
  for (const p of parts) {
    for (const tok of chipTokens(p)) {
      const re = new RegExp(`(^|[^a-z0-9])${esc(tok)}([^a-z0-9]|$)`, 'g');
      const inTitle = re.test(t) ? 1 : 0;
      const inBody = Math.min(5, (body.match(re) ?? []).length);
      const score = inTitle * 6 + inBody;
      if (score >= 3 && (!best || score > best.score || (score === best.score && tok.length > best.token.length))) {
        best = { part: p, token: tok, score };
      }
    }
  }
  return best ? { part: best.part, token: best.token } : null;
}

/** Board size from text like "Size: 45 x 20 x 15 mm" or "25mm × 15mm". Returns [w, d, h?] in mm. */
export function extractDimensionsMm(text: string): number[] | null {
  const n = '(\\d{1,3}(?:[.,]\\d+)?)';
  const re = new RegExp(`${n}\\s*(?:mm)?\\s*[x×*]\\s*${n}\\s*(?:mm)?(?:\\s*[x×*]\\s*${n})?\\s*mm`, 'i');
  const m = re.exec(text);
  if (!m) return null;
  const vals = [m[1], m[2], m[3]].filter(Boolean).map((v) => Number(v.replace(',', '.')));
  if (vals.some((v) => !Number.isFinite(v) || v < 2 || v > 150)) return null;
  return vals;
}
