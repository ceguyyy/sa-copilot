// Every filesystem location the desktop app uses, for the installed app and for `npm run desktop` in the repo.
import path from 'node:path'

export interface PathInput {
  isPackaged: boolean
  /** Electron app.getAppPath(): resources/app when installed, the repo root in dev. */
  appPath: string
  /** process.resourcesPath: where extraResources (python, deck, templates) are installed. */
  resourcesPath: string
  userData: string
  documents: string
  platform: NodeJS.Platform
}

export interface AppPaths {
  appRoot: string
  dataDir: string
  pgDir: string
  uploadDir: string
  backupDir: string
  logsDir: string
  configFile: string
  defaultDocsDir: string
  distDir: string
  schemaFile: string
  serverEntry: string
  python: string
  deckScript: string
  defaultDeckTemplate: string
  routerAppDir: string
  outlineEntry: string
}

export function resolvePaths(input: PathInput): AppPaths {
  const root = input.appPath
  const res = input.resourcesPath
  const data = input.userData
  const pythonExe = input.platform === 'win32' ? path.join(res, 'python', 'python.exe') : path.join(res, 'python', 'bin', 'python3')
  return {
    appRoot: root,
    dataDir: data,
    pgDir: path.join(data, 'pg'),
    uploadDir: path.join(data, 'uploads'),
    backupDir: path.join(data, 'backups'),
    logsDir: path.join(data, 'logs'),
    configFile: path.join(data, 'config.json'),
    defaultDocsDir: path.join(input.documents, 'SA Copilot'),
    distDir: path.join(root, 'dist'),
    schemaFile: path.join(root, 'db', 'schema.sql'),
    serverEntry: path.join(root, 'server-dist', 'index.mjs'),
    python: input.isPackaged ? pythonExe : 'python',
    deckScript: input.isPackaged ? path.join(res, 'deck', 'build_deck.py') : path.join(root, 'server', 'deck', 'build_deck.py'),
    defaultDeckTemplate: input.isPackaged ? path.join(res, 'templates', 'deck.pptx') : path.join(root, 'data', 'templates', 'deck.pptx'),
    routerAppDir: path.join(root, 'node_modules', '9router', 'app'),
    outlineEntry: path.join(root, 'node_modules', 'outline-mcp-server', 'build', 'stdio.js'),
  }
}
