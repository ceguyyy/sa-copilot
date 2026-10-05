import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { UpdateStatus } from '../../shared/maintenance.ts'
import { config } from '../config.ts'
import { HttpError } from '../http.ts'
import { createBackup } from '../backup/service.ts'
import { exclusive, maintenanceBusy } from './lock.ts'

const exec = promisify(execFile)
let job: UpdateStatus['job']
const git = async (...args: string[]) => (await exec('git', args, {
  cwd: config.root, windowsHide: true, timeout: 60_000,
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
})).stdout.trim()

export async function updateStatus(fetchLatest = false): Promise<UpdateStatus> {
  let version = config.appVersion
  try { version = JSON.parse(await readFile(path.join(config.root, 'package.json'), 'utf8')).version } catch { /* bundled app */ }
  const base = { version, job }
  if (process.env.SA_APP_VERSION) return { ...base, supported: false, reason: 'Installed desktop app: install the new release from GitHub. Projects remain in the app data folder.' }
  try {
    const root = await git('rev-parse', '--show-toplevel')
    if (path.resolve(root) !== path.resolve(config.root)) throw new Error('Not the project checkout')
    const branch = await git('symbolic-ref', '--short', 'HEAD')
    const upstream = await git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')
    if (fetchLatest) {
      const remote = await git('config', '--get', `branch.${branch}.remote`)
      await git('fetch', '--', remote)
    }
    const [current, latest, counts, changes] = await Promise.all([
      git('rev-parse', 'HEAD'), git('rev-parse', upstream),
      git('rev-list', '--left-right', '--count', `HEAD...${upstream}`), git('status', '--porcelain'),
    ])
    const [ahead, behind] = counts.split(/\s+/).map(Number)
    return { ...base, supported: true, branch, current, latest, ahead, behind, dirty: !!changes }
  } catch {
    return { ...base, supported: false, reason: 'Git checkout/upstream unavailable, or fetch failed. Check Git access and the branch tracking configuration.' }
  }
}

async function npm(command: 'ci' | 'build') {
  const args = command === 'ci' ? ['ci'] : ['run', 'build']
  // Windows npm.cmd needs the command interpreter; arguments here are fixed, never supplied by HTTP.
  await exec(process.platform === 'win32' ? 'cmd.exe' : 'npm',
    process.platform === 'win32' ? ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`] : args,
    { cwd: config.root, windowsHide: true, timeout: 10 * 60_000, maxBuffer: 10 * 1024 * 1024 })
}

export async function startUpgrade(expectedCommit: string): Promise<UpdateStatus> {
  if (maintenanceBusy()) throw new HttpError(409, 'An operation is already running')
  if (job?.restartRequired) throw new HttpError(409, 'Restart SA Copilot before another upgrade')
  const status = await updateStatus(true)
  if (!status.supported || !status.latest) throw new HttpError(409, status.reason ?? 'Git unavailable')
  if (status.dirty || status.ahead) throw new HttpError(409, 'Commit or move local changes and resolve local commits before upgrading')
  if (status.latest !== expectedCommit) throw new HttpError(409, 'Remote changed; check for updates again')
  if (!status.behind) throw new HttpError(409, 'Already up to date')
  if (maintenanceBusy()) throw new HttpError(409, 'An operation is already running')
  // Acquire the lock synchronously before yielding the accepted response.
  const activeJob: NonNullable<UpdateStatus['job']> = { phase: 'Waiting for active requests', running: true }
  job = activeJob
  const task = exclusive(async () => {
    activeJob.phase = 'Backing up data'
    const backup = await createBackup()
    await mkdir(config.backupDir, { recursive: true })
    const file = path.join(config.backupDir, `pre-upgrade-${Date.now()}.sacopilot`)
    await writeFile(file, backup.data)
    activeJob.safetyBackup = file
    if (await git('status', '--porcelain')) throw new Error('Local files changed during upgrade preparation')
    activeJob.phase = 'Updating Git checkout'
    await git('merge', '--ff-only', expectedCommit)
    activeJob.phase = 'Installing dependencies'
    await npm('ci')
    activeJob.phase = 'Building application'
    await npm('build')
    activeJob.phase = 'Upgrade ready. Restart SA Copilot with npm start'
    activeJob.restartRequired = true
  })
  // A failed build can leave the checkout advanced. Keep the safety backup and make recovery explicit.
  void task.catch((e: unknown) => {
    activeJob.error = `Upgrade stopped during: ${activeJob.phase}. Fix the checkout, run npm ci and npm start. Any completed pre-upgrade backup is retained.`
    console.error('Upgrade failed', e instanceof Error ? e.name : 'unknown')
  }).finally(() => { activeJob.running = false })
  return { ...status, job }
}
