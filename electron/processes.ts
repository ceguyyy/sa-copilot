// Child-process housekeeping: stale Postgres lock files, killing process trees, simple log files.
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'

const MAX_LOG_BYTES = 5 * 1024 * 1024

/** postmaster.pid's first line is the server pid; the file is stale when that process no longer runs. */
export function isStalePidFile(content: string, isAlive: (pid: number) => boolean): boolean {
  const pid = Number.parseInt(content.split('\n')[0] ?? '', 10)
  return !Number.isInteger(pid) || pid <= 0 || !isAlive(pid)
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as { code?: string }).code === 'EPERM'
  }
}

export function killTreeCommand(pid: number, platform: NodeJS.Platform): { command: string; args: string[] } | null {
  return platform === 'win32' ? { command: 'taskkill', args: ['/PID', String(pid), '/T', '/F'] } : null
}

/** Kills a process and everything it started. On macOS the child must have been spawned with `detached: true`. */
export function killTree(pid: number): Promise<void> {
  const cmd = killTreeCommand(pid, process.platform)
  if (!cmd) {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      // already gone
    }
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const child = spawn(cmd.command, cmd.args, { stdio: 'ignore', windowsHide: true })
    child.on('exit', () => resolve())
    child.on('error', () => resolve())
  })
}

/** Appends "<ISO time> <line>" to <dir>/<name>.log, rolling over to <name>.log.1 at 5 MB. */
export function createLogger(dir: string, name: string): (line: string) => void {
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${name}.log`)
  return (line: string) => {
    try {
      if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_LOG_BYTES) renameSync(file, `${file}.1`)
      appendFileSync(file, `${new Date().toISOString()} ${line.replace(/\s+$/, '')}\n`)
    } catch {
      // logging must never take the app down
    }
  }
}
