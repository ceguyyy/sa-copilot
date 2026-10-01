import { describe, expect, it } from 'vitest'
import { cleanMermaid, flowFromAi, happyCaseScript, normalizeFlow } from './pocFlow.ts'

describe('cleanMermaid', () => {
  it('strips markdown fences the model sometimes wraps around the diagram', () => {
    expect(cleanMermaid('```mermaid\nflowchart TD\n  A --> B\n```')).toBe('flowchart TD\n  A --> B')
    expect(cleanMermaid('  flowchart LR\n A-->B  ')).toBe('flowchart LR\n A-->B')
  })
})

describe('flowFromAi', () => {
  it('keeps the flowchart and every happy case step, dropping empty steps', () => {
    const flow = flowFromAi({
      flowchart: '```mermaid\nflowchart TD\nA-->B\n```',
      happyCases: [
        {
          title: 'Booking dokter',
          goal: 'Pasien berhasil booking',
          steps: [
            { user: 'Halo, mau booking dokter gigi', ai: 'Menanyakan tanggal', action: 'Label: Booking' },
            { user: '', ai: '', action: '' },
          ],
        },
        { title: '', steps: [] },
      ],
    })
    expect(flow).toEqual({
      mermaid: 'flowchart TD\nA-->B',
      happyCases: [
        { title: 'Booking dokter', goal: 'Pasien berhasil booking', steps: [{ user: 'Halo, mau booking dokter gigi', ai: 'Menanyakan tanggal', action: 'Label: Booking' }] },
      ],
    })
  })

  it('returns an empty flow for missing or malformed output', () => {
    expect(flowFromAi(undefined)).toEqual({ mermaid: '', happyCases: [] })
    expect(flowFromAi({ flowchart: 42, happyCases: 'x' })).toEqual({ mermaid: '', happyCases: [] })
  })
})

describe('normalizeFlow', () => {
  it('gives POCs saved before the flow existed an empty one', () => {
    expect(normalizeFlow(undefined)).toEqual({ mermaid: '', happyCases: [] })
  })
})

describe('happyCaseScript', () => {
  it('writes a numbered test script to paste into the Cekat chat', () => {
    const script = happyCaseScript({
      title: 'Booking dokter',
      goal: 'Pasien berhasil booking',
      steps: [
        { user: 'Halo', ai: 'Sapaan + tanya kebutuhan', action: '' },
        { user: 'Mau booking besok', ai: 'Menawarkan slot', action: 'Tool: cek_jadwal_dokter' },
      ],
    })
    expect(script).toBe(
      [
        'Happy case: Booking dokter',
        'Goal: Pasien berhasil booking',
        '',
        '1. User: Halo',
        '   Expected AI: Sapaan + tanya kebutuhan',
        '',
        '2. User: Mau booking besok',
        '   Expected AI: Menawarkan slot',
        '   Expected action: Tool: cek_jadwal_dokter',
      ].join('\n'),
    )
  })
})
