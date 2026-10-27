// New project → "Or describe it": the user writes what they want to build. With the AI on, a new
// project opens on the chosen board and the description goes to the assistant, which builds the
// project with the user in the chat (questions, part cards, a proposal checked by the wiring rules,
// Apply). Without it, the words are matched against the parts library and the templates. Either way
// nothing is built until the user confirms.

import { useState } from 'react';
import { PARTS, getBoard } from '@shared/board';
import { partsFromDescription, templateFromDescription } from '@shared/describe';
import { TEMPLATES, templateFits, type TemplateDef } from '@shared/templates';
import type { AiSource } from '@shared/types';
import { t } from '@shared/i18n';
import { log, useApp } from '../state/store';
import { askAi } from './ai';
import { useProjects } from '../state/projects';
import { useTemplate } from '../state/templateRun';
import { useLayout } from '../state/layout';
import { projectFromParts, sketchFileName } from '../state/buildProject';
import { SimilarProjects } from './SimilarProjects';

interface Proposal {
  name: string;
  summary: string;
  parts: { partId: string; why: string; on: boolean }[];
  sources: AiSource[];
  template: TemplateDef | null;
}

export function DescribeProject({ boardId, onDone }: { boardId: string; onDone(): void }) {
  const aiOn = useApp((s) => s.ai.enabled);
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const board = getBoard(boardId);

  const fromRules = (): Proposal => {
    const matches = partsFromDescription(text, PARTS);
    const tpl = templateFromDescription(text, TEMPLATES, PARTS);
    return {
      name: tpl ? t(tpl.name) : t('New project'),
      summary: matches.length ? t('Parts named in your description, from the parts library.') : t('No part of the library matched your words. Try naming the parts, or turn on the assistant.'),
      parts: matches.map((m) => ({ partId: m.partId, why: t('you wrote “{word}”', { word: m.matched }), on: true })),
      sources: matches.map((m) => ({ kind: 'library', label: `parts library · ${m.partId}` })),
      template: tpl && !templateFits(tpl, board) ? tpl : null,
    };
  };

  /** The conversation with the assistant happens in the chat, in a new project on the chosen board. */
  const toChat = () => {
    useProjects.getState().add({ board: boardId, parts: [], wires: [] }, t('New project'));
    useLayout.getState().toggleRight(true);
    useLayout.getState().setRightTab('assistant');
    onDone();
    void askAi(text.trim());
  };

  const suggest = () => {
    if (!text.trim()) return;
    setProposal(null);
    if (aiOn) toChat();
    else setProposal(fromRules());
  };

  const create = () => {
    if (!proposal) return;
    const ids = proposal.parts.filter((p) => p.on).map((p) => p.partId);
    const file = sketchFileName(proposal.name);
    const { scene, notes } = projectFromParts(boardId, ids, file);
    useProjects.getState().add(scene, proposal.name);
    log('action', t('Project “{name}” built from your description: {parts}.', { name: proposal.name, parts: ids.map((id) => PARTS[id]?.name ?? id).join(', ') || t('no parts') }), {
      source: 'parts library keywords (suggestion you confirmed)',
    });
    for (const n of notes) log('action', t('Pin assigned: {note}', { note: n }), { source: 'pin rules (safe pins)' });
    onDone();
  };

  const useTemplateInstead = (tpl: TemplateDef) => {
    useProjects.getState().add({ board: boardId, parts: [], wires: [] }, t(tpl.name));
    useTemplate.getState().open(tpl.id);
    onDone();
  };

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
        <button className="btn ai" disabled={!text.trim()} onClick={suggest}>
          {t('Suggest')}
        </button>
      </div>
      <p className="small dim">
        {aiOn
          ? t('The assistant continues in the chat: it asks what it needs, compares parts with you and proposes the wiring, checked by the wiring rules. Nothing changes until you press Apply.')
          : t('The assistant is off: the parts are matched from the words you use. Everything is shown for you to confirm.')}
      </p>
      {text.trim().length > 8 && <SimilarProjects text={text} onPick={onDone} />}
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
