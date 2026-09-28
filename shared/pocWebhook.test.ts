import { describe, expect, it } from 'vitest'
import { cekatWebhookPath, cekatWebhookUrl, webhookPathFromUrl } from './pocWebhook.ts'

describe('Cekat webhook helpers', () => {
  it('builds a client-prefixed path on workflows.cekat.ai', () => {
    expect(cekatWebhookPath('XHealth Dental (MY)', 'cek_jadwal')).toBe('xhealth-dental-my-cek_jadwal')
    expect(cekatWebhookUrl('Xhealth', 'cek_jadwal')).toBe('https://workflows.cekat.ai/webhook/xhealth-cek_jadwal')
  })

  it('reads the path back only from Cekat webhook URLs', () => {
    expect(webhookPathFromUrl('https://workflows.cekat.ai/webhook/xhealth-cek_jadwal/')).toBe('xhealth-cek_jadwal')
    expect(webhookPathFromUrl('https://n8n.other.com/webhook/x')).toBeNull()
    expect(webhookPathFromUrl('https://workflows.cekat.ai/webhook/')).toBeNull()
  })
})
