// 9router: reuse one already running on the device (its default port), else run the bundled copy on a free port.
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { killTree } from '../processes.ts'

export const DEFAULT_ROUTER_PORT = 20128
const START_TIMEOUT_MS = 60_000

/** Any HTTP answer from /v1/models means a 9router is there (401 just means we sent no key). */
export async function findRunningRouter(port = DEFAULT_ROUTER_PORT, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    await fetchFn(`http://127.0.0.1:${port}/v1/models`, { signal: AbortSignal.timeout(2000) })
    return true
  } catch {
    return false
  }
}

export function routerLaunch(opts: { execPath: string; appDir: string; port: number; baseEnv: NodeJS.ProcessEnv }) {
  return {
    command: opts.execPath,
    args: ['--dns-result-order=ipv4first', path.join(opts.appDir, 'server.js')],
    cwd: opts.appDir,
    env: {
      ...opts.baseEnv,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(opts.port),
      HOSTNAME: '127.0.0.1',
      // sql.js ships inside 9router's own node_modules; no runtime npm install is needed.
      NODE_PATH: path.join(opts.appDir, 'node_modules'),
    },
  }
}

export async function startRouter(opts: { execPath: string; appDir: string; port: number; log: (l: string) => void }): Promise<{ port: number; external: boolean; stop(): Promise<void> }> {
  if (await findRunningRouter(DEFAULT_ROUTER_PORT)) {
    opts.log(`reusing the 9router already running on ${DEFAULT_ROUTER_PORT}`)
    return { port: DEFAULT_ROUTER_PORT, external: true, stop: async () => {} }
  }
  const run = routerLaunch({ ...opts, baseEnv: process.env })
  const child: ChildProcess = spawn(run.command, run.args, {
    cwd: run.cwd,
    env: run.env,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.on('data', (d) => opts.log(String(d)))
  child.stderr?.on('data', (d) => opts.log(String(d)))
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve))

  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`9router exited during start (code ${child.exitCode}) — see 9router.log`)
    if (await findRunningRouter(opts.port)) {
      return {
        port: opts.port,
        external: false,
        stop: async () => {
          if (child.pid && child.exitCode === null) await killTree(child.pid)
          await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))])
        },
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (child.pid) await killTree(child.pid)
  throw new Error('9router did not start within 60 seconds — see 9router.log')
}
