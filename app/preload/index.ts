// Preload: exposes a small typed API. No Node, filesystem or serial access leaks to the renderer.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { BoardPilotApi } from '@shared/api';

const call =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args);

const listen =
  (channel: string) =>
  (cb: (payload: never) => void) => {
    const h = (_e: IpcRendererEvent, payload: unknown) => cb(payload as never);
    ipcRenderer.on(`evt:${channel}`, h);
    return () => {
      ipcRenderer.removeListener(`evt:${channel}`, h);
    };
  };

const api: BoardPilotApi = {
  hw: {
    state: call('hw:state'),
    setMode: call('hw:setMode'),
    setBoard: call('hw:setBoard'),
    listPorts: call('hw:listPorts'),
    identify: call('hw:identify'),
    installAgent: call('hw:installAgent'),
    connectAgent: call('hw:connectAgent'),
    agent: call('hw:agent'),
    agentWrite: call('hw:agentWrite'),
    restore: call('hw:restore'),
    flashUser: call('hw:flashUser'),
    openSerial: call('hw:openSerial'),
    closeSerial: call('hw:closeSerial'),
    writeSerial: call('hw:writeSerial'),
    captureSerial: call('hw:captureSerial'),
    preflight: call('hw:preflight'),
  } as BoardPilotApi['hw'],
  sim: {
    scenarios: call('sim:scenarios'),
    load: call('sim:load'),
    scene: call('sim:scene'),
    control: call('sim:control'),
  } as BoardPilotApi['sim'],
  safety: { grant: call('safety:grant') } as BoardPilotApi['safety'],
  ai: {
    status: call('ai:status'),
    getSettings: call('ai:getSettings'),
    saveSettings: call('ai:saveSettings'),
    clearKey: call('ai:clearKey'),
    listModels: call('ai:listModels'),
    test: call('ai:test'),
    ask: call('ai:ask'),
    recognize: call('ai:recognize'),
    classify: call('ai:classify'),
    reset: call('ai:reset'),
  } as BoardPilotApi['ai'],
  session: {
    append: (entry) => ipcRenderer.send('session:append', entry),
    pickFile: call('session:pickFile'),
    openSketch: call('session:openSketch'),
    saveFile: call('session:saveFile'),
    exportReport: call('session:exportReport'),
    info: call('session:info'),
  } as BoardPilotApi['session'],
  parts: {
    list: call('parts:list'),
    save: call('parts:save'),
    remove: call('parts:remove'),
    importFromUrl: call('parts:import'),
  } as BoardPilotApi['parts'],
  project: {
    autosave: (scene) => ipcRenderer.send('project:autosave', scene),
    last: call('project:last'),
    save: call('project:save'),
    open: call('project:open'),
  } as BoardPilotApi['project'],
  mcp: { status: call('mcp:status'), setEnabled: call('mcp:setEnabled'), writeResult: call('mcp:writeResult') } as BoardPilotApi['mcp'],
  coach: {
    ask: call('coach:ask'),
    history: call('coach:history'),
    remove: call('coach:remove'),
    removeAll: call('coach:removeAll'),
  } as BoardPilotApi['coach'],
  license: {
    status: call('license:status'),
    activate: call('license:activate'),
    openBuyPage: call('license:buy'),
  } as BoardPilotApi['license'],
  app: {
    setLanguage: call('app:setLanguage'),
    openExternal: call('app:openExternal'),
  } as BoardPilotApi['app'],
  on: {
    state: listen('state'),
    live: listen('live'),
    serial: listen('serial'),
    probe: listen('probe'),
    log: listen('log'),
    progress: listen('progress'),
    trace: listen('trace'),
    mcpWrite: listen('mcpWrite'),
  } as BoardPilotApi['on'],
};

contextBridge.exposeInMainWorld('bp', api);
