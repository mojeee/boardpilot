import { useEffect } from 'react';
import { useApp } from './state/store';
import { wireEvents } from './state/hw';
import { TopBar } from './components/TopBar';
import { TaskRail, TASKS, openTask } from './components/TaskRail';
import { LogPanel } from './components/LogPanel';
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
import { runDemo } from './demo';
import { PartEditor } from './components/PartEditor';
import { LicenseDialog, LockScreen, useLicense } from './components/License';
import { usePartsLib } from './state/partsLib';
import { useScene } from './state/store';

let booted = false;
/** One-time start-up: events, license, user parts, project autosave. */
async function boot() {
  if (booted) return;
  booted = true;
  await wireEvents();
  await Promise.all([useLicense.getState().refresh(), usePartsLib.getState().load()]);
  if (useApp.getState().conn.mode === 'real') {
    const last = await window.bp.project.last();
    if (last) useScene.getState().setScene(last);
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  useScene.subscribe((s, prev) => {
    if (s.scene === prev.scene) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => window.bp.project.autosave(useScene.getState().scene), 800);
  });
  const params = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  const screen = params.get('screen');
  if (screen) openTask(screen as Parameters<typeof openTask>[0]);
  const demo = params.get('demo');
  if (demo) void runDemo(demo, params.get('scenario'));
}

function FlowStarter({ screen }: { screen: string }) {
  const t = TASKS.find((x) => x.screen === screen);
  return (
    <div className="right-split">
      <div className="right-top">
        <div className="wizard">
          <div className="panel-title">{t?.label}</div>
          <p className="dim">{t?.hint}</p>
          {t?.flow && (
            <button className="btn primary" onClick={() => useWizard.getState().start(t.flow!)}>
              Start
            </button>
          )}
        </div>
      </div>
      <div className="right-bottom">
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
  if (screen === 'connect' || screen === 'flash') {
    const want = TASKS.find((t) => t.screen === screen)?.flow;
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
    default:
      return <Viewport />;
  }
}

export function App() {
  useEffect(() => {
    void boot();
  }, []);

  if (!window.bp) {
    return <div className="fatal">BoardPilot must run inside its desktop app (the preload bridge is missing).</div>;
  }

  return (
    <div className="shell">
      <TopBar />
      <TaskRail />
      <main className="center">
        <Center />
      </main>
      <aside className="right">
        <RightPanel />
      </aside>
      <div className="bottom">
        <LogPanel />
      </div>
      <DevMenu />
      <PartEditor />
      <LicenseDialog />
      <ConfirmDialog />
      <LockScreen />
    </div>
  );
}
