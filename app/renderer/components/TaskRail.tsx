// The tasks and the top menu that opens them. The menu replaced the left task rail (workspace
// redesign): the project page is the main place, the other tasks are one click away.

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

/** The top menu: short names, the full task name as the tooltip. */
export const MENU: { screen: Screen; label: string; icon: string; hint: string }[] = [
  { screen: 'newProject', label: 'Project', icon: 'project', hint: 'Your project: the 3D board, the code, the log and the assistant' },
  { screen: 'connect', label: 'Connect', icon: 'connect', hint: 'Find the board and read its chip' },
  { screen: 'flash', label: 'Flash', icon: 'flash', hint: 'Write a program to the board, safely' },
  { screen: 'debug', label: 'Debug', icon: 'debug', hint: 'Find out why something does not work' },
  { screen: 'monitor', label: 'Monitor', icon: 'monitor', hint: 'Live values, serial output and memory' },
  { screen: 'test', label: 'Test', icon: 'test', hint: 'Check pins, buses and decoded signals' },
  { screen: 'report', label: 'Report', icon: 'report', hint: 'Summary of this session to share' },
  { screen: 'learn', label: 'Learn', icon: 'learn', hint: 'Visual lessons, from zero to senior' },
];

export function TopMenu() {
  const screen = useApp((s) => s.screen);
  return (
    <nav className="top-menu" aria-label={t('Tasks')}>
      {MENU.map((m) => (
        <button
          key={m.screen}
          className={`menu-item ${screen === m.screen ? 'on' : ''}`}
          aria-current={screen === m.screen ? 'page' : undefined}
          onClick={() => (m.screen === 'learn' ? useApp.getState().setScreen('learn') : openTask(m.screen))}
          title={t(m.hint)}
          data-where={`menu:${m.screen === 'newProject' ? 'project' : m.screen}`}
        >
          <Icon name={m.icon} size={15} />
          <span>{t(m.label)}</span>
        </button>
      ))}
    </nav>
  );
}
