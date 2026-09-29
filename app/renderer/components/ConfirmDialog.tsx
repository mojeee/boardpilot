// The only way a write to the board gets a confirmation token: the user clicks Confirm here.

import { useConfirm } from '../state/store';
import { Icon } from './Icon';
import { t } from '@shared/i18n';

export function ConfirmDialog() {
  const req = useConfirm((s) => s.req);
  if (!req) return null;
  const close = (token: string | null) => {
    req.resolve(token);
    useConfirm.getState().close();
  };
  return (
    <div className="modal-back" role="dialog" aria-modal>
      <div className="modal">
        <div className="modal-icon">
          <Icon name="warn" size={22} />
        </div>
        <h2>{req.title}</h2>
        <p>{req.body}</p>
        <ul>
          {req.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => close(null)}>
            {t('Cancel')}
          </button>
          <button
            className="btn primary"
            autoFocus
            onClick={async () => {
              const token = await window.bp.safety.grant(req.kind, req.uses);
              close(token);
            }}
          >
            {req.confirmLabel}
          </button>
        </div>
        <p className="modal-foot">{t('Nothing is written to the board unless you confirm.')}</p>
      </div>
    </div>
  );
}
