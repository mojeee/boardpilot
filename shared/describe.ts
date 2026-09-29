// "Describe it" without the AI: the words of a project description matched against the parts
// library keywords and the templates. Everything it returns is a suggestion the user confirms
// (the assistant does the same job better when it is on, see app/main/ai/assistant.ts).

import type { PartDef } from './types';
import type { TemplateDef } from './templates';

export interface DescribeMatch {
  partId: string;
  /** the words of the description that matched */
  matched: string;
}

/** When several parts share a word ("relay", "oled"), the one a beginner most likely means. */
const PREFERRED = [
  'led-resistor',
  'push-button',
  'potentiometer',
  'ssd1306-i2c',
  'bme280-gy',
  'dht22',
  'hc-sr04',
  'hc-sr501',
  'relay-1ch',
  'buzzer-active',
  'servo-sg90',
  'soil-moisture-capacitive',
  'water-pump-5v',
  'ldr-module',
  'mpu6050',
  'lcd1602-i2c',
  'ws2812-ring',
];

/** Words too general to name a part on their own ("a sensor", "a weather station"). */
const STOP = new Set(['sensor', 'sensore', 'module', 'modulo', 'board', 'scheda', 'station', 'weather station', 'meteo', 'stazione meteo', 'pointer', 'kit', 'breakout', 'switch', 'input', 'output', 'digital', 'analog']);

const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.+-]+/g, ' ')
    .trim()} `;

/**
 * Parts named in a description: a keyword phrase found as whole words scores 3, the distinctive
 * first word of a longer keyword ("soil" for "soil moisture") scores 1. One part per matched word.
 */
export function partsFromDescription(text: string, parts: Record<string, PartDef>): DescribeMatch[] {
  const hay = norm(text);
  const byWord = new Map<string, { id: string; score: number; rank: number }>();
  for (const p of Object.values(parts)) {
    const kws = [...(p.keywords ?? []), p.name.split(/[ (]/)[0]];
    kws.forEach((kw, i) => {
      const k = norm(kw).trim();
      if (k.length < 3) return;
      let score = 0;
      let word = k;
      if (hay.includes(` ${k} `)) score = 3;
      else {
        const first = k.split(' ')[0];
        if (k.includes(' ') && first.length >= 4 && hay.includes(` ${first} `)) {
          score = 1;
          word = first;
        }
      }
      if (!score || STOP.has(word)) return;
      const pref = PREFERRED.indexOf(p.id);
      const rank = (pref < 0 ? 100 : pref) + i * 0.5;
      const cur = byWord.get(word);
      if (!cur || score > cur.score || (score === cur.score && rank < cur.rank)) byWord.set(word, { id: p.id, score, rank });
    });
  }
  // Longer phrases win over their own words ("soil moisture" over "moisture").
  const words = [...byWord.keys()].sort((a, b) => b.length - a.length);
  const out: DescribeMatch[] = [];
  const taken = new Set<string>();
  for (const w of words) {
    const hit = byWord.get(w)!;
    if (taken.has(hit.id) || out.some((o) => o.matched.includes(w))) continue;
    taken.add(hit.id);
    out.push({ partId: hit.id, matched: w });
  }
  return out;
}

/** The template closest to a description: the most of its parts named, or its name in the text. */
export function templateFromDescription(text: string, templates: TemplateDef[], parts: Record<string, PartDef>): TemplateDef | null {
  const hay = norm(text);
  const named = new Set(partsFromDescription(text, parts).map((m) => m.partId));
  let best: { tpl: TemplateDef; score: number } | null = null;
  for (const tpl of templates) {
    const nameWords = norm(tpl.name)
      .trim()
      .split(' ')
      .filter((w) => w.length >= 4);
    let score = nameWords.filter((w) => hay.includes(` ${w} `) || hay.includes(` ${w.replace(/ing$/, '')}`)).length * 2;
    score += tpl.parts.filter((p) => named.has(p.partId)).length;
    if (score >= 2 && (!best || score > best.score)) best = { tpl, score };
  }
  return best?.tpl ?? null;
}
