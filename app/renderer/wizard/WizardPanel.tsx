// Right-panel wizard UI: progress, the current step, fallbacks, AI help, and the result card.

import { useEffect, useRef, useState } from 'react';
import { stepBody, stepOptions, type StepDef, type ResultData, type StepState } from '@shared/flow';
import { FLOWS } from '@flows/index';
import { PARTS, getBoard, targetLabel } from '@shared/board';
import { useApp, useConfirm, useScene, log } from '../state/store';
import { useWizard } from './session';
import { askAi } from '../components/ai';
import { AskBox, AssistantPanel } from '../components/AssistantPanel';
import { PhotoInput } from '../components/PhotoInput';
import { Icon } from '../components/Icon';
import { confirmRestore } from '../state/hw';

const STATUS_ICON: Record<StepState['status'], string> = {
  pending: '',
  running: '',
  waiting: '',
  ok: 'check',
  warning: 'warn',
  failed: 'x',
  skipped: '',
};

function FreeText({ step }: { step: StepDef }) {
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const runner = useWizard((s) => s.runner);
  if (!runner) return null;
  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const opts = stepOptions(step, runner.ctx).map((o) => ({ id: o.id, label: o.label }));
    const r = await window.bp.ai.classify(text, opts);
    setBusy(false);
    if (!r.ok) {
      setNote(`${r.error.humanMessage} Pick the closest button instead.`);
      return;
    }
    const opt = opts.find((o) => o.id === r.value.optionId);
    if (!opt) {
      setNote(`${r.value.reason} Pick the closest button, or ask the assistant below.`);
      return;
    }
    log('action', `You wrote: “${text.trim()}”. The assistant matched it to: ${opt.label} (suggestion; change it by running the flow again).`, { source: 'assistant classification' });
    useWizard.getState().answer({ kind: 'option', optionId: opt.id, label: opt.label });
  };
  return (
    <div className="free-text">
      <div className="label">Or describe it in your own words</div>
      <div className="ask-box">
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. the sensor always shows 0 degrees" />
        <button className="btn icon ai" disabled={busy || !text.trim()} onClick={submit} aria-label="Send">
          <Icon name="send" size={16} />
        </button>
      </div>
      {note && <p className="small dim">{note}</p>}
    </div>
  );
}

function InputPicker({ kinds, stepId }: { kinds: string[]; stepId: string }) {
  const [model, setModel] = useState('');
  const answer = useWizard((s) => s.answer);
  const i2cParts = Object.values(PARTS);
  return (
    <div className="input-picker">
      {kinds.includes('library') && (
        <div className="picker-block">
          <div className="label">Pick from the library</div>
          <div className="lib-grid">
            {i2cParts
              .filter((p) => stepId !== 'sensor-input' || p.bus === 'i2c')
              .map((p) => (
                <button key={p.id} className="lib-item" onClick={() => answer({ kind: 'input', input: 'library', value: p.name, partId: p.id })}>
                  <b>{p.name}</b>
                  <span>{p.measures?.join(', ') ?? p.category}</span>
                </button>
              ))}
          </div>
        </div>
      )}
      {kinds.includes('model') && (
        <div className="picker-block">
          <div className="label">Type the model printed on it</div>
          <div className="row gap">
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. GY-BME280" className="text-in" />
            <button className="btn small" disabled={!model.trim()} onClick={() => answer({ kind: 'input', input: 'model', value: model.trim() })}>
              Use
            </button>
          </div>
        </div>
      )}
      {kinds.includes('photo') && (
        <div className="picker-block">
          <div className="label">Take a photo</div>
          <PhotoInput compact onConfirm={(partId, name) => answer({ kind: 'input', input: 'photo', value: name, partId, confirmed: true })} />
        </div>
      )}
      {kinds.includes('datasheet') && (
        <div className="picker-block">
          <div className="label">Upload the datasheet</div>
          <button
            className="btn small"
            onClick={async () => {
              const p = await window.bp.session.pickFile('datasheet');
              if (p) answer({ kind: 'input', input: 'datasheet', value: p.split('/').pop()?.replace(/\.pdf$/i, '') ?? p });
            }}
          >
            Choose PDF…
          </button>
        </div>
      )}
      {kinds.includes('firmware') && (
        <button
          className="btn primary"
          onClick={async () => {
            const p = useApp.getState().conn.mode === 'sim' ? '/simulated/weather-station.ino.bin' : await window.bp.session.pickFile('firmware');
            if (p) answer({ kind: 'input', input: 'firmware', value: p });
          }}
        >
          Choose .bin file…
        </button>
      )}
      {kinds.includes('port') && (
        <div className="row gap">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="/dev/cu.usbserial-0001" className="text-in mono" />
          <button className="btn small" disabled={!model.trim()} onClick={() => answer({ kind: 'input', input: 'port', value: model.trim() })}>
            Use
          </button>
        </div>
      )}
    </div>
  );
}

function ResultCard({ r }: { r: ResultData }) {
  const scene = useScene((s) => s.scene);
  const agentOn = useApp((s) => !!s.conn.agent);
  const flowId = useWizard((s) => s.state?.flowId);
  return (
    <div className="result-card">
      <div className="row gap">
        <span className={`conf conf-${r.confidence}`}>{r.confidence === 'measured' ? 'Measured' : r.confidence === 'documented' ? 'From documentation' : 'Suggestion'}</span>
      </div>
      <h3>{r.title}</h3>
      <p>{r.cause}</p>
      {r.evidence.length > 0 && (
        <>
          <div className="label">Evidence</div>
          <ul className="evidence">
            {r.evidence.map((e, i) => (
              <li key={i} className={e.target ? 'clickable' : ''} onClick={() => e.target && useScene.getState().focusOn([e.target])}>
                {e.text}
                <span className={`log-src ${e.source.startsWith('measured') ? 'measured' : ''}`}>{e.source}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {r.highlight.length > 0 && (
        <div className="chips">
          {r.highlight.map((t) => (
            <button key={t} className="chip link mono" onClick={() => useScene.getState().focusOn([t])}>
              {targetLabel(getBoard(), scene, t)}
            </button>
          ))}
        </div>
      )}
      {r.nextSteps.length > 0 && (
        <>
          <div className="label">What to do next</div>
          <ol className="next-steps">
            {r.nextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}
      {r.sources.length > 0 && <div className="small dim">Sources: {r.sources.join(' · ')}</div>}
      <div className="row gap wrap">
        {flowId && (
          <button className="btn small" onClick={() => useWizard.getState().start(flowId)}>
            Run the checks again
          </button>
        )}
        <button className="btn small" onClick={() => useApp.getState().setScreen('report')}>
          Create report
        </button>
        {agentOn && (
          <button className="btn small ghost" onClick={() => confirmRestore()}>
            Restore my firmware
          </button>
        )}
      </div>
    </div>
  );
}

function CurrentStep() {
  const runner = useWizard((s) => s.runner);
  const state = useWizard((s) => s.state);
  const [helpBusy, setHelpBusy] = useState(false);
  if (!runner || !state) return null;
  const step = runner.currentStep;
  if (state.result) return <ResultCard r={state.result} />;
  if (!step) return null;
  const body = stepBody(step, runner.ctx);
  const st = state.steps[state.current];

  return (
    <div className={`step-card s-${state.status}`}>
      <div className="step-kicker">
        {state.status === 'running' ? <span className="spinner" /> : null}
        <span className="mono dim small">{step.type.toUpperCase()}</span>
      </div>
      <h3>{step.title}</h3>
      {body && <p className="pre">{body}</p>}

      {state.status === 'waiting' && step.type === 'question' && (
        <>
          <div className="options">
            {stepOptions(step, runner.ctx).map((o) => (
              <button key={o.id} className="option" onClick={() => useWizard.getState().answer({ kind: 'option', optionId: o.id, label: o.label })}>
                <b>{o.label}</b>
                {o.hint && <span>{o.hint}</span>}
              </button>
            ))}
          </div>
          {step.allowFreeText && <FreeText step={step} />}
        </>
      )}

      {state.status === 'waiting' && (step.type === 'input' || (st?.status === 'waiting' && st.summary && step.fallbacks?.some((f) => f.kind === 'input'))) && (
        <InputPicker kinds={step.inputs ?? step.fallbacks?.filter((f) => f.kind === 'input').map((f) => f.input!) ?? []} stepId={step.id} />
      )}

      {state.status === 'waiting' && step.type === 'confirm' && step.confirm && (
        <>
          <ul className="confirm-details">
            {step.confirm.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
          <div className="row gap">
            <button
              className="btn primary"
              onClick={async () => {
                const token = await useConfirm.getState().ask({
                  kind: step.confirm!.write,
                  title: step.title + '?',
                  body: body ?? '',
                  details: step.confirm!.details,
                  confirmLabel: 'Confirm',
                });
                useWizard.getState().answer({ kind: 'confirm', confirmed: !!token, token: token ?? undefined });
              }}
            >
              Review and confirm…
            </button>
            <button className="btn ghost" onClick={() => useWizard.getState().answer({ kind: 'confirm', confirmed: false })}>
              Not now
            </button>
          </div>
        </>
      )}

      {state.status === 'waiting' && step.type === 'action' && (
        <div className="row gap">
          <button className="btn primary" onClick={() => useWizard.getState().answer({ kind: 'done' })}>
            Done, check it
          </button>
        </div>
      )}

      {state.status === 'failed' && (
        <div className="failed-box">
          <p className="err-text">{state.lastOutcome?.summary}</p>
          <div className="row gap wrap">
            <button
              className="btn small ai"
              disabled={helpBusy}
              onClick={async () => {
                setHelpBusy(true);
                const q = step.aiHelp?.(runner.ctx, state.lastOutcome) ?? `The step “${step.title}” failed: ${state.lastOutcome?.summary ?? ''}. Explain in plain words what went wrong and what I should do.`;
                await askAi(q);
                setHelpBusy(false);
              }}
            >
              <Icon name="ai" size={15} /> Explain what went wrong
            </button>
            {(step.fallbacks ?? [{ id: 'retry', label: 'Try again', kind: 'retry' as const }]).map((f) => (
              <button key={f.id} className="btn small" onClick={() => useWizard.getState().fallback(f)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function WizardPanel() {
  const state = useWizard((s) => s.state);
  const runner = useWizard((s) => s.runner);
  const cur = useRef<HTMLDivElement>(null);
  useEffect(() => {
    cur.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [state?.current, state?.status]);
  if (!state || !runner) return null;
  const flow = FLOWS[state.flowId];
  const visible = state.steps.filter((s) => s.status !== 'skipped' || s.summary !== 'Not needed');
  const doneCount = state.steps.filter((s) => ['ok', 'warning', 'skipped'].includes(s.status)).length;
  const pct = state.status === 'done' ? 100 : Math.round((doneCount / state.steps.length) * 100);

  return (
    <div className="wizard">
      <div className="wiz-head">
        <div>
          <div className="panel-title">{flow?.title}</div>
          <div className="small dim">{flow?.description}</div>
        </div>
        <button className="btn small ghost" onClick={() => useWizard.getState().cancel()}>
          Stop
        </button>
      </div>
      <div className="wiz-progress">
        <i style={{ width: `${pct}%` }} />
      </div>
      <ol className="wiz-steps">
        {visible.map((s) => {
          const def = runner.flow.steps.find((d) => d.id === s.id);
          if (!def || (def.when && s.status === 'pending' && !def.when(runner.ctx))) return null;
          return (
            <li key={s.id} className={`ws ws-${s.status} ${state.steps[state.current]?.id === s.id ? 'cur' : ''}`}>
              <span className="ws-icon">{STATUS_ICON[s.status] ? <Icon name={STATUS_ICON[s.status]} size={13} /> : s.status === 'running' ? <span className="spinner sm" /> : null}</span>
              <span className="ws-title">{def.title}</span>
              {s.summary && s.status !== 'waiting' && s.status !== 'running' && <span className="ws-sum">{s.summary}</span>}
            </li>
          );
        })}
      </ol>
      <div ref={cur}>
        <CurrentStep />
      </div>
      <AskBox placeholder="Ask about this step…" />
    </div>
  );
}

/** Right panel for task screens: wizard on top, assistant conversation below. */
export function WizardWithAssistant() {
  return (
    <div className="right-split">
      <div className="right-top">
        <WizardPanel />
      </div>
      <div className="right-bottom">
        <AssistantPanel hideInput />
      </div>
    </div>
  );
}
