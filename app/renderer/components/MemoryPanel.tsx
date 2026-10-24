// Project memory panel (Project tools): the user's old projects, notes and datasheets, kept on
// this computer. Create a memory, add a code folder, a PDF or a note, attach it to the project so
// the assistant searches it, try a search, share it as one file. The main process does the reading.

import { useCallback, useEffect, useState } from 'react';
import type { MemoryHit, MemoryInfo, MemorySource } from '@shared/memory';
import { attachMemory, detachMemory } from '@shared/memory';
import type { AppError } from '@shared/types';
import { t } from '@shared/i18n';
import { log, useScene } from '../state/store';
import '../styles/memory.css';

const say = (e: AppError) => [e.humanMessage, e.hint].filter(Boolean).join(' ');

const NONE: string[] = [];

const KIND: Record<MemorySource['kind'], string> = { code: 'code folder', pdf: 'PDF', note: 'note' };

export function MemoryPanel() {
  const attachedIds = useScene((s) => s.scene.memories);
  const attached = attachedIds ?? NONE;
  const [list, setList] = useState<MemoryInfo[]>([]);
  const [name, setName] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MemoryHit[] | null>(null);

  const refresh = useCallback(async () => setList(await window.bp.memory.list()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fail = (e: AppError) => {
    if (e.code === 'cancelled') return;
    setMessage({ kind: 'err', text: say(e) });
    if (e.code !== 'needs_app') log('failed', say(e), { source: 'project memory' });
  };
  const ok = (text: string) => {
    setMessage({ kind: 'ok', text });
    log('action', text, { source: 'project memory' });
  };

  const setAttached = (id: string, on: boolean) => {
    useScene.getState().updateScene((s) => ({ ...s, memories: on ? attachMemory(s.memories, id) : detachMemory(s.memories, id) }));
  };

  const create = async () => {
    const r = await window.bp.memory.create(name);
    if (!r.ok) return fail(r.error);
    setName('');
    setOpen(r.value.id);
    setAttached(r.value.id, true);
    ok(t('Created the memory “{name}” and attached it to this project.', { name: r.value.name }));
    await refresh();
  };

  const run = async (id: string, what: 'folder' | 'pdf') => {
    setBusy(id);
    setMessage(null);
    try {
      if (what === 'folder') {
        const r = await window.bp.memory.importFolder(id);
        if (!r.ok) return fail(r.error);
        const v = r.value;
        ok(
          t('Read {files} files into {chunks} pieces.', { files: v.files, chunks: v.chunks }) +
            (v.skipped ? ' ' + t('{n} files were too big or not text and were left out.', { n: v.skipped }) : '') +
            (v.skippedDirs.length ? ' ' + t('Skipped build and vendor folders: {dirs}.', { dirs: v.skippedDirs.slice(0, 5).join(', ') }) : '') +
            (v.capped ? ' ' + t('The folder is very big: the import stopped at the size limit.') : ''),
        );
      } else {
        const r = await window.bp.memory.importPdf(id);
        if (!r.ok) {
          fail(r.error);
          if (r.error.code === 'pdf_unsupported') setNote({ id, text: note?.id === id ? note.text : '' });
          return;
        }
        ok(t('Added the PDF text.'));
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const saveNote = async () => {
    if (!note) return;
    const r = await window.bp.memory.addNote(note.id, note.text);
    if (!r.ok) return fail(r.error);
    setNote(null);
    ok(t('Saved the note in “{name}”.', { name: r.value.name }));
    await refresh();
  };

  const removeSource = async (id: string, s: MemorySource) => {
    const r = await window.bp.memory.removeSource(id, s.id);
    if (!r.ok) return fail(r.error);
    ok(t('Removed “{label}” from the memory.', { label: s.label }));
    await refresh();
  };

  const remove = async (m: MemoryInfo) => {
    if (confirmDelete !== m.id) return setConfirmDelete(m.id);
    setConfirmDelete(null);
    const r = await window.bp.memory.remove(m.id);
    if (!r.ok) return fail(r.error);
    setAttached(m.id, false);
    ok(t('Deleted the memory “{name}”.', { name: m.name }));
    await refresh();
  };

  const exportFile = async (m: MemoryInfo) => {
    const r = await window.bp.memory.exportFile(m.id);
    if (!r.ok) return fail(r.error);
    ok(t('Exported “{name}” to {path}. Send this file to a colleague; they import it here.', { name: m.name, path: r.value }));
  };

  const importFile = async () => {
    const r = await window.bp.memory.importFile();
    if (!r.ok) return fail(r.error);
    ok(t('Imported the memory “{name}”.', { name: r.value.name }));
    await refresh();
  };

  const search = async () => {
    const ids = attached.length ? attached : list.map((m) => m.id);
    setHits(query.trim() ? await window.bp.memory.search(query, ids, 5) : null);
  };

  const missing = attached.filter((id) => !list.some((m) => m.id === id));

  return (
    <div className="memory-panel">
      <p className="small dim">
        {t('Teach the assistant your old projects: code folders, datasheets and notes. Everything stays on this computer. The chat searches the memories attached to this project and shows the file and lines it used.')}
      </p>
      <div className="row gap">
        <input
          className="text-in grow"
          value={name}
          placeholder={t('New memory name, e.g. acme-panels')}
          aria-label={t('New memory name')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && void create()}
        />
        <button className="btn small primary" disabled={!name.trim()} onClick={() => void create()}>
          {t('Create')}
        </button>
      </div>
      <button className="btn small ghost" onClick={() => void importFile()}>
        {t('Import a memory file…')}
      </button>

      {missing.map((id) => (
        <div key={id} className="finding sev-warning">
          <b>{t('This project uses a memory that is not on this computer.')}</b>
          <span>{t('Import the file your colleague exported, or detach it.')}</span>
          <button className="btn small ghost" onClick={() => setAttached(id, false)}>
            {t('Detach')}
          </button>
        </div>
      ))}

      {list.length === 0 && <p className="small dim">{t('No memories yet. Create one, then add the folder of an old project.')}</p>}

      {list.map((m) => {
        const on = attached.includes(m.id);
        const expanded = open === m.id;
        return (
          <div key={m.id} className={`memory-card ${on ? 'on' : ''}`}>
            <div className="row gap">
              <label className="row gap grow memory-attach" title={t('The chat on this project searches attached memories')}>
                <input type="checkbox" checked={on} onChange={(e) => setAttached(m.id, e.target.checked)} />
                <b className="mono">{m.name}</b>
              </label>
              <button className="link small" onClick={() => setOpen(expanded ? null : m.id)} aria-expanded={expanded}>
                {expanded ? t('Hide') : t('Open')}
              </button>
            </div>
            <div className="small dim">
              {t('{sources} sources, {chunks} pieces', { sources: m.sources.length, chunks: m.chunks })} · {on ? t('used by this project') : t('not used by this project')}
            </div>
            {expanded && (
              <>
                <div className="row gap wrap">
                  <button className="btn small" disabled={busy === m.id} onClick={() => void run(m.id, 'folder')}>
                    {busy === m.id ? t('Reading…') : t('Add a code folder…')}
                  </button>
                  <button className="btn small ghost" disabled={busy === m.id} onClick={() => void run(m.id, 'pdf')}>
                    {t('Add a PDF…')}
                  </button>
                  <button className="btn small ghost" onClick={() => setNote({ id: m.id, text: '' })}>
                    {t('Add a note')}
                  </button>
                </div>
                {note?.id === m.id && (
                  <div className="memory-note">
                    <textarea
                      rows={4}
                      value={note.text}
                      placeholder={t('What you learnt, e.g. "This ST7789 needs 120 ms after reset, then MADCTL 0x36 = 0x70 for landscape".')}
                      aria-label={t('Note')}
                      onChange={(e) => setNote({ id: m.id, text: e.target.value })}
                    />
                    <div className="row gap">
                      <button className="btn small primary" disabled={!note.text.trim()} onClick={() => void saveNote()}>
                        {t('Save note')}
                      </button>
                      <button className="btn small ghost" onClick={() => setNote(null)}>
                        {t('Cancel')}
                      </button>
                    </div>
                  </div>
                )}
                {m.sources.length > 0 && (
                  <ul className="memory-sources">
                    {m.sources.map((s) => (
                      <li key={s.id} className="row gap">
                        <span className="chip small">{t(KIND[s.kind])}</span>
                        <span className="grow mono small memory-label" title={s.label}>
                          {s.label}
                        </span>
                        {s.kind !== 'note' && <span className="small dim">{t('{n} files', { n: s.files })}</span>}
                        <button className="link small" onClick={() => void removeSource(m.id, s)}>
                          {t('Remove')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="row gap wrap">
                  <button className="btn small ghost" onClick={() => void exportFile(m)}>
                    {t('Export to share…')}
                  </button>
                  <button className={`btn small ghost ${confirmDelete === m.id ? 'danger' : ''}`} onClick={() => void remove(m)}>
                    {confirmDelete === m.id ? t('Click again to delete') : t('Delete memory')}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {list.length > 0 && (
        <>
          <div className="row gap">
            <input
              className="text-in grow"
              value={query}
              placeholder={t('Try a search, e.g. ST7789 init')}
              aria-label={t('Search the memory')}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void search()}
            />
            <button className="btn small" onClick={() => void search()}>
              {t('Search')}
            </button>
          </div>
          {hits && hits.length === 0 && <p className="small dim">{t('Nothing found. Try the chip name, a register or a function name.')}</p>}
          {hits?.map((h) => (
            <details key={h.ref} className="memory-hit">
              <summary className="mono small">{h.citation.replace(/^memory · /, '')}</summary>
              <pre className="code">{h.text}</pre>
            </details>
          ))}
        </>
      )}

      {message && <p className={`small ${message.kind === 'err' ? 'memory-err' : 'dim'}`}>{message.text}</p>}
    </div>
  );
}
