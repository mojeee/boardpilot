// New project → "Or describe it": the user writes what they want to build. With the AI on, the
// assistant asks a few short questions, then proposes parts and starter code; without it, the words
// are matched against the parts library and the templates. Either way the proposal is a suggestion:
// nothing is built until the user presses "Create the project".

import { useState } from 'react';
import { PARTS, getBoard } from '@shared/board';
import { partsFromDescription, templateFromDescription } from '@shared/describe';
import { TEMPLATES, templateFits, type TemplateDef } from '@shared/templates';
import type { AiSource } from '@shared/types';
import { t } from '@shared/i18n';
import { log, useApp } from '../state/store';
import { useProjects } from '../state/projects';
import { useTemplate } from '../state/templateRun';
import { useCodeUi } from '../state/code';
import { useLayout } from '../state/layout';
import { projectFromParts, sketchFileName } from '../state/buildProject';

interface Proposal {
  name: string;
  summary: string;
  parts: { partId: string; why: string; on: boolean }[];
  code: string;
  notes: string[];
  sources: AiSource[];
  by: 'ai' | 'rules';
  template: TemplateDef | null;
}

export function DescribeProject({ boardId, onDone }: { boardId: string; onDone(): void }) {
  const aiOn = useApp((s) => s.ai.enabled);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [questions, setQuestions] = useState<{ question: string; options: string[] }[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const board = getBoard(boardId);

  const fromRules = (): Proposal => {
    const matches = partsFromDescription(text, PARTS);
    const tpl = templateFromDescription(text, TEMPLATES, PARTS);
    return {
      name: tpl ? t(tpl.name) : t('New project'),
      summary: matches.length ? t('Parts named in your description, from the parts library.') : t('No part of the library matched your words. Try naming the parts, or turn on the assistant.'),
      parts: matches.map((m) => ({ partId: m.partId, why: t('you wrote “{word}”', { word: m.matched }), on: true })),
      code: '',
      notes: [],
      sources: matches.map((m) => ({ kind: 'library', label: `parts library · ${m.partId}` })),
      by: 'rules',
      template: tpl && !templateFits(tpl, board) ? tpl : null,
    };
  };

  const ask = async (withAnswers: { question: string; answer: string }[]) => {
    setBusy(true);
    setNote(null);
    const r = await window.bp.ai.describeProject({ text, boardId, answers: withAnswers });
    setBusy(false);
    if (!r.ok) {
      setNote(`${t(r.error.humanMessage)} ${t(r.error.hint)}`);
      setProposal(fromRules());
      return;
    }
    if (r.value.kind === 'questions') {
      setQuestions(r.value.questions);
      setAnswers({});
      return;
    }
    const v = r.value;
    const tpl = templateFromDescription(text, TEMPLATES, PARTS);
    setQuestions(null);
    setProposal({
      name: v.name,
      summary: v.summary,
      parts: v.parts.map((p) => ({ ...p, on: true })),
      code: v.code,
      notes: v.notes,
      sources: v.sources,
      by: 'ai',
      template: tpl && !templateFits(tpl, board) ? tpl : null,
    });
  };

  const suggest = () => {
    if (!text.trim()) return;
    setProposal(null);
    setQuestions(null);
    if (aiOn) void ask([]);
    else setProposal(fromRules());
  };

  const create = () => {
    if (!proposal) return;
    const ids = proposal.parts.filter((p) => p.on).map((p) => p.partId);
    const file = sketchFileName(proposal.name);
    const { scene, notes } = projectFromParts(boardId, ids, file);
    useProjects.getState().add(scene, proposal.name);
    log('action', t('Project “{name}” built from your description: {parts}.', { name: proposal.name, parts: ids.map((id) => PARTS[id]?.name ?? id).join(', ') || t('no parts') }), {
      source: proposal.by === 'ai' ? 'assistant (suggestion you confirmed)' : 'parts library keywords (suggestion you confirmed)',
    });
    for (const n of notes) log('action', t('Pin assigned: {note}', { note: n }), { source: 'pin rules (safe pins)' });
    for (const n of proposal.notes) log('warning', n, { source: 'assistant (suggestion)' });
    if (proposal.code.trim()) {
      // The assistant's own sketch waits in the Code panel as a suggestion, checked against the wiring.
      useCodeUi.getState().set({
        suggestion: {
          title: t('The assistant’s sketch for this project'),
          afterLine: 0,
          replace: true,
          text: proposal.code,
          explanation: proposal.summary,
          sources: proposal.sources,
          by: 'ai',
        },
      });
      useLayout.getState().showBottom('code');
    }
    onDone();
  };

  const useTemplateInstead = (tpl: TemplateDef) => {
    useProjects.getState().add({ board: boardId, parts: [], wires: [] }, t(tpl.name));
    useTemplate.getState().open(tpl.id);
    onDone();
  };

  const allAnswered = questions?.every((_, i) => answers[i]?.trim());
  return (
    <div className="np-describe">
      <div className="np-describe-title">✦ {t('Or describe it, and the assistant suggests parts, wiring and starter code')}</div>
      <div className="row gap">
        <input
          className="text-in grow"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && suggest()}
          placeholder={t('e.g. a plant waterer: soil sensor, small pump, OLED, runs on USB')}
          aria-label={t('Describe your project')}
        />
        <button className="btn ai" disabled={busy || !text.trim()} onClick={suggest}>
          {busy ? <span className="spinner sm" /> : null} {t('Suggest')}
        </button>
      </div>
      <p className="small dim">
        {aiOn ? t('It asks a few questions first. Everything it suggests is shown for you to confirm.') : t('The assistant is off: the parts are matched from the words you use. Everything is shown for you to confirm.')}
      </p>
      {note && <p className="small warn-text">{note}</p>}
      {questions && (
        <div className="np-questions">
          {questions.map((q, i) => (
            <div key={i} className="np-q">
              <b>{q.question}</b>
              <div className="row gap wrap">
                {q.options.map((o) => (
                  <button key={o} className={`btn small ${answers[i] === o ? 'ai' : 'ghost'}`} onClick={() => setAnswers({ ...answers, [i]: o })}>
                    {o}
                  </button>
                ))}
                <input className="text-in small-in" placeholder={t('or type your answer')} value={q.options.includes(answers[i] ?? '') ? '' : (answers[i] ?? '')} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} />
              </div>
            </div>
          ))}
          <button className="btn small ai" disabled={busy || !allAnswered} onClick={() => void ask(questions.map((q, i) => ({ question: q.question, answer: answers[i] ?? '' })))}>
            {t('Continue')}
          </button>
        </div>
      )}
      {proposal && (
        <div className="np-proposal">
          <div className="row between">
            <b>{proposal.name}</b>
            <span className="conf conf-suggestion">{t('Suggestion')}</span>
          </div>
          {proposal.summary && <p className="small">{proposal.summary}</p>}
          {proposal.parts.map((p, i) => (
            <label key={`${p.partId}${i}`} className="np-part">
              <input type="checkbox" checked={p.on} onChange={(e) => setProposal({ ...proposal, parts: proposal.parts.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) })} />
              <b>{PARTS[p.partId]?.name ?? p.partId}</b> <span className="small dim">{p.why}</span>
            </label>
          ))}
          {proposal.notes.map((n) => (
            <p key={n} className="small warn-text">
              {n}
            </p>
          ))}
          {proposal.sources.length > 0 && <div className="mono small dim">{t('source')}: {proposal.sources.map((s) => s.label).join(' · ')}</div>}
          <div className="row gap wrap">
            <button className="btn small primary" disabled={!proposal.parts.some((p) => p.on)} onClick={create}>
              {t('Create the project')}
            </button>
            {proposal.template && (
              <button className="btn small" onClick={() => useTemplateInstead(proposal.template!)}>
                {t('Use the “{name}” template instead', { name: t(proposal.template.name) })}
              </button>
            )}
          </div>
          <p className="small dim">{t('The safe-pin rules wire the parts; the starter code matches that wiring. You can change anything afterwards.')}</p>
        </div>
      )}
    </div>
  );
}
