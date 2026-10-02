// Portable CPython (python-build-standalone) for one target, with markitdown + python-pptx installed,
// into build/python/<os>-<arch>/. Also copies the pitch deck template into build/templates/.
// Usage: node --env-file-if-exists=.env scripts/fetch-python.mjs <win|mac> <x64|arm64>
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [os, arch] = process.argv.slice(2)
const TRIPLES = { 'win-x64': 'x86_64-pc-windows-msvc', 'mac-arm64': 'aarch64-apple-darwin', 'mac-x64': 'x86_64-apple-darwin' }
const triple = TRIPLES[`${os}-${arch}`]
if (!triple) throw new Error('Usage: fetch-python.mjs <win|mac> <x64|arm64> (win supports x64 only)')
if ((os === 'win') !== (process.platform === 'win32')) throw new Error(`Build the ${os} Python on ${os === 'win' ? 'Windows' : 'macOS'}`)

const PACKAGES = ['markitdown[pdf,docx,pptx,xlsx,xls,outlook]==0.1.7', 'python-pptx==1.0.2']
const dest = path.join('build', 'python', `${os}-${arch}`)
const stamp = path.join(dest, '.complete')
const spec = JSON.stringify({ triple, PACKAGES })

if (existsSync(stamp) && readFileSync(stamp, 'utf8').startsWith(spec)) {
  console.log(`Python for ${os}-${arch} is up to date`)
} else {
  // In CI, GITHUB_TOKEN lifts the API rate limit that a shared runner IP hits easily.
  const auth = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}
  const res = await fetch('https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest', { headers: { 'User-Agent': 'sa-copilot-build', ...auth } })
  if (!res.ok) throw new Error(`GitHub API ${res.status} while looking up the portable Python release`)
  const release = await res.json()
  const asset = release.assets.find((a) => a.name.startsWith('cpython-3.12.') && a.name.endsWith(`-${triple}-install_only_stripped.tar.gz`))
  if (!asset) throw new Error(`No CPython 3.12 build for ${triple} in ${release.tag_name}`)
  mkdirSync(path.join('build', 'cache'), { recursive: true })
  const archive = path.join('build', 'cache', asset.name)
  if (!existsSync(archive)) {
    console.log(`Downloading ${asset.name}`)
    writeFileSync(archive, Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer()))
  }
  const tmp = `${dest}-tmp`
  rmSync(tmp, { recursive: true, force: true })
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  execFileSync('tar', ['-xzf', archive, '-C', tmp], { stdio: 'inherit' })
  renameSync(path.join(tmp, 'python'), dest)
  rmSync(tmp, { recursive: true, force: true })

  const py = os === 'win' ? path.join(dest, 'python.exe') : path.join(dest, 'bin', 'python3')
  // On an Apple Silicon Mac the x64 interpreter runs under Rosetta, so pip picks x86_64 wheels.
  const [cmd, pre] = os === 'mac' && arch === 'x64' && process.arch === 'arm64' ? ['arch', ['-x86_64', py]] : [py, []]
  execFileSync(cmd, [...pre, '-m', 'pip', 'install', '--no-warn-script-location', '--disable-pip-version-check', ...PACKAGES], { stdio: 'inherit' })
  const freeze = execFileSync(cmd, [...pre, '-m', 'pip', 'freeze'], { encoding: 'utf8' })
  writeFileSync(stamp, `${spec}\n${release.tag_name}\n${freeze}`)
  console.log(`Python ready in ${dest}`)
}

mkdirSync(path.join('build', 'templates'), { recursive: true })
const template = process.env.DECK_TEMPLATE
if (template && existsSync(template)) {
  copyFileSync(template, path.join('build', 'templates', 'deck.pptx'))
  console.log(`Deck template: ${template}`)
} else {
  console.warn('DECK_TEMPLATE not found — installers will ask for a template path in Settings → Connections')
}
