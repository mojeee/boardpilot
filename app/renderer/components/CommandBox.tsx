// "Ask AI or find anything" (⌘K) in the top menu: find an action, a screen, a board, a template or
// a part by name and run it, or send the text to the assistant. Works without the AI: actions are
// found by their names and keywords ("back up my board", "open the monitor"), and "…, then …" runs
// several in order.

import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { actionChain, bestAction, searchActions } from '@shared/actions';
import { PARTS, boardList } from '@shared/board';
import { TEMPLATES } from '@shared/templates';
import { t } from '@shared/i18n';
import { useApp } from '../state/store';
import { runAction } from '../state/appActions';
import { useLayout } from '../state/layout';
import { addPart } from '../state/sceneActions';
import { askAi } from './ai';
import { MENU, openTask } from './TaskRail';
import { Icon } from './Icon';

const useBox = create<{ open: boolean; set(open: boolean): void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openCommandBox = () => useBox.getState().set(true);

interface Entry {
  key: string;
  icon: string;
  label: string;
  hint: string;
  run(): void;
  ai?: boolean;
}

function useEntries(q: string): Entry[] {
  const aiOn = useApp((s) => s.ai.enabled);
  return useMemo(() => {
    const text = q.trim();
    const low = text.toLowerCase();
    const out: Entry[] = [];
    const chain = text ? actionChain(text, t) : null;
    if (chain) {
      out.push({
        key: 'chain',
        icon: 'flash',
        label: chain.map((a) => t(a.label)).join(' → '),
        hint: t('Runs these in order; writes to the board still ask first.'),
        run: () => {
          void (async () => {
            for (const a of chain) if (!(await runAction(a.id, '', 'box'))) break;
          })();
        },
      });
    }
    for (const a of searchActions(text, t).slice(0, text ? 6 : 8)) {
      out.push({ key: `a:${a.id}`, icon: a.writes ? 'flash' : 'check', label: t(a.label), hint: t(a.hint), run: () => void runAction(a.id, '', 'box') });
    }
    if (text) {
      const best = bestAction(text, t);
      if (best && !out.some((e) => e.key === `a:${best.id}`)) out.unshift({ key: `a:${best.id}`, icon: 'check', label: t(best.label), hint: t(best.hint), run: () => void runAction(best.id, '', 'box') });
      for (const m of MENU.filter((m) => t(m.label).toLowerCase().includes(low) || m.label.toLowerCase().includes(low)).slice(0, 3)) {
        out.push({ key: `s:${m.screen}`, icon: m.icon, label: t('Go to {screen}', { screen: t(m.label) }), hint: t(m.hint), run: () => (m.screen === 'learn' ? useApp.getState().setScreen('learn') : openTask(m.screen)) });
      }
      for (const tpl of TEMPLATES.filter((x) => t(x.name).toLowerCase().includes(low) || x.id.includes(low)).slice(0, 3)) {
        out.push({ key: `t:${tpl.id}`, icon: 'project', label: t('Template: {name}', { name: t(tpl.name) }), hint: t(tpl.summary), run: () => void runAction('open_template', tpl.id, 'box') });
      }
      for (const b of boardList().filter((b) => b.name.toLowerCase().includes(low) || b.id.includes(low)).slice(0, 3)) {
        out.push({ key: `b:${b.id}`, icon: 'board', label: t('Use the {board}', { board: b.name }), hint: t(b.summary), run: () => void runAction('set_board', b.id, 'box') });
      }
      if (low.length >= 3) {
        for (const p of Object.values(PARTS)
          .filter((p) => p.name.toLowerCase().includes(low) || p.id.includes(low) || p.keywords?.some((k) => k.toLowerCase() === low))
          .slice(0, 4)) {
          out.push({ key: `p:${p.id}`, icon: 'box', label: t('Add {part}', { part: p.name }), hint: t('Adds it to the drawing; wire it or let the safe-pin rules do it.'), run: () => void addPart(p.id) });
        }
      }
      out.push({
        key: 'ai',
        icon: 'ai',
        ai: true,
        label: aiOn ? t('Ask the assistant: “{text}”', { text }) : t('The assistant is off: set up AI to ask it'),
        hint: aiOn ? t('It can answer, build and run app actions for you.') : t('Open AI settings'),
        run: () => {
          if (!aiOn) return void import('./AiSettings').then((m) => m.openAiSettings());
          useLayout.getState().toggleRight(true);
          if (useApp.getState().screen === 'newProject') useLayout.getState().setRightTab('assistant');
          void askAi(text);
        },
      });
    }
    // One entry per key, in order.
    return out.filter((e, i) => out.findIndex((x) => x.key === e.key) === i).slice(0, 12);
  }, [q, aiOn]);
}

function Palette() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const entries = useEntries(q);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = () => useBox.getState().set(false);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setSel(0), [q]);
  const go = (e: Entry | undefined) => {
    if (!e) return;
    close();
    e.run();
  };
  return (
    <div className="cmd-back" onMouseDown={close}>
      <div className="cmd" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={t('Ask AI or find anything')}>
        <div className="cmd-in">
          <span className="cmd-spark">✦</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Ask AI or find anything: “back up my board”')}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(entries.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') go(entries[sel]);
            }}
            aria-label={t('Ask AI or find anything')}
          />
        </div>
        <ul className="cmd-list" role="listbox">
          {entries.map((e, i) => (
            <li key={e.key} role="option" aria-selected={i === sel} className={`${i === sel ? 'on' : ''} ${e.ai ? 'ai' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => go(e)}>
              <Icon name={e.icon} size={15} />
              <span className="cmd-label">{e.label}</span>
              <span className="cmd-hint">{e.hint}</span>
            </li>
          ))}
        </ul>
        <div className="cmd-foot small dim">{t('↑↓ to choose · Enter to run · Esc to close. The assistant shows every step and where each button is.')}</div>
      </div>
    </div>
  );
}

export function CommandBox() {
  const open = useBox((s) => s.open);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useBox.getState().set(!useBox.getState().open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <button className="cmd-open" onClick={openCommandBox} title={t('Ask AI or find anything (⌘K)')} data-where="top:search">
        <span className="cmd-spark">✦</span>
        <span className="cmd-ph">{t('Ask AI or find anything: “back up my board”')}</span>
        <span className="kbd mono">⌘K</span>
      </button>
      {open && <Palette />}
    </>
  );
}
