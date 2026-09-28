// The assistant: plain-language answers with a confidence label and the source of every claim.

import { useEffect, useRef, useState } from 'react';
import type { AiReply } from '@shared/types';
import { getBoard, targetLabel } from '@shared/board';
import { useAi, useApp, useScene } from '../state/store';
import { askAi } from './ai';
import { Icon } from './Icon';

const CONF_TEXT = { measured: 'Measured', documented: 'From documentation', suggestion: 'Suggestion' };

export function ReplyView({ reply }: { reply: AiReply }) {
  const scene = useScene((s) => s.scene);
  return (
    <div className="ai-reply">
      <div className="row gap">
        <span className={`conf conf-${reply.confidence}`}>{CONF_TEXT[reply.confidence]}</span>
      </div>
      <div className="ai-text">{reply.message}</div>
      {reply.highlight.length > 0 && (
        <div className="chips">
          {reply.highlight.map((t) => (
            <button key={t} className="chip link mono" onClick={() => useScene.getState().focusOn([t])}>
              {targetLabel(getBoard(), scene, t)}
            </button>
          ))}
        </div>
      )}
      {reply.sources.length > 0 && (
        <div className="ai-sources">
          {reply.sources.map((s, i) => (
            <div key={i} className={`src-line src-${s.kind}`}>
              <span>{s.kind}</span> {s.label}
            </div>
          ))}
        </div>
      )}
      {(reply.toolCalls?.length ?? 0) > 0 && (
        <details className="ai-tools">
          <summary>{reply.toolCalls!.length} tool call{reply.toolCalls!.length > 1 ? 's' : ''}</summary>
          {reply.toolCalls!.map((c, i) => (
            <div key={i} className="mono small">
              {c.ok ? '✓' : '✗'} {c.name} {JSON.stringify(c.input)}
            </div>
          ))}
        </details>
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

export function AskBox({ placeholder = 'Ask about your board…', autoFocus }: { placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const busy = useAi((s) => s.busy);
  const enabled = useApp((s) => s.ai.enabled);
  const send = () => {
    const t = q.trim();
    if (!t) return;
    setQ('');
    void askAi(t);
  };
  return (
    <div className="ask-box">
      <textarea
        value={q}
        rows={2}
        placeholder={enabled ? placeholder : 'AI is off: add ANTHROPIC_API_KEY to .env.local'}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button className="btn icon ai" disabled={busy || !q.trim()} onClick={send} aria-label="Ask">
        <Icon name="send" size={16} />
      </button>
    </div>
  );
}

export function AssistantPanel({ title = 'Assistant', hideInput }: { title?: string; hideInput?: boolean }) {
  const items = useAi((s) => s.items);
  const busy = useAi((s) => s.busy);
  const ai = useApp((s) => s.ai);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [items.length, busy]);

  return (
    <section className="assistant">
      <header>
        <span className="panel-title ai-title">
          <Icon name="ai" size={16} /> {title}
        </span>
        <span className="dim small mono">{ai.enabled ? ai.model : 'off'}</span>
      </header>
      <div className="ai-list" ref={list}>
        {items.length === 0 && (
          <div className="ai-empty">
            {ai.enabled
              ? 'Ask anything about your board, wiring or code. I only state measurements I actually took, and show where every fact comes from.'
              : 'The assistant is off because no API key is set. Add ANTHROPIC_API_KEY=… to .env.local in the project folder and restart. Every check and measurement works without it.'}
          </div>
        )}
        {items.map((it) =>
          it.role === 'user' ? (
            <div key={it.id} className="ai-user">
              {it.text}
            </div>
          ) : it.role === 'assistant' ? (
            <ReplyView key={it.id} reply={it.reply} />
          ) : (
            <div key={it.id} className="ai-error">
              {it.text} <span className="dim">{it.hint}</span>
            </div>
          ),
        )}
        {busy && <div className="ai-thinking">Checking…</div>}
      </div>
      {!hideInput && <AskBox />}
    </section>
  );
}
