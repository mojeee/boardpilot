// Renders the social motion clips (issue #22) from the real app in simulator mode: every clip in
// motion/clips.json, in 16:9, 1:1 and 9:16. Needs a build first (npm run motion does both).
//   node scripts/render-motion.mjs                       every clip, every format
//   node scripts/render-motion.mjs found-it pwm          some clips
//   node scripts/render-motion.mjs --format 9x16         one format (or 16x9,1x1)
//   node scripts/render-motion.mjs --keep-frames         keep the PNG frames after encoding
// Output: motion/out/<clip>/<clip>-<format>.mp4 and .gif, plus <clip>.en.srt and <clip>.it.srt.
// Frames: motion/out/<clip>/<format>/frames/frame-00001.png … (kept when ffmpeg is missing).
// On Linux without a display it runs under xvfb-run with software WebGL. ffmpeg is used as a
// system tool when it is installed (not an npm dependency); without it you get the PNG frames and
// the command to run. Clips are muted: the videos have no audio track.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'motion/out');

/** Keep in sync with MOTION_FORMATS in shared/motion.ts (this script is plain Node, no TypeScript). */
const FORMATS = {
  '16x9': { width: 1920, height: 1080, scale: 2, use: 'YouTube, X, LinkedIn' },
  '1x1': { width: 1080, height: 1080, scale: 2, use: 'Instagram and LinkedIn feed' },
  '9x16': { width: 1080, height: 1920, scale: 2, use: 'YouTube Shorts, Reels, TikTok' },
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const optionValues = new Set(['--format', '--fps'].map(option).filter(Boolean));
const wanted = args.filter((a) => !a.startsWith('--') && !optionValues.has(a));

const data = JSON.parse(readFileSync(join(root, 'motion/clips.json'), 'utf8'));
const fps = Number(option('--fps') ?? data.fps ?? 30);
const formats = (option('--format') ?? Object.keys(FORMATS).join(',')).split(',');
for (const f of formats) if (!FORMATS[f]) fail(`unknown format ${f}; known: ${Object.keys(FORMATS).join(', ')}`);
const clips = wanted.length ? wanted.map((id) => data.clips.find((c) => c.id === id) ?? fail(`unknown clip ${id}; known: ${data.clips.map((c) => c.id).join(', ')}`)) : data.clips;

const boardNames = Object.fromEntries(
  readdirSync(join(root, 'boards'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(root, 'boards', f), 'utf8')))
    .map((b) => [b.id, b.name]),
);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!existsSync(join(root, 'out/main/index.js')) || !existsSync(join(root, 'out/renderer/index.html'))) fail('No build found. Run npm run build first (or npm run motion, which builds).');

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const headless = process.platform === 'linux' && !process.env.DISPLAY;

function record(clip, fmtId) {
  const format = { id: fmtId, ...FORMATS[fmtId] };
  const dir = join(OUT, clip.id, fmtId);
  const frames = join(dir, 'frames');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const jobPath = join(dir, 'job.json');
  writeFileSync(jobPath, JSON.stringify({ clip, format, fps, outDir: frames, srtPrefix: join(OUT, clip.id, clip.id), boardNames }, null, 2));
  const electron = ['electron', '.', '--no-sandbox', `--force-device-scale-factor=${format.scale}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const cmd = headless ? 'xvfb-run' : 'npx';
  const xargs = headless ? ['-a', '-s', '-screen 0 2200x2200x24', 'npx', ...electron] : electron;
  const r = spawnSync(cmd, xargs, { cwd: root, env: { ...process.env, BOARDPILOT_MODE: 'sim', BP_MOTION: jobPath }, encoding: 'utf8', timeout: (180 + clip.duration * fps * 15) * 1000 });
  const said = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').filter((l) => l.startsWith('motion:'));
  if (r.status !== 0 || !existsSync(join(frames, 'frames.json'))) {
    console.log('failed');
    for (const l of said) console.log(`  ${l}`);
    if (r.error) console.log(`  ${r.error.message}`);
    return null;
  }
  const meta = JSON.parse(readFileSync(join(frames, 'frames.json'), 'utf8'));
  return { frames, meta };
}

function ffmpegCommands(frames, mp4, gif, width) {
  return [
    ['-y', '-v', 'error', '-framerate', String(fps), '-i', join(frames, 'frame-%05d.png'), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
    ['-y', '-v', 'error', '-i', mp4, '-vf', `fps=15,scale=${Math.round(width / 2)}:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', gif],
  ];
}

const quote = (a) => (/[\s;[\]]/.test(a) ? `"${a}"` : a);
const pending = [];
let failed = 0;

for (const clip of clips) {
  for (const fmtId of formats) {
    process.stdout.write(`${clip.id} ${fmtId}… `);
    const got = record(clip, fmtId);
    if (!got) {
      failed++;
      continue;
    }
    const { frames, meta } = got;
    const base = join(OUT, clip.id, `${clip.id}-${fmtId}`);
    const cmds = ffmpegCommands(frames, `${base}.mp4`, `${base}.gif`, FORMATS[fmtId].width);
    const real = `${meta.frames} frames, ${meta.seconds} s`;
    if (!hasFfmpeg) {
      console.log(`frames ok (${real})`);
      pending.push(...cmds.map((c) => `ffmpeg ${c.map((a) => quote(relative(root, a) || a)).join(' ')}`));
      continue;
    }
    const ok = cmds.every((c) => spawnSync('ffmpeg', c, { stdio: 'inherit' }).status === 0);
    if (!ok) {
      console.log('ffmpeg failed; frames kept');
      failed++;
      continue;
    }
    if (!flag('--keep-frames')) rmSync(frames, { recursive: true, force: true });
    console.log(`ok (${real}) → ${relative(root, base)}.mp4, .gif`);
  }
}

console.log(`\nSubtitles: motion/out/<clip>/<clip>.en.srt and .it.srt`);
if (pending.length) {
  console.log('\nffmpeg is not installed, so the clips are PNG frames. Install ffmpeg (macOS: brew install ffmpeg,');
  console.log('Windows: winget install ffmpeg, Linux: apt install ffmpeg) and run this again, or encode by hand:\n');
  for (const c of pending) console.log(c);
}
process.exit(failed ? 1 : 0);
