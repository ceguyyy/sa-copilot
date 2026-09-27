import { describe, expect, test } from 'vitest'
import { PRESET_THEMES, contrastRatio, themeProblems } from './theme.ts'

describe('contrastRatio', () => {
  test('black on white is 21:1 and is symmetric', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
  })

  test('identical colors are 1:1', () => {
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })
})

describe('themeProblems', () => {
  test.each(PRESET_THEMES.map((t) => [t.name, t]))('preset %s is readable in both modes', (_, theme) => {
    expect(themeProblems(theme)).toEqual([])
  })

  test('flags unreadable text', () => {
    const base = PRESET_THEMES[0]
    const problems = themeProblems({ ...base, light: { ...base.light, ink: '#dddddd' } })
    expect(problems.some((p) => p.startsWith('light: text on page'))).toBe(true)
  })

  test('flags missing or malformed colors', () => {
    const base = PRESET_THEMES[0]
    expect(themeProblems({ light: { ...base.light, ember: 'orange' }, dark: base.dark })).toEqual(['light: ember must be #rrggbb colors'])
    expect(themeProblems({})).toHaveLength(2)
  })
})
