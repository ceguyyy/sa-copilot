import net from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { freePort, isListening } from './ports.ts'

const open: net.Server[] = []
afterEach(() => open.splice(0).forEach((s) => s.close()))

function listen(port = 0): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(port, '127.0.0.1', () => resolve((s.address() as net.AddressInfo).port))
    open.push(s)
  })
}

describe('ports', () => {
  it('finds a port nobody listens on', async () => {
    const port = await freePort()
    expect(port).toBeGreaterThan(0)
    expect(await isListening(port)).toBe(false)
  })

  it('never returns a port that is taken', async () => {
    const taken = await listen()
    expect(await isListening(taken)).toBe(true)
    for (let i = 0; i < 20; i++) expect(await freePort()).not.toBe(taken)
  })
})
