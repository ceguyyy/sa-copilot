import { describe, expect, it } from 'vitest'
import { outlineStdio } from './outlineCommand.ts'

describe('outlineStdio', () => {
  it('runs the bundled entry with the app runtime as Node', () => {
    expect(outlineStdio('/app/node_modules/outline-mcp-server/build/stdio.js', '/app/SA Copilot')).toEqual({
      command: '/app/SA Copilot',
      args: ['/app/node_modules/outline-mcp-server/build/stdio.js'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    })
  })

  it('falls back to npx when nothing is bundled', () => {
    expect(outlineStdio('', '/usr/bin/node')).toEqual({
      command: 'npx',
      args: ['-y', '--package=outline-mcp-server@latest', '-c', 'outline-mcp-server-stdio'],
      env: {},
    })
  })
})
