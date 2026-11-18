// Ads conversions (CAPI) of a POC: which Cekat label or SDK custom event is sent to Meta, TikTok and Google
// Ads, and under which event name. In Cekat this is set up in Marketing › Paid Ads › Conversions (labels) and
// Marketing › Events › "Use it to optimise ads" (custom events sent from the client's system with the SDK).

export const AD_PLATFORMS = [
  { key: 'meta', label: 'Meta Ads' },
  { key: 'tiktok', label: 'TikTok Ads' },
  { key: 'google', label: 'Google Ads' },
] as const

export type AdPlatform = (typeof AD_PLATFORMS)[number]['key']

/** The event name sent to each platform; empty means the event is not sent there. */
export type AdEventTargets = Record<AdPlatform, string>

export const CONVERSION_LIMITS = {
  eventName: 100,
  sdkEvents: 50,
  sdkEventName: 120,
  sdkEventKey: 64,
  sdkEventDescription: 1_000,
  sdkEventProperties: 10,
  propertyKey: 64,
} as const

export const SDK_PROPERTY_TYPES = ['string', 'number', 'timestamp', 'date', 'boolean'] as const
export type SdkPropertyType = (typeof SDK_PROPERTY_TYPES)[number]

export type SdkEventProperty = { key: string; type: SdkPropertyType }

/** A custom event the client's system sends to Cekat (SDK or HTTP), optionally forwarded as an ads conversion. */
export type SdkEvent = { name: string; key: string; description: string; properties: SdkEventProperty[]; targets: AdEventTargets }

/** Standard event names per platform, grouped for the searchable picker. Any other name is a custom event. */
export const STANDARD_AD_EVENTS: Record<AdPlatform, { group: string; events: string[] }[]> = {
  meta: [
    {
      group: 'Business messaging',
      events: ['LeadSubmitted', 'QualifiedLead', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase', 'OrderCreated', 'OrderShipped', 'OrderDelivered', 'OrderCanceled', 'OrderReturned', 'CartAbandoned', 'RatingProvided', 'ReviewProvided'],
    },
    {
      group: 'Standard',
      events: ['Lead', 'CompleteRegistration', 'Contact', 'Schedule', 'SubmitApplication', 'Subscribe', 'StartTrial', 'AddPaymentInfo', 'AddToWishlist', 'Search', 'FindLocation', 'CustomizeProduct', 'Donate'],
    },
  ],
  tiktok: [
    {
      group: 'Standard',
      events: ['SubmitForm', 'Lead', 'Contact', 'ViewContent', 'AddToCart', 'AddToWishlist', 'InitiateCheckout', 'AddPaymentInfo', 'PlaceAnOrder', 'CompletePayment', 'Purchase', 'CompleteRegistration', 'Subscribe', 'StartTrial', 'Schedule', 'SubmitApplication', 'ApplicationApproval', 'ClickButton', 'Download', 'Search', 'FindLocation', 'CustomizeProduct'],
    },
  ],
  google: [
    {
      group: 'Conversion goals',
      events: ['Lead', 'Qualified lead', 'Converted lead', 'Submit lead form', 'Contact', 'Phone call lead', 'Book appointment', 'Request quote', 'Sign-up', 'Subscribe', 'Page view', 'Add to cart', 'Begin checkout', 'Purchase', 'Get directions', 'Outbound click'],
    },
  ],
}

export const emptyTargets = (): AdEventTargets => ({ meta: '', tiktok: '', google: '' })

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function isStandardAdEvent(platform: AdPlatform, name: string): boolean {
  return STANDARD_AD_EVENTS[platform].some((g) => g.events.includes(name.trim()))
}

/** Targets from any input (old POCs have none, model output may be partial), trimmed and cut to the limit. */
export function normalizeTargets(raw: unknown): AdEventTargets {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return { meta: cut(r.meta), tiktok: cut(r.tiktok), google: cut(r.google) }
}

const cut = (v: unknown) => str(v).trim().slice(0, CONVERSION_LIMITS.eventName)

/** Targets from model output: characters ad platforms reject are dropped so the POC still validates. */
export function targetsFromAi(raw: unknown): AdEventTargets {
  const t = normalizeTargets(raw)
  const clean = (v: string) => v.replace(/[^\p{L}\p{N} _.-]/gu, '').trim()
  return { meta: clean(t.meta), tiktok: clean(t.tiktok), google: clean(t.google) }
}

export function hasTargets(targets: AdEventTargets | undefined): boolean {
  return !!targets && AD_PLATFORMS.some(({ key }) => targets[key].trim() !== '')
}

/** "Meta Ads: QualifiedLead · TikTok Ads: SubmitForm (custom)" — empty when sent nowhere. */
export function targetsText(targets: AdEventTargets | undefined): string {
  if (!targets) return ''
  return AD_PLATFORMS.filter(({ key }) => targets[key].trim())
    .map(({ key, label }) => `${label}: ${targets[key].trim()}${isStandardAdEvent(key, targets[key]) ? '' : ' (custom)'}`)
    .join(' · ')
}

/** A valid Cekat custom event key: lowercase letters, digits and underscores, starting with a letter. */
export const SDK_EVENT_KEY_RE = /^[a-z][a-z0-9_]*$/

/** Suggested key for an event name, e.g. "Trial started" → "trial_started". */
export function sdkEventKeyFrom(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+|_+$/g, '')
    .slice(0, CONVERSION_LIMITS.sdkEventKey)
}

export const emptySdkEvent = (): SdkEvent => ({ name: '', key: '', description: '', properties: [], targets: emptyTargets() })

function normalizeProperty(raw: unknown): SdkEventProperty {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const type = SDK_PROPERTY_TYPES.includes(p.type as SdkPropertyType) ? (p.type as SdkPropertyType) : 'string'
  return { key: str(p.key).slice(0, CONVERSION_LIMITS.propertyKey), type }
}

export function normalizeSdkEvents(raw: unknown): SdkEvent[] {
  const list = Array.isArray(raw) ? raw : []
  return list
    .filter((e) => e && typeof e === 'object')
    .map((e: Record<string, unknown>) => ({
      name: str(e.name).slice(0, CONVERSION_LIMITS.sdkEventName),
      key: str(e.key).slice(0, CONVERSION_LIMITS.sdkEventKey),
      description: str(e.description).slice(0, CONVERSION_LIMITS.sdkEventDescription),
      properties: (Array.isArray(e.properties) ? e.properties : []).map(normalizeProperty).slice(0, CONVERSION_LIMITS.sdkEventProperties),
      targets: normalizeTargets(e.targets),
    }))
    .slice(0, CONVERSION_LIMITS.sdkEvents)
}

/** SDK events from model output: keys made valid, events without a name dropped. */
export function sdkEventsFromAi(raw: unknown): SdkEvent[] {
  return normalizeSdkEvents(raw)
    .filter((e) => e.name.trim())
    .map((e) => ({ ...e, key: SDK_EVENT_KEY_RE.test(e.key) ? e.key : sdkEventKeyFrom(e.key || e.name), properties: e.properties.filter((p) => SDK_EVENT_KEY_RE.test(p.key)) }))
}

/** One SDK event as readable text, for the version diff and the project markdown. */
export function sdkEventText(e: SdkEvent): string {
  const props = e.properties.length ? `properties: ${e.properties.map((p) => `${p.key} (${p.type})`).join(', ')}` : ''
  return [`${e.name} [${e.key}]`, e.description, props, targetsText(e.targets) && `ads: ${targetsText(e.targets)}`].filter(Boolean).join('\n')
}
