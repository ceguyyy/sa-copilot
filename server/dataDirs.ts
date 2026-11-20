// Folders for app data that is not a user file, all under config.dataDir. They used to sit next to the upload
// folder (path.dirname(UPLOAD_DIR)), which put them at the root of a drive when UPLOAD_DIR was e.g. "C:/SA Copilot";
// migrateLegacyDataDirs moves them over once.
import { cp, mkdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.ts'

const MOVED = ['mcp-oauth', 'cekat-browser'] as const

/** MCP OAuth logins (one private file per server). */
export const mcpAuthDir = () => path.join(config.dataDir, 'mcp-oauth')
/** The saved browser profile the Cekat builder logs in with. */
export const cekatProfileDir = () => path.join(config.dataDir, 'cekat-browser')

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  )

/** A folder's old location: next to the upload folder. */
export const legacyDataDir = (name: string) => path.join(path.dirname(config.uploadDir), name)

async function move(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch (e) {
    // rename cannot cross drives; copy, then remove the old copy.
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
    await cp(from, to, { recursive: true, errorOnExist: true })
    await rm(from, { recursive: true, force: true })
  }
}

/**
 * Moves each folder from its old location to config.dataDir when only the old one exists. A folder already in the
 * new place is never overwritten. Returns what moved, for the startup log.
 */
export async function migrateLegacyDataDirs(): Promise<string[]> {
  const moved: string[] = []
  for (const name of MOVED) {
    const from = legacyDataDir(name)
    const to = path.join(config.dataDir, name)
    if (path.resolve(from) === path.resolve(to) || !(await exists(from)) || (await exists(to))) continue
    await move(from, to)
    moved.push(`${from} → ${to}`)
  }
  return moved
}
