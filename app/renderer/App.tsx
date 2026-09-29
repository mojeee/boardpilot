import { useEffect } from 'react';
import { useApp } from './state/store';
import { wireEvents } from './state/hw';
import { TopBar } from './components/TopBar';
import { TaskRail, TASKS, openTask } from './components/TaskRail';
import { LogPanel } from './components/LogPanel';
import { Splitter } from './components/Splitter';
import { AssistantPanel } from './components/AssistantPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DevMenu } from './components/DevMenu';
import { Viewport } from './three/Viewport';
import { WizardWithAssistant } from './wizard/WizardPanel';
import { useWizard } from './wizard/session';
import { Home } from './screens/Home';
import { DebugPicker } from './screens/DebugPicker';
import { TestHardware } from './screens/TestHardware';
import { Monitor } from './screens/Monitor';
import { Report } from './screens/Report';
import { NewProjectPanel } from './screens/NewProject';
import { Learn } from './screens/Learn';
import { runDemo } from './demo';
import { PartEditor } from './components/PartEditor';
import { LicenseDialog, LockScreen, useLicense } from './components/License';
import { AiSettingsDialog } from './components/AiSettings';
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
  await Promise.all([useLicense.getState().refresh(), usePartsLib.getState().load()]);
  if (useApp.getState().conn.mode === 'real') {
    const last = await window.bp.project.last();
    if (last) useScene.getState().openScene(last);
  }
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

function RightPanel() {
  const screen = useApp((s) => s.screen);
  const flowId = useWizard((s) => s.state?.flowId);
  if (screen === 'newProject') return <NewProjectPanel />;
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

export function App() {
  useEffect(() => {
    void boot();
  }, []);

  if (!window.bp) {
    return <div className="fatal">{t('BoardPilot must run inside its desktop app (the preload bridge is missing).')}</div>;
  }

  return (
    <div className="shell">
      <TopBar />
      <TaskRail />
      <main className="center">
        <Center />
      </main>
      <aside className="right">
        <Splitter kind="right" />
        <RightPanel />
      </aside>
      <div className="bottom">
        <Splitter kind="log" />
        <LogPanel />
      </div>
      <DevMenu />
      <PartEditor />
      <LicenseDialog />
      <AiSettingsDialog />
      <BoardPickerDialog />
      <ConfirmDialog />
      <LockScreen />
      {isWebDemo() && <DownloadAppPrompt />}
    </div>
  );
}
