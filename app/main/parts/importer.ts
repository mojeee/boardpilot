// "Add a part from a link": fetch the page (or PDF datasheet), then let the AI draft a part
// definition, or fall back to keyword rules. The draft always goes to the part editor for the
// user to check; nothing is saved automatically.

import type { PartDef, Result } from '@shared/types';
import { extractDimensionsMm, findLibraryMatch, guessPartFromText } from '@shared/partHeuristics';
import { BUILTIN_PART_IDS, PARTS } from '@shared/board';
import { validatePartDef } from '@shared/partSchema';
import { t } from '@shared/i18n';
import type { Assistant } from '../ai/assistant';

const MAX_BYTES = 8 * 1024 * 1024;

export interface ImportResult {
  draft: PartDef;
  notes: string[];
  usedAi: boolean;
  /** Where the pins came from: the AI, a built-in library part, or keyword rules. */
  basis: 'ai' | 'library' | 'keywords';
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

/** Product photo URL from Open Graph / Twitter meta tags or schema.org Product JSON. */
export function productImageUrl(html: string, base: URL): string | null {
  const m =
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html) ??
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
    /"image"\s*:\s*"(https?:[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i.exec(html);
  if (!m) return null;
  try {
    const u = new URL(m[1].replace(/&amp;/g, '&'), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function decodeTitle(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

export async function importPartFromUrl(url: string, ai: Assistant): Promise<Result<ImportResult>> {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return fail('bad_url', t('That does not look like a web link.'), t('Paste a full link starting with https://'));
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return fail('bad_url', t('Only web links (http or https) can be imported.'), t('Paste a product page or datasheet link.'));

  let res: Response;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    res = await fetch(u, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 BoardPilot part importer', Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.5' } });
  } catch {
    clearTimeout(timer);
    return fail('fetch_failed', t('The page could not be loaded.'), t('Check the link and your internet connection, or add the part by hand.'));
  }
  clearTimeout(timer);
  if (!res.ok) return fail('fetch_failed', t('The site answered with an error ({status}).', { status: res.status }), t('Some shops block apps. Try the datasheet PDF link, or add the part by hand.'));
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return fail('too_big', t('The file is too large to import (over 8 MB).'), t('Use the product page instead of a big PDF.'));
  const type = res.headers.get('content-type') ?? '';
  const isPdf = type.includes('pdf') || buf.subarray(0, 5).toString() === '%PDF-';

  let title = u.hostname;
  let text = '';
  let imageUrl: string | null = null;
  if (!isPdf) {
    const html = buf.toString('utf8');
    const page = htmlToText(html);
    title = page.title || title;
    text = page.text.slice(0, 40000);
    imageUrl = productImageUrl(html, u);
  }

  const builtins = Object.values(PARTS).filter((p) => BUILTIN_PART_IDS.has(p.id));
  const match = isPdf ? null : findLibraryMatch(title, text, builtins);
  const dims = isPdf ? null : extractDimensionsMm(text);
  const origin = (method: 'ai' | 'manual') => ({ url: u.toString(), importedAt: new Date().toISOString(), method });

  let draft: PartDef | null = null;
  let notes: string[] = [];
  let usedAi = false;
  let basis: ImportResult['basis'] = 'keywords';
  if (ai.enabled) {
    const r = await ai.extractPart({ url: u.toString(), title, text, pdfBase64: isPdf ? buf.toString('base64') : undefined });
    if (r.ok) {
      const v = validatePartDef({ ...r.value.part, origin: origin('ai') });
      if (v.ok) {
        draft = v.value;
        notes = r.value.notes;
        usedAi = true;
        basis = 'ai';
        if (match) notes.push(t('The page mentions {chip}; the built-in part “{name}” is similar and can be compared.', { chip: match.token.toUpperCase(), name: match.part.name }));
      }
    }
    // fall through to the library / keyword rules if the AI failed
  }
  if (!draft && isPdf) {
    return fail('pdf_needs_ai', t('Reading a PDF datasheet needs the AI assistant.'), t('Turn on the AI assistant in AI settings (add an API key), or use the product page link, or add the part by hand.'));
  }
  if (!draft && match) {
    // The page is about a chip we already know: start from the library definition (checked data).
    const pageName = title.split(/\s[|–—-]\s|\|/)[0].trim().slice(0, 60) || match.part.name;
    const v = validatePartDef({ ...match.part, id: undefined, name: pageName, origin: origin('manual'), sources: [...match.part.sources, { title: pageName, section: u.toString() }] });
    if (v.ok) {
      draft = v.value;
      basis = 'library';
      notes = [
        t('The page is about {chip}. Pins, bus and addresses come from the built-in part “{name}”.', { chip: match.token.toUpperCase(), name: match.part.name }),
        t('Boards from different shops can order their pins differently: compare with the labels on your board.'),
      ];
    }
  }
  if (!draft) {
    const g = guessPartFromText(title, text, u.toString());
    const v = validatePartDef(g.draft);
    if (!v.ok) return v;
    draft = v.value;
    notes = g.notes;
  }

  // 3D model: real size from the page, color and thumbnail from the product photo.
  if (dims && dims.length >= 2) {
    const size: [number, number, number] = [Math.max(dims[0], dims[1]), Math.min(dims[0], dims[1]), dims[2] ?? draft.model.size[2]];
    const v = validatePartDef({ ...draft, model: { ...draft.model, size } });
    if (v.ok) {
      draft = v.value;
      notes.push(t('3D size taken from the page: {size} mm.', { size: dims.join(' × ') }));
    }
  }
  if (imageUrl) {
    const { fetchProductImage } = await import('./productImage');
    const img = await fetchProductImage(imageUrl);
    if (img) {
      const v = validatePartDef({ ...draft, image: img.thumb, model: { ...draft.model, color: img.color ?? draft.model.color } });
      if (v.ok) {
        draft = v.value;
        if (img.color) notes.push(t('3D board color measured from the product photo.'));
      }
    }
  }
  return { ok: true, value: { draft, notes, usedAi, basis, pageTitle: title } };
}
