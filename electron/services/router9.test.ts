import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { findRunningRouter, routerLaunch } from './router9.ts'

describe('findRunningRouter', () => {
  it('reuses anything answering /v1/models (even 401 without a key)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }))
    expect(await findRunningRouter(20128, fetchFn)).toBe(true)
    expect(fetchFn.mock.calls[0][0]).toBe('http://127.0.0.1:20128/v1/models')
  })
  it('reports no router when nothing answers', async () => {
    expect(await findRunningRouter(20128, vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))).toBe(false)
  })
})

describe('routerLaunch', () => {
  it('runs the bundled Next server with the app runtime, local-only, with its node_modules on NODE_PATH', () => {
    const run = routerLaunch({ execPath: '/A/SA Copilot', appDir: '/A/app/node_modules/9router/app', port: 51000, baseEnv: { PATH: '/bin' } })
    expect(run.command).toBe('/A/SA Copilot')
    expect(run.args).toEqual(['--dns-result-order=ipv4first', path.join('/A/app/node_modules/9router/app', 'server.js')])
    expect(run.cwd).toBe('/A/app/node_modules/9router/app')
    expect(run.env).toMatchObject({ PATH: '/bin', ELECTRON_RUN_AS_NODE: '1', PORT: '51000', HOSTNAME: '127.0.0.1', NODE_PATH: path.join('/A/app/node_modules/9router/app', 'node_modules') })
  })
})
