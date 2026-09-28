import { describe, expect, it } from 'vitest'
import { openCommand } from './opener.ts'

describe('openCommand', () => {
  it('uses Explorer on Windows and open on macOS', () => {
    expect(openCommand('win32', 'C:\\SA\\x')).toEqual({ command: 'explorer.exe', args: ['C:\\SA\\x'] })
    expect(openCommand('darwin', '/Users/a/x')).toEqual({ command: 'open', args: ['/Users/a/x'] })
  })

  it('has no opener elsewhere', () => {
    expect(openCommand('linux', '/x')).toBeNull()
  })
})
