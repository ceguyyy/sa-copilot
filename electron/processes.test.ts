import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLogger, isStalePidFile, killTreeCommand } from './processes.ts'

describe('isStalePidFile', () => {
  const pidFile = (pid: number) => `${pid}\n/data/pg\n1790000000\n54329\n`
  it('is stale when the recorded postmaster is gone', () => {
    expect(isStalePidFile(pidFile(4242), () => false)).toBe(true)
  })
  it('is not stale while that process runs', () => {
    expect(isStalePidFile(pidFile(4242), (pid) => pid === 4242)).toBe(false)
  })
  it('treats an unreadable pid file as stale', () => {
    expect(isStalePidFile('', () => true)).toBe(true)
    expect(isStalePidFile('garbage', () => true)).toBe(true)
  })
})

describe('killTreeCommand', () => {
  it('uses taskkill with /T on Windows', () => {
    expect(killTreeCommand(123, 'win32')).toEqual({ command: 'taskkill', args: ['/PID', '123', '/T', '/F'] })
  })
  it('uses a process-group signal elsewhere', () => {
    expect(killTreeCommand(123, 'darwin')).toBeNull()
  })
})

describe('createLogger', () => {
  it('appends timestamped lines to <name>.log', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sa-log-'))
    const log = createLogger(dir, 'server')
    log('hello')
    log('world')
    const text = readFileSync(path.join(dir, 'server.log'), 'utf8')
    expect(text).toMatch(/^\d{4}-\d\d-\d\dT.* hello\n.* world\n$/)
  })
})
