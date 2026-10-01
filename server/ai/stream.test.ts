import { describe, expect, it, vi } from 'vitest'

vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')
const { streamResponse } = await import('./stream.ts')

describe('streamResponse', () => {
  it('keeps the job running to the end when the browser disconnects mid-stream', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let finished = false
    const res = streamResponse(async (out) => {
      out.send({ type: 'progress', chars: 1 })
      await gate
      out.send({ type: 'progress', chars: 2 }) // after the disconnect: must not throw
      out.send({ type: 'done' })
      finished = true
    })
    const reader = res.body!.getReader()
    await reader.read()
    await reader.cancel()
    release()
    await expect.poll(() => finished).toBe(true)
  })
})
