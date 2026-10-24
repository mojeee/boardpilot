// What the assistant's project builder shows in the chat: option cards that say what makes each
// choice different, and a project proposal (parts, wiring, checks, extras) with one Apply button.
// Applying replaces the drawing with the proposal and is undoable; nothing is written to the board.

import type { AiChoice, TargetRef } from '@shared/types';
import type { ProjectProposal } from '@shared/projectBuilder';
import { PARTS, getBoard } from '@shared/board';
import { generateSketch } from '@shared/sketch';
import { t } from '@shared/i18n';
import { log, useScene } from '../state/store';
import { useProjects } from '../state/projects';
import { useLayout } from '../state/layout';
import { sketchFileName } from '../state/buildProject';

/**
 * Apply a proposal. A new project replaces an empty drawing (Cmd+Z undoes it) or opens in a new
 * project tab, so the user's work is never overwritten. Its starter code goes in the Code panel; a
 * project that already has code keeps it (the assistant can then suggest code for the new parts).
 * Returns where it went.
 */
export function applyProposal(p: ProjectProposal): 'here' | 'tab' {
  const current = useScene.getState().scene;
  const isNew = p.parts.every((x) => x.added);
  const board = getBoard(p.board);
  const sketch = (!isNew && current.sketch?.text.trim() ? current.sketch : null) ?? { name: sketchFileName(p.title), text: generateSketch(p.scene, board, PARTS) };
  const scene = { ...p.scene, sketch };
  const where = isNew && current.parts.length > 0 ? 'tab' : 'here';
  if (where === 'tab') useProjects.getState().add(scene, p.title);
  else useScene.getState().openScene(scene, true);
  log('action', t('Applied the assistant’s project “{title}”: {parts} parts, {wires} wires on the {board}. Undo brings the previous drawing back.', { title: p.title, parts: p.scene.parts.length, wires: p.scene.wires.length, board: p.boardName }), {
    source: 'assistant proposal, checked by the wiring rules',
  });
  for (const f of p.findings.filter((x) => x.severity !== 'info')) log('warning', `${f.message} ${f.hint}`.trim(), { target: f.targets[0], source: f.source ?? 'wiring rules' });
  return where;
}

/** Show the project's code (the starter code after Apply) in the Code panel. */
export const openCode = () => useLayout.getState().showBottom('code');

export function ChoiceCards({ choices, onPick, picked, locked }: { choices: AiChoice[]; onPick: (c: AiChoice) => void; picked?: string | null; locked?: boolean }) {
  return (
    <div className="ai-choices" role="group" aria-label={t('Options')}>
      {choices.map((c) => (
        <button
          key={c.label}
          className={`ai-choice${picked === c.label ? ' on' : ''}`}
          disabled={locked}
          data-choice={c.label}
          onClick={() => onPick(c)}
        >
          <b>{c.label}</b>
          <span>{c.detail}</span>
          {c.partId && PARTS[c.partId] && <span className="mono dim small">{PARTS[c.partId].name}</span>}
        </button>
      ))}
    </div>
  );
}

export function ProposalCard({ proposal: p, applied, onApply }: { proposal: ProjectProposal; applied: false | 'here' | 'tab'; onApply: () => void }) {
  const errors = p.findings.filter((f) => f.severity === 'error');
  const warnings = p.findings.filter((f) => f.severity === 'warning');
  const focus = (targets: TargetRef[]) => useScene.getState().focusOn(targets);

  return (
    <div className="proposal" data-proposal={p.title}>
      <div className="proposal-head">
        <div>
          <div className="proposal-title">{p.title}</div>
          <div className="small dim">{p.boardName}</div>
        </div>
        <span className={`chip ${errors.length ? 'sev-error' : warnings.length ? 'sev-warning' : 'ok'}`}>
          {errors.length ? t('{n} problem(s)', { n: errors.length }) : warnings.length ? t('{n} warning(s)', { n: warnings.length }) : t('Checks passed')}
        </span>
      </div>
      {p.summary && <p className="small">{p.summary}</p>}

      <div className="label">{t('Parts')}</div>
      <ul className="proposal-parts">
        {p.parts.map((x) => (
          <li key={x.id}>
            <button className="link" onClick={() => applied && focus([`part:${x.id}`])}>
              {x.label}
            </button>{' '}
            <span className="dim small">{x.name}</span>
            {x.why && <div className="small">{x.why}</div>}
          </li>
        ))}
      </ul>

      <details className="proposal-wiring" open={p.wiring.length <= 12}>
        <summary className="label">{t('Wiring ({n} wires)', { n: p.wiring.length })}</summary>
        <table className="mono small">
          <tbody>
            {p.wiring.map((r) => (
              <tr key={`${r.part}.${r.pin}`} onClick={() => applied && focus(r.boardPin ? [`pin:${r.boardPin}`, `part:${r.part}`] : [`part:${r.part}`])}>
                <td>
                  <span className="dot" style={{ background: r.color }} />
                  {r.partLabel} {r.pin}
                </td>
                <td>→</td>
                <td>
                  {r.boardLabel}
                  {r.gpio !== null && r.boardLabel !== `GPIO${r.gpio}` && <span className="dim"> GPIO{r.gpio}</span>}
                </td>
                <td className="dim">{r.auto ? t('safe pin') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="findings">
          {[...errors, ...warnings].map((f) => (
            <button key={f.id} className={`finding sev-${f.severity}`} onClick={() => applied && focus(f.targets)}>
              <b>{f.message}</b>
              <span>{f.hint}</span>
            </button>
          ))}
        </div>
      )}
      {p.unwired.length > 0 && <p className="small warn-text">{t('Not wired yet: {pins}', { pins: p.unwired.join(', ') })}</p>}
      {p.extras.length > 0 && (
        <>
          <div className="label">{t('Also buy')}</div>
          <ul className="small">
            {p.extras.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </>
      )}
      {p.notes.length > 0 && (
        <ul className="small dim">
          {p.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <div className="row gap wrap">
        {applied ? (
          <>
            <span className="ok-text small">✓ {applied === 'tab' ? t('Opened as a new project') : t('Applied to your project')}</span>
            {applied === 'here' && (
              <button className="btn small ghost" onClick={() => useScene.getState().undo()}>
                {t('Undo')}
              </button>
            )}
            <button className="btn small" onClick={openCode} data-action="code">
              {t('Open the code')}
            </button>
          </>
        ) : (
          <button className="btn primary small" onClick={onApply} data-action="apply">
            {t('Apply to my project')}
          </button>
        )}
      </div>
      <p className="small dim">{t('A suggestion built from the parts library and the board file, checked by the wiring rules. Check it against your real parts before you wire.')}</p>
    </div>
  );
}
