// Text the SA copies out of a POC's ads conversions: the Cekat setup checklist, and the brief for the client's
// developers who send the SDK events. Follows docs.cekat.ai (Marketing › Paid Ads, Marketing › Events); the exact
// endpoint and SDK code live in each event's Set up tab, so they are pointed to rather than guessed.
import { AD_PLATFORMS, hasTargets, normalizeSdkEvents, normalizeTargets, targetsText, type AdPlatform, type SdkEvent, type SdkPropertyType } from './pocConversions.ts'

type LabelLike = { name?: unknown; condition?: unknown; conversion?: unknown }
type ConfigLike = { labels?: unknown; sdkEvents?: unknown }

const PLATFORM_STEPS: Record<AdPlatform, string> = {
  meta: 'Meta Ads — Paid Ads › Platform › Meta › Manage: choose the Conversion events destination dataset, and in CTWA Ads click Connect dataset for every WhatsApp number that runs Click-to-WhatsApp ads.',
  tiktok: 'TikTok Ads — Paid Ads › Platform › TikTok › Manage: turn on Sync for the ad accounts, and in Messaging Ads click Connect ad account for every inbox that runs messaging ads.',
  google: 'Google Ads — Paid Ads › Platform › Google › Manage: turn on Sync for the accounts and fix missing Tracking Parameters.',
}

const SAMPLE: Record<SdkPropertyType, string> = {
  string: '"example"',
  number: '150000',
  timestamp: '"2026-11-19T10:00:00Z"',
  date: '"2026-11-19"',
  boolean: 'true',
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function labelsWithTargets(config: ConfigLike) {
  const labels = Array.isArray(config.labels) ? (config.labels as LabelLike[]) : []
  return labels.map((l) => ({ name: text(l.name), condition: text(l.condition), targets: normalizeTargets(l.conversion) })).filter((l) => l.name && hasTargets(l.targets))
}

const eventsWithTargets = (config: ConfigLike) => normalizeSdkEvents(config.sdkEvents).filter((e) => e.key && hasTargets(e.targets))

/** Platforms any label or SDK event sends to, in display order. */
export function usedPlatforms(config: ConfigLike): AdPlatform[] {
  const all = [...labelsWithTargets(config).map((l) => l.targets), ...eventsWithTargets(config).map((e) => e.targets)]
  return AD_PLATFORMS.map((p) => p.key).filter((key) => all.some((t) => t[key].trim()))
}

/** The Cekat setup checklist (markdown), or '' when the POC sends no conversions. */
export function conversionSetupGuide(pocName: string, config: ConfigLike): string {
  const platforms = usedPlatforms(config)
  if (!platforms.length) return ''
  const labels = labelsWithTargets(config)
  const events = eventsWithTargets(config)
  const out = [`## Ads conversion setup — ${pocName || 'POC'}`, '', '### 1. Connect the ad platforms (Marketing › Paid Ads › Platform)', ...platforms.map((p) => `- [ ] ${PLATFORM_STEPS[p]}`)]
  if (labels.length) {
    out.push('', '### 2. Label conversions (Marketing › Paid Ads › Conversions)', '- [ ] Make sure every label below exists in Settings › Labels with exactly this name, and that the AI Agent applies it (AI Actions › Conversation Label).')
    for (const l of labels) out.push(`- [ ] Turn on "${l.name}" and pick: ${targetsText(l.targets)}`)
  }
  if (events.length) {
    out.push('', `### ${labels.length ? 3 : 2}. SDK events (Marketing › Events › Custom)`)
    for (const e of events) {
      const props = e.properties.length ? `, properties ${e.properties.map((p) => `${p.key} (${p.type})`).join(', ')}` : ''
      out.push(`- [ ] New event "${e.name}" with key \`${e.key}\`${props}; then Use it to optimise ads → ${targetsText(e.targets)}`)
    }
    out.push('- [ ] Send the developer brief to the client team; they copy the code for their language from each event\'s Set up tab.')
  }
  const platformNames = platforms.map((p) => AD_PLATFORMS.find((a) => a.key === p)!.label.replace(' Ads', '')).join(' / ')
  const anyCustom = [...labels.map((l) => l.targets), ...events.map((e) => e.targets)].some((t) => targetsText(t).includes('(custom)'))
  out.push('', '### Verify')
  if (events.length) out.push('- [ ] Marketing › Events › Test & activity: send a test event and check it under Recent events.')
  out.push(`- [ ] Trigger each conversion once, then check it is Sent in Paid Ads › ${platformNames} › Conversions.`)
  if (anyCustom) out.push('- [ ] Events marked (custom) are sent under their own name: check the ad platform accepts them as custom conversions.')
  return out.join('\n')
}

function eventBrief(e: SdkEvent): string {
  const props = e.properties.length
    ? ['Properties (all optional, the type must match):', ...e.properties.map((p) => `  - \`${p.key}\` — ${p.type}, e.g. ${SAMPLE[p.type]}`)]
    : ['Properties: none']
  return [`### ${e.name} — key \`${e.key}\``, e.description ? `When: ${e.description}` : '', ...props, hasTargets(e.targets) ? `Used as ads conversion: ${targetsText(e.targets)}` : ''].filter(Boolean).join('\n')
}

/** The brief for the client's developers (markdown), or '' when the POC has no SDK events. */
export function sdkDeveloperBrief(pocName: string, config: ConfigLike): string {
  const events = normalizeSdkEvents(config.sdkEvents).filter((e) => e.key)
  if (!events.length) return ''
  return [
    `## Cekat events to send — ${pocName || 'POC'}`,
    '',
    'Send each event from your server right after the action happens, using the Cekat SDK for your language or plain HTTP. The exact code and endpoint are in Cekat › Marketing › Events › (event) › Set up; tick "Use my API key" there.',
    '',
    'Every event must say who it belongs to:',
    '- `phone_number` and/or `email` — at least one is required. Phone numbers are digits only with the country code, e.g. 6281234567890.',
    '- `contact_name` — optional.',
    '',
    'Recommended: add the Match events to campaigns middleware from the Set up tab, so each event is credited to the ad that brought the customer.',
    '',
    ...events.flatMap((e) => [eventBrief(e), '']),
    'Before going live, send a test from Test & activity and check it appears under Recent events.',
  ].join('\n').trim()
}
