// Lessons are data: every text needs an Italian translation, ids are unique, and every widget exists.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LESSONS, TRACKS, lessonTexts } from '@shared/lessons';
import { IT } from '@shared/i18n';

describe('lessons', () => {
  it('has unique ids and belongs to known tracks', () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    const tracks = new Set(TRACKS.map((t) => t.id));
    expect(LESSONS.every((l) => tracks.has(l.track))).toBe(true);
    expect(TRACKS.every((t) => LESSONS.some((l) => l.track === t.id))).toBe(true);
  });

  it('has an Italian translation for every lesson text', () => {
    const texts = [...LESSONS.flatMap(lessonTexts), ...TRACKS.flatMap((t) => [t.label, t.hint])];
    expect(texts.filter((s) => !(s in IT))).toEqual([]);
  });

  it('uses only widgets that the Learn screen renders', () => {
    const src = readFileSync('app/renderer/screens/LearnWidgets.tsx', 'utf8');
    const registry = src.slice(src.indexOf('const WIDGETS'));
    for (const l of LESSONS)
      for (const b of l.blocks) if (b.kind === 'widget') expect(registry, `${l.id}: widget ${b.id}`).toMatch(new RegExp(`'?${b.id}'?:`));
  });

  it('keeps tables rectangular', () => {
    for (const l of LESSONS)
      for (const b of l.blocks) if (b.kind === 'table') for (const r of b.rows) expect(r.length, `${l.id}: ${r[0]}`).toBe(b.head.length);
  });

  it('asks interview questions in every lesson', () => {
    expect(LESSONS.filter((l) => l.interview.length === 0).map((l) => l.id)).toEqual([]);
  });
});
