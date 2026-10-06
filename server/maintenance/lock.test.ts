import { describe, expect, it } from 'vitest'
import { beginWrite, exclusive, maintenanceBusy } from './lock.ts'

describe('maintenance lock', () => {
  it('drains active writes, blocks new writes and rejects competing maintenance', async () => {
    const done = beginWrite()
    let ran = false
    const task = exclusive(async () => { ran = true })
    expect(maintenanceBusy()).toBe(true)
    expect(ran).toBe(false)
    expect(() => beginWrite()).toThrow('temporarily locked')
    await expect(exclusive(async () => {})).rejects.toThrow('already running')
    done()
    await task
    expect(ran).toBe(true)
    expect(maintenanceBusy()).toBe(false)
  })
  it('releases the lock after failure', async () => {
    await expect(exclusive(async () => { throw new Error('failed') })).rejects.toThrow('failed')
    const done = beginWrite()
    done()
    expect(maintenanceBusy()).toBe(false)
  })
})
