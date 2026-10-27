// Past projects: the user's folders of old projects, read (never changed) and described in a
// table: board or chip, framework, parts, buses and protocols, documents. Every value shows where
// it came from (a file and line, or "you"); the user adds notes and corrects values. The assistant
// sees the same table and suggests a similar past project while a new one is planned.

import { useEffect, useMemo, useState } from 'react';
import { t } from '@shared/i18n';
import { PARTS, BOARDS } from '@shared/board';
import type { ArchiveEntry, Fact } from '@shared/archive/types';
import { Icon } from '../components/Icon';
import { BUS_LABEL, PROTOCOL_LABEL, ensureArchive, startFromArchive, useArchive } from '../state/archive';
import '../styles/archive.css';

const KIND_LABEL: Record<string, string> = { firmware: 'Firmware', schematic: 'Schematic', docs: 'Documents', boardpilot: 'BoardPilot' };
const FRAMEWORK_LABEL: Record<string, string> = {
  arduino: 'Arduino',
  platformio: 'PlatformIO',
  'esp-idf': 'ESP-IDF',
  stm32cube: 'STM32Cube',
  'pico-sdk': 'Pico SDK',
  kicad: 'KiCad',
  boardpilot: 'BoardPilot',
  unknown: '—',
};

/** "main.cpp:12", "you", or "AI (to confirm)". */
function whereFrom(f: Fact<unknown>): string {
  if (f.source === 'user') return t('you');
  if (f.source === 'ai') return t('AI suggestion, to confirm');
  return f.evidence ? `${f.evidence.file}${f.evidence.line ? `:${f.evidence.line}` : ''}` : t('detected');
}

const BUS_ROLE: Record<string, string> = { i2c: 'sda', spi: 'spi', uart: 'uart', onewire: 'gpio', can: 'uart', rs485: 'uart', adc: 'adc' };

function busChip(b: Fact<string>) {
  return (
    <span key={b.value} className={`chip role-${BUS_ROLE[b.value] ?? 'gpio'}`} title={t('read from {where}', { where: whereFrom(b) })}>
      {BUS_LABEL[b.value] ?? b.value}
    </span>
  );
}

function boardText(e: ArchiveEntry): string {
  if (!e.board) return '—';
  const b = e.board.value.boardId ? BOARDS[e.board.value.boardId] : undefined;
  return b ? b.name : e.board.value.mcu;
}

const fmtDate = (ms: number) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

export function Archive() {
  useEffect(ensureArchive, []);
  const { projects, roots, busy, note, selected, loaded } = useArchive();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [proto, setProto] = useState('');

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return projects.filter((p) => {
      if (kind && !p.kinds.includes(kind as never)) return false;
      if (proto && !p.protocols.some((x) => x.value === proto) && !p.buses.some((x) => x.value === proto)) return false;
      if (!words.length) return true;
      const hay = [p.name, boardText(p), p.framework.value, p.notes, p.tags.join(' '), p.summary?.value ?? '', ...p.parts.map((x) => x.value.name), ...p.protocols.map((x) => x.value), ...p.buses.map((x) => x.value), ...p.keywords]
        .join(' ')
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [projects, q, kind, proto]);

  const sel = projects.find((p) => p.id === selected) ?? null;
  const allProto = [...new Set(projects.flatMap((p) => [...p.protocols.map((x) => x.value), ...p.buses.map((x) => x.value)]))].sort();

  return (
    <div className="archive">
      <div className="archive-main">
        <div className="screen-head row between">
          <div>
            <h2>{t('Past projects')}</h2>
            <p className="dim">{t('Your folders of old projects, read on this computer and described in a table. Nothing is changed and nothing is sent anywhere.')}</p>
          </div>
          <div className="row gap">
            <button className="btn small" disabled={busy} onClick={() => void useArchive.getState().addFolder()} data-where="archive:add">
              <Icon name="plus" size={13} /> {t('Add folder')}
            </button>
            <button className="btn small ghost" disabled={busy || !roots.length} onClick={() => void useArchive.getState().rescan()}>
              <Icon name="rotate" size={13} /> {t('Rescan')}
            </button>
          </div>
        </div>

        {note && <div className={`archive-note ${note.ok ? 'ok' : 'err'}`}>{note.text}</div>}
        {busy && <div className="archive-note">{t('Reading the folders…')}</div>}

        {loaded && !projects.length && !busy ? (
          <div className="gate archive-empty">
            <b>{t('Point BoardPilot at a folder of old projects.')}</b>
            <span className="dim">
              {t('It finds Arduino, PlatformIO, ESP-IDF, STM32CubeMX and KiCad projects, BoardPilot projects and folders of documents, and lists the board, parts, buses and protocols of each. Nothing leaves this computer.')}
            </span>
            <div className="row gap">
              <button className="btn small primary" onClick={() => void useArchive.getState().addFolder()}>
                {t('Add folder')}
              </button>
              <button className="btn small" onClick={() => void useArchive.getState().addSample()} data-where="archive:sample">
                {t('Try the sample archive')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="row gap wrap archive-filters">
              <input className="text-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search: a part, a chip, a word…')} aria-label={t('Search past projects')} />
              <select className="select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('Kind')}>
                <option value="">{t('All kinds')}</option>
                {Object.keys(KIND_LABEL).map((k) => (
                  <option key={k} value={k}>
                    {t(KIND_LABEL[k])}
                  </option>
                ))}
              </select>
              <select className="select" value={proto} onChange={(e) => setProto(e.target.value)} aria-label={t('Bus or protocol')}>
                <option value="">{t('Any bus or protocol')}</option>
                {allProto.map((p) => (
                  <option key={p} value={p}>
                    {PROTOCOL_LABEL[p] ?? BUS_LABEL[p] ?? p}
                  </option>
                ))}
              </select>
              <span className="small dim">{t('{n} of {total} projects', { n: shown.length, total: projects.length })}</span>
            </div>
            <div className="archive-table-wrap">
              <table className="bom-table archive-table">
                <thead>
                  <tr>
                    <th>{t('Project')}</th>
                    <th>{t('Board or chip')}</th>
                    <th>{t('Made with')}</th>
                    <th>{t('Parts')}</th>
                    <th>{t('Buses and protocols')}</th>
                    <th>{t('Files')}</th>
                    <th>{t('Last change')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id} className={p.id === selected ? 'on' : ''} onClick={() => useArchive.getState().select(p.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && useArchive.getState().select(p.id)}>
                      <td>
                        <b>{p.name}</b>
                        {p.tags.length > 0 && <div className="row gap wrap">{p.tags.map((tg) => <span key={tg} className="chip">{tg}</span>)}</div>}
                      </td>
                      <td className="mono" title={p.board ? t('read from {where}', { where: whereFrom(p.board) }) : t('No board or chip found in the files.')}>
                        {boardText(p)}
                        {p.board?.source === 'user' && <span className="src-mark"> · {t('you')}</span>}
                      </td>
                      <td>{FRAMEWORK_LABEL[p.framework.value] ?? p.framework.value}</td>
                      <td>
                        <div className="row gap wrap">
                          {p.parts.slice(0, 5).map((x) => (
                            <span key={x.value.partId ?? x.value.name} className={`chip ${x.value.partId ? '' : 'raw'}`} title={t('read from {where}', { where: whereFrom(x) })}>
                              {x.value.partId ? PARTS[x.value.partId]?.keywords[0]?.toUpperCase() ?? x.value.name : x.value.name}
                            </span>
                          ))}
                          {p.parts.length > 5 && <span className="small dim">+{p.parts.length - 5}</span>}
                        </div>
                      </td>
                      <td>
                        <div className="row gap wrap">
                          {p.buses.map(busChip)}
                          {p.protocols.map((x) => (
                            <span key={x.value} className="chip proto" title={t('read from {where}', { where: whereFrom(x) })}>
                              {PROTOCOL_LABEL[x.value] ?? x.value}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="small dim">{p.kinds.map((k) => t(KIND_LABEL[k] ?? k)).join(', ')}</td>
                      <td className="small dim">{fmtDate(p.lastModified)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="archive-roots small dim">
              {roots.map((r) => (
                <span key={r} className="row gap">
                  <Icon name="folder" size={12} /> <span className="mono">{r}</span>
                  <button className="link small" onClick={() => void useArchive.getState().removeFolder(r)}>
                    {t('Remove from the archive')}
                  </button>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      {sel && <Detail e={sel} />}
    </div>
  );
}

/** One project: every property with where it was read, the user's notes and corrections. */
function Detail({ e }: { e: ArchiveEntry }) {
  const [notes, setNotes] = useState(e.notes);
  const [tags, setTags] = useState(e.tags.join(', '));
  const [mcu, setMcu] = useState('');
  useEffect(() => {
    setNotes(e.notes);
    setTags(e.tags.join(', '));
    setMcu('');
  }, [e.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => void useArchive.getState().update(e.id, { notes, tags: tags.split(',').map((x) => x.trim()).filter(Boolean) });
  const open = (file?: string) => void window.bp.archive.reveal(e.id, file);
  const Src = ({ f }: { f: Fact<unknown> }) =>
    f.evidence && f.source === 'detected' && !window.bp.web ? (
      <button className="link mono small src" onClick={() => open(f.evidence!.file)} title={t('Show this file in its folder')}>
        {whereFrom(f)}
      </button>
    ) : (
      <span className={`mono small src ${f.source}`}>{whereFrom(f)}</span>
    );

  return (
    <aside className="archive-detail" aria-label={t('Project details')}>
      <div className="row between">
        <h3>{e.name}</h3>
        <button className="link dim" onClick={() => useArchive.getState().select(null)} aria-label={t('Close')}>
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="mono small dim archive-path" title={e.root}>
        …/{e.root.split(/[\\/]/).slice(-2).join('/')}
      </div>
      {e.summary && (
        <p className="small">
          {e.summary.value} <Src f={e.summary} />
        </p>
      )}
      <div className="row gap wrap">
        <button className="btn small primary" onClick={() => void startFromArchive(e)}>
          {t('Use as start')}
        </button>
        {!window.bp.web && (
          <button className="btn small ghost" onClick={() => open()}>
            {t('Open folder')}
          </button>
        )}
      </div>
      <p className="small dim">{t('Every value below was read from the file shown next to it. Values you correct are marked “you”.')}</p>

      <dl className="archive-facts">
        <dt>{t('Board or chip')}</dt>
        <dd>
          {e.board ? (
            <>
              {boardText(e)} <Src f={e.board} />
            </>
          ) : (
            <span className="dim">{t('Not found in the files.')}</span>
          )}
          <div className="row gap archive-fix">
            <input className="text-in" value={mcu} onChange={(x) => setMcu(x.target.value)} placeholder={t('Correct it, e.g. STM32G071RB')} aria-label={t('Board or chip')} />
            <button className="btn small" disabled={!mcu.trim()} onClick={() => void useArchive.getState().update(e.id, { mcu: mcu.trim() })}>
              {t('Save')}
            </button>
          </div>
        </dd>
        <dt>{t('Made with')}</dt>
        <dd>
          {FRAMEWORK_LABEL[e.framework.value] ?? e.framework.value} <Src f={e.framework} />
        </dd>
        <dt>{t('Parts')}</dt>
        <dd>
          {e.parts.length ? (
            <ul>
              {e.parts.map((p) => (
                <li key={p.value.partId ?? p.value.name}>
                  {p.value.partId ? t(PARTS[p.value.partId]?.name ?? p.value.name) : p.value.name}
                  {!p.value.partId && <span className="small dim"> ({t('not in the parts library')})</span>} <Src f={p} />
                </li>
              ))}
            </ul>
          ) : (
            <span className="dim">{t('None found.')}</span>
          )}
        </dd>
        <dt>{t('Buses and protocols')}</dt>
        <dd>
          {e.buses.length + e.protocols.length ? (
            <ul>
              {e.buses.map((b) => (
                <li key={b.value}>
                  {BUS_LABEL[b.value] ?? b.value} <Src f={b} />
                </li>
              ))}
              {e.protocols.map((b) => (
                <li key={b.value}>
                  {PROTOCOL_LABEL[b.value] ?? b.value} <Src f={b} />
                </li>
              ))}
            </ul>
          ) : (
            <span className="dim">{t('None found.')}</span>
          )}
        </dd>
        {e.pins.length > 0 && (
          <>
            <dt>{t('Pins')}</dt>
            <dd>
              <ul>
                {e.pins.map((p) => (
                  <li key={`${p.value.pin}${p.value.use}`}>
                    <span className="mono">{p.value.pin}</span> {p.value.use} <Src f={p} />
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {e.libraries.length > 0 && (
          <>
            <dt>{t('Libraries')}</dt>
            <dd className="mono small">{e.libraries.map((l) => l.value).join(', ')}</dd>
          </>
        )}
        {e.docs.length > 0 && (
          <>
            <dt>{t('Documents')}</dt>
            <dd>
              <ul>
                {e.docs.map((d) => (
                  <li key={d.path}>
                    {window.bp.web ? (
                      <span className="mono small">{d.path}</span>
                    ) : (
                      <button className="link mono small" onClick={() => open(d.path)}>
                        {d.path}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>

      <div className="label">{t('Your notes')}</div>
      <textarea rows={4} value={notes} onChange={(x) => setNotes(x.target.value)} placeholder={t('What it was for, what went wrong, who knows it best…')} aria-label={t('Your notes')} />
      <input className="text-in" value={tags} onChange={(x) => setTags(x.target.value)} placeholder={t('Tags, separated by commas')} aria-label={t('Tags')} />
      <div className="row gap">
        <button className="btn small" onClick={save}>
          {t('Save notes')}
        </button>
        <span className="small dim">{t('Notes are kept when the folder is rescanned. The assistant reads them too.')}</span>
      </div>
    </aside>
  );
}
