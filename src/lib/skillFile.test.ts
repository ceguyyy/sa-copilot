import { describe, expect, test } from 'vitest'
import { parseSkillMarkdown, skillToMarkdown } from './skillFile'

describe('skill markdown round trip', () => {
  test('exports frontmatter + body and parses it back', () => {
    const skill = { name: 'TOR: custom', output_type: 'tor' as const, description: 'Rows "quoted"', instructions: '# Rules\n- one' }
    const md = skillToMarkdown(skill)
    expect(md.startsWith('---\nname: "TOR: custom"\n')).toBe(true)
    expect(parseSkillMarkdown(md)).toEqual(skill)
  })

  test('defaults output type to chat and name from first heading when frontmatter is missing', () => {
    expect(parseSkillMarkdown('# My Skill\nDo things')).toEqual({
      name: 'My Skill',
      output_type: 'chat',
      description: '',
      instructions: '# My Skill\nDo things',
    })
  })

  test('rejects an unknown output type', () => {
    expect(() => parseSkillMarkdown('---\nname: x\noutput_type: nope\n---\nbody')).toThrow(/output_type/)
  })

  test('rejects an empty body', () => {
    expect(() => parseSkillMarkdown('---\nname: x\n---\n')).toThrow(/empty/)
  })
})
