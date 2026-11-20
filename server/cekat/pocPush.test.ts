import { describe, expect, it, vi } from 'vitest'
import { applyPush, buildPlan, businesses, existingEventKeys, labelIds, previewPush, type CekatCall } from './pocPush.ts'

const none = { meta: '', tiktok: '', google: '' }
const config = {
  labels: [
    { name: 'Qualified', conversion: { meta: 'QualifiedLead', tiktok: '', google: 'Qualified lead' } },
    { name: 'Booking', conversion: { meta: 'Schedule', tiktok: '', google: '' } },
    { name: 'Komplain', conversion: none },
  ],
  sdkEvents: [
    { name: 'Order paid', key: 'order_paid', properties: [{ key: 'value', type: 'number' }, { key: 'paid_at', type: 'timestamp' }], targets: { meta: 'Purchase', tiktok: 'BayarLunas', google: '' } },
    { name: 'Chat started', key: 'conversation_started', properties: [], targets: none },
  ],
}
const eventsJson = JSON.stringify({ count: 1, events: [{ id: 'event-conversation-started', key: 'conversation_started', label: 'Chat Started' }] })
const catalogJson = JSON.stringify({ rules: [], catalog: { labels: [{ id: 'lbl-1', name: 'Qualified' }], pipeline: [{ id: 'p1', name: 'New Lead' }] } })

/** A Cekat stand-in: answers the reads, records the writes. */
function fakeCekat(overrides: Partial<Record<string, (args: Record<string, unknown>) => Promise<string>>> = {}) {
  const writes: { tool: string; args: Record<string, unknown> }[] = []
  const call = vi.fn<CekatCall>(async (tool, args) => {
    if (overrides[tool]) return overrides[tool]!(args)
    if (tool === 'marketing_list_custom_events') return eventsJson
    if (tool === 'marketing_setup_conversions' && !args.rules) return catalogJson
    if (tool === 'marketing_setup_conversions' && !args.confirm) return JSON.stringify({ preview: args.rules })
    writes.push({ tool, args })
    return '{"ok":true}'
  })
  return { call, writes }
}

describe('reading Cekat answers', () => {
  it('reads existing event keys, label ids and businesses', () => {
    expect([...existingEventKeys(eventsJson)]).toEqual(['conversation_started'])
    expect(labelIds(catalogJson)).toEqual(new Map([['qualified', 'lbl-1']]))
    expect(labelIds(JSON.stringify({ triggers: [{ trigger_source: 'label', trigger_key: 'VIP', trigger_ref_id: 77 }] }))).toEqual(new Map([['vip', '77']]))
    expect(businesses(JSON.stringify({ data: [{ business: { id: 'b1', name: 'Klinik', status: 'active' } }] }))).toEqual([{ id: 'b1', name: 'Klinik', status: 'active' }])
    expect(existingEventKeys('not json').size).toBe(0)
  })
})

describe('buildPlan', () => {
  it('creates only missing events and maps property types', () => {
    const plan = buildPlan(config, new Set(['conversation_started']), new Map([['qualified', 'lbl-1']]))
    expect(plan.createEvents).toEqual([
      { key: 'order_paid', label: 'Order paid', category: 'SA Copilot POC', event_name: 'order_paid', properties: [{ key: 'value', label: 'value', value_type: 'number' }, { key: 'paid_at', label: 'paid_at', value_type: 'date' }] },
    ])
    expect(plan.existingEvents).toEqual(['conversation_started'])
  })

  it('builds one rule per label and platform, standard or custom, and reports labels Cekat lacks', () => {
    const plan = buildPlan(config, new Set(), new Map([['qualified', 'lbl-1']]))
    expect(plan.rules).toEqual([
      { trigger_source: 'label', trigger_key: 'Qualified', trigger_ref_id: 'lbl-1', platform: 'meta', event_name: 'QualifiedLead', event_type: 'standard' },
      { trigger_source: 'label', trigger_key: 'Qualified', trigger_ref_id: 'lbl-1', platform: 'google', event_name: 'Qualified lead', event_type: 'standard' },
      { trigger_source: 'custom', trigger_key: 'order_paid', platform: 'meta', event_name: 'Purchase', event_type: 'standard' },
      { trigger_source: 'custom', trigger_key: 'order_paid', platform: 'tiktok', event_name: 'BayarLunas', event_type: 'custom' },
    ])
    expect(plan.ruleText[3]).toBe('Event order_paid → TikTok Ads: BayarLunas (custom)')
    expect(plan.problems).toEqual([expect.stringContaining('Label "Booking" is not in this Cekat business yet')])
  })
})

describe('previewPush', () => {
  it('changes nothing in Cekat', async () => {
    const cekat = fakeCekat()
    const preview = await previewPush(cekat.call, config)
    expect(cekat.writes).toEqual([])
    expect(cekat.call).not.toHaveBeenCalledWith('marketing_save_custom_event', expect.anything())
    expect(cekat.call).not.toHaveBeenCalledWith('marketing_setup_conversions', expect.objectContaining({ confirm: true }))
    expect(preview).toMatchObject({ kind: 'plan', plan: { existingEvents: ['conversation_started'] } })
  })

  it('asks to choose a business when Cekat needs one', async () => {
    const cekat = fakeCekat({
      marketing_list_custom_events: async () => { throw new Error('HTTP 403 Please choose a business') },
      central_get_business: async () => JSON.stringify({ data: [{ business: { id: 'b1', name: 'Klinik', status: 'active' } }] }),
    })
    await expect(previewPush(cekat.call, config)).resolves.toEqual({ kind: 'choose-business', businesses: [{ id: 'b1', name: 'Klinik', status: 'active' }] })
  })

  it('explains that event rules are checked after the events exist', async () => {
    const cekat = fakeCekat({ marketing_setup_conversions: async (args) => { if (args.rules) throw new Error('unknown trigger order_paid'); return catalogJson } })
    const preview = await previewPush(cekat.call, config)
    expect(preview.kind === 'plan' && preview.cekatCheck).toContain('after the events are created')
  })
})

describe('applyPush', () => {
  it('creates the missing events first, then saves the rules with confirm', async () => {
    const cekat = fakeCekat()
    const result = await applyPush(cekat.call, config)
    expect(cekat.writes.map((w) => w.tool)).toEqual(['marketing_save_custom_event', 'marketing_setup_conversions'])
    expect(cekat.writes[1].args).toMatchObject({ confirm: true })
    expect(result).toMatchObject({ createdEvents: ['order_paid'], failedEvents: [], rulesSaved: 4, rulesError: null })
    expect(result.problems).toHaveLength(1)
  })

  it('skips the rules of an event that could not be created and keeps going', async () => {
    const cekat = fakeCekat({ marketing_save_custom_event: async () => { throw new Error('needs analytics write permission') } })
    const result = await applyPush(cekat.call, config)
    expect(result.failedEvents).toEqual([{ key: 'order_paid', error: 'needs analytics write permission' }])
    const saved = cekat.writes.find((w) => w.tool === 'marketing_setup_conversions')!.args.rules as { trigger_key: string }[]
    expect(saved.map((r) => r.trigger_key)).toEqual(['Qualified', 'Qualified'])
    expect(result.rulesSaved).toBe(2)
  })

  it('reports a refused rule save without hiding the events that were created', async () => {
    const cekat = fakeCekat({ marketing_setup_conversions: async (args) => { if (args.confirm) throw new Error('Meta is not connected'); return catalogJson } })
    const result = await applyPush(cekat.call, config)
    expect(result).toMatchObject({ createdEvents: ['order_paid'], rulesSaved: 0, rulesError: 'Meta is not connected' })
  })
})
