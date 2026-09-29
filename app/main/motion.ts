// Motion capture mode for the social clips (issue #22). Developer aid, like BP_SNAPSHOT: it only
// runs when BP_MOTION=<job.json> is set (scripts/render-motion.mjs does that), in simulator mode.
// The window opens at the video's size, the renderer draws captions, rings and arrows on top of the
// real app (app/renderer/motion/), and this module steps a virtual clock one video frame at a time
// and captures each frame, then quits. Frames are PNG files; the render script makes MP4 and GIF.

import { app, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { captionCues, clipProblems, toSrt, type MotionJob } from '@shared/motion';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The job from BP_MOTION, or null in normal use. */
export function motionJob(): MotionJob | null {
  const path = process.env.BP_MOTION;
  if (!path) return null;
  const job = JSON.parse(readFileSync(path, 'utf8')) as MotionJob;
  const problems = clipProblems(job.clip);
  if (problems.length) throw new Error(`motion: clip ${job.clip.id} is not valid:\n  ${problems.join('\n  ')}`);
  return job;
}

/** Window options for a capture: content exactly video size / scale, so the capture is video size. */
export function motionWindowOptions(job: MotionJob): BrowserWindowConstructorOptions {
  return {
    width: Math.round(job.format.width / job.format.scale),
    height: Math.round(job.format.height / job.format.scale),
    minWidth: 0,
    minHeight: 0,
    useContentSize: true,
    resizable: false,
    autoHideMenuBar: true,
    frame: false,
  };
}

/** The hash the capture window opens: the clip's demo link plus motion=1 (loads the overlay code). */
export const motionHash = (job: MotionJob) => `${job.clip.hash}&lang=en&motion=1`;

async function until(check: () => Promise<boolean>, ms: number, what: string) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return;
    await sleep(200);
  }
  throw new Error(`motion: timed out waiting for ${what}`);
}

/** Records the clip. Before the page loads, the virtual clock (motion/clock.js) is injected so the
 *  app's timers and animations can be stepped. The page sets itself up in real time, then time is
 *  frozen and moved one video frame per capture: the result is the same on any machine. */
export async function runMotion(win: BrowserWindow, job: MotionJob, load: () => void) {
  const wc = win.webContents;
  const js = <T>(code: string) => wc.executeJavaScript(code, true) as Promise<T>;
  const fail = (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    app.exit(2);
  };
  // Page errors show up in the render script's output.
  wc.on('console-message', (e) => {
    if ((e.level === 'error' || e.level === 'warning') && !e.message.includes('Electron Security Warning')) console.log(`motion: page ${e.level}: ${e.message}`);
  });
  wc.once('did-finish-load', () => {
    void (async () => {
      console.log(`motion: ${job.clip.id} ${job.format.id}: page loaded`);
      rmSync(job.outDir, { recursive: true, force: true });
      mkdirSync(job.outDir, { recursive: true });
      if (job.srtPrefix) {
        for (const lang of ['en', 'it'] as const) writeFileSync(`${job.srtPrefix}.${lang}.srt`, toSrt(captionCues(job.clip, lang, job.boardNames)));
      }
      await until(() => js<boolean>('typeof window.bpMotion === "object" && typeof window.bpClock === "object"'), 30000, 'the overlay code');
      // load() resolves once the demo reached `ready` and the setup steps ran.
      const loaded = await js<string>(`window.bpMotion.load(${JSON.stringify(job)})`);
      if (loaded !== 'ready') throw new Error(`motion: setup failed: ${loaded}`);

      const total = Math.round(job.clip.duration * job.fps);
      const name = (i: number) => join(job.outDir, `frame-${String(i).padStart(5, '0')}.png`);
      const writes: Promise<void>[] = [];
      await js('window.bpClock.manual()');
      await js('window.bpMotion.play()');
      const t0 = Date.now();
      for (let i = 1; i <= total; i++) {
        const img = await wc.capturePage();
        writes.push(writeFile(name(i), img.resize({ width: job.format.width, height: job.format.height, quality: 'best' }).toPNG()));
        if (i < total) await js(`window.bpClock.advance(${1000 / job.fps})`);
      }
      await Promise.all(writes);
      await js('window.bpMotion.stop()');
      const seconds = Math.round((Date.now() - t0) / 1000);
      writeFileSync(
        join(job.outDir, 'frames.json'),
        JSON.stringify({ clip: job.clip.id, format: job.format.id, fps: job.fps, frames: total, width: job.format.width, height: job.format.height, seconds }, null, 2),
      );
      console.log(`motion: ${job.clip.id} ${job.format.id}: ${total} frames in ${seconds} s`);
      app.exit(0);
    })().catch(fail);
  });
  try {
    // The debugger needs a live page to attach to: start from a blank one.
    await wc.loadURL('about:blank');
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Page.enable');
    const clock = readFileSync(join(app.getAppPath(), 'motion/clock.js'), 'utf8');
    await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: clock });
  } catch (e) {
    fail(e);
    return;
  }
  load();
}
