import { describe, expect, it } from 'vitest'
import { aiActionsPrompt } from './pocActions.ts'

describe('aiActionsPrompt', () => {
  it('lists every AI action with its condition, ready to copy', () => {
    const prompt = aiActionsPrompt({
      labels: [{ name: 'Booking', condition: 'user wants to book a doctor' }],
      pipeline: [
        { order: 2, status: 'Booked', condition: 'booking is confirmed' },
        { order: 1, status: 'New Lead', condition: '' },
      ],
      apiIntegrations: [{ name: 'cek_jadwal_dokter', description: 'user asks for a doctor schedule' }],
      agentTransferConditions: 'user asks for a human',
    })
    expect(prompt).toBe(
      [
        '## Labels',
        '- Booking -> user wants to book a doctor',
        '',
        '## Pipeline',
        '- 1. New Lead -> (first status)',
        '- 2. Booked -> booking is confirmed',
        '',
        '## Tools',
        '- cek_jadwal_dokter -> user asks for a doctor schedule',
        '',
        '## Agent handoff',
        'user asks for a human',
      ].join('\n'),
    )
  })

  it('skips unnamed rows and empty sections', () => {
    const prompt = aiActionsPrompt({
      labels: [{ name: '  ', condition: 'ignored' }, { name: 'VIP', condition: '' }],
      pipeline: [],
      apiIntegrations: [],
      agentTransferConditions: '  ',
    })
    expect(prompt).toBe(['## Labels', '- VIP -> (no condition yet)'].join('\n'))
  })

  it('returns an empty string when there is no action at all', () => {
    expect(aiActionsPrompt({ labels: [], pipeline: [], apiIntegrations: [], agentTransferConditions: '' })).toBe('')
  })
})
