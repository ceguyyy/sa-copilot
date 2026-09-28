// Where the app keeps its data, for Settings → Connections ("where is everything stored?").
import type { AppPaths } from './paths.ts'
import { FOLDER_KEYS, type FolderKey } from './settings.ts'

export function folderLocations(paths: AppPaths, docsDir: string): Record<FolderKey, string> {
  return {
    data: paths.dataDir,
    database: paths.pgDir,
    uploads: paths.uploadDir,
    backups: paths.backupDir,
    logs: paths.logsDir,
    exports: docsDir || paths.defaultDocsDir,
  }
}

/** Only these names cross the IPC boundary, so the renderer can never ask to open an arbitrary path. */
export function isFolderKey(value: unknown): value is FolderKey {
  return typeof value === 'string' && (FOLDER_KEYS as readonly string[]).includes(value)
}
