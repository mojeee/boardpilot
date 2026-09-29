// New project (the + on the project tabs): start Blank on a board, let the app Read the board on the
// USB port and what is connected to it, begin from a Template, or describe the project to the
// assistant. Each choice opens the project in a new tab.

import { useState } from 'react';
import { FAMILY_LABEL, PARTS, boardList, getBoard } from '@shared/board';
import { TEMPLATES, templateFits } from '@shared/templates';
import { t } from '@shared/i18n';
import { log, useScene } from '../state/store';
import { useProjects, type NewMode } from '../state/projects';
import { useTemplate } from '../state/templateRun';
import { Icon } from './Icon';
import { ReadFromPort } from './ReadFromPort';
import { DescribeProject } from './DescribeProject';

const LEVEL: Record<string, string> = { 'first steps': 'First steps', easy: 'Easy', medium: 'Medium' };

function BoardSelect({ value, onChange }: { value: string; onChange(id: string): void }) {
  const boards = boardList();
  const families = [...new Set(boards.map((b) => b.family))];
  return (
    <select className="select np-board" value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('Board')}>
      {families.map((f) => (
        <optgroup key={f} label={FAMILY_LABEL[f]}>
          {boards
            .filter((b) => b.family === f)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

function TemplateList({ boardId, onPick }: { boardId: string; onPick(id: string): void }) {
  const board = getBoard(boardId);
  return (
    <div className="np-templates">
      {TEMPLATES.map((tpl) => {
        const why = templateFits(tpl, board);
        return (
          <button key={tpl.id} className="tpl-card" disabled={!!why} onClick={() => onPick(tpl.id)} title={why ?? ''}>
            <b>{t(tpl.name)}</b>
            <span className="small dim">{t(tpl.summary)}</span>
            <span className="tpl-meta mono small">
              {t(LEVEL[tpl.difficulty])} · {t('{n} min', { n: tpl.minutes })} · {tpl.parts.map((p) => PARTS[p.partId]?.name.split(/[ (]/)[0]).join(' + ')}
            </span>
            {why && <span className="small warn-text">{why}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function NewProjectDialog() {
  const open = useProjects((s) => s.newOpen);
  if (!open) return null;
  return <NewProjectBody />;
}

function NewProjectBody() {
  const initial = useProjects((s) => s.newMode);
  const [mode, setMode] = useState<NewMode | null>(initial);
  const [boardId, setBoardId] = useState(useScene.getState().scene.board);
  const p = useProjects.getState();
  const close = () => p.closeNew();

  const blank = () => {
    p.add({ board: boardId, parts: [], wires: [] }, t('Untitled'));
    log('info', t('New empty project on {board}. Add parts from the Parts button, or ask the assistant.', { board: getBoard(boardId).name }));
    close();
  };

  const template = (id: string) => {
    const tpl = TEMPLATES.find((x) => x.id === id);
    if (!tpl) return;
    p.add({ board: boardId, parts: [], wires: [] }, t(tpl.name));
    useTemplate.getState().open(id);
    close();
  };

  const card = (m: NewMode, icon: string, title: string, text: string) => (
    <button className={`np-card ${mode === m ? 'on' : ''}`} onClick={() => (m === 'blank' ? blank() : setMode(m))} aria-pressed={mode === m}>
      <Icon name={icon} size={20} />
      <b>{title}</b>
      <span>{text}</span>
    </button>
  );

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal np-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('New project')}>
        <div className="row between">
          <h2>{t('New project')}</h2>
          <button className="close" onClick={close} aria-label={t('Close')}>
            ×
          </button>
        </div>
        <p>{t('Start empty, let BoardPilot read the board on your USB port, or begin from a template.')}</p>
        {mode !== 'port' && (
          <div className="row gap np-board-row">
            <span className="small dim">{t('Board')}</span>
            <BoardSelect value={boardId} onChange={setBoardId} />
          </div>
        )}
        <div className="np-cards">
          {card('blank', 'plus', t('Blank'), t('Pick a board and add parts yourself, or describe the project to the assistant.'))}
          {card('port', 'connect', t('Read from port'), t('Plug in your board. BoardPilot finds it, identifies the chip and looks for what is connected.'))}
          {card('template', 'project', t('Template'), t('{n} ready projects that build themselves on your board: blink, weather station, plant watering…', { n: TEMPLATES.length }))}
        </div>
        {mode !== 'port' && <DescribeProject boardId={boardId} onDone={close} />}
        {mode === 'template' && <TemplateList boardId={boardId} onPick={template} />}
        {mode === 'port' && <ReadFromPort onDone={close} onPickBoard={() => setMode(null)} />}
      </div>
    </div>
  );
}
