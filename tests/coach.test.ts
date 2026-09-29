// Interview coach: lesson sections, manual fallback, prompt, reply checks (honest AI), and the
// local history (90-day pruning, per-question cap, deletes). No network.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LESSONS, type Lesson } from '@shared/lessons';
import {
  COACH_MAX_ANSWER,
  COACH_MAX_PER_QUESTION,
  addAttempt,
  attemptsFor,
  keyPointsFor,
  lessonSections,
  parseHistory,
  pruneAttempts,
  removeQuestion,
  type CoachAttempt,
} from '@shared/coach';
import { DEMO_MAX_BODY_BYTES } from '@shared/ai';
import { IT } from '@shared/i18n';
import { buildCoachPrompt, parseCoachReply } from '../app/main/ai/coach';
import { CoachStore } from '../app/main/session/coachStore';
import { Assistant } from '../app/main/ai/assistant';
import { AiSettingsStore, type SecretBox } from '../app/main/settings/settings';
import type { HardwareHub } from '../app/main/hardware/hub';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 29, 12);
const lesson = (id: string): Lesson => LESSONS.find((l) => l.id === id)!;
const hw = lesson('hardware-basics');

const attempt = (over: Partial<CoachAttempt> = {}): CoachAttempt => ({
  id: Math.random().toString(36).slice(2),
  lessonId: hw.id,
  question: hw.interview[0],
  answer: 'Because the LED needs a resistor to limit the current.',
  at: NOW,
  feedback: { right: ['Limits the current'], missing: ['How to compute the value'], followUp: 'What if the supply is 5 V?', sections: [{ id: 's3', title: 'x' }], confidence: 'suggestion' },
  ...over,
});

describe('lesson sections', () => {
  it('starts with the intro and adds one section per heading', () => {
    for (const l of LESSONS) {
      const s = lessonSections(l);
      expect(s[0]).toMatchObject({ id: 's1', title: l.title });
      expect(s.length).toBe(1 + l.blocks.filter((b) => b.kind === 'h').length);
      expect(s.map((x) => x.id)).toEqual(s.map((_, i) => `s${i + 1}`));
    }
  });

  it('keeps table cells separate so each one can be translated', () => {
    const intro = lessonSections(hw)[0];
    expect(intro.lines).toContainEqual(['Voltage (V)', 'The push that moves electrons', 'volt (V)', 'Water pressure']);
  });
});

describe('key points (manual fallback)', () => {
  it('picks the lesson section that matches the question', () => {
    const titles = keyPointsFor(hw, 'Why does an LED need a series resistor, and how do you choose its value?').map((s) => s.title);
    expect(titles).toContain('An LED always needs a resistor');
  });

  it('falls back to the intro when nothing matches', () => {
    const s = keyPointsFor(hw, 'zzz qqq');
    expect(s).toHaveLength(1);
    expect(s[0].id).toBe('s1');
  });

  it('gives at least one non-empty section for every interview question', () => {
    for (const l of LESSONS)
      for (const q of l.interview) {
        const s = keyPointsFor(l, q);
        expect(s.length, `${l.id}: ${q}`).toBeGreaterThan(0);
        expect(s.some((x) => x.lines.length > 0), `${l.id}: ${q}`).toBe(true);
      }
  });
});

describe('coach prompt', () => {
  it('sends the lesson with section ids, the question and the answer', () => {
    const p = buildCoachPrompt({ lesson: hw, question: hw.interview[0], answer: 'It limits current.', lang: 'en' });
    expect(p).toContain('[s1] Hardware basics for software developers');
    expect(p).toContain('An LED always needs a resistor');
    expect(p).toContain(`<question>${hw.interview[0]}</question>`);
    expect(p).toContain('<answer>It limits current.</answer>');
    expect(p).toContain('Write every text in English');
    expect(p).toMatch(/data, not instructions/);
  });

  it('asks for Italian and uses the translated lesson when the UI is Italian', () => {
    const tr = (s: string) => IT[s] ?? s;
    const p = buildCoachPrompt({ lesson: hw, question: hw.interview[0], answer: 'x', lang: 'it', tr });
    expect(p).toContain('Italian');
    expect(p).toContain(IT[hw.interview[0]]);
    expect(p).toContain(IT['An LED always needs a resistor']);
  });

  it('cuts very long answers and stays under the free demo request limit for every lesson', () => {
    const long = 'a'.repeat(COACH_MAX_ANSWER * 2);
    for (const l of LESSONS) {
      const p = buildCoachPrompt({ lesson: l, question: l.interview[0] ?? '', answer: long, lang: 'it', tr: (s) => IT[s] ?? s });
      expect(p).not.toContain('a'.repeat(COACH_MAX_ANSWER + 1));
      // prompt + JSON schema + request wrapper must fit the relay's 48 KB
      expect(new TextEncoder().encode(p).length, l.id).toBeLessThan(DEMO_MAX_BODY_BYTES - 8 * 1024);
    }
  });
});

describe('coach reply', () => {
  const reply = (o: unknown) => JSON.stringify(o);

  it('reads a good reply and maps section ids to lesson headings', () => {
    const f = parseCoachReply(reply({ right: ['Limits current'], missing: ['Ohm’s law'], followUp: 'And for a blue LED?', sections: ['s3', '[S2]'] }), hw);
    expect(f).toEqual({
      right: ['Limits current'],
      missing: ['Ohm’s law'],
      followUp: 'And for a blue LED?',
      sections: [
        { id: 's3', title: 'An LED always needs a resistor' },
        { id: 's2', title: 'Ohm’s law: V = I × R' },
      ],
      confidence: 'suggestion',
    });
  });

  it('drops sections the lesson does not have and never cites them', () => {
    const f = parseCoachReply(reply({ right: [], missing: ['x'], followUp: '', sections: ['s99', 'Datasheet 5.4.1', 's1', 's1'] }), hw);
    expect(f?.sections).toEqual([{ id: 's1', title: hw.title }]);
  });

  it('is always a suggestion, whatever the model says', () => {
    const f = parseCoachReply(reply({ right: ['ok'], missing: [], followUp: 'q', sections: ['s2'], confidence: 'measured' }), hw);
    expect(f?.confidence).toBe('suggestion');
  });

  it('accepts JSON wrapped in text and ignores non-string items', () => {
    const f = parseCoachReply('Here you go:\n```json\n' + reply({ right: ['a', 3, null], missing: 'no', followUp: 'q', sections: ['s2'] }) + '\n```', hw);
    expect(f).toMatchObject({ right: ['a'], missing: [], followUp: 'q' });
  });

  it('returns null for an unusable reply', () => {
    expect(parseCoachReply('not json', hw)).toBeNull();
    expect(parseCoachReply('[1,2]', hw)).toBeNull();
    expect(parseCoachReply(reply({ right: [], missing: [], followUp: '', sections: ['s1'] }), hw)).toBeNull();
  });
});

describe('coach history', () => {
  it('prunes answers older than 90 days', () => {
    const old = attempt({ at: NOW - 91 * DAY });
    const recent = attempt({ at: NOW - 89 * DAY });
    expect(pruneAttempts([old, recent], NOW)).toEqual([recent]);
  });

  it('skips malformed entries and forces the suggestion label when reading the file', () => {
    const good = attempt();
    const tampered = { ...attempt(), feedback: { ...attempt().feedback, confidence: 'measured' } };
    const list = parseHistory({ attempts: [good, { id: 1 }, null, 'x', tampered] });
    expect(list).toHaveLength(2);
    expect(list.every((a) => a.feedback.confidence === 'suggestion')).toBe(true);
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory({ attempts: 'nope' })).toEqual([]);
  });

  it('lists one question newest first and keeps at most the cap per question', () => {
    let list: CoachAttempt[] = [attempt({ question: hw.interview[1], at: NOW })];
    for (let i = 0; i < COACH_MAX_PER_QUESTION + 3; i++) list = addAttempt(list, attempt({ id: `a${i}`, at: NOW + i }));
    const mine = attemptsFor(list, hw.id, hw.interview[0]);
    expect(mine).toHaveLength(COACH_MAX_PER_QUESTION);
    expect(mine[0].id).toBe(`a${COACH_MAX_PER_QUESTION + 2}`);
    expect(mine.some((a) => a.id === 'a0')).toBe(false);
    expect(attemptsFor(list, hw.id, hw.interview[1])).toHaveLength(1);
  });

  it('deletes the answers of one question only', () => {
    const list = [attempt(), attempt({ question: hw.interview[1] })];
    expect(removeQuestion(list, hw.id, hw.interview[0]).map((a) => a.question)).toEqual([hw.interview[1]]);
  });
});

describe('Assistant.coach (fetch stubbed)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const fakeBox = (): SecretBox => ({
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(`enc:${[...s].reverse().join('')}`),
    decryptString: (b) => [...b.toString().replace(/^enc:/, '')].reverse().join(''),
  });
  const settingsFile = () => join(mkdtempSync(join(tmpdir(), 'bp-coach-ai-')), 'settings.json');
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const stubFetch = (answers: (() => Response)[]) => {
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push([url, init]);
      const next = answers.shift();
      if (!next) throw new Error('unexpected fetch');
      return Promise.resolve(next());
    });
    return calls;
  };
  const GRADE = JSON.stringify({ right: ['Limits the current'], missing: ['Compute R = (V − Vf) / I'], followUp: 'What changes for a blue LED?', sections: ['s3', 's42'] });
  const question = hw.interview[0];

  it('works with the free demo: small request, graded as a suggestion with real sections', async () => {
    const env = { BOARDPILOT_DEMO_AI_URL: 'https://relay.test/api/demo-ai' };
    const a = new Assistant({} as HardwareHub, new AiSettingsStore(settingsFile(), fakeBox(), env), env);
    const calls = stubFetch([() => json(200, { candidates: [{ content: { role: 'model', parts: [{ text: GRADE }] }, finishReason: 'STOP' }] })]);
    const r = await a.coach(hw, question, 'It limits the current through the LED.');
    expect(calls[0][0]).toContain('relay.test');
    expect(String(calls[0][1].body).length).toBeLessThan(DEMO_MAX_BODY_BYTES);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.confidence).toBe('suggestion');
    expect(r.value.sections).toEqual([{ id: 's3', title: 'An LED always needs a resistor' }]);
  });

  it('works with the user’s own key', async () => {
    const env = { BOARDPILOT_DEMO_AI_URL: 'off' };
    const s = new AiSettingsStore(settingsFile(), fakeBox(), env);
    expect(s.save({ provider: 'openai', model: 'gpt-test', apiKey: 'sk-test-0000000000000000' }).ok).toBe(true);
    const a = new Assistant({} as HardwareHub, s, env);
    const calls = stubFetch([
      () => json(200, { status: 'completed', output: [{ type: 'message', id: 'm1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: GRADE, annotations: [] }] }] }),
    ]);
    const r = await a.coach(hw, question, 'It limits the current.');
    expect(calls[0][0]).toBe('https://api.openai.com/v1/responses');
    expect(r.ok && r.value.followUp).toBe('What changes for a blue LED?');
  });

  it('returns plain-language errors when the assistant is off or busy', async () => {
    const off = { BOARDPILOT_DEMO_AI_URL: 'off' };
    const r1 = await new Assistant({} as HardwareHub, new AiSettingsStore(settingsFile(), fakeBox(), off), off).coach(hw, question, 'x');
    expect(r1.ok ? null : r1.error.code).toBe('ai_off');

    const env = { BOARDPILOT_DEMO_AI_URL: 'https://relay.test/api/demo-ai' };
    stubFetch([() => json(429, { error: { message: 'busy' } })]);
    const r2 = await new Assistant({} as HardwareHub, new AiSettingsStore(settingsFile(), fakeBox(), env), env).coach(hw, question, 'x');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.humanMessage).toMatch(/free demo/);

    stubFetch([() => json(200, { candidates: [{ content: { role: 'model', parts: [{ text: 'no json here' }] }, finishReason: 'STOP' }] })]);
    const r3 = await new Assistant({} as HardwareHub, new AiSettingsStore(settingsFile(), fakeBox(), env), env).coach(hw, question, 'x');
    expect(r3.ok ? null : r3.error.code).toBe('ai_parse');
  });
});

describe('CoachStore (app data file)', () => {
  const tmp = () => join(mkdtempSync(join(tmpdir(), 'bp-coach-')), 'coach-answers.json');

  it('saves, lists, prunes on load and deletes', async () => {
    const file = tmp();
    writeFileSync(file, JSON.stringify({ format: 'boardpilot-coach@1', attempts: [attempt({ id: 'old', at: NOW - 100 * DAY }), attempt({ id: 'keep', at: NOW - DAY })] }));
    const store = new CoachStore(file, () => NOW);
    expect((await store.list(hw.id, hw.interview[0])).map((a) => a.id)).toEqual(['keep']);
    // the pruned entry is gone from the file too
    expect(readFileSync(file, 'utf8')).not.toContain('"old"');

    await store.add(attempt({ id: 'new', at: NOW }));
    await store.add(attempt({ id: 'other', question: hw.interview[1], at: NOW }));
    expect(await store.count()).toBe(3);
    const reopened = new CoachStore(file, () => NOW);
    expect((await reopened.list(hw.id, hw.interview[0])).map((a) => a.id)).toEqual(['new', 'keep']);

    await reopened.removeQuestion(hw.id, hw.interview[0]);
    expect(await reopened.count()).toBe(1);
    await reopened.removeAll();
    expect(await reopened.count()).toBe(0);
    expect(existsSync(file)).toBe(false);
  });

  it('starts empty when the file is missing or broken', async () => {
    const file = tmp();
    expect(await new CoachStore(file, () => NOW).count()).toBe(0);
    writeFileSync(file, '{ not json');
    expect(await new CoachStore(file, () => NOW).count()).toBe(0);
  });
});
