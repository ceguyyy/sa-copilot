// Uploaded source files live on local disk under config.uploadDir, flat, named "<uuid>-<safe name>".
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.ts'

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '_').replace(/^\.+/, '')
  return cleaned.slice(-120) || 'file'
}

/** Resolves a stored key to an absolute path, refusing anything that could escape the upload dir. */
function resolveKey(key: string): string {
  const base = path.basename(key)
  if (!base || base !== key) throw new Error(`Invalid storage key: ${key}`)
  return path.join(config.uploadDir, base)
}

export async function saveUpload(file: File): Promise<string> {
  await mkdir(config.uploadDir, { recursive: true })
  const key = `${randomUUID()}-${safeFileName(file.name)}`
  await writeFile(resolveKey(key), Buffer.from(await file.arrayBuffer()))
  return key
}

export async function readUpload(key: string): Promise<Buffer> {
  return readFile(resolveKey(key))
}

export async function deleteUpload(key: string): Promise<void> {
  try {
    await unlink(resolveKey(key))
  } catch (e) {
    // Already gone is fine — the goal state is "file does not exist".
    if ((e as { code?: string }).code !== 'ENOENT') throw e
  }
}
