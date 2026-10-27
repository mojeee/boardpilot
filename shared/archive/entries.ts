// The archive index file and the user's edits on top of the scan.

import type { PartDef } from '../types';
import { BOARDS } from '../board';
import type { ArchiveEdit, ArchiveEntry, ArchiveIndexFile, ArchiveProject } from './types';

export const EMPTY_INDEX: ArchiveIndexFile = { format: 'boardpilot-archive@1', roots: [], projects: [], edits: {} };

/** A stored index, or an empty one when the file is missing or not ours. */
export function parseIndex(raw: unknown): ArchiveIndexFile {
  const f = raw as Partial<ArchiveIndexFile> | null;
  if (!f || f.format !== 'boardpilot-archive@1' || !Array.isArray(f.projects) || !Array.isArray(f.roots)) return { ...EMPTY_INDEX, edits: {} };
  return {
    format: 'boardpilot-archive@1',
    roots: f.roots.filter((r): r is string => typeof r === 'string'),
    projects: f.projects.filter((p): p is ArchiveProject => !!p && typeof (p as ArchiveProject).id === 'string' && typeof (p as ArchiveProject).root === 'string'),
    edits: f.edits && typeof f.edits === 'object' ? f.edits : {},
  };
}

/** Only the fields a user may change, cleaned (length limits, known board ids). */
export function cleanEdit(e: unknown, parts: Record<string, PartDef>): ArchiveEdit {
  const x = (e ?? {}) as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const out: ArchiveEdit = {};
  if (typeof x.notes === 'string') out.notes = x.notes.slice(0, 4000);
  if (Array.isArray(x.tags)) out.tags = x.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()).map((t) => t.trim().slice(0, 40)).slice(0, 20);
  if (s(x.name, 120)?.trim()) out.name = s(x.name, 120)!.trim();
  if (s(x.mcu, 60)?.trim()) out.mcu = s(x.mcu, 60)!.trim();
  if (typeof x.boardId === 'string' && BOARDS[x.boardId]) out.boardId = x.boardId;
  if (Array.isArray(x.addParts))
    out.addParts = x.addParts
      .filter((p): p is { name: string; partId?: string } => !!p && typeof (p as { name?: unknown }).name === 'string')
      .map((p) => ({ name: p.name.slice(0, 80), ...(p.partId && parts[p.partId] ? { partId: p.partId } : {}) }))
      .slice(0, 30);
  return out;
}

/** The scan with the user's corrections applied; corrected values are marked as the user's. */
export function applyEdit(p: ArchiveProject, e: ArchiveEdit | undefined): ArchiveEntry {
  const entry: ArchiveEntry = { ...p, notes: e?.notes ?? '', tags: e?.tags ?? [] };
  if (!e) return entry;
  if (e.name) entry.name = e.name;
  if (e.boardId || e.mcu) {
    const b = e.boardId ? BOARDS[e.boardId] : undefined;
    entry.board = { value: { ...(b ? { boardId: b.id } : {}), mcu: e.mcu ?? b?.chip ?? p.board?.value.mcu ?? '' }, source: 'user' };
  }
  if (e.addParts?.length) {
    const have = new Set(p.parts.map((f) => f.value.partId ?? f.value.name.toLowerCase()));
    entry.parts = [...p.parts, ...e.addParts.filter((x) => !have.has(x.partId ?? x.name.toLowerCase())).map((value) => ({ value, source: 'user' as const }))];
  }
  return entry;
}

export function entriesOf(index: ArchiveIndexFile): ArchiveEntry[] {
  return index.projects.map((p) => applyEdit(p, index.edits[p.id])).sort((a, b) => b.lastModified - a.lastModified);
}
