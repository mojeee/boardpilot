// Tiny i18n: the English text is the key. t('Connect the board first.') returns the Italian text
// when the language is Italian and a translation exists, else the English text.
// Placeholders: t('Found {n} devices', { n: 3 }).

import common from './it/common';
import app from './it/app';
import three from './it/three';
import wizard from './it/wizard';
import flows from './it/flows';
import main from './it/main';
import parts from './it/parts';
import settings from './it/settings';
import partsdata from './it/partsdata';
import partsdata2 from './it/partsdata2';
import partsdata3 from './it/partsdata3';
import partsdata4 from './it/partsdata4';
import partsdata5 from './it/partsdata5';
import boardsUi from './it/boards-ui';
import boardsData from './it/boards-data';
import code from './it/code';
import gotchas from './it/gotchas';
import templates from './it/templates';
import lessons from './it/lessons';
import timing from './it/timing';

export type Lang = 'en' | 'it';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'it', label: 'Italiano' },
];

// lessons first: an existing UI translation with the same English key wins
export const IT: Record<string, string> = { ...lessons, ...common, ...app, ...three, ...wizard, ...flows, ...main, ...parts, ...settings, ...partsdata, ...partsdata2, ...partsdata3, ...partsdata4, ...partsdata5, ...boardsUi, ...boardsData, ...code, ...gotchas, ...templates, ...timing };

let current: Lang = 'en';
const listeners = new Set<(l: Lang) => void>();

export function setLanguage(l: Lang) {
  current = l === 'it' ? 'it' : 'en';
  for (const fn of listeners) fn(current);
}
export const getLanguage = () => current;
export function onLanguage(fn: (l: Lang) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(text: string, vars?: Record<string, string | number>): string {
  let s = current === 'it' ? IT[text] ?? text : text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}
