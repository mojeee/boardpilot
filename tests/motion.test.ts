// Social motion clips (issue #22): the clip list is valid, captions are phone-readable (at most 6
// words next to the brand and the tag, at least 48 px tall), subtitles are well formed, and every
// board and part a clip uses exists.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import data from '../motion/clips.json';
import { MAX_CAPTION_WORDS, MIN_CAPTION_PX, MOTION_FORMATS, captionCues, clipProblems, toSrt, wordCount, type MotionClip } from '@shared/motion';

const root = join(__dirname, '..');
const clips = data.clips as unknown as MotionClip[];
const board = (id: string) => JSON.parse(readFileSync(join(root, 'boards', `${id}.json`), 'utf8')) as { name: string };

describe('motion clips', () => {
  it('has the 8 clips from the issue, with unique ids', () => {
    expect(clips).toHaveLength(8);
    expect(new Set(clips.map((c) => c.id)).size).toBe(8);
  });

  it('every clip passes the checks', () => {
    expect(clips.flatMap(clipProblems)).toEqual([]);
  });

  it('labels anything from the simulator', () => {
    for (const c of clips) expect(c.tag === 'Lesson' ? c.hash.includes('screen=learn') : c.tag === 'Simulator').toBe(true);
  });

  it('uses boards and parts that exist, and board names fit on screen', () => {
    for (const c of clips)
      for (const s of c.steps) {
        if (s.do === 'board') {
          expect(existsSync(join(root, 'boards', `${s.id}.json`))).toBe(true);
          expect(wordCount(board(s.id).name)).toBeLessThanOrEqual(MAX_CAPTION_WORDS);
        }
        if (s.do === 'part') expect(existsSync(join(root, 'parts', `${s.id}.json`))).toBe(true);
      }
  });

  it('the boards clip shows every board', () => {
    const shown = clips.find((c) => c.id === 'thirteen-boards')!.steps.flatMap((s) => (s.do === 'board' ? [s.id] : []));
    const all = readdirSync(join(root, 'boards'));
    expect(shown.sort()).toEqual(all.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort());
  });

  it('the parts clip claim matches the library', () => {
    const n = readdirSync(join(root, 'parts')).filter((f) => f.endsWith('.json')).length;
    expect(n).toBeGreaterThanOrEqual(380);
  });
});

describe('motion formats and overlay', () => {
  const css = readFileSync(join(root, 'app/renderer/motion/overlay.css'), 'utf8');

  it('has 16:9, 1:1 and 9:16', () => {
    expect(MOTION_FORMATS.map((f) => [f.id, f.width, f.height])).toEqual([
      ['16x9', 1920, 1080],
      ['1x1', 1080, 1080],
      ['9x16', 1080, 1920],
    ]);
  });

  it('the render script uses the same sizes', () => {
    const script = readFileSync(join(root, 'scripts/render-motion.mjs'), 'utf8');
    for (const f of MOTION_FORMATS) expect(script).toContain(`'${f.id}': { width: ${f.width}, height: ${f.height}, scale: ${f.scale}`);
  });

  it('captions are at least 48 px tall in the video', () => {
    for (const f of MOTION_FORMATS) {
      const m = new RegExp(`\\.motion-${f.id} \\.mo-line \\{ font-size: (\\d+)px`).exec(css);
      expect(m, f.id).not.toBeNull();
      expect(Number(m![1]) * f.scale).toBeGreaterThanOrEqual(MIN_CAPTION_PX);
    }
  });

  it('uses only design-token colours', () => {
    expect(css.match(/#[0-9a-f]{3,8}\b/gi)).toBeNull();
  });
});

describe('subtitles', () => {
  const clip: MotionClip = {
    id: 'demo',
    title: 'Demo',
    message: 'm',
    hash: '#demo=live',
    ready: '.x',
    tag: 'Simulator',
    duration: 6,
    steps: [
      { at: 0, do: 'caption', en: 'One', it: 'Uno' },
      { at: 1.5, do: 'board', id: 'rpi-pico' },
      { at: 3, do: 'uncaption' },
      { at: 4.25, do: 'caption', en: 'Two', it: 'Due' },
    ],
    post: { en: 'p', it: 'p' },
  };

  it('each caption lasts until the next one or the end', () => {
    expect(captionCues(clip, 'it', { 'rpi-pico': 'Raspberry Pi Pico' })).toEqual([
      { from: 0, to: 1.5, text: 'Uno' },
      { from: 1.5, to: 3, text: 'Raspberry Pi Pico' },
      { from: 4.25, to: 6, text: 'Due' },
    ]);
  });

  it('writes SubRip', () => {
    expect(toSrt(captionCues(clip, 'en'))).toBe(
      '1\n00:00:00,000 --> 00:00:01,500\nOne\n\n2\n00:00:01,500 --> 00:00:03,000\nrpi-pico\n\n3\n00:00:04,250 --> 00:00:06,000\nTwo\n',
    );
  });

  it('catches long captions and missing Italian', () => {
    const bad = { ...clip, steps: [{ at: 0, do: 'caption' as const, en: 'one two three four five six seven', it: '' }] };
    expect(clipProblems(bad)).toHaveLength(2);
  });
});
