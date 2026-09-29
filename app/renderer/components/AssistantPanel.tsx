// The assistant: plain-language answers with a confidence label and the source of every claim.

import { useEffect, useRef, useState } from 'react';
import type { AiReply, AiSource } from '@shared/types';
import { PARTS, targetLabel } from '@shared/board';
import { currentBoard, log, useAi, useApp, useScene, type ChatItem } from '../state/store';
import { showWhere, stopAction } from '../state/appActions';
import { sceneWithParts } from '../state/buildProject';
import { revealLine } from '../state/code';
import { useLayout } from '../state/layout';
import { askAi } from './ai';
import { Icon } from './Icon';
import { t } from '@shared/i18n';
import { openAiSettings } from './AiSettings';

const CONF_TEXT = { measured: 'Measured', documented: 'From documentation', suggestion: 'Suggestion' };
const SRC_KIND: Record<AiSource['kind'], string> = { measurement: 'measurement', datasheet: 'datasheet', library: 'library', user: 'you said' };

export function ReplyView({ reply }: { reply: AiReply }) {
  const scene = useScene((s) => s.scene);
  return (
    <div className="ai-reply">
      <div className="row gap">
        <span className={`conf conf-${reply.confidence}`}>{t(CONF_TEXT[reply.confidence])}</span>
      </div>
      <div className="ai-text">{reply.message}</div>
      {reply.highlight.length > 0 && (
        <div className="chips">
          {reply.highlight.map((h) => (
            <button key={h} className="chip link mono" onClick={() => useScene.getState().focusOn([h])}>
              {targetLabel(currentBoard(), scene, h)}
            </button>
          ))}
        </div>
      )}
      {reply.sources.length > 0 && (
        <div className="ai-sources">
          {reply.sources.map((s, i) => (
            <div key={i} className={`src-line src-${s.kind}`}>
              <span>{t(SRC_KIND[s.kind] ?? s.kind)}</span> {s.label}
            </div>
          ))}
        </div>
      )}
      {(reply.toolCalls?.length ?? 0) > 0 && (
        <details className="ai-tools">
          <summary>{reply.toolCalls!.length > 1 ? t('{n} tool calls', { n: reply.toolCalls!.length }) : t('1 tool call')}</summary>
          {reply.toolCalls!.map((c, i) => (
            <div key={i} className="mono small">
              {c.ok ? '✓' : '✗'} {c.name} {JSON.stringify(c.input)}
            </div>
          ))}
        </details>
      )}
      {reply.proposal && <ProposalCard proposal={reply.proposal} />}
      {reply.nextOptions.length > 0 && (
        <div className="next-options">
          {reply.nextOptions.map((o) => (
            <button key={o} className="btn small ghost" onClick={() => askAi(o)}>
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Parts the assistant proposed: nothing changes until the user clicks "Add to the project". */
function ProposalCard({ proposal }: { proposal: NonNullable<AiReply['proposal']> }) {
  const [done, setDone] = useState(false);
  const add = () => {
    const before = useScene.getState().scene;
    const { scene, notes } = sceneWithParts(before, proposal.partIds);
    useScene.getState().setScene(scene, true);
    useScene.getState().preset('home');
    log('action', t('Added {parts} (you confirmed the assistant’s suggestion). ⌘Z undoes it.', { parts: proposal.partIds.map((id) => PARTS[id]?.name ?? id).join(', ') }), {
      source: 'assistant suggestion, confirmed by you',
    });
    for (const n of notes) log('action', t('Pin assigned: {note}', { note: n }), { source: 'pin rules (safe pins)' });
    setDone(true);
  };
  return (
    <div className="ai-proposal">
      <div className="label">{t('Parts to add')}</div>
      <ul>
        {proposal.partIds.map((id) => (
          <li key={id}>
            <b>{PARTS[id]?.name ?? id}</b> <span className="mono small dim">parts library · {id}</span>
          </li>
        ))}
      </ul>
      <div className="row gap wrap">
        <button className="btn small primary" disabled={done} onClick={add}>
          {done ? t('Added') : t('Add to the project')}
        </button>
        <span className="small dim">{t('The safe-pin rules pick the pins. Nothing changes until you click.')}</span>
      </div>
    </div>
  );
}

const STEP_ICON = { run: '…', ok: '✓', fail: '✕', skip: '–' } as const;

/** An app action running for the user: its steps, where it lives in the UI, and Stop. */
function ActionCard({ item }: { item: Extract<ChatItem, { role: 'action' }> }) {
  const progress = useApp((s) => s.progress);
  return (
    <div className={`ai-action st-${item.state}`}>
      <ul className="act-steps">
        {item.steps.map((s, i) => (
          <li key={i} className={`as-${s.status}`}>
            <span className="as-ico">{s.status === 'run' ? <span className="spinner sm" /> : STEP_ICON[s.status]}</span>
            <span>{s.text}</span>
            {s.status === 'run' && progress && (
              <span className="as-bar">
                <i style={{ width: `${progress.pct}%` }} />
              </span>
            )}
          </li>
        ))}
        {item.steps.length === 0 && item.state === 'running' && (
          <li className="as-run">
            <span className="as-ico">
              <span className="spinner sm" />
            </span>
            <span>{item.title}</span>
          </li>
        )}
      </ul>
      <div className="mono small dim">
        {t('app action')} · {item.title} · {item.readOnly ? t('read only') : t('asks before writing')}
      </div>
      <div className="row gap wrap">
        <button className="btn small ghost" onClick={() => showWhere(item.where)}>
          {t('Show me where it is')}
        </button>
        {item.state === 'running' && (
          <button className="btn small ghost" onClick={() => stopAction(item.id)}>
            {t('Stop')}
          </button>
        )}
        {item.state === 'stopped' && <span className="small dim">{t('Stopped. A step already running on the board finishes first.')}</span>}
      </div>
    </div>
  );
}

/** Something the app's checks found by themselves, said by the assistant with its source. */
function NoticeCard({ item }: { item: Extract<ChatItem, { role: 'notice' }> }) {
  return (
    <div className={`ai-notice sev-${item.severity}`}>
      <div className="row gap">
        <span className="notice-kicker">{t('I noticed')}</span>
        <span className="conf conf-documented">{t('Check')}</span>
      </div>
      <div className="ai-text">
        <b>{item.text}</b> {item.hint}
      </div>
      <div className="src-line src-library">
        <span>{t('source')}</span> {item.source}
      </div>
      <div className="row gap wrap">
        {item.targets.length > 0 && (
          <button className="btn small ghost" onClick={() => useScene.getState().focusOn(item.targets)}>
            {t('Show on the board')}
          </button>
        )}
        {item.line ? (
          <button
            className="btn small ghost"
            onClick={() => {
              useLayout.getState().showBottom('code');
              revealLine(item.line!);
            }}
          >
            {t('Show in the code')}
          </button>
        ) : null}
        {(item.targets.length > 0 || item.line || item.severity !== 'info') && (
          <button className="btn small ghost" onClick={() => void askAi(t('Why is this a problem, and how do I fix it? {text}', { text: item.text }))}>
            ✦ {t('Ask why')}
          </button>
        )}
      </div>
    </div>
  );
}

export function AskBox({ placeholder, autoFocus }: { placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const busy = useAi((s) => s.busy);
  const enabled = useApp((s) => s.ai.enabled);
  const send = () => {
    const text = q.trim();
    if (!text) return;
    setQ('');
    void askAi(text);
  };
  return (
    <div className="ask-box">
      <textarea
        value={q}
        rows={2}
        placeholder={enabled ? (placeholder ?? t('Ask, describe what to build, or tell it what to do')) : t('AI is off: add a key in AI settings')}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button className="btn icon ai" disabled={busy || !q.trim()} onClick={send} aria-label={t('Ask')}>
        <Icon name="send" size={16} />
      </button>
    </div>
  );
}

/** Shown while the free demo answers: what it is, and the way to a full provider. */
export function DemoBanner() {
  return (
    <div className="ai-demo-banner" role="note">
      <b>{t('Free demo AI')}</b>
      <span>{t('Older model, a few requests per minute, for testing only: don’t send private data.')}</span>
      <button className="link" onClick={openAiSettings}>
        {t('Use my own key')}
      </button>
    </div>
  );
}

export function AssistantPanel({ title, hideInput, hideHeader }: { title?: string; hideInput?: boolean; hideHeader?: boolean }) {
  const items = useAi((s) => s.items);
  const busy = useAi((s) => s.busy);
  const ai = useApp((s) => s.ai);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [items.length, busy]);

  return (
    <section className="assistant">
      <header hidden={hideHeader}>
        <span className="panel-title ai-title">
          <Icon name="ai" size={16} /> {title ?? t('Assistant')}
        </span>
        <button className="link dim small mono" onClick={openAiSettings} title={t('AI settings')}>
          {ai.enabled ? (ai.provider === 'demo' ? t('demo') : ai.model) : t('off')}
        </button>
      </header>
      {ai.enabled && ai.provider === 'demo' && <DemoBanner />}
      <div className="ai-list" ref={list}>
        {items.length === 0 && (
          <div className="ai-empty">
            {ai.enabled ? (
              t('Ask anything about your board, wiring or code. I only state measurements I actually took, and show where every fact comes from.')
            ) : (
              <>
                {t('The assistant is off because no API key is set. Add your own key for Claude, GPT or Gemini. Every check and measurement works without it.')}{' '}
                <button className="link" onClick={openAiSettings}>
                  {t('Open AI settings')}
                </button>
              </>
            )}
          </div>
        )}
        {items.map((it) =>
          it.role === 'user' ? (
            <div key={it.id} className="ai-user">
              {it.text}
            </div>
          ) : it.role === 'assistant' ? (
            <ReplyView key={it.id} reply={it.reply} />
          ) : it.role === 'action' ? (
            <ActionCard key={it.id} item={it} />
          ) : it.role === 'notice' ? (
            <NoticeCard key={it.id} item={it} />
          ) : (
            <div key={it.id} className="ai-error">
              {t(it.text)} <span className="dim">{t(it.hint)}</span>
            </div>
          ),
        )}
        {busy && <div className="ai-thinking">{t('Checking…')}</div>}
      </div>
      {!hideInput && <AskBox />}
    </section>
  );
}
