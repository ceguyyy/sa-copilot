import { describe, expect, it, vi } from 'vitest'

vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')
const { stepsFromJudge } = await import('./pocQaJudge.ts')

const steps = [
  { message: 'Halo', expectedAi: 'Menyapa', expectedAction: '' },
  { message: 'Cek {{order}}', expectedAi: 'Status pesanan', expectedAction: 'cek_pesanan' },
  { message: 'Makasih', expectedAi: 'Penutup', expectedAction: '' },
]

describe('stepsFromJudge', () => {
  it('keeps no-reply steps as no_reply, marks expected actions for a manual check and stops at the last sent step', () => {
    const turns = [
      { sent: 'Halo', replies: ['Hai kak'] },
      { sent: 'Cek INV-1', replies: [] },
    ]
    const result = stepsFromJudge(steps, turns, [{ verdict: 'pass', reason: 'Menyapa' }, { verdict: 'pass', reason: 'x' }])
    expect(result).toEqual([
      { sent: 'Halo', replies: ['Hai kak'], expectedAi: 'Menyapa', expectedAction: '', verdict: 'pass', reason: 'Menyapa', actionCheck: 'none' },
      { sent: 'Cek INV-1', replies: [], expectedAi: 'Status pesanan', expectedAction: 'cek_pesanan', verdict: 'no_reply', reason: 'The agent did not reply in time.', actionCheck: 'pending' },
    ])
  })

  it('treats anything but an explicit pass as fail', () => {
    const [step] = stepsFromJudge(steps, [{ sent: 'Halo', replies: ['?'] }], [{ verdict: 'maybe' }])
    expect(step.verdict).toBe('fail')
  })
})
