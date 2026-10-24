// The assistant: plain-language answers with a confidence label and the source of every claim.

import { useEffect, useRef, useState } from 'react';
import type { AiReply, AiSource } from '@shared/types';
import { getBoard, targetLabel } from '@shared/board';
import { currentBoard, useAi, useApp, useScene } from '../state/store';
import { askAi } from './ai';
import { Icon } from './Icon';
import { t } from '@shared/i18n';
import { openAiSettings } from './AiSettings';
import { ChoiceCards, ProposalCard, applyProposal } from './ProposalCard';
import { ReplayBar } from '../replay/ReplayBar';
import { useReplay } from '../replay/player';

const CONF_TEXT = { measured: 'Measured', documented: 'From documentation', suggestion: 'Suggestion' };
const SRC_KIND: Record<AiSource['kind'], string> = { measurement: 'measurement', datasheet: 'datasheet', library: 'library', user: 'you said' };

export function ReplyView({ reply, id }: { reply: AiReply; id?: number }) {
  const scene = useScene((s) => s.scene);
  const mark = useAi((s) => (id === undefined ? undefined : s.marks[id]));
  const last = useAi((s) => id !== undefined && s.items[s.items.length - 1]?.id === id);
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
      {reply.choices && reply.choices.length > 0 && (
        <ChoiceCards
          choices={reply.choices}
          picked={mark?.picked ?? null}
          locked={!last || !!mark?.picked}
          onPick={(c) => {
            if (id !== undefined) useAi.getState().mark(id, { picked: c.label });
            void askAi(c.label);
          }}
        />
      )}
      {reply.proposal && (
        <ProposalCard
          proposal={reply.proposal}
          applied={!!mark?.applied}
          codeOpen={!!mark?.code}
          onCode={(open) => id !== undefined && useAi.getState().mark(id, { code: open })}
          onApply={() => {
            applyProposal(reply.proposal!);
            if (id !== undefined) useAi.getState().mark(id, { applied: true });
          }}
        />
      )}
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
        placeholder={enabled ? (placeholder ?? t('Ask about your board…')) : t('AI is off: add a key in AI settings')}
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

export function AssistantPanel({ title, hideInput }: { title?: string; hideInput?: boolean }) {
  const items = useAi((s) => s.items);
  const busy = useAi((s) => s.busy);
  const ai = useApp((s) => s.ai);
  const replaying = useReplay((s) => !!s.rec);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [items.length, busy]);

  return (
    <section className="assistant">
      <header>
        <span className="panel-title ai-title">
          <Icon name="ai" size={16} /> {title ?? t('Assistant')}
        </span>
        <button className="link dim small mono" onClick={openAiSettings} title={t('AI settings')}>
          {ai.enabled ? (ai.provider === 'demo' ? t('demo') : ai.model) : t('off')}
        </button>
      </header>
      {replaying ? <ReplayBar /> : ai.enabled && ai.provider === 'demo' && <DemoBanner />}
      <div className="ai-list" ref={list}>
        {items.length === 0 && !replaying && (
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
            <ReplyView key={it.id} id={it.id} reply={it.reply} />
          ) : (
            <div key={it.id} className="ai-error">
              {t(it.text)} <span className="dim">{t(it.hint)}</span>
            </div>
          ),
        )}
        {busy && <div className="ai-thinking">{t('Checking…')}</div>}
      </div>
      {!hideInput && !replaying && <AskBox />}
    </section>
  );
}
