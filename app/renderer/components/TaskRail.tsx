import { useApp, type Screen } from '../state/store';
import { useWizard } from '../wizard/session';
import { Icon } from './Icon';
import { t } from '@shared/i18n';

export const TASKS: { screen: Screen; label: string; icon: string; flow?: string; hint: string }[] = [
  { screen: 'connect', label: 'Connect and identify', icon: 'connect', flow: 'connect-identify', hint: 'Find the board and read its chip' },
  { screen: 'newProject', label: 'New project', icon: 'project', hint: 'Pick parts, get safe pins and starter code' },
  { screen: 'flash', label: 'Flash firmware', icon: 'flash', flow: 'flash-firmware', hint: 'Write a program to the board, safely' },
  { screen: 'debug', label: 'Debug a problem', icon: 'debug', hint: 'Find out why something does not work' },
  { screen: 'monitor', label: 'Monitor', icon: 'monitor', hint: 'Live values, serial output and memory' },
  { screen: 'test', label: 'Test hardware', icon: 'test', hint: 'Check pins, buses and decoded signals' },
  { screen: 'report', label: 'Report', icon: 'report', hint: 'Summary of this session to share' },
];

export function openTask(screen: Screen) {
  const task = TASKS.find((x) => x.screen === screen);
  useApp.getState().setScreen(screen);
  const w = useWizard.getState();
  if (task?.flow && w.state?.flowId !== task.flow) w.start(task.flow);
  if (screen === 'debug' && w.state && !w.state.flowId.startsWith('debug-')) w.cancel();
}

export function TaskRail() {
  const screen = useApp((s) => s.screen);
  return (
    <nav className="rail">
      <button className={`rail-item ${screen === 'home' ? 'on' : ''}`} onClick={() => useApp.getState().setScreen('home')}>
        <Icon name="home" /> {t('Home')}
      </button>
      <div className="rail-sep">{t('Tasks')}</div>
      {TASKS.map((task, i) => (
        <button key={task.screen} className={`rail-item ${screen === task.screen ? 'on' : ''}`} onClick={() => openTask(task.screen)} title={t(task.hint)}>
          <Icon name={task.icon} />
          <span className="rail-num mono">{i + 1}</span>
          {t(task.label)}
        </button>
      ))}
    </nav>
  );
}
