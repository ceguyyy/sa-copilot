import { describe, expect, it } from 'vitest'
import { BEHAVIOR_LIMITS, behaviorFromAi, composeAgentBehavior, hasBehaviorSegments, splitLegacyBehavior } from './pocBehavior.ts'

const segments = {
  communicationStyle: 'Ramah dan singkat',
  conversationFlow: '1. Sapa\n2. Tanya kebutuhan',
  rulesRestrictions: 'Jangan diagnosa',
  customInstructions: [
    { title: 'Promo', content: 'Diskon 10% hari Senin' },
    { title: '', content: 'Gunakan emoji secukupnya' },
  ],
}

describe('composeAgentBehavior', () => {
  it('joins the segments as markdown sections in a fixed order', () => {
    expect(composeAgentBehavior(segments)).toBe(
      [
        '## Communication Style\n\nRamah dan singkat',
        '## Conversation Flow\n\n1. Sapa\n2. Tanya kebutuhan',
        '## Rules & Restrictions\n\nJangan diagnosa',
        '## Promo\n\nDiskon 10% hari Senin',
        '## Custom Instruction 2\n\nGunakan emoji secukupnya',
      ].join('\n\n'),
    )
  })

  it('skips empty segments', () => {
    expect(composeAgentBehavior({ rulesRestrictions: 'Jangan diagnosa', customInstructions: [{ title: 'x', content: ' ' }] })).toBe('## Rules & Restrictions\n\nJangan diagnosa')
  })

  it('falls back to the legacy prompt for POCs saved before the split', () => {
    expect(composeAgentBehavior({ agentBehavior: '# Agata\nRamah' })).toBe('# Agata\nRamah')
    expect(composeAgentBehavior({})).toBe('')
  })
})

describe('splitLegacyBehavior', () => {
  it('moves a legacy prompt into Conversation Flow and clears it', () => {
    const next = splitLegacyBehavior({ agentBehavior: '# Agata', welcomeMessage: 'Halo' })
    expect(next).toMatchObject({ conversationFlow: '# Agata', communicationStyle: '', rulesRestrictions: '', customInstructions: [], agentBehavior: '', welcomeMessage: 'Halo' })
  })

  it('keeps existing segments and drops a stale legacy prompt', () => {
    const next = splitLegacyBehavior({ ...segments, agentBehavior: 'old' })
    expect(next.conversationFlow).toBe(segments.conversationFlow)
    expect(next.agentBehavior).toBe('')
  })

  it('does not mutate its input', () => {
    const input = { agentBehavior: '# Agata' }
    splitLegacyBehavior(input)
    expect(input).toEqual({ agentBehavior: '# Agata' })
  })
})

describe('behaviorFromAi', () => {
  it('cuts each segment to its limit and drops empty custom instructions', () => {
    const out = behaviorFromAi({
      communicationStyle: 'a'.repeat(6000),
      conversationFlow: 'b'.repeat(9000),
      rulesRestrictions: 'c'.repeat(4000),
      customInstructions: [{ title: 'T', content: 'd'.repeat(2500) }, { title: 'empty', content: '' }, 'junk'],
    })
    expect(out.communicationStyle).toHaveLength(BEHAVIOR_LIMITS.communicationStyle)
    expect(out.conversationFlow).toHaveLength(BEHAVIOR_LIMITS.conversationFlow)
    expect(out.rulesRestrictions).toHaveLength(BEHAVIOR_LIMITS.rulesRestrictions)
    expect(out.customInstructions).toHaveLength(1)
    expect(out.customInstructions[0].content).toHaveLength(BEHAVIOR_LIMITS.customInstruction)
  })

  it('tolerates missing fields', () => {
    expect(behaviorFromAi({})).toEqual({ communicationStyle: '', conversationFlow: '', rulesRestrictions: '', customInstructions: [] })
  })
})

describe('hasBehaviorSegments', () => {
  it('is false for only whitespace and true for any text', () => {
    expect(hasBehaviorSegments({ communicationStyle: '  ', customInstructions: [{ title: 'x', content: '' }] })).toBe(false)
    expect(hasBehaviorSegments({ customInstructions: [{ title: '', content: 'x' }] })).toBe(true)
  })
})
