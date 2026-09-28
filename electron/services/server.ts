// The SA Copilot server (server-dist/index.mjs) as a child process: start, health check, restart, crash policy.
import { spawn, type ChildProcess } from 'node:child_process'
import { killTree } from '../processes.ts'

const START_TIMEOUT_MS = 90_000
const CRASH_WINDOW_MS = 5 * 60_000
const TAIL_LINES = 8

export async function waitForHealth(url: string, timeoutMs: number, fetchFn: typeof fetch = fetch, intervalMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let last = 'no response'
  for (;;) {
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(3000) })
      if (res.status === 200) return
      last = `HTTP ${res.status}`
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
    }
    if (Date.now() + intervalMs > deadline) throw new Error(`SA Copilot server did not become ready: ${last}`)
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

/** One automatic restart; a second crash within 5 minutes is fatal. */
export class CrashPolicy {
  private lastCrash: number | null = null

  recordCrash(now: number): 'restart' | 'fatal' {
    const recent = this.lastCrash !== null && now - this.lastCrash < CRASH_WINDOW_MS
    this.lastCrash = now
    return recent ? 'fatal' : 'restart'
  }
}

interface SupervisorOptions {
  entry: string
  execPath: string
  log: (l: string) => void
  onFatal: (message: string) => void
}

export class ServerSupervisor {
  private child: ChildProcess | null = null
  private stopping = false
  private readonly policy = new CrashPolicy()
  private env: Record<string, string> = {}
  private healthUrl = ''
  private readonly opts: SupervisorOptions
  /** Last output lines, so a fatal error can say why (e.g. the database could not be set up). */
  private tail: string[] = []
  /** Rejects the start() in progress when the server dies for good before becoming healthy. */
  private failStart: ((error: Error) => void) | null = null

  constructor(opts: SupervisorOptions) {
    this.opts = opts
  }

  private collect(chunk: Buffer): void {
    const text = String(chunk)
    this.opts.log(text)
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    this.tail = [...this.tail, ...lines].slice(-TAIL_LINES)
  }

  private fatal(): void {
    const detail = this.tail.length ? ['', '', ...this.tail].join('\n') : ''
    const message = `The SA Copilot server stopped twice in a few minutes.${detail}`
    if (this.failStart) this.failStart(new Error(message))
    else this.opts.onFatal(message)
  }

  private spawnChild(): void {
    const child = spawn(this.opts.execPath, [this.opts.entry], {
      env: { ...process.env, ...this.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', (d: Buffer) => this.collect(d))
    child.stderr?.on('data', (d: Buffer) => this.collect(d))
    child.once('exit', (code) => {
      if (this.child !== child || this.stopping) return
      this.opts.log(`server exited unexpectedly (code ${code})`)
      if (this.policy.recordCrash(Date.now()) === 'fatal') {
        this.fatal()
        return
      }
      this.spawnChild()
      waitForHealth(this.healthUrl, START_TIMEOUT_MS).catch((e) => this.opts.onFatal(e instanceof Error ? e.message : String(e)))
    })
    this.child = child
  }

  async start(env: Record<string, string>, healthUrl: string): Promise<void> {
    this.env = env
    this.healthUrl = healthUrl
    this.stopping = false
    this.tail = []
    const failed = new Promise<never>((_, reject) => {
      this.failStart = reject
    })
    try {
      this.spawnChild()
      await Promise.race([waitForHealth(healthUrl, START_TIMEOUT_MS), failed])
    } finally {
      this.failStart = null
    }
  }

  async restart(env: Record<string, string>, healthUrl: string): Promise<void> {
    await this.stop()
    await this.start(env, healthUrl)
  }

  async stop(): Promise<void> {
    this.stopping = true
    const child = this.child
    this.child = null
    if (!child?.pid || child.exitCode !== null) return
    const exited = new Promise((r) => child.once('exit', r))
    await killTree(child.pid)
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))])
  }
}
