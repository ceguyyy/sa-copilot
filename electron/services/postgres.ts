// Embedded PostgreSQL (binaries from the embedded-postgres npm packages) in <data>/pg.
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import EmbeddedPostgres from 'embedded-postgres'
import { isProcessAlive, isStalePidFile } from '../processes.ts'

const run = promisify(execFile)

const PACKAGES: Record<string, string> = {
  'win32-x64': '@embedded-postgres/windows-x64',
  'darwin-arm64': '@embedded-postgres/darwin-arm64',
  'darwin-x64': '@embedded-postgres/darwin-x64',
}

/** The npm package holding the Postgres binaries for this OS/CPU (only the targets the installers ship). */
export function platformPackage(platform: NodeJS.Platform, arch: string): string {
  const name = PACKAGES[`${platform}-${arch}`]
  if (!name) throw new Error(`Embedded Postgres is not supported on ${platform}-${arch}`)
  return name
}

async function pgCtl(): Promise<string> {
  const binaries = (await import(platformPackage(process.platform, process.arch))) as { pg_ctl: string }
  return binaries.pg_ctl
}

/** Clean shutdown that waits until Postgres has exited (embedded-postgres' own stop force-kills on Windows). */
async function stopCluster(dir: string, log: (l: string) => void): Promise<void> {
  try {
    await run(await pgCtl(), ['stop', '-D', dir, '-m', 'fast', '-w', '-t', '60'], { windowsHide: true })
  } catch (e) {
    log(`pg_ctl stop: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export async function startPostgres(opts: { dir: string; port: number; password: string; log: (l: string) => void }): Promise<{ stop(): Promise<void> }> {
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dir,
    user: 'postgres',
    password: opts.password,
    port: opts.port,
    persistent: true,
    // Always UTF-8 with a neutral locale: initdb otherwise uses the OS code page (WIN1252 on many Windows setups),
    // which cannot hold the schema's or the users' non-ASCII text.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: (m) => opts.log(String(m)),
    onError: (e) => opts.log(`ERROR ${String(e)}`),
  })
  if (!existsSync(path.join(opts.dir, 'PG_VERSION'))) {
    opts.log('initialising a new database cluster')
    await pg.initialise()
  } else {
    const pidFile = path.join(opts.dir, 'postmaster.pid')
    if (existsSync(pidFile)) {
      if (isStalePidFile(readFileSync(pidFile, 'utf8'), isProcessAlive)) {
        opts.log('removing stale postmaster.pid')
        rmSync(pidFile)
      } else {
        // Still running: an orphan of a previous run that crashed or was killed. This cluster is ours alone.
        opts.log('stopping a Postgres left running by a previous session')
        await stopCluster(opts.dir, opts.log)
      }
    }
  }
  await pg.start()
  return { stop: () => stopCluster(opts.dir, opts.log) }
}
