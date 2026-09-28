// Bundles the server and the Electron main/preload with esbuild. node_modules stay external (shipped as-is).
import { cpSync, mkdirSync } from 'node:fs'
import { build } from 'esbuild'

const node = { bundle: true, platform: 'node', target: 'node22', sourcemap: true, logLevel: 'info' }

await build({
  ...node,
  packages: 'external',
  entryPoints: ['server/index.ts'],
  outfile: 'server-dist/index.mjs',
  format: 'esm',
  // Some dependencies still use require(); give the ESM bundle one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
})
await build({ ...node, packages: 'external', entryPoints: ['electron/main.ts'], outfile: 'electron-dist/main.mjs', format: 'esm', external: ['electron'] })
// The preload runs sandboxed: CommonJS, and it only imports electron.
await build({ ...node, entryPoints: ['electron/preload.ts'], outfile: 'electron-dist/preload.cjs', format: 'cjs', external: ['electron'] })
mkdirSync('electron-dist', { recursive: true })
cpSync('electron/splash.html', 'electron-dist/splash.html')
