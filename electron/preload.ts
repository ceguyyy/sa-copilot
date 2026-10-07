import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBridge } from './bridge.ts'

const bridge: DesktopBridge = {
  getUpdates: () => ipcRenderer.invoke('updates:get'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (patch) => ipcRenderer.invoke('config:save', patch),
  restartRouter: () => ipcRenderer.invoke('router:restart'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openLogs: () => ipcRenderer.invoke('app:open-logs'),
  openFolder: (folder) => ipcRenderer.invoke('app:open-folder', folder),
  splashAction: (action) => ipcRenderer.send('splash:action', action),
}

contextBridge.exposeInMainWorld('saDesktop', bridge)
