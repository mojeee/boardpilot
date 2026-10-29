// Validation of a board definition the user imports (the same rules as boards/*.json, scripts/check-boards.mjs).

import type { BoardDef, Result } from './types';
import { checkBoard } from './boardCheck.mjs';
import { t } from './i18n';

/** A board file bigger than this is not a board definition. */
export const MAX_BOARD_BYTES = 600 * 1024;

const bad = (humanMessage: string, hint: string): Result<BoardDef> => ({ ok: false, error: { code: 'bad_board', humanMessage, hint } });

/** Board ids are file names and picker keys: lower-case letters, digits and dashes. */
export function boardIdFrom(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * The board when it passes every rule of scripts/check-boards.mjs, otherwise a plain-language error that
 * names the first problems. The id is cleaned up to a safe file name. Nothing is changed otherwise.
 */
export function validateBoardDef(raw: unknown): Result<BoardDef> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return bad(t('That file is not a board definition.'), t('Pick a board JSON file like the ones in the boards folder of BoardPilot.'));
  let size = 0;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return bad(t('That file is not a board definition.'), t('Pick a board JSON file like the ones in the boards folder of BoardPilot.'));
  }
  if (size > MAX_BOARD_BYTES) return bad(t('That board file is too big.'), t('A board definition is a few hundred kilobytes at most.'));
  const b = raw as Record<string, unknown>;
  const id = typeof b.id === 'string' ? boardIdFrom(b.id) : '';
  if (!id) return bad(t('The board needs an id.'), t('Add "id": "my-board" (letters, digits and dashes) to the file.'));
  const def = { ...b, id };
  let problems: string[];
  try {
    problems = checkBoard(def);
  } catch {
    return bad(t('That file is not a complete board definition.'), t('Start from a file in the boards folder of BoardPilot and change it.'));
  }
  if (problems.length) {
    const shown = problems.slice(0, 3).join('; ');
    return bad(t('The board definition has problems: {problems}', { problems: shown + (problems.length > 3 ? t(' (and {n} more)', { n: problems.length - 3 }) : '') }), t('Fix the file (node scripts/check-boards.mjs lists every problem), then import it again.'));
  }
  return { ok: true, value: def as unknown as BoardDef };
}
