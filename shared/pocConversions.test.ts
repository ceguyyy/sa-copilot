import { describe, expect, it } from 'vitest'
import {
  isStandardAdEvent,
  normalizeSdkEvents,
  normalizeTargets,
  sdkEventKeyFrom,
  sdkEventText,
  sdkEventsFromAi,
  targetsFromAi,
  targetsText,
} from './pocConversions.ts'

describe('isStandardAdEvent', () => {
  it('knows the business messaging and standard names per platform', () => {
    expect(isStandardAdEvent('meta', 'QualifiedLead')).toBe(true)
    expect(isStandardAdEvent('meta', ' ViewContent ')).toBe(true)
    expect(isStandardAdEvent('tiktok', 'SubmitForm')).toBe(true)
    expect(isStandardAdEvent('google', 'Qualified lead')).toBe(true)
    expect(isStandardAdEvent('tiktok', 'QualifiedLead')).toBe(false)
    expect(isStandardAdEvent('meta', 'BookingKlinik')).toBe(false)
  })
})

describe('normalizeTargets', () => {
  it('fills missing platforms for POCs saved before conversions existed', () => {
    expect(normalizeTargets(undefined)).toEqual({ meta: '', tiktok: '', google: '' })
    expect(normalizeTargets({ meta: ' Lead ' })).toEqual({ meta: 'Lead', tiktok: '', google: '' })
  })
})

describe('targetsFromAi', () => {
  it('drops characters ad platforms reject', () => {
    expect(targetsFromAi({ meta: 'Qualified<Lead>!', tiktok: 'SubmitForm', google: 'Qualified lead' })).toEqual({ meta: 'QualifiedLead', tiktok: 'SubmitForm', google: 'Qualified lead' })
  })
})

describe('targetsText', () => {
  it('lists only the platforms the event is sent to and marks custom names', () => {
    expect(targetsText({ meta: 'QualifiedLead', tiktok: '', google: 'Booking klinik' })).toBe('Meta Ads: QualifiedLead · Google Ads: Booking klinik (custom)')
    expect(targetsText({ meta: '', tiktok: '', google: '' })).toBe('')
  })
})

describe('sdkEventKeyFrom', () => {
  it('turns a name into a valid event key', () => {
    expect(sdkEventKeyFrom('Trial started')).toBe('trial_started')
    expect(sdkEventKeyFrom('  12 Order Paid!! ')).toBe('order_paid')
  })
})

describe('SDK events', () => {
  it('normalizes stored events and keeps at most 10 properties', () => {
    const props = Array.from({ length: 12 }, (_, i) => ({ key: `p${i}`, type: 'number' }))
    const [event] = normalizeSdkEvents([{ name: 'Order paid', key: 'order_paid', properties: [...props, { key: 'x', type: 'weird' }] }])
    expect(event.properties).toHaveLength(10)
    expect(event.targets).toEqual({ meta: '', tiktok: '', google: '' })
    expect(normalizeSdkEvents(undefined)).toEqual([])
  })

  it('repairs model output: invalid keys, unnamed events and bad property keys', () => {
    const events = sdkEventsFromAi([
      { name: 'Order Paid', key: 'Order Paid', properties: [{ key: 'value', type: 'number' }, { key: 'Bad Key', type: 'string' }], targets: { meta: 'Purchase' } },
      { name: '', key: 'nothing' },
    ])
    expect(events).toEqual([{ name: 'Order Paid', key: 'order_paid', description: '', properties: [{ key: 'value', type: 'number' }], targets: { meta: 'Purchase', tiktok: '', google: '' } }])
  })

  it('renders an event as readable text', () => {
    const text = sdkEventText({ name: 'Order paid', key: 'order_paid', description: 'Payment confirmed', properties: [{ key: 'value', type: 'number' }], targets: { meta: 'Purchase', tiktok: 'CompletePayment', google: '' } })
    expect(text).toBe('Order paid [order_paid]\nPayment confirmed\nproperties: value (number)\nads: Meta Ads: Purchase · TikTok Ads: CompletePayment')
  })
})
