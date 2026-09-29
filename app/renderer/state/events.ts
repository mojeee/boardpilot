// What happens in the app, for the assistant: screens opened, parts and wires changed, the code
// edited, simulated runs, project tabs. Short lines, newest last; sent with every question (the
// log and the live readings go separately). Also the watcher that makes the assistant speak up
// by itself when a check finds something new: each notice quotes the check and its source.

import { PARTS, getBoard } from '@shared/board';
import { checkCode } from '@shared/codeCheck';
import type { Scene, TargetRef } from '@shared/types';
import { t } from '@shared/i18n';
import { useAi, useApp, useLive, useLog, useScene } from './store';
import { useTemplate } from './templateRun';
import { useProjects } from './projects';

const MAX = 60;
const events: string[] = [];

export function recordEvent(text: string) {
  const time = new Date().toLocaleTimeString([], { hour12: false });
  events.push(`${time} ${text}`);
  if (events.length > MAX) events.splice(0, events.length - MAX);
}

export const recentEvents = () => events.slice(-30);

const wireText = (s: Scene, w: Scene['wires'][number]) => `${w.from.part === 'board' ? w.from.pin : `${w.from.part}.${w.from.pin}`} → ${w.to.part === 'board' ? w.to.pin : `${w.to.part}.${w.to.pin}`}`;

function sceneDiff(s: Scene, prev: Scene) {
  if (s.board !== prev.board) recordEvent(`board set to ${getBoard(s.board).name}`);
  const before = new Map(prev.parts.map((p) => [p.id, p]));
  const after = new Map(s.parts.map((p) => [p.id, p]));
  for (const [id, p] of after) if (!before.has(id)) recordEvent(`part added: ${id} (${p.partId})`);
  for (const [id, p] of before) if (!after.has(id)) recordEvent(`part removed: ${id} (${p.partId})`);
  const wb = new Set(prev.wires.map((w) => wireText(prev, w)));
  const wa = new Set(s.wires.map((w) => wireText(s, w)));
  const added = [...wa].filter((w) => !wb.has(w));
  const removed = [...wb].filter((w) => !wa.has(w));
  if (added.length + removed.length > 4) recordEvent(`wiring changed: ${s.wires.length} wires (was ${prev.wires.length})`);
  else {
    for (const w of added) recordEvent(`wire added: ${w}`);
    for (const w of removed) recordEvent(`wire removed: ${w}`);
  }
}

let started = false;

/** Start recording app events and watching the checks (once, at start-up). */
export function startEventFeed() {
  if (started) return;
  started = true;
  let codeTimer: ReturnType<typeof setTimeout> | null = null;
  useApp.subscribe((s, prev) => {
    if (s.screen !== prev.screen) recordEvent(`screen opened: ${s.screen === 'newProject' ? 'project' : s.screen}`);
    if (s.conn.chip?.chip !== prev.conn.chip?.chip && s.conn.chip) recordEvent(`board identified: ${s.conn.chip.chip} on ${s.conn.port ?? '?'}`);
    if (!!s.conn.agent !== !!prev.conn.agent) recordEvent(s.conn.agent ? 'diagnostic agent running' : 'diagnostic agent disconnected');
    if (s.conn.serialOpen !== prev.conn.serialOpen) recordEvent(s.conn.serialOpen ? 'serial monitor opened' : 'serial monitor closed');
  });
  useScene.subscribe((s, prev) => {
    if (s.preview || prev.preview) return;
    if (s.scene !== prev.scene) {
      if (s.loadNonce !== prev.loadNonce) recordEvent(`project opened: ${s.scene.parts.length} parts, ${s.scene.wires.length} wires`);
      else sceneDiff(s.scene, prev.scene);
      if (s.scene.sketch?.text !== prev.scene.sketch?.text) {
        if (codeTimer) clearTimeout(codeTimer);
        codeTimer = setTimeout(() => {
          const sk = useScene.getState().scene.sketch;
          if (sk) recordEvent(`code edited: ${sk.name}, ${sk.text.split('\n').length} lines`);
        }, 2000);
      }
    }
  });
  useTemplate.subscribe((s, prev) => {
    if (s.running !== prev.running) recordEvent(s.running ? `simulated run started (${s.tpl?.id ?? ''})` : 'simulated run paused');
    if (s.state && s.state !== prev.state) recordEvent(`simulated run state: ${s.state}`);
  });
  useProjects.subscribe((s, prev) => {
    if (s.active !== prev.active) recordEvent(`project tab: ${s.tabs.find((x) => x.id === s.active)?.name ?? ''}`);
  });
  startWatch();
}

/* ---------------- the assistant speaks up ---------------- */

interface Notice {
  key: string;
  severity: 'error' | 'warning' | 'info';
  text: string;
  hint: string;
  source: string;
  targets: TargetRef[];
  line?: number;
}

const announced = new Set<string>();
let pending: Notice[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function queue(list: Notice[]) {
  const fresh = list.filter((n) => !announced.has(n.key) && !pending.some((p) => p.key === n.key));
  if (!fresh.length) return;
  pending.push(...fresh);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 1200);
}

function flush() {
  const list = pending;
  pending = [];
  const order = { error: 0, warning: 1, info: 2 } as const;
  list.sort((a, b) => order[a.severity] - order[b.severity]);
  for (const n of list) announced.add(n.key);
  // Two notices at most at once; the rest are in the banner and the log.
  for (const n of list.slice(0, 2)) useAi.getState().push({ role: 'notice', severity: n.severity, text: n.text, hint: n.hint, source: n.source, targets: n.targets, line: n.line });
  if (list.length > 2) {
    useAi.getState().push({
      role: 'notice',
      severity: 'info',
      text: list.length - 2 === 1 ? t('1 more thing to check.') : t('{n} more things to check.', { n: list.length - 2 }),
      hint: t('They are in the warnings banner and the log.'),
      source: t('the app’s checks'),
      targets: [],
    });
  }
}

function startWatch() {
  let codeTimer: ReturnType<typeof setTimeout> | null = null;
  useScene.subscribe((s, prev) => {
    if (s.preview) return;
    if (s.findings !== prev.findings) {
      queue(
        s.findings
          .filter((f) => f.severity !== 'info')
          .map((f) => ({
            key: `w:${f.rule}:${f.targets.join(',')}:${f.message}`,
            severity: f.severity,
            text: f.message,
            hint: f.hint,
            source: f.source ?? t('wiring check of the drawing'),
            targets: f.targets,
          })),
      );
    }
    if (s.scene.sketch?.text !== prev.scene.sketch?.text || s.scene.wires !== prev.scene.wires) {
      if (codeTimer) clearTimeout(codeTimer);
      codeTimer = setTimeout(() => {
        const sc = useScene.getState().scene;
        const text = sc.sketch?.text ?? '';
        if (!text.trim()) return;
        const fs = checkCode(text, sc, getBoard(sc.board), PARTS, { monitorBaud: useLive.getState().baud });
        queue(
          fs
            .filter((f) => f.severity !== 'info')
            .map((f) => ({ key: `c:${f.rule}:${f.message}`, severity: f.severity, text: f.message, hint: f.hint, source: f.source, targets: f.targets, line: f.line || undefined })),
        );
      }, 1500);
    }
  });
  // Measured problems from the board (a sensor that stopped answering, a failed read).
  let lastId = useLog.getState().entries.at(-1)?.id ?? 0;
  useLog.subscribe((s) => {
    const fresh = s.entries.filter((e) => e.id > lastId);
    lastId = s.entries.at(-1)?.id ?? lastId;
    queue(
      fresh
        .filter((e) => e.type === 'failed' && e.source?.startsWith('measured'))
        .map((e) => ({ key: `l:${e.text}`, severity: 'error' as const, text: e.text, hint: '', source: e.source ?? '', targets: e.target ? [e.target] : [] })),
    );
  });
}
