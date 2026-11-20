import { describe, expect, it } from 'vitest'
import { CEKAT_CONVERSATION_SAMPLE, cekatToolCall } from './pocCurl.ts'
import { pocToolsCollection, toolEndpoint } from './pocSaPostman.ts'

const schema = { type: 'object', properties: { tanggal: { type: 'string', format: 'date' }, poli: { type: 'string', enum: ['gigi', 'umum'] } }, required: ['tanggal'] }
const tool = { name: 'cek_jadwal', description: 'Cek slot dokter', httpMethod: 'POST', webhookAddress: 'https://automation.cekat.ai/api/v1/webhooks/abc/sync', apiKey: 'k-1', aiInput: schema }

describe('cekatToolCall', () => {
  it('posts the AI inputs at the top level plus the conversation, with the API key as Bearer', () => {
    const call = cekatToolCall(tool)
    expect(call).toMatchObject({ method: 'POST', url: tool.webhookAddress })
    expect(call.headers).toEqual([
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Authorization', value: 'Bearer k-1' },
    ])
    expect(JSON.parse(call.body)).toEqual({ tanggal: '2026-10-05', poli: 'gigi', conversation: CEKAT_CONVERSATION_SAMPLE })
  })

  it('sends a GET tool its inputs as query parameters', () => {
    const call = cekatToolCall({ ...tool, httpMethod: 'GET', apiKey: '' })
    expect(call).toEqual({ method: 'GET', url: `${tool.webhookAddress}?tanggal=2026-10-05&poli=gigi`, headers: [], body: '' })
  })
})

describe('pocToolsCollection', () => {
  it('makes one SAPostman request per named tool, checking for status 200', () => {
    const collection = pocToolsCollection('Klinik Sehat', [tool, { ...tool, name: ' ' }])
    expect(collection.name).toBe('POC tools · Klinik Sehat')
    expect(collection.endpoints).toHaveLength(1)
    const e = collection.endpoints[0]
    expect(e).toMatchObject({ name: 'cek_jadwal', method: 'POST', bodyMode: 'raw', rawType: 'JSON' })
    expect(JSON.parse(e.scripts.post)).toEqual([{ name: 'Status is 200', target: 'status', operator: 'equals', equals: 200 }])
    expect(e.docs).toContain('Cek slot dokter')
  })

  it('tells the SA to set a missing webhook address', () => {
    expect(toolEndpoint({ ...tool, webhookAddress: '' }).docs).toContain('Set the webhook address')
  })
})
