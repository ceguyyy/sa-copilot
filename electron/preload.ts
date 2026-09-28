import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBridge } from './bridge.ts'

const bridge: DesktopBridge = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (patch) => ipcRenderer.invoke('config:save', patch),
  restartRouter: () => ipcRenderer.invoke('router:restart'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openLogs: () => ipcRenderer.invoke('app:open-logs'),
  openFolder: (folder) => ipcRenderer.invoke('app:open-folder', folder),
  splashAction: (action) => ipcRenderer.send('splash:action', action),
}

contextBridge.exposeInMainWorld('saDesktop', bridge)
