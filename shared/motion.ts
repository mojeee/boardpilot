// Motion clips for social posts (issue #22): short muted clips recorded from the real app in
// simulator mode, with captions, highlight rings and arrows drawn on top. The clip list is data
// (motion/clips.json); scripts/render-motion.mjs records every clip in every format. Nothing here
// is shown in normal use: the capture mode only runs when the main process gets BP_MOTION.

/** The three social formats. `scale` is the device pixel ratio of the capture window: the page is
 *  laid out at width/scale × height/scale CSS pixels and captured at the full video size. */
export type MotionFormatId = '16x9' | '1x1' | '9x16';

export interface MotionFormat {
  id: MotionFormatId;
  width: number;
  height: number;
  scale: number;
  /** Where it is posted, for the docs. */
  use: string;
}

export const MOTION_FORMATS: readonly MotionFormat[] = [
  { id: '16x9', width: 1920, height: 1080, scale: 2, use: 'YouTube, X, LinkedIn' },
  { id: '1x1', width: 1080, height: 1080, scale: 2, use: 'Instagram and LinkedIn feed' },
  { id: '9x16', width: 1080, height: 1920, scale: 2, use: 'YouTube Shorts, Reels, TikTok' },
];

/** Colour of a ring or arrow: a design token name (tokens.css), never a raw colour. */
export type MotionTone = 'warn' | 'ok' | 'err' | 'ai' | 'sda' | 'scl' | 'gpio';

/** One timed step. `at` is seconds from the start of the recording. A `target` is a CSS selector in
 *  the app; `text` narrows it to the first match whose text contains that string. */
export type MotionStep =
  | { at: number; do: 'caption'; en: string; it: string }
  | { at: number; do: 'uncaption' }
  | { at: number; do: 'ring'; target: string; text?: string; tone?: MotionTone; pad?: number }
  | { at: number; do: 'arrow'; target: string; text?: string; tone?: MotionTone; from?: 'left' | 'right' | 'above' | 'below' }
  | { at: number; do: 'clear' }
  | { at: number; do: 'camera'; target: string; text?: string; pad?: number; over?: number; maxZoom?: number; fill?: boolean }
  | { at: number; do: 'click'; target: string; text?: string }
  | { at: number; do: 'slide'; target: string; to: number; over: number }
  | { at: number; do: 'pan'; target: string; to: number; over: number }
  | { at: number; do: 'hide'; target: string }
  | { at: number; do: 'reveal'; target: string; over: number }
  | { at: number; do: 'type'; target: string; over: number }
  | { at: number; do: 'scroll'; target: string; text?: string }
  | { at: number; do: 'board'; id: string }
  | { at: number; do: 'part'; id: string }
  | { at: number; do: 'view'; preset: 'home' | 'top' | 'side' | 'module' }
  | { at: number; do: 'focus'; targets: string[] }
  | { at: number; do: 'mode'; mode: 'sim' | 'real' };

export interface MotionClip {
  id: string;
  title: string;
  /** The one message of the clip, for the docs and the post. */
  message: string;
  /** App hash to open (the existing #demo=… and #screen=… links). */
  hash: string;
  /** Selector that must exist before setup runs (the demo reached its state). */
  ready: string;
  /** Extra wait after `ready`, in seconds (3D framing, animations). */
  settle?: number;
  /** Steps run before the recording starts (their `at` is ignored). */
  setup?: MotionStep[];
  /** Length of the clip in seconds (5 to 15). */
  duration: number;
  /** Always-visible label: "Simulator" for anything the simulated board produced, "Lesson" for a Learn widget. */
  tag: 'Simulator' | 'Lesson';
  steps: MotionStep[];
  /** Post text for the social channel (English, Italian). */
  post: { en: string; it: string };
}

/** Everything the capture window needs for one recording. */
export interface MotionJob {
  clip: MotionClip;
  format: MotionFormat;
  fps: number;
  /** Folder for frame-00001.png … and frames.json. */
  outDir: string;
  /** Path prefix for the subtitle files: <prefix>.en.srt and <prefix>.it.srt. */
  srtPrefix?: string;
  /** Board names for `board` steps (id → name), read from /boards by the render script. */
  boardNames?: Record<string, string>;
}

/** Phone readability rule from the issue: at most 8 words on screen at once. The brand name and
 *  the Simulator/Lesson tag are always there, so a caption gets 6. */
export const MAX_CAPTION_WORDS = 6;
/** Caption text is at least this many video pixels tall in a 1080-wide video. */
export const MIN_CAPTION_PX = 48;

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Problems with a clip definition (empty when it is fine). Used by the tests and the render script. */
export function clipProblems(c: MotionClip): string[] {
  const out: string[] = [];
  if (!/^[a-z0-9-]+$/.test(c.id)) out.push(`${c.id}: id must be lowercase words with dashes`);
  if (c.duration < 5 || c.duration > 15) out.push(`${c.id}: duration ${c.duration}s is outside 5 to 15 s`);
  if (!c.hash.startsWith('#')) out.push(`${c.id}: hash must start with #`);
  const captions = c.steps.filter((s): s is Extract<MotionStep, { do: 'caption' }> => s.do === 'caption');
  if (!captions.length) out.push(`${c.id}: no caption`);
  for (const s of captions) {
    if (!s.en.trim() || !s.it.trim()) out.push(`${c.id}: caption at ${s.at}s needs English and Italian`);
    if (wordCount(s.en) > MAX_CAPTION_WORDS) out.push(`${c.id}: "${s.en}" has more than ${MAX_CAPTION_WORDS} words`);
    if (wordCount(s.it) > MAX_CAPTION_WORDS) out.push(`${c.id}: "${s.it}" has more than ${MAX_CAPTION_WORDS} words`);
  }
  let last = -1;
  for (const s of c.steps) {
    if (s.at < last) out.push(`${c.id}: steps must be in time order (${s.at}s after ${last}s)`);
    if (s.at < 0 || s.at >= c.duration) out.push(`${c.id}: step at ${s.at}s is outside the clip`);
    last = s.at;
  }
  if (!c.post.en.trim() || !c.post.it.trim()) out.push(`${c.id}: post text needs English and Italian`);
  return out;
}

/** Caption cues for a subtitle file: each caption lasts until the next caption, an `uncaption`, or the end. */
export function captionCues(c: MotionClip, lang: 'en' | 'it', boardNames: Record<string, string> = {}): { from: number; to: number; text: string }[] {
  const cues: { from: number; to: number; text: string }[] = [];
  for (const s of c.steps) {
    const open = cues[cues.length - 1];
    const text = s.do === 'caption' ? s[lang] : s.do === 'board' ? (boardNames[s.id] ?? s.id) : null;
    if (s.do === 'uncaption' || text !== null) {
      if (open && open.to < 0) open.to = s.at;
    }
    if (text !== null) cues.push({ from: s.at, to: -1, text });
  }
  for (const q of cues) if (q.to < 0) q.to = c.duration;
  return cues.filter((q) => q.to > q.from);
}

const stamp = (t: number) => {
  const ms = Math.round(t * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/** SubRip (.srt) text for the caption cues. */
export function toSrt(cues: { from: number; to: number; text: string }[]): string {
  return cues.map((q, i) => `${i + 1}\n${stamp(q.from)} --> ${stamp(q.to)}\n${q.text}\n`).join('\n');
}
