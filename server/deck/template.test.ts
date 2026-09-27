import { describe, expect, test } from 'vitest'
import { deckVisuals } from '../../shared/deck/index.ts'
import { SAMPLE_DECK } from '../../shared/deck/deck.test.ts'
import { templateEdits } from './template.ts'

describe('templateEdits', () => {
  const visuals = deckVisuals(SAMPLE_DECK, null)
  const edits = templateEdits(SAMPLE_DECK, visuals)

  test('only touches slide 1 and slides 31–39 (40 needs a Timeline)', () => {
    expect(edits.map((e) => e.index)).toEqual([1, 31, 32, 33, 34, 35, 36, 37, 38, 39])
  })

  test('cover: new title, presenter name set, empty job title keeps the template line', () => {
    const cover = edits.find((e) => e.index === 1)!
    expect(cover.texts['Google Shape;59;p16']).toBe('Scaling Klinik X')
    expect(cover.texts['Google Shape;60;p16']).toEqual(['Christian Gunawan', null])
  })

  test('cover: nothing filled in leaves slide 1 as it is', () => {
    const untouched = templateEdits({ ...SAMPLE_DECK, cover: { title: '', presenter: '', presenterRole: '' } }, visuals)
    expect(untouched.find((e) => e.index === 1)!.texts).toEqual({})
  })

  test('uses the template shape names of each slide page', () => {
    expect(Object.keys(edits.find((e) => e.index === 31)!.images)).toEqual(['Google Shape;529;p46'])
    expect(edits.find((e) => e.index === 40)).toBeUndefined()
  })

  test('puts mockup cards in reading order (top-left, top-right, bottom-left, bottom-right)', () => {
    const slide34 = edits.find((e) => e.index === 34)!
    expect(slide34.texts['Google Shape;552;p49']).toBe('TL')
    expect(slide34.texts['Google Shape;554;p49']).toBe('TR')
    expect(slide34.texts['Google Shape;550;p49']).toBe('BL')
    expect(slide34.texts['Google Shape;555;p49']).toBe('BR')
  })

  test('every image points at a rendered visual', () => {
    const keys = new Set(visuals.map((v) => v.key))
    for (const e of edits) for (const img of Object.values(e.images)) expect(keys.has(img.visual)).toBe(true)
  })

  test('empty texts keep the template wording instead of blanking it', () => {
    const blank = templateEdits({ ...SAMPLE_DECK, crm: { ...SAMPLE_DECK.crm, description: '  ' } }, visuals)
    expect(blank.find((e) => e.index === 37)!.texts).not.toHaveProperty('Google Shape;615;p52')
  })
})
