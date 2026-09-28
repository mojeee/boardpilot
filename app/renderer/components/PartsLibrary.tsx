// Parts library: search, filter, add to the project, and grow the library from a web link
// (AI or keyword draft, always checked by the user in the part editor) or by hand.

import { useMemo, useState } from 'react';
import type { PartDef } from '@shared/types';
import { ROLE_HEX, partRoleColor } from '@shared/board';
import { t } from '@shared/i18n';
import { usePartsLib, isBuiltin } from '../state/partsLib';
import { addPart } from '../state/sceneActions';
import { log, useApp } from '../state/store';
import { usePartEditor } from './PartEditor';
import { Icon } from './Icon';

type Filter = 'all' | PartDef['category'] | 'mine';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sensor', label: 'Sensors' },
  { id: 'display', label: 'Displays' },
  { id: 'input', label: 'Inputs' },
  { id: 'output', label: 'Outputs' },
  { id: 'mine', label: 'My parts' },
];

function ImportFromLink() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const aiOn = useApp((s) => s.ai.enabled);
  const run = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await window.bp.parts.importFromUrl(url.trim());
    setBusy(false);
    if (!r.ok) {
      setErr(`${t(r.error.humanMessage)} ${t(r.error.hint)}`);
      return;
    }
    log('info', t('Drafted “{name}” from {page}. Check it before saving.', { name: r.value.draft.name, page: r.value.pageTitle }), {
      source: r.value.usedAi ? t('assistant (suggestion)') : t('keyword rules (suggestion)'),
    });
    usePartEditor.getState().open({ draft: r.value.draft, notes: r.value.notes, fromImport: true, usedAi: r.value.usedAi });
    setUrl('');
  };
  return (
    <div className="import-link">
      <div className="label">{t('Add a part from a link')}</div>
      <div className="row gap">
        <input
          className="text-in"
          value={url}
          placeholder={t('Paste a product page or datasheet link')}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <button className="btn small primary" disabled={busy || !url.trim()} onClick={run}>
          {busy ? <span className="spinner" /> : t('Import')}
        </button>
      </div>
      <p className="small dim">
        {aiOn
          ? t('The assistant reads the page and drafts the pins and 3D shape. You check it before it is saved.')
          : t('Without the AI assistant the app guesses from keywords on the page. You check every field before saving.')}
      </p>
      {err && <p className="small err-text">{err}</p>}
    </div>
  );
}

function PartRow({ p, onAdded }: { p: PartDef; onAdded?: () => void }) {
  const mine = !isBuiltin(p.id);
  return (
    <div className="lib-row">
      <div className="lib-swatch" style={{ background: p.model.color }} />
      <div className="lib-main">
        <b>{p.name}</b>
        <div className="lib-pins">
          {p.pins.map((pin) => (
            <span key={pin.name} style={{ color: ROLE_HEX[partRoleColor(pin.role)] }}>
              {pin.name}
            </span>
          ))}
        </div>
        <span className="small dim">
          {[p.bus?.toUpperCase(), `${p.voltage} V`, p.addresses?.join(' / '), mine ? t('my part') : null].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="lib-actions">
        <button
          className="btn icon small"
          title={t('Add to project')}
          onClick={() => {
            addPart(p.id);
            onAdded?.();
          }}
        >
          <Icon name="plus" size={16} />
        </button>
        {mine && (
          <>
            <button className="btn icon small" title={t('Edit')} onClick={() => usePartEditor.getState().open({ draft: p, replaceId: p.id })}>
              <Icon name="edit" size={15} />
            </button>
            <button
              className="btn icon small"
              title={t('Delete from library')}
              onClick={async () => {
                if (!window.confirm(t('Delete “{name}” from your library? Projects that use it will show it as unknown.', { name: p.name }))) return;
                const r = await usePartsLib.getState().remove(p.id);
                if (r.ok) log('action', t('Deleted “{name}” from your library.', { name: p.name }));
              }}
            >
              <Icon name="trash" size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function PartsLibrary({ onAdded, onClose }: { onAdded?: () => void; onClose?: () => void }) {
  const version = usePartsLib((s) => s.version);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const parts = useMemo(() => {
    const all = usePartsLib.getState().all();
    const needle = q.trim().toLowerCase();
    return all.filter((p) => {
      if (filter === 'mine' && isBuiltin(p.id)) return false;
      if (filter !== 'all' && filter !== 'mine' && p.category !== filter) return false;
      if (!needle) return true;
      return [p.name, ...p.keywords, p.bus ?? '', ...(p.measures ?? [])].some((s) => s.toLowerCase().includes(needle));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter, version]);

  return (
    <div className="parts-lib">
      <div className="row between">
        <span className="panel-title">{t('Parts library')}</span>
        {onClose && (
          <button className="close" onClick={onClose} aria-label={t('Close')}>
            ×
          </button>
        )}
      </div>
      <input className="text-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search parts, e.g. temperature, oled, 0x76')} />
      <div className="filters wrap">
        {FILTERS.map((f) => (
          <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
            {t(f.label)}
          </button>
        ))}
      </div>
      <div className="lib-list">
        {parts.length === 0 && <div className="empty">{t('No part matches. Import it from a link below, or create it by hand.')}</div>}
        {parts.map((p) => (
          <PartRow key={p.id} p={p} onAdded={onAdded} />
        ))}
      </div>
      <ImportFromLink />
      <button className="btn small ghost" onClick={() => usePartEditor.getState().open({ draft: null })}>
        {t('Create a part by hand…')}
      </button>
    </div>
  );
}
