// The interview coach calls behind window.bp.coach, shared by the IPC handlers (desktop app) and
// the browser demo (app/web/bpWeb.ts): checks the lesson and question, grades through the
// assistant and keeps the attempts in a CoachStore.

import { randomUUID } from 'node:crypto';
import type { BoardPilotApi } from '@shared/api';
import type { Result } from '@shared/types';
import { t } from '@shared/i18n';
import { LESSONS, type Lesson } from '@shared/lessons';
import { COACH_MAX_ANSWER, type CoachAttempt, type CoachFeedback } from '@shared/coach';
import type { CoachStore } from './coachStore';

export interface CoachGrader {
  coach(lesson: Lesson, question: string, answer: string): Promise<Result<CoachFeedback>>;
}

export function makeCoachApi(ai: CoachGrader, coach: CoachStore): BoardPilotApi['coach'] {
  const coachLesson = (lessonId: unknown, question: unknown): Lesson | null => {
    const lesson = LESSONS.find((l) => l.id === lessonId);
    return lesson && typeof question === 'string' && lesson.interview.includes(question) ? lesson : null;
  };
  const noQuestion = <T>(): Result<T> => ({ ok: false, error: { code: 'coach_unknown', humanMessage: t('This interview question was not found.'), hint: t('Open the lesson again and pick the question.') } });
  const saveFailed = <T>(): Result<T> => ({
    ok: false,
    error: { code: 'coach_storage', humanMessage: t('Your saved answers could not be read or changed.'), hint: t('Check that the app data folder is not full or read-only, then try again.') },
  });

  return {
    async ask(lessonId, question, answer) {
      const lesson = coachLesson(lessonId, question);
      if (!lesson) return noQuestion();
      const text = typeof answer === 'string' ? answer.trim().slice(0, COACH_MAX_ANSWER) : '';
      if (!text) return { ok: false, error: { code: 'coach_empty', humanMessage: t('Write your answer first.'), hint: t('A few sentences are enough.') } };
      const r = await ai.coach(lesson, question, text);
      if (!r.ok) return r;
      const attempt: CoachAttempt = { id: randomUUID(), lessonId: lesson.id, question, answer: text, at: Date.now(), feedback: r.value };
      let saved = true;
      try {
        await coach.add(attempt);
      } catch {
        saved = false; // the grade is still shown; the renderer says it was not saved
      }
      return { ok: true, value: { attempt, saved } };
    },
    async history(lessonId, question) {
      if (!coachLesson(lessonId, question)) return noQuestion();
      try {
        return { ok: true, value: { attempts: await coach.list(lessonId, question), total: await coach.count() } };
      } catch {
        return saveFailed();
      }
    },
    async remove(lessonId, question) {
      if (!coachLesson(lessonId, question)) return noQuestion();
      try {
        await coach.removeQuestion(lessonId, question);
        return { ok: true, value: true };
      } catch {
        return saveFailed();
      }
    },
    async removeAll() {
      try {
        await coach.removeAll();
        return { ok: true, value: true };
      } catch {
        return saveFailed();
      }
    },
  };
}
