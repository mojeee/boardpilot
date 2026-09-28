import { DEBUG_SYMPTOMS } from '@flows/index';
import { useWizard } from '../wizard/session';
import { AssistantPanel } from '../components/AssistantPanel';
import { t } from '@shared/i18n';

/** Right panel of "Debug a problem" before a flow is chosen. */
export function DebugPicker() {
  return (
    <div className="right-split">
      <div className="right-top">
        <div className="wizard">
          <div className="wiz-head">
            <div>
              <div className="panel-title">{t('Debug a problem')}</div>
              <div className="small dim">{t('What is going wrong? The app then checks it step by step.')}</div>
            </div>
          </div>
          <div className="options">
            {DEBUG_SYMPTOMS.map((s) => (
              <button key={s.id} className="option" onClick={() => useWizard.getState().start(s.id)}>
                <b>{t(s.label)}</b>
                <span>{t(s.hint)}</span>
              </button>
            ))}
          </div>
          <p className="small dim">{t('Something else? Ask the assistant below in your own words.')}</p>
        </div>
      </div>
      <div className="right-bottom">
        <AssistantPanel />
      </div>
    </div>
  );
}
