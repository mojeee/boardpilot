// The Italian texts the website calculators need. The app's dictionary (shared/i18n) holds every
// screen of the app, far too much for a small page script, so vite.tools.config.ts swaps
// shared/i18n for a tiny module with only these entries: every t('…') literal in the files the
// bundle uses, plus the boards' clock notes. Same t() behaviour, same Italian texts as the app.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Files whose t('…') literals end up in the bundle. */
export const TOOLS_I18N_SOURCES = ['shared/clocks.ts', 'scripts/site/tools-client/main.ts', 'scripts/site/tools-client/calc.ts'];

// Same pattern as tests/i18n.test.ts.
const LITERAL = /\bt\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*[,)]/g;

export function toolsI18nKeys(root) {
  const keys = new Set();
  for (const f of TOOLS_I18N_SOURCES) {
    const src = readFileSync(join(root, f), 'utf8');
    for (const m of src.matchAll(LITERAL)) {
      if (m[1] === '`' && m[2].includes('${')) continue;
      keys.add(m[2].replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n'));
    }
  }
  for (const f of readdirSync(join(root, 'boards')).filter((x) => x.endsWith('.json'))) {
    const note = JSON.parse(readFileSync(join(root, 'boards', f), 'utf8')).clocks?.note;
    if (note) keys.add(note);
  }
  return [...keys].sort();
}

/** The subset of the Italian dictionary for the bundle (keys without a translation stay English). */
export function toolsItDict(root, IT) {
  return Object.fromEntries(toolsI18nKeys(root).filter((k) => k in IT).map((k) => [k, IT[k]]));
}

/** Source of the module that replaces shared/i18n in the bundle: the same API the calculators use. */
export function toolsI18nModule(dict) {
  return `const IT = ${JSON.stringify(dict)};
let current = 'en';
export function setLanguage(l) { current = l === 'it' ? 'it' : 'en'; }
export const getLanguage = () => current;
export function t(text, vars) {
  let s = current === 'it' ? IT[text] ?? text : text;
  if (vars) s = s.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}
`;
}
