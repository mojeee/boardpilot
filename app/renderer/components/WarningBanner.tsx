// Warnings as a banner across the top of the project page: the wiring checker, the code checker
// and the board's measured failures, one at a time ("1 of N"), each in plain words with its
// source and three buttons: Fix (when the fix is a plain edit), Show on the board, Ask why. They
// stay in the log too. × hides the banner until something new comes up.

import { useMemo, useState } from 'react';
import { PARTS, getBoard } from '@shared/board';
import { wiringFix } from '@shared/fixes';
import type { TargetRef } from '@shared/types';
import { t } from '@shared/i18n';
import { log, useAi, useApp, useScene } from '../state/store';
import { replaceLine, revealLine, useCodeFindings } from '../state/code';
import { useLayout } from '../state/layout';
import { askAi } from './ai';
import { Icon } from './Icon';

interface BannerItem {
  key: string;
  severity: 'error' | 'warning';
  title: string;
  text: string;
  source: string;
  targets: TargetRef[];
  line?: number;
  fix?: { label: string; tip: string; run(): void };
}

/** "Line 6: the code sets…" → title "Code and drawing disagree", text without the line prefix. */
const stripLine = (m: string) => {
  const s = m.replace(/^[^:]{0,12}\d+:\s*/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function useBannerItems(): BannerItem[] {
  const scene = useScene((s) => s.scene);
  const findings = useScene((s) => s.findings);
  const code = useCodeFindings();
  const notices = useAi((s) => s.items);
  return useMemo(() => {
    const board = getBoard(scene.board);
    const out: BannerItem[] = [];
    for (const f of code) {
      if (f.severity === 'info') continue;
      out.push({
        key: `c:${f.id}:${f.message}`,
        severity: f.severity,
        title: f.rule === 'code_i2c_pins' || f.rule === 'code_pin_not_wired' ? t('Code and drawing disagree.') : t('Check the code.'),
        text: `${stripLine(f.message)} ${f.hint}`,
        source: f.line ? t('code check · line {line}', { line: f.line }) : t('code check'),
        targets: f.targets,
        line: f.line || undefined,
        fix: f.fix
          ? {
              label: t('Fix the code'),
              tip: f.fix.text.trim(),
              run: () => {
                replaceLine(f.line, f.fix!.text);
                useLayout.getState().showBottom('code');
                log('action', t('Fixed line {line}: {code}', { line: f.line, code: f.fix!.text.trim() }), { source: 'code check (one-click fix)' });
              },
            }
          : undefined,
      });
    }
    for (const f of findings) {
      if (f.severity === 'info') continue;
      const fix = wiringFix(f, scene, board, PARTS);
      out.push({
        key: `w:${f.id}:${f.message}`,
        severity: f.severity,
        title: t('Wiring check.'),
        text: `${f.message} ${f.hint}`,
        source: f.source ?? t('wiring check of the drawing'),
        targets: f.targets,
        fix: fix
          ? {
              label: t('Fix the wiring'),
              tip: fix.text,
              run: () => {
                useScene.getState().setScene(fix.scene, true);
                log('action', t('{fix} ⌘Z undoes it.', { fix: fix.text }), { source: 'wiring check (one-click fix)', target: f.targets[0] });
              },
            }
          : undefined,
      });
    }
    // What the board itself reported (measured failures the assistant noticed), newest first.
    for (const n of [...notices].reverse()) {
      if (n.role !== 'notice' || !n.source.startsWith('measured') || out.length > 30) continue;
      out.push({ key: `n:${n.id}`, severity: 'error', title: t('The board reports a problem.'), text: n.text, source: n.source, targets: n.targets });
    }
    const order = { error: 0, warning: 1 } as const;
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [scene, findings, code, notices]);
}

export function WarningBanner() {
  const screen = useApp((s) => s.screen);
  const preview = useScene((s) => !!s.preview);
  const items = useBannerItems();
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const keys = items.map((i) => i.key).join('|');
  if (screen !== 'newProject' || preview || !items.length || dismissed === keys) return null;
  const i = Math.min(index, items.length - 1);
  const it = items[i];
  const step = (d: number) => setIndex((i + d + items.length) % items.length);
  return (
    <div className={`warn-banner sev-${it.severity}`} role="alert">
      <Icon name="warn" size={18} />
      <span className="wb-text">
        <b>{it.title}</b> <span>{it.text}</span>
      </span>
      <span className="wb-src mono">{it.source}</span>
      <span className="grow" />
      {it.fix && (
        <button className="wb-btn fix" title={it.fix.tip} onClick={it.fix.run}>
          {it.fix.label}
        </button>
      )}
      {(it.targets.length > 0 || it.line) && (
        <button
          className="wb-btn"
          onClick={() => {
            if (it.targets.length) useScene.getState().focusOn(it.targets);
            if (it.line) {
              useLayout.getState().showBottom('code');
              revealLine(it.line);
            }
          }}
        >
          {t('Show on the board')}
        </button>
      )}
      <button
        className="wb-btn ai"
        onClick={() => {
          useLayout.getState().toggleRight(true);
          useLayout.getState().setRightTab('assistant');
          void askAi(t('Why is this a problem, and how do I fix it? {text}', { text: it.text }));
        }}
      >
        ✦ {t('Ask why')}
      </button>
      {items.length > 1 && (
        <span className="wb-nav">
          {t('{i} of {n}', { i: i + 1, n: items.length })}
          <button onClick={() => step(-1)} aria-label={t('Previous warning')}>
            ‹
          </button>
          <button onClick={() => step(1)} aria-label={t('Next warning')}>
            ›
          </button>
        </span>
      )}
      <button className="wb-close" onClick={() => setDismissed(keys)} aria-label={t('Hide the warnings until something new comes up')} title={t('Hide the warnings until something new comes up')}>
        ×
      </button>
    </div>
  );
}
