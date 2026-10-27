// "Did we already make something like this?" The project being planned (the words of the
// description and the parts already drawn) compared with every project in the archive. The score
// is a weighted overlap; each match lists only the facts that really overlap, so the assistant and
// the UI can say why without inventing anything.

import type { PartDef, Scene } from '../types';
import { BOARDS } from '../board';
import { partsFromDescription } from '../describe';
import { addWords, mcuFamily } from './extract';
import type { ArchiveBus, ArchiveEntry, ArchiveProtocol, SimilarMatch, SimilarReason } from './types';

export interface PlanInProgress {
  /** what the user wrote so far (description, chat messages) */
  text: string;
  scene?: Scene;
}

/** Words in a description that name a protocol or bus (English and Italian). */
const PROTOCOL_WORDS: [RegExp, ArchiveProtocol][] = [
  [/\bmodbus\b/i, 'modbus'],
  [/\bopen ?therm\b|\bopentherm\b/i, 'opentherm'],
  [/\bwi-?fi\b|\bwireless\b|\bwlan\b/i, 'wifi'],
  [/\bble\b|\bbluetooth\b/i, 'ble'],
  [/\bmqtt\b/i, 'mqtt'],
  [/\blora(wan)?\b/i, 'lora'],
  [/\bethernet\b|\blan\b/i, 'ethernet'],
  [/\bhttp\b|\bweb ?server\b|\bweb page\b|\bpagina web\b/i, 'http'],
];
const BUS_WORDS: [RegExp, ArchiveBus][] = [
  [/\bi2c\b|\bi²c\b/i, 'i2c'],
  [/\bspi\b/i, 'spi'],
  [/\buart\b|\bserial\b|\bseriale\b/i, 'uart'],
  [/\brs-?485\b/i, 'rs485'],
  [/\bcan ?bus\b|\bcan\b/i, 'can'],
  [/\b1-?wire\b|\bonewire\b/i, 'onewire'],
  [/\bntc\b|\bthermistor\b|\btermistore\b|\banalog\b|\banalogic[oa]\b|\badc\b/i, 'adc'],
];

/** A part family key: the first keyword of a library part (all DS18B20 variants → "ds18b20"). */
const partKey = (partId: string, parts: Record<string, PartDef>) => (parts[partId]?.keywords[0] ?? partId).toLowerCase();

/** Words in the archive often in Italian or English; a few pairs so "termostato" meets "thermostat". */
const SYNONYMS: Record<string, string> = {
  termostato: 'thermostat',
  cronotermostato: 'thermostat',
  caldaia: 'boiler',
  pompa: 'pump',
  ventola: 'fan',
  ventilatore: 'fan',
  rele: 'relay',
  sonda: 'probe',
  temperatura: 'temperature',
  umidita: 'humidity',
  sensore: 'sensor',
  collaudo: 'test',
  qualita: 'quality',
  aria: 'air',
  calore: 'heat',
  riscaldamento: 'heating',
  valvola: 'valve',
  nodo: 'node',
  stanza: 'room',
  display: 'display',
};
const canon = (w: string) => SYNONYMS[w] ?? w;

export interface SimilarOptions {
  limit?: number;
  /** below this a project is not shown (0..1) */
  threshold?: number;
}

/** The archive projects most like the plan, best first, each with the reasons. */
export function similarProjects(plan: PlanInProgress, archive: ArchiveEntry[], parts: Record<string, PartDef>, opts: SimilarOptions = {}): SimilarMatch[] {
  const limit = opts.limit ?? 3;
  const threshold = opts.threshold ?? 0.18;

  const planParts = new Set<string>();
  for (const p of plan.scene?.parts ?? []) planParts.add(partKey(p.partId, parts));
  for (const m of partsFromDescription(plan.text, parts)) planParts.add(partKey(m.partId, parts));
  const planProtocols = new Set(PROTOCOL_WORDS.filter(([re]) => re.test(plan.text)).map(([, p]) => p));
  const planBuses = new Set(BUS_WORDS.filter(([re]) => re.test(plan.text)).map(([, b]) => b));
  for (const p of plan.scene?.parts ?? []) {
    const bus = parts[p.partId]?.bus;
    if (bus === 'i2c' || bus === 'spi' || bus === 'onewire') planBuses.add(bus);
    if (bus === 'analog') planBuses.add('adc');
  }
  const board = plan.scene ? BOARDS[plan.scene.board] : undefined;
  const planFamily = board ? mcuFamily(board.chip) : undefined;
  const words = new Set<string>();
  addWords(words, plan.text);
  const planWords = new Set([...words].map(canon));

  // inverse document frequency: a word in every project says little
  const df = new Map<string, number>();
  const projWords = archive.map((p) => new Set([...p.keywords, ...wordsOf(p.notes), ...p.tags.flatMap(wordsOf), ...wordsOf(p.summary?.value ?? '')].map(canon)));
  for (const ws of projWords) for (const w of ws) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log(1 + archive.length / (1 + (df.get(w) ?? 0)));

  const out: SimilarMatch[] = [];
  archive.forEach((p, i) => {
    const reasons: SimilarReason[] = [];
    let score = 0;
    let max = 0;

    // parts: the strongest signal
    const theirs = new Map<string, string>();
    for (const f of p.parts) theirs.set(f.value.partId ? partKey(f.value.partId, parts) : f.value.name.toLowerCase(), f.value.name);
    if (planParts.size) {
      max += 3;
      const shared = [...planParts].filter((k) => theirs.has(k));
      score += (3 * shared.length) / Math.max(planParts.size, 1);
      for (const k of shared) reasons.push({ kind: 'part', value: theirs.get(k)! });
    }
    // protocols and buses
    const pp = new Set(p.protocols.map((f) => f.value));
    if (planProtocols.size) {
      max += 2;
      const shared = [...planProtocols].filter((x) => pp.has(x));
      score += (2 * shared.length) / planProtocols.size;
      for (const x of shared) reasons.push({ kind: 'protocol', value: x });
    }
    const pb = new Set(p.buses.map((f) => f.value));
    if (planBuses.size) {
      max += 1;
      const shared = [...planBuses].filter((x) => pb.has(x));
      score += shared.length / planBuses.size;
      for (const x of shared) reasons.push({ kind: 'bus', value: x });
    }
    // board: same board, else same chip family
    if (planFamily && p.board) {
      max += 1;
      if (p.board.value.boardId && p.board.value.boardId === board?.id) {
        score += 1;
        reasons.push({ kind: 'board', value: board.name });
      } else if (mcuFamily(p.board.value.mcu) === planFamily) {
        score += 0.6;
        reasons.push({ kind: 'mcu', value: p.board.value.mcu });
      }
    }
    // words, weighted by how rare they are in the archive
    if (planWords.size) {
      max += 2;
      const shared = [...planWords].filter((w) => projWords[i].has(w));
      const total = [...planWords].reduce((s, w) => s + idf(w), 0);
      const got = shared.reduce((s, w) => s + idf(w), 0);
      score += total ? (2 * got) / total : 0;
      const top = shared.sort((a, b) => idf(b) - idf(a)).slice(0, 3);
      if (top.length) reasons.push({ kind: 'words', value: top.join(', ') });
    }
    const norm = max ? score / max : 0;
    if (norm >= threshold && reasons.some((r) => r.kind !== 'words' || norm >= threshold * 1.5)) out.push({ id: p.id, name: p.name, score: Math.round(norm * 100) / 100, reasons });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

function wordsOf(text: string): string[] {
  const s = new Set<string>();
  addWords(s, text);
  return [...s];
}

/** A plain-English line for a match (assistant tool output; the UI translates the parts itself). */
export function reasonsText(m: SimilarMatch): string {
  return m.reasons
    .map((r) => (r.kind === 'part' ? r.value : r.kind === 'words' ? `words: ${r.value}` : r.kind === 'mcu' ? `same chip family (${r.value})` : r.value))
    .join('; ');
}
