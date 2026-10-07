import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CrashPolicy, ServerSupervisor, waitForHealth } from './server.ts'

describe('ServerSupervisor', () => {
  it('reports a missing executable instead of emitting an unhandled process error', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sa-srv-missing-'))
    const fatal = vi.fn()
    const supervisor = new ServerSupervisor({ entry: 'server.mjs', execPath: path.join(dir, 'missing-node'), log: () => {}, onFatal: fatal })
    await expect(supervisor.start({}, 'http://127.0.0.1:1/api/health')).rejects.toThrow(/Could not start.*ENOENT/)
    expect(fatal).not.toHaveBeenCalled()
    await supervisor.stop()
  })

  it('cancels startup and stops the child when the app closes before readiness', async () => {
    const entry = path.join(mkdtempSync(path.join(tmpdir(), 'sa-srv-stop-')), 'idle.mjs')
    writeFileSync(entry, 'setInterval(() => {}, 1000)\n')
    const fatal = vi.fn()
    const supervisor = new ServerSupervisor({ entry, execPath: process.execPath, log: () => {}, onFatal: fatal })
    const started = supervisor.start({}, 'http://127.0.0.1:1/api/health')
    const rejected = expect(started).rejects.toThrow(/stopped|abort/i)
    await supervisor.stop()
    await rejected
    expect(fatal).not.toHaveBeenCalled()
  })

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
  it('cancels a pending health poll without another request', async () => {
    const controller = new AbortController()
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    const ready = waitForHealth('http://127.0.0.1:1/api/health', 90_000, fetchFn, 500, controller.signal)
    const rejected = expect(ready).rejects.toThrow(/abort/i)
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledOnce())
    controller.abort()
    await rejected
    expect(fetchFn).toHaveBeenCalledOnce()
  })
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
