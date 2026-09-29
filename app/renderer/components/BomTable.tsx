// Shopping list for the project (shared/bom): the parts in the scene plus the extras the wiring
// rules imply, each with its reason. Saves as CSV or Markdown.

import { useMemo } from 'react';
import { PARTS, getBoard } from '@shared/board';
import { billOfMaterials, bomToCsv, bomToMarkdown } from '@shared/bom';
import { t } from '@shared/i18n';
import { log, useScene } from '../state/store';

export function BomTable() {
  const scene = useScene((s) => s.scene);
  const rows = useMemo(() => billOfMaterials(scene, getBoard(scene.board), PARTS), [scene]);
  const save = async (name: string, text: string) => {
    const r = await window.bp.session.saveFile(name, text);
    if (r.ok) log('info', t('Shopping list saved to {path}.', { path: r.value }));
  };
  return (
    <div className="bom">
      <table className="bom-table">
        <thead>
          <tr>
            <th>{t('Item')}</th>
            <th>{t('Quantity')}</th>
            <th>{t('Details')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`bom-${r.kind}`}>
              <td>
                {r.item}
                {r.why && <div className="small dim">{r.why}</div>}
              </td>
              <td className="mono">{r.qty}</td>
              <td className="small dim">{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row gap">
        <button className="btn small" onClick={() => save('shopping-list.csv', bomToCsv(rows))}>
          {t('Save CSV…')}
        </button>
        <button className="btn small ghost" onClick={() => save('shopping-list.md', bomToMarkdown(rows))}>
          {t('Save Markdown…')}
        </button>
      </div>
    </div>
  );
}
