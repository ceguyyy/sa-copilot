// Starts Electron for `npm run desktop`. Editors like VS Code export ELECTRON_RUN_AS_NODE=1 to their terminals,
// which would make Electron behave as plain Node and never open a window, so it is removed here.
import { spawn } from 'node:child_process'
import electron from 'electron'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env })
child.on('exit', (code) => process.exit(code ?? 0))
