// "Add a part from a link": fetch the page (or PDF datasheet), then let the AI draft a part
// definition, or fall back to keyword rules. The draft always goes to the part editor for the
// user to check; nothing is saved automatically.

import type { PartDef, Result } from '@shared/types';
import { guessPartFromText } from '@shared/partHeuristics';
import { validatePartDef } from '@shared/partSchema';
import type { Assistant } from '../ai/assistant';

const MAX_BYTES = 8 * 1024 * 1024;

export interface ImportResult {
  draft: PartDef;
  notes: string[];
  usedAi: boolean;
  pageTitle: string;
}

const fail = (code: string, humanMessage: string, hint: string): Result<never> => ({ ok: false, error: { code, humanMessage, hint } });

export function htmlToText(html: string): { title: string; text: string } {
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const desc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ?? '';
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return { title: decodeTitle(title), text: `${desc}\n${text}` };
}

function decodeTitle(t: string) {
  return t.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

export async function importPartFromUrl(url: string, ai: Assistant): Promise<Result<ImportResult>> {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return fail('bad_url', 'That does not look like a web link.', 'Paste a full link starting with https://');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return fail('bad_url', 'Only web links (http or https) can be imported.', 'Paste a product page or datasheet link.');

  let res: Response;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    res = await fetch(u, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 BoardPilot part importer', Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.5' } });
  } catch {
    clearTimeout(timer);
    return fail('fetch_failed', 'The page could not be loaded.', 'Check the link and your internet connection, or add the part by hand.');
  }
  clearTimeout(timer);
  if (!res.ok) return fail('fetch_failed', `The site answered with an error (${res.status}).`, 'Some shops block apps. Try the datasheet PDF link, or add the part by hand.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return fail('too_big', 'The file is too large to import (over 8 MB).', 'Use the product page instead of a big PDF.');
  const type = res.headers.get('content-type') ?? '';
  const isPdf = type.includes('pdf') || buf.subarray(0, 5).toString() === '%PDF-';

  let title = u.hostname;
  let text = '';
  if (!isPdf) {
    const t = htmlToText(buf.toString('utf8'));
    title = t.title || title;
    text = t.text.slice(0, 40000);
  }

  if (ai.enabled) {
    const r = await ai.extractPart({ url: u.toString(), title, text, pdfBase64: isPdf ? buf.toString('base64') : undefined });
    if (r.ok) {
      const v = validatePartDef({ ...r.value.part, origin: { url: u.toString(), importedAt: new Date().toISOString(), method: 'ai' } });
      if (v.ok) return { ok: true, value: { draft: v.value, notes: r.value.notes, usedAi: true, pageTitle: title } };
    }
    // fall through to the keyword rules if the AI failed
  }
  if (isPdf) {
    return fail('pdf_needs_ai', 'Reading a PDF datasheet needs the AI assistant.', 'Add ANTHROPIC_API_KEY to .env.local, or use the product page link, or add the part by hand.');
  }
  const g = guessPartFromText(title, text, u.toString());
  const v = validatePartDef(g.draft);
  if (!v.ok) return v;
  return { ok: true, value: { draft: v.value, notes: g.notes, usedAi: false, pageTitle: title } };
}
