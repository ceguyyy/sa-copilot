import { describe, expect, test, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgres://test@localhost/test'
})

const { cleanScenario, demoCategoryId } = await import('./demo.ts')

const base = {
  name: 'Reminder',
  title: 'Appointment reminder',
  triggerType: 'OUTBOUND_SYSTEM',
  outboundPill: 'H-1 Reminder',
  steps: [
    {
      userReply: 'Konfirmasi',
      aiResponse: 'Terima kasih!',
      chips: ['Ya', ' '],
      enableCard: false,
      card: { title: 'x', sub: '', items: [], status: '' },
      enableFlow: true,
      flow: { title: 'Form', fields: [{ id: 'nama', label: 'Nama', type: 'text' }] },
    },
  ],
}

describe('cleanScenario', () => {
  test('keeps only switched-on cards/flows and non-empty chips', () => {
    const s = cleanScenario(base)
    expect(s.steps[0]).not.toHaveProperty('card')
    expect(s.steps[0].flow?.fields).toHaveLength(1)
    expect(s.steps[0].chips).toEqual(['Ya'])
  })

  test('outbound pill only for outbound scenarios', () => {
    expect(cleanScenario(base).outboundPill).toBe('H-1 Reminder')
    expect(cleanScenario({ ...base, triggerType: 'INBOUND_USER' }).outboundPill).toBeUndefined()
  })

  test('fills demo defaults and rejects scenarios without steps', () => {
    expect(cleanScenario(base)).toMatchObject({ tag: 'Use Case Demo', cekatComponents: [], description: '' })
    expect(() => cleanScenario({ ...base, steps: [] })).toThrow()
    expect(() => cleanScenario({ ...base, steps: [{ userReply: ' ', aiResponse: 'x' }] })).toThrow()
  })
})

describe('demoCategoryId', () => {
  test('is a readable slug of the client plus a short project id', () => {
    expect(demoCategoryId({ id: '3fa9c0de-0000-4000-8000-000000000000', name: 'P', client_name: 'Klinik Sehat Jaya', description: null })).toBe('klinik-sehat-jaya-3fa9')
    expect(demoCategoryId({ id: 'abcd0000-0000-4000-8000-000000000000', name: 'P', client_name: '!!!', description: null })).toBe('client-abcd')
  })
})
