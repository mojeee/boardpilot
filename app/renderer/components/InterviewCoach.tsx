// Interview coach (Learn screen): a "Practise" button next to each interview question. The user
// types an answer, the assistant grades it (always labelled as a suggestion, citing the lesson
// section it relies on). If the assistant is unavailable, the lesson's own key points are shown
// instead. Past attempts are kept only on this computer (90 days) and can be deleted.

import { useCallback, useEffect, useId, useState } from 'react';
import type { Lesson } from '@shared/lessons';
import type { AppError } from '@shared/types';
import { COACH_MAX_ANSWER, COACH_RETENTION_DAYS, keyPointsFor, lineText, type CoachAttempt, type CoachFeedback } from '@shared/coach';
import { getLanguage, t } from '@shared/i18n';
import { Icon } from './Icon';
import '../styles/coach.css';

export function InterviewCoach({ lesson, question }: { lesson: Lesson; question: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`btn small ai coach-open ${open ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="ai" size={13} /> {open ? t('Close practice') : t('Practise')}
      </button>
      {open && <CoachPanel lesson={lesson} question={question} />}
    </>
  );
}

const locale = () => (getLanguage() === 'it' ? 'it-IT' : undefined);
const formatDate = (at: number) => new Date(at).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });

/** Section "s1" is the text before the first heading; its title is the lesson title. */
const sectionLabel = (s: { id: string; title: string }) => (s.id === 's1' ? t('Introduction') : t(s.title));

function CoachPanel({ lesson, question }: { lesson: Lesson; question: string }) {
  const inputId = useId();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState<{ attempt: CoachAttempt; saved: boolean } | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [attempts, setAttempts] = useState<CoachAttempt[]>([]);
  const [total, setTotal] = useState(0);
  const [historyError, setHistoryError] = useState<AppError | null>(null);
  const [confirm, setConfirm] = useState<'one' | 'all' | null>(null);

  const loadHistory = useCallback(async () => {
    const r = await window.bp.coach.history(lesson.id, question);
    if (r.ok) {
      setAttempts(r.value.attempts);
      setTotal(r.value.total);
      setHistoryError(null);
    } else setHistoryError(r.error);
  }, [lesson.id, question]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const grade = async () => {
    if (busy || !answer.trim()) return;
    setBusy(true);
    setError(null);
    setLatest(null);
    const r = await window.bp.coach.ask(lesson.id, question, answer);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setLatest(r.value);
    void loadHistory();
  };

  const remove = async (which: 'one' | 'all') => {
    setConfirm(null);
    const r = which === 'one' ? await window.bp.coach.remove(lesson.id, question) : await window.bp.coach.removeAll();
    if (!r.ok) setHistoryError(r.error);
    setLatest(null);
    void loadHistory();
  };

  return (
    <div className="coach">
      <p className="small muted">
        {t('Type your answer as you would say it in an interview. The assistant tells you what was right, what is missing and what a senior interviewer would ask next.')}
      </p>
      <label className="label" htmlFor={inputId}>
        {t('Your answer')}
      </label>
      <textarea
        id={inputId}
        rows={5}
        maxLength={COACH_MAX_ANSWER}
        value={answer}
        placeholder={t('Explain it in your own words…')}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void grade();
        }}
      />
      <div className="coach-hint small dim">
        <span>{t('To dictate, use your computer’s own dictation: on a Mac press Fn twice (or the microphone key), on Windows press Win+H.')}</span>
        <span className="mono">
          {answer.length}/{COACH_MAX_ANSWER}
        </span>
      </div>
      <div className="coach-actions">
        <button className="btn ai" disabled={busy || !answer.trim()} onClick={() => void grade()}>
          <Icon name="ai" size={14} /> {busy ? t('Checking your answer…') : t('Check my answer')}
        </button>
        <button className="btn ghost" onClick={() => setShowKeys(!showKeys)}>
          {showKeys ? t('Hide the key points') : t('Show the lesson’s key points')}
        </button>
      </div>

      {error && (
        <div className="coach-error" role="alert">
          <b>{error.humanMessage}</b>
          {error.hint && <span>{error.hint}</span>}
          <span className="dim">{t('Meanwhile, compare your answer with the lesson’s key points below.')}</span>
        </div>
      )}

      {latest && (
        <>
          <Feedback lesson={lesson} feedback={latest.attempt.feedback} />
          {!latest.saved && <p className="small warn-text">{t('This answer could not be saved on this computer, so it will not appear in your past answers.')}</p>}
        </>
      )}

      {(showKeys || error) && <KeyPoints lesson={lesson} question={question} />}

      <section className="coach-history">
        <div className="coach-history-head">
          <h4>{t('Your past answers ({n})', { n: attempts.length })}</h4>
          {attempts.length > 0 && confirm === null && (
            <button className="btn small danger" onClick={() => setConfirm('one')}>
              <Icon name="trash" size={12} /> {t('Delete my answers')}
            </button>
          )}
        </div>
        <p className="small dim">{t('Saved only on this computer. Answers older than {days} days are deleted automatically.', { days: COACH_RETENTION_DAYS })}</p>
        {historyError && <p className="small err-text">{historyError.humanMessage} {historyError.hint}</p>}
        {attempts.length === 0 ? (
          <p className="small dim">{t('No saved answers for this question yet.')}</p>
        ) : (
          <ol className="coach-attempts">
            {attempts.map((a) => (
              <li key={a.id}>
                <details>
                  <summary>
                    <span className="mono">{formatDate(a.at)}</span>
                    <span className="coach-score ok">{t('Right: {n}', { n: a.feedback.right.length })}</span>
                    <span className="coach-score warn">{t('Missing: {n}', { n: a.feedback.missing.length })}</span>
                  </summary>
                  <p className="coach-answer pre">{a.answer}</p>
                  <Feedback lesson={lesson} feedback={a.feedback} />
                </details>
              </li>
            ))}
          </ol>
        )}
        {confirm !== null ? (
          <div className="coach-confirm" role="alertdialog">
            <span>
              {confirm === 'one'
                ? t('Delete your {n} saved answers to this question? This cannot be undone.', { n: attempts.length })
                : t('Delete all {n} saved answers, for every question? This cannot be undone.', { n: total })}
            </span>
            <button className="btn small danger" onClick={() => void remove(confirm)}>
              {t('Delete')}
            </button>
            <button className="btn small ghost" onClick={() => setConfirm(null)}>
              {t('Keep them')}
            </button>
          </div>
        ) : (
          total > 0 && (
            <button className="btn small ghost coach-delete-all" onClick={() => setConfirm('all')}>
              {t('Delete all my saved answers ({n})', { n: total })}
            </button>
          )
        )}
      </section>
    </div>
  );
}

function Feedback({ lesson, feedback }: { lesson: Lesson; feedback: CoachFeedback }) {
  return (
    <div className="coach-feedback">
      <div className="coach-feedback-head">
        <span className={`conf conf-${feedback.confidence}`}>{t('Suggestion')}</span>
        <span className="small dim">{t('Feedback from the assistant. Check it against the lesson before you rely on it.')}</span>
      </div>
      <h4>{t('What was right')}</h4>
      {feedback.right.length ? (
        <ul>
          {feedback.right.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="small dim">{t('The assistant found nothing right yet. Look at the key points and try again.')}</p>
      )}
      <h4>{t('What is missing')}</h4>
      {feedback.missing.length ? (
        <ul>
          {feedback.missing.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="small dim">{t('The assistant found nothing important missing.')}</p>
      )}
      {feedback.followUp && (
        <>
          <h4>{t('A senior interviewer might ask next')}</h4>
          <p className="coach-followup">{feedback.followUp}</p>
        </>
      )}
      <div className="coach-sources small">
        <span className="label">{t('Source')}</span>
        {feedback.sections.length ? (
          feedback.sections.map((s) => (
            <span key={s.id} className="chip">
              {t('Lesson “{lesson}”, section “{section}”', { lesson: t(lesson.title), section: sectionLabel(s) })}
            </span>
          ))
        ) : (
          <span className="warn-text">{t('The assistant did not name a lesson section. Compare the feedback with the lesson yourself.')}</span>
        )}
      </div>
    </div>
  );
}

function KeyPoints({ lesson, question }: { lesson: Lesson; question: string }) {
  const sections = keyPointsFor(lesson, question);
  return (
    <div className="coach-keys">
      <h4>{t('Key points from the lesson')}</h4>
      <p className="small dim">{t('The parts of this lesson closest to the question. A good answer covers them in your own words.')}</p>
      {sections.map((s) => (
        <div key={s.id} className="coach-key">
          <b>{sectionLabel(s)}</b>
          <ul>
            {s.lines.map((l, i) => (
              <li key={i}>{lineText(l, (x) => t(x))}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
