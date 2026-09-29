import { useEffect } from 'react';
import { useApp } from './state/store';
import { wireEvents } from './state/hw';
import { TopBar } from './components/TopBar';
import { TASKS, openTask } from './components/TaskRail';
import { BottomPanel } from './components/BottomPanel';
import { CodeFindingsLogger } from './components/CodeCheck';
import { Splitter } from './components/Splitter';
import { Icon } from './components/Icon';
import { handleLayoutKey, useLayout } from './state/layout';
import { ProjectTabs } from './components/ProjectTabs';
import { NewProjectDialog } from './components/NewProjectDialog';
import { nameFirstTab } from './state/projects';
import { startEventFeed } from './state/events';
import { CommandBox } from './components/CommandBox';
import { WarningBanner } from './components/WarningBanner';
import { ExportDialog } from './components/ExportDialog';
import { AssistantPanel } from './components/AssistantPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DevMenu } from './components/DevMenu';
import { Viewport } from './three/Viewport';
import { WizardWithAssistant } from './wizard/WizardPanel';
import { useWizard } from './wizard/session';
import { Home } from './screens/Home';
import './styles/workspace.css';
import { DebugPicker } from './screens/DebugPicker';
import { TestHardware } from './screens/TestHardware';
import { Monitor } from './screens/Monitor';
import { Report } from './screens/Report';
import { NewProjectPanel } from './screens/NewProject';
import { Learn } from './screens/Learn';
import { runDemo } from './demo';
import { PartEditor } from './components/PartEditor';
import { LicenseDialog, LockScreen, useLicense } from './components/License';
import { AiSettingsDialog, openAiSettings } from './components/AiSettings';
import { BoardPickerDialog } from './components/BoardPicker';
import { DownloadAppPrompt, isWebDemo } from './components/WebDemo';
import { usePartsLib } from './state/partsLib';
import { useScene } from './state/store';
import { t } from '@shared/i18n';

let booted = false;
/** One-time start-up: events, license, user parts, project autosave. */
async function boot() {
  if (booted) return;
  booted = true;
  await wireEvents();
  startEventFeed();
  await Promise.all([useLicense.getState().refresh(), usePartsLib.getState().load()]);
  if (useApp.getState().conn.mode === 'real') {
    const last = await window.bp.project.last();
    if (last) useScene.getState().openScene(last);
  } else nameFirstTab('Demo bench');
  let timer: ReturnType<typeof setTimeout> | null = null;
  useScene.subscribe((s, prev) => {
    // A lesson preview is not the user's project: never autosave it (nor the restore after it).
    if (s.scene === prev.scene || s.preview || prev.preview) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => window.bp.project.autosave(useScene.getState().scene), 800);
  });
  const params = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  const screen = params.get('screen');
  if (screen) openTask(screen as Parameters<typeof openTask>[0]);
  // motion=1: the social-clip capture overlay (only used with BP_MOTION, see app/main/motion.ts)
  if (params.get('motion')) void import('./motion/overlay');
  const demo = params.get('demo');
  if (demo) void runDemo(demo, params.get('scenario'));
}

function FlowStarter({ screen }: { screen: string }) {
  const task = TASKS.find((x) => x.screen === screen);
  return (
    <div className="right-split">
      <div className="right-top">
        <div className="wizard">
          <div className="panel-title">{task ? t(task.label) : ''}</div>
          <p className="dim">{task ? t(task.hint) : ''}</p>
          {task?.flow && (
            <button className="btn primary" onClick={() => useWizard.getState().start(task.flow!)}>
              {t('Start')}
            </button>
          )}
        </div>
      </div>
      <div className="right-bottom">
        <Splitter kind="assistant" />
        <AssistantPanel />
      </div>
    </div>
  );
}

function AiModelLink() {
  const ai = useApp((s) => s.ai);
  return (
    <button className="link dim small mono" onClick={openAiSettings} title={t('AI settings')}>
      {ai.enabled ? (ai.provider === 'demo' ? t('demo') : ai.model) : t('off')}
    </button>
  );
}

/** The project page's right panel: the assistant (open by default) or the project tools. */
function ProjectRight() {
  const tab = useLayout((s) => s.rightTab);
  const set = useLayout.getState().setRightTab;
  return (
    <div className="right-tabs">
      <div className="tabbar" role="tablist" aria-label={t('Right panel')}>
        <button role="tab" aria-selected={tab === 'assistant'} className={`tab ai ${tab === 'assistant' ? 'on' : ''}`} onClick={() => set('assistant')}>
          <Icon name="ai" size={14} /> {t('Assistant')}
        </button>
        <button role="tab" aria-selected={tab === 'tools'} className={`tab ${tab === 'tools' ? 'on' : ''}`} onClick={() => set('tools')} title={t('Parts, pins, templates, starter code and calculators')} data-where="right:tools">
          <Icon name="project" size={14} /> {t('Project tools')}
        </button>
        <span className="grow" />
        <AiModelLink />
      </div>
      <div className={`tab-body ${tab === 'assistant' ? 'no-scroll' : ''}`}>{tab === 'assistant' ? <AssistantPanel hideHeader /> : <NewProjectPanel />}</div>
    </div>
  );
}

function RightPanel() {
  const screen = useApp((s) => s.screen);
  const flowId = useWizard((s) => s.state?.flowId);
  if (screen === 'newProject') return <ProjectRight />;
  if (screen === 'debug') return flowId?.startsWith('debug-') ? <WizardWithAssistant /> : <DebugPicker />;
  if (screen === 'test' && flowId?.startsWith('lab-')) return <WizardWithAssistant />;
  if (screen === 'connect' || screen === 'flash') {
    const want = TASKS.find((x) => x.screen === screen)?.flow;
    return flowId === want ? <WizardWithAssistant /> : <FlowStarter screen={screen} />;
  }
  return <AssistantPanel />;
}

function Center() {
  const screen = useApp((s) => s.screen);
  switch (screen) {
    case 'home':
      return <Home />;
    case 'test':
      return <TestHardware />;
    case 'monitor':
      return <Monitor />;
    case 'report':
      return <Report />;
    case 'learn':
      return <Learn />;
    default:
      return <Viewport />;
  }
}

/** The right panel, or a narrow strip with a button to bring it back. */
function Right() {
  const open = useLayout((s) => s.rightOpen);
  if (!open) {
    return (
      <aside className="right">
        <div className="right-strip">
          <button onClick={() => useLayout.getState().toggleRight(true)} title={t('Show the assistant (⌘I)')} aria-label={t('Show the assistant (⌘I)')}>
            <Icon name="ai" size={16} />
            <span className="vtext">{t('Assistant')}</span>
          </button>
        </div>
      </aside>
    );
  }
  return (
    <aside className="right">
      <Splitter kind="right" />
      <button className="edge-toggle" onClick={() => useLayout.getState().toggleRight(false)} title={t('Hide the panel (⌘I)')} aria-label={t('Hide the panel (⌘I)')}>
        ›
      </button>
      <RightPanel />
    </aside>
  );
}

function Work() {
  const rightOpen = useLayout((s) => s.rightOpen);
  const bottomOpen = useLayout((s) => s.bottomOpen);
  const bottomMax = useLayout((s) => s.bottomMax);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (handleLayoutKey(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const cls = ['work', rightOpen ? '' : 'right-closed', !bottomOpen ? 'bottom-closed' : bottomMax ? 'bottom-max' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <main className="center">
        <Center />
      </main>
      <Right />
      <div className="bottom">
        {bottomOpen && !bottomMax && <Splitter kind="log" />}
        <BottomPanel />
      </div>
    </div>
  );
}

export function App() {
  useEffect(() => {
    void boot();
  }, []);

  if (!window.bp) {
    return <div className="fatal">{t('BoardPilot must run inside its desktop app (the preload bridge is missing).')}</div>;
  }

  return (
    <div className="shell">
      <TopBar>
        <CommandBox />
      </TopBar>
      <ProjectTabs />
      <WarningBanner />
      <Work />
      <CodeFindingsLogger />
      <DevMenu />
      <PartEditor />
      <LicenseDialog />
      <AiSettingsDialog />
      <BoardPickerDialog />
      <NewProjectDialog />
      <ExportDialog />
      <ConfirmDialog />
      <LockScreen />
      {isWebDemo() && <DownloadAppPrompt />}
    </div>
  );
}
