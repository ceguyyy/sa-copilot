import { describe, expect, it } from 'vitest'
import { conversionSetupGuide, sdkDeveloperBrief, usedPlatforms } from './pocConversionGuide.ts'

const none = { meta: '', tiktok: '', google: '' }
const config = {
  labels: [
    { name: 'Qualified', condition: 'Budget confirmed', conversion: { meta: 'QualifiedLead', tiktok: '', google: 'Qualified lead' } },
    { name: 'Komplain', condition: 'Unhappy', conversion: none },
  ],
  sdkEvents: [
    { name: 'Order paid', key: 'order_paid', description: 'Payment confirmed in the backend', properties: [{ key: 'value', type: 'number' }, { key: 'paid_at', type: 'timestamp' }], targets: { meta: 'Purchase', tiktok: 'BayarLunas', google: '' } },
    { name: 'Trial started', key: 'trial_started', description: '', properties: [], targets: none },
  ],
}

describe('usedPlatforms', () => {
  it('lists the platforms any label or SDK event sends to', () => {
    expect(usedPlatforms(config)).toEqual(['meta', 'tiktok', 'google'])
    expect(usedPlatforms({ labels: [{ name: 'x', conversion: { meta: 'Lead' } }] })).toEqual(['meta'])
    expect(usedPlatforms({})).toEqual([])
  })
})

describe('conversionSetupGuide', () => {
  it('is empty when the POC sends no conversions', () => {
    expect(conversionSetupGuide('POC', { labels: [{ name: 'x', conversion: none }] })).toBe('')
  })

  it('walks through platforms, label conversions, SDK events and verification', () => {
    const guide = conversionSetupGuide('POC 01', config)
    expect(guide).toContain('## Ads conversion setup — POC 01')
    expect(guide).toContain('Meta Ads — Paid Ads › Platform › Meta › Manage')
    expect(guide).toContain('Connect dataset')
    expect(guide).toContain('- [ ] Turn on "Qualified" and pick: Meta Ads: QualifiedLead · Google Ads: Qualified lead')
    expect(guide).not.toContain('Komplain')
    expect(guide).toContain('New event "Order paid" with key `order_paid`, properties value (number), paid_at (timestamp); then Use it to optimise ads → Meta Ads: Purchase · TikTok Ads: BayarLunas (custom)')
    expect(guide).not.toContain('trial_started')
    expect(guide).toContain('Paid Ads › Meta / TikTok / Google › Conversions')
    expect(guide).toContain('Events marked (custom)')
  })

  it('numbers the SDK step 2 and skips custom notes when there are no labels or custom names', () => {
    const guide = conversionSetupGuide('POC', { sdkEvents: [{ name: 'Order paid', key: 'order_paid', targets: { meta: 'Purchase' } }] })
    expect(guide).toContain('### 2. SDK events')
    expect(guide).not.toContain('Label conversions')
    expect(guide).not.toContain('(custom)')
  })
})

describe('sdkDeveloperBrief', () => {
  it('is empty without SDK events', () => {
    expect(sdkDeveloperBrief('POC', { sdkEvents: [] })).toBe('')
  })

  it('explains the contact fields and each event with typed sample values', () => {
    const brief = sdkDeveloperBrief('POC 01', config)
    expect(brief).toContain('`phone_number` and/or `email` — at least one is required')
    expect(brief).toContain('6281234567890')
    expect(brief).toContain('### Order paid — key `order_paid`')
    expect(brief).toContain('When: Payment confirmed in the backend')
    expect(brief).toContain('`value` — number, e.g. 150000')
    expect(brief).toContain('`paid_at` — timestamp, e.g. "2026-11-19T10:00:00Z"')
    expect(brief).toContain('### Trial started — key `trial_started`\nProperties: none')
    expect(brief).toContain('Set up')
  })
})
