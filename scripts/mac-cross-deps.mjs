// The Mac builds both arm64 and x64; npm only installed native packages for this Mac's arch. Add the other one.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

if (process.platform !== 'darwin') throw new Error('Run on macOS')
const optional = (pkg) => JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).optionalDependencies ?? {}
const wanted = []
for (const [owner, prefix] of [['embedded-postgres', '@embedded-postgres/darwin-'], ['@resvg/resvg-js', '@resvg/resvg-js-darwin-']]) {
  for (const [name, version] of Object.entries(optional(owner))) if (name.startsWith(prefix)) wanted.push(`${name}@${version}`)
}
console.log(`Installing ${wanted.join(', ')}`)
execFileSync('npm', ['install', '--no-save', '--force', ...wanted], { stdio: 'inherit' })
