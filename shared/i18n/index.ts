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

export type Lang = 'en' | 'it';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'it', label: 'Italiano' },
];

export const IT: Record<string, string> = { ...common, ...app, ...three, ...wizard, ...flows, ...main, ...parts, ...settings };

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
