// What happens in the app, for the assistant: screens opened, parts and wires changed, the code
// edited, simulated runs, project tabs. Short lines, newest last; sent with every question (the
// log and the live readings go separately). Also the watcher that makes the assistant speak up
// by itself when a check finds something new: each notice quotes the check and its source.

import { create } from 'zustand';
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

/** What the checks find right now (notice keys), so a notice whose problem is gone can say so. */
export const useOpenChecks = create<{ wiring: Set<string>; code: Set<string> }>(() => ({ wiring: new Set(), code: new Set() }));

/** False once the checks no longer find what the notice was about (fixed, or another board or project). */
export function stillFound(key: string | undefined, open = useOpenChecks.getState()): boolean {
  if (key?.startsWith('w:')) return open.wiring.has(key);
  if (key?.startsWith('c:')) return open.code.has(key);
  return true;
}

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

let queuedTab = '';

function queue(list: Notice[]) {
  // Switching tabs while notices wait: they were about the other project, drop them.
  const tab = useProjects.getState().active;
  if (tab !== queuedTab) {
    pending = [];
    queuedTab = tab;
  }
  const fresh = list.filter((n) => !announced.has(n.key) && !pending.some((p) => p.key === n.key));
  if (!fresh.length) return;
  pending.push(...fresh);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 1200);
}

function flush() {
  // Only what the checks still find: the problem may have been fixed, or the board changed, while it waited.
  const list = pending.filter((n) => stillFound(n.key));
  pending = [];
  const order = { error: 0, warning: 1, info: 2 } as const;
  list.sort((a, b) => order[a.severity] - order[b.severity]);
  for (const n of list) announced.add(n.key);
  // Two notices at most at once; the rest are in the banner and the log.
  // A notice belongs to the project it is about; the assistant shows it only in that project's tab.
  const tab = useProjects.getState().active;
  for (const n of list.slice(0, 2)) useAi.getState().push({ role: 'notice', key: n.key, severity: n.severity, text: n.text, hint: n.hint, source: n.source, targets: n.targets, line: n.line, tab });
  if (list.length > 2) {
    useAi.getState().push({
      role: 'notice',
      severity: 'info',
      text: list.length - 2 === 1 ? t('1 more thing to check.') : t('{n} more things to check.', { n: list.length - 2 }),
      hint: t('They are in the warnings banner and the log.'),
      source: t('the app’s checks'),
      targets: [],
      tab,
    });
  }
}

function startWatch() {
  let codeTimer: ReturnType<typeof setTimeout> | null = null;
  useScene.subscribe((s, prev) => {
    if (s.preview) return;
    if (s.findings !== prev.findings) {
      const list: Notice[] = s.findings
        .filter((f) => f.severity !== 'info')
        .map((f) => ({
          key: `w:${f.rule}:${f.targets.join(',')}:${f.message}`,
          severity: f.severity,
          text: f.message,
          hint: f.hint,
          source: f.source ?? t('wiring check of the drawing'),
          targets: f.targets,
        }));
      useOpenChecks.setState({ wiring: new Set(list.map((n) => n.key)) });
      queue(list);
    }
    const sc = s.scene;
    const was = prev.scene;
    if (sc.sketch?.text !== was.sketch?.text || sc.wires !== was.wires || sc.parts !== was.parts || sc.board !== was.board) {
      if (codeTimer) clearTimeout(codeTimer);
      codeTimer = setTimeout(() => {
        const now = useScene.getState().scene;
        const text = now.sketch?.text ?? '';
        const list: Notice[] = !text.trim()
          ? []
          : checkCode(text, now, getBoard(now.board), PARTS, { monitorBaud: useLive.getState().baud })
              .filter((f) => f.severity !== 'info')
              .map((f) => ({ key: `c:${f.rule}:${f.message}`, severity: f.severity, text: f.message, hint: f.hint, source: f.source, targets: f.targets, line: f.line || undefined }));
        useOpenChecks.setState({ code: new Set(list.map((n) => n.key)) });
        queue(list);
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
