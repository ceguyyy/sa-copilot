// SA Copilot desktop: starts Postgres → 9router → server, shows the UI, and shuts everything down on quit.
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import type { DesktopStatus } from './bridge.ts'
import { buildServerEnv, ConfigStore, parsePatch, publicConfig, type Cipher, type DesktopConfig, type Ports } from './config.ts'
import { folderLocations, isFolderKey } from './locations.ts'
import { resolvePaths } from './paths.ts'
import { freePort } from './ports.ts'
import { createLogger } from './processes.ts'
import { startPostgres } from './services/postgres.ts'
import { startRouter } from './services/router9.ts'
import { ServerSupervisor } from './services/server.ts'

if (process.env.SA_COPILOT_DATA_DIR) app.setPath('userData', path.resolve(process.env.SA_COPILOT_DATA_DIR))
if (!app.requestSingleInstanceLock()) app.quit()

const paths = resolvePaths({
  isPackaged: app.isPackaged,
  appPath: app.getAppPath(),
  resourcesPath: process.resourcesPath,
  userData: app.getPath('userData'),
  documents: app.getPath('documents'),
  platform: process.platform,
})
mkdirSync(paths.logsDir, { recursive: true })
const logMain = createLogger(paths.logsDir, 'main')

const cipher: Cipher = {
  encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
  decrypt: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')),
}
const store = new ConfigStore(paths.configFile, cipher)

let splash: BrowserWindow | null = null
let win: BrowserWindow | null = null
let cfg: DesktopConfig
const ports: Ports = { postgres: 0, router: 0, server: 0 }
let postgres: { stop(): Promise<void> } | null = null
let router: { port: number; external: boolean; stop(): Promise<void> } | null = null
let quitting = false

const supervisor = new ServerSupervisor({
  entry: paths.serverEntry,
  execPath: process.execPath,
  log: createLogger(paths.logsDir, 'server'),
  onFatal: (message) => showFatal(message),
})

const serverUrl = () => `http://127.0.0.1:${ports.server}`
const healthUrl = () => `${serverUrl()}/api/health`
const splashFile = path.join(import.meta.dirname, 'splash.html')

function secureWindow(options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const w = new BrowserWindow({
    ...options,
    webPreferences: { preload: path.join(import.meta.dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith(serverUrl())) void shell.openExternal(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(serverUrl())) event.preventDefault()
  })
  return w
}

function setStatus(text: string) {
  logMain(text)
  void splash?.webContents.executeJavaScript(`setStatus(${JSON.stringify(text)})`).catch(() => {})
}

function showFatal(message: string) {
  logMain(`FATAL ${message}`)
  const show = () => void splash?.webContents.executeJavaScript(`showError(${JSON.stringify(message)})`).catch(() => {})
  if (!splash || splash.isDestroyed()) {
    splash = secureWindow({ width: 460, height: 360, resizable: false, title: 'SA Copilot' })
    splash.webContents.once('did-finish-load', show)
    void splash.loadFile(splashFile)
    return
  }
  show()
}

async function startServices(): Promise<void> {
  cfg = await store.ensurePgPassword()

  setStatus('Menyiapkan database…')
  if (!postgres) {
    ports.postgres = await freePort()
    postgres = await startPostgres({ dir: paths.pgDir, port: ports.postgres, password: cfg.pgPassword, log: createLogger(paths.logsDir, 'postgres') })
  }

  setStatus('Menjalankan AI router…')
  if (!router) {
    try {
      router = await startRouter({ execPath: process.execPath, appDir: paths.routerAppDir, port: await freePort(), log: createLogger(paths.logsDir, '9router') })
    } catch (e) {
      // The app still works without AI; Settings → Connections can restart the router.
      logMain(`9router failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  ports.router = router?.port ?? 0

  setStatus('Menjalankan SA Copilot…')
  if (!ports.server) ports.server = await freePort()
  await supervisor.start(buildServerEnv(cfg, paths, ports, app.getVersion()), healthUrl())
}

async function boot(): Promise<void> {
  if (!splash || splash.isDestroyed()) splash = secureWindow({ width: 460, height: 360, resizable: false, title: 'SA Copilot' })
  if (!splash.webContents.getURL()) await splash.loadFile(splashFile)
  try {
    await startServices()
  } catch (e) {
    showFatal(e instanceof Error ? e.message : String(e))
    return
  }
  win = secureWindow({ width: 1440, height: 920, minWidth: 1024, minHeight: 700, title: 'SA Copilot', show: false })
  win.once('ready-to-show', () => {
    win?.show()
    splash?.destroy()
    splash = null
  })
  await win.loadURL(`${serverUrl()}/`)

  if (process.env.SA_COPILOT_SMOKE === '1') {
    writeFileSync(path.join(paths.logsDir, 'ready.json'), JSON.stringify({ server: ports.server, postgres: ports.postgres, router: ports.router }))
    setTimeout(() => app.quit(), 3000)
  }
}

async function status(): Promise<DesktopStatus> {
  return {
    ...publicConfig(cfg),
    routerDashboardUrl: ports.router ? `http://127.0.0.1:${ports.router}/dashboard` : '',
    routerExternal: router?.external ?? false,
    dataDir: paths.dataDir,
    version: app.getVersion(),
    folders: folderLocations(paths, cfg.values.docsDir),
  }
}

ipcMain.handle('config:get', () => status())
ipcMain.handle('config:save', async (_e, input: unknown) => {
  cfg = await store.save(parsePatch(input))
  await supervisor.restart(buildServerEnv(cfg, paths, ports, app.getVersion()), healthUrl())
  return status()
})
ipcMain.handle('router:restart', async () => {
  await router?.stop()
  router = null
  router = await startRouter({ execPath: process.execPath, appDir: paths.routerAppDir, port: await freePort(), log: createLogger(paths.logsDir, '9router') })
  ports.router = router.port
  await supervisor.restart(buildServerEnv(cfg, paths, ports, app.getVersion()), healthUrl())
  return status()
})
ipcMain.handle('shell:open-external', async (_e, url: unknown) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Only http(s) links can be opened')
  await shell.openExternal(url)
})
ipcMain.handle('app:open-logs', async () => {
  await shell.openPath(paths.logsDir)
})
ipcMain.handle('app:open-folder', async (_e, folder: unknown) => {
  if (!isFolderKey(folder)) throw new Error('Unknown folder')
  const target = folderLocations(paths, cfg.values.docsDir)[folder]
  await mkdir(target, { recursive: true })
  const error = await shell.openPath(target)
  if (error) throw new Error(error)
})
ipcMain.on('splash:action', (_e, action: unknown) => {
  if (action === 'retry') void boot()
  else if (action === 'logs') void shell.openPath(paths.logsDir)
  else if (action === 'quit') app.quit()
})

app.on('second-instance', () => {
  const target = win ?? splash
  if (target && !target.isDestroyed()) {
    if (target.isMinimized()) target.restore()
    target.focus()
  }
})

app.on('window-all-closed', () => app.quit())

app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  void (async () => {
    logMain('shutting down')
    await supervisor.stop().catch((e) => logMain(`server stop: ${e}`))
    await router?.stop().catch((e) => logMain(`9router stop: ${e}`))
    await postgres?.stop().catch((e) => logMain(`postgres stop: ${e}`))
    app.exit(0)
  })()
})

void app.whenReady().then(boot)
