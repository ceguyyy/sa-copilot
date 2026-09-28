import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CrashPolicy, ServerSupervisor, waitForHealth } from './server.ts'

describe('ServerSupervisor', () => {
  it('fails fast with the server’s own error when it keeps crashing on start', async () => {
    const entry = path.join(mkdtempSync(path.join(tmpdir(), 'sa-srv-')), 'crash.mjs')
    writeFileSync(entry, "console.error('Cannot set up PostgreSQL: encoding mismatch'); process.exit(1)\n")
    const fatal = vi.fn()
    const supervisor = new ServerSupervisor({ entry, execPath: process.execPath, log: () => {}, onFatal: fatal })
    const started = Date.now()
    await expect(supervisor.start({}, 'http://127.0.0.1:1/api/projects')).rejects.toThrow(/Cannot set up PostgreSQL: encoding mismatch/)
    expect(Date.now() - started).toBeLessThan(15_000)
    await supervisor.stop()
  }, 30_000)
})

describe('waitForHealth', () => {
  it('resolves once the server answers 200', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
    await waitForHealth('http://127.0.0.1:1/api/projects', 2000, fetchFn, 10)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('fails with the last error after the timeout', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(waitForHealth('http://127.0.0.1:1/api/projects', 50, fetchFn, 10)).rejects.toThrow(/did not become ready.*ECONNREFUSED/)
  })
})

describe('CrashPolicy', () => {
  it('restarts after the first crash and gives up on a second one within 5 minutes', () => {
    const policy = new CrashPolicy()
    expect(policy.recordCrash(0)).toBe('restart')
    expect(policy.recordCrash(60_000)).toBe('fatal')
  })
  it('restarts again when the last crash was long ago', () => {
    const policy = new CrashPolicy()
    expect(policy.recordCrash(0)).toBe('restart')
    expect(policy.recordCrash(10 * 60_000)).toBe('restart')
  })
})
