import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const directory = path.join(root, 'data', 'claude-office')
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
// Check the daemon before downloading or building anything.
run('docker', ['info', '--format', '{{.ServerVersion}}'])
if (!existsSync(directory)) {
  mkdirSync(path.dirname(directory), { recursive: true })
  run('git', ['clone', '--depth', '1', 'https://github.com/paulrobello/claude-office.git', directory])
}
if (!existsSync(path.join(directory, 'docker-compose.yml'))) {
  throw new Error(`Missing docker-compose.yml in ${directory}`)
}
run('docker', ['compose', '-f', path.join(directory, 'docker-compose.yml'), '-f', path.join(root, 'scripts', 'office-compose.yml'), 'up', '-d', '--build'], directory)
console.log('Claude Office: http://localhost:8000. Open Home in SA Copilot and click Refresh.')
console.log('Install Claude Code hooks using the upstream guide to see live activity.')
