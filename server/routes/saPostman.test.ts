import { describe, it, expect, vi } from 'vitest'
import { executeSaRequest } from './saPostman.ts'
vi.mock('../config.ts', () => ({ config: { port: 3001 } }))

describe('SAPostman HTTP transport', () => {
  it('forwards payload and headers without following redirects, returns non-2xx responses', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"error":"bad"}', { status: 422, headers: { 'Content-Type': 'application/json' } }))
    const result = await executeSaRequest({ method: 'POST', url: 'https://example.com/hook', headers: [{ name: 'Authorization', value: 'Bearer demo' }], body: '{"action":"test"}' }, fetcher)
    expect(result.status).toBe(422)
    expect(result.body).toBe('{"error":"bad"}')
    expect(fetcher.mock.calls[0][1]).toMatchObject({ body: '{"action":"test"}', redirect: 'manual' })
    expect(fetcher.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer demo')
  })
  it('limits responses and rejects unsafe transport options', async () => {
    const result = await executeSaRequest({ method: 'GET', url: 'https://example.com', headers: [], body: '' }, vi.fn().mockResolvedValue(new Response('x'.repeat(2_000_010))))
    expect(result.truncated).toBe(true)
    expect(result.bytes).toBe(2_000_000)
    await expect(executeSaRequest({ method: 'GET', url: 'file:///tmp/file', headers: [], body: '' })).rejects.toThrow('HTTP')
    await expect(executeSaRequest({ method: 'GET', url: 'https://example.com', headers: [], body: '{}' })).rejects.toThrow('cannot have a body')
  })
})
