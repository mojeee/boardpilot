// Project tabs: several projects open at once. The active project lives in useScene (the 3D view,
// the code, the checks all read it); the others wait here with their own undo history and template.
// Switching tabs puts the current project aside and brings the other one back exactly as it was.

import { create } from 'zustand';
import type { Scene } from '@shared/types';
import { t } from '@shared/i18n';
import { log, useApp, useScene } from './store';
import { attachTemplate, useTemplate } from './templateRun';

export interface ProjectTab {
  id: string;
  name: string;
  scene: Scene;
  past: Scene[];
  future: Scene[];
  /** the template the project was built from (its simulated run comes back with the tab) */
  templateId: string | null;
}

interface ProjectsState {
  tabs: ProjectTab[];
  active: string;
  /** the New project dialog */
  newOpen: boolean;
  newMode: NewMode | null;
  openNew(mode?: NewMode | null): void;
  closeNew(): void;
  /** Open a scene as a new tab and switch to it. */
  add(scene: Scene, name: string, opts?: { templateId?: string | null }): string;
  switchTo(id: string): void;
  close(id: string): void;
  reopen(): void;
  rename(id: string, name: string): void;
}

export type NewMode = 'blank' | 'port' | 'template' | 'describe';

let seq = 1;
const newId = () => `p${Date.now().toString(36)}${seq++}`;
/** Closed tabs, newest last, for ⌘⇧T. */
const closed: ProjectTab[] = [];

/** The active project as it is right now (scene, history, template). */
function snapshot(tab: ProjectTab): ProjectTab {
  const s = useScene.getState();
  return { ...tab, scene: s.scene, past: s.past, future: s.future, templateId: useTemplate.getState().tpl?.id ?? null };
}

/** Put a tab's project into the workspace. */
function load(tab: ProjectTab) {
  const sc = useScene.getState();
  if (sc.preview) sc.endPreview();
  sc.setScene(tab.scene);
  useScene.setState({ past: tab.past, future: tab.future, selected: null, highlight: [], loadNonce: useScene.getState().loadNonce + 1 });
  attachTemplate(tab.templateId);
}

export const useProjects = create<ProjectsState>((set, get) => ({
  tabs: [{ id: 'p0', name: 'Project', scene: useScene.getState().scene, past: [], future: [], templateId: null }],
  active: 'p0',
  newOpen: false,
  newMode: null,
  openNew: (mode = null) => set({ newOpen: true, newMode: mode }),
  closeNew: () => set({ newOpen: false, newMode: null }),
  add: (scene, name, opts) => {
    const st = get();
    const tabs = st.tabs.map((x) => (x.id === st.active ? snapshot(x) : x));
    const tab: ProjectTab = { id: newId(), name, scene, past: [], future: [], templateId: opts?.templateId ?? null };
    set({ tabs: [...tabs, tab], active: tab.id });
    if (useTemplate.getState().tpl) useTemplate.getState().close();
    load(tab);
    useApp.getState().setScreen('newProject');
    return tab.id;
  },
  switchTo: (id) => {
    const st = get();
    if (id === st.active) return;
    const target = st.tabs.find((x) => x.id === id);
    if (!target) return;
    set({ tabs: st.tabs.map((x) => (x.id === st.active ? snapshot(x) : x)), active: id });
    load(target);
  },
  close: (id) => {
    const st = get();
    const i = st.tabs.findIndex((x) => x.id === id);
    if (i < 0) return;
    const tab = id === st.active ? snapshot(st.tabs[i]) : st.tabs[i];
    closed.push(tab);
    if (closed.length > 10) closed.shift();
    const rest = st.tabs.filter((x) => x.id !== id);
    if (tab.scene.parts.length || tab.scene.sketch?.text.trim()) log('info', t('Closed “{name}”. ⌘⇧T opens it again.', { name: tabName(tab) }));
    if (!rest.length) {
      // The last tab: an empty project on the same board takes its place.
      const blank: ProjectTab = { id: newId(), name: t('Untitled'), scene: { board: tab.scene.board, parts: [], wires: [] }, past: [], future: [], templateId: null };
      set({ tabs: [blank], active: blank.id });
      load(blank);
      return;
    }
    if (id !== st.active) return set({ tabs: rest });
    const next = rest[Math.min(i, rest.length - 1)];
    set({ tabs: rest, active: next.id });
    load(next);
  },
  reopen: () => {
    const tab = closed.pop();
    if (!tab) return;
    const st = get();
    set({ tabs: [...st.tabs.map((x) => (x.id === st.active ? snapshot(x) : x)), tab], active: tab.id });
    load(tab);
  },
  rename: (id, name) => {
    const n = name.trim().slice(0, 60);
    if (n) set({ tabs: get().tabs.map((x) => (x.id === id ? { ...x, name: n } : x)) });
  },
}));

/** A tab's name as shown (the first tab's default name is translated at render time). */
export const tabName = (tab: ProjectTab) => (tab.name === 'Project' || tab.name === 'Demo bench' ? t(tab.name) : tab.name);

/** Name the first tab once the start-up project is known (the simulator's bench, or the last project). */
export function nameFirstTab(name: string) {
  const st = useProjects.getState();
  if (st.tabs.length === 1) useProjects.setState({ tabs: [{ ...st.tabs[0], name }] });
}

export const openNewProject = (mode: NewMode | null = null) => useProjects.getState().openNew(mode);

/** ⌘⇧T reopens the last closed project. */
export function handleProjectKey(e: KeyboardEvent): boolean {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 't') {
    useProjects.getState().reopen();
    return true;
  }
  return false;
}
