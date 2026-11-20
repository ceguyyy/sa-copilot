// "Create in Cekat": turns a POC's SDK events and ads conversions into a Cekat business through the Cekat MCP.
// Always two steps: preview (reads Cekat, plans, changes nothing) and apply (after the SA confirms). Existing
// custom events are never overwritten, and rules for labels Cekat does not have yet are left out and reported.
import { isStandardAdEvent, normalizeSdkEvents, normalizeTargets, AD_PLATFORMS, type AdPlatform, type SdkPropertyType } from '../../shared/pocConversions.ts'

export type CekatCall = (tool: string, args: Record<string, unknown>) => Promise<string>

export interface CekatEvent { key: string; label: string; category: string; event_name: string; properties: { key: string; label: string; value_type: string }[] }
export interface CekatRule { trigger_source: 'label' | 'custom'; trigger_key: string; trigger_ref_id?: string; platform: AdPlatform; event_name: string; event_type: 'standard' | 'custom' }
export interface PushPlan {
  createEvents: CekatEvent[]
  existingEvents: string[]
  rules: CekatRule[]
  /** One readable line per rule, in the same order. */
  ruleText: string[]
  problems: string[]
}
export type Business = { id: string; name: string; status: string }
export type PushPreview = { kind: 'plan'; plan: PushPlan; cekatCheck: string } | { kind: 'choose-business'; businesses: Business[] }
export type PushResult = { createdEvents: string[]; failedEvents: { key: string; error: string }[]; rulesSaved: number; rulesError: string | null; problems: string[] }

type ConfigLike = { labels?: unknown; sdkEvents?: unknown }

const EVENT_CATEGORY = 'SA Copilot POC'
const VALUE_TYPE: Record<SdkPropertyType, string> = { string: 'text', number: 'number', boolean: 'boolean', date: 'date', timestamp: 'date' }
const PLATFORM_LABEL = Object.fromEntries(AD_PLATFORMS.map((p) => [p.key, p.label])) as Record<AdPlatform, string>
const MAX_CHECK_CHARS = 6000

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Keys of the custom events the business already has (marketing_list_custom_events). */
export function existingEventKeys(text: string): Set<string> {
  const events = (parse(text) as { events?: { key?: unknown }[] } | null)?.events
  return new Set((Array.isArray(events) ? events : []).map((e) => String(e?.key ?? '')).filter(Boolean))
}

/**
 * Label name → label id from the conversions catalog. The catalog's exact shape is not documented, so this
 * looks for {id, name|label} items under a key containing "label", or items marked with source/type "label".
 */
export function labelIds(text: string): Map<string, string> {
  const ids = new Map<string, string>()
  const add = (item: Record<string, unknown>) => {
    const id = item.id ?? item.trigger_ref_id ?? item.label_id
    const name = item.name ?? item.label ?? item.trigger_key ?? item.title
    if ((typeof id === 'string' || typeof id === 'number') && typeof name === 'string' && name.trim()) ids.set(name.trim().toLowerCase(), String(id))
  }
  const walk = (node: unknown, underLabels: boolean) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, underLabels))
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    const marked = [obj.source, obj.type, obj.trigger_source, obj.kind].some((v) => v === 'label')
    if (underLabels || marked) add(obj)
    for (const [key, value] of Object.entries(obj)) walk(value, /label/i.test(key) && Array.isArray(value))
  }
  walk(parse(text), false)
  return ids
}

/** The businesses the login can use (central_get_business). */
export function businesses(text: string): Business[] {
  const data = (parse(text) as { data?: { business?: Record<string, unknown> }[] } | null)?.data
  return (Array.isArray(data) ? data : [])
    .map((d) => d?.business ?? {})
    .filter((b) => typeof b.id === 'string')
    .map((b) => ({ id: String(b.id), name: String(b.name ?? b.id), status: String(b.status ?? '') }))
}

export const needsBusiness = (e: unknown) => /choose a business/i.test(e instanceof Error ? e.message : String(e))

/** What would change in Cekat for this POC. Pure: given what Cekat already has. */
export function buildPlan(config: ConfigLike, existing: Set<string>, labels: Map<string, string>): PushPlan {
  const plan: PushPlan = { createEvents: [], existingEvents: [], rules: [], ruleText: [], problems: [] }
  const events = normalizeSdkEvents(config.sdkEvents).filter((e) => e.key)
  for (const e of events) {
    if (existing.has(e.key)) {
      plan.existingEvents.push(e.key)
      continue
    }
    plan.createEvents.push({
      key: e.key,
      label: e.name || e.key,
      category: EVENT_CATEGORY,
      event_name: e.key,
      properties: e.properties.filter((p) => p.key).map((p) => ({ key: p.key, label: p.key, value_type: VALUE_TYPE[p.type] })),
    })
  }
  const addRule = (rule: CekatRule, what: string) => {
    plan.rules.push(rule)
    plan.ruleText.push(`${what} → ${PLATFORM_LABEL[rule.platform]}: ${rule.event_name}${rule.event_type === 'custom' ? ' (custom)' : ''}`)
  }
  const ruleFor = (platform: AdPlatform, name: string) => ({ platform, event_name: name, event_type: isStandardAdEvent(platform, name) ? ('standard' as const) : ('custom' as const) })

  const rawLabels = Array.isArray(config.labels) ? (config.labels as { name?: unknown; conversion?: unknown }[]) : []
  for (const l of rawLabels) {
    const name = typeof l.name === 'string' ? l.name.trim() : ''
    const targets = normalizeTargets(l.conversion)
    const platforms = AD_PLATFORMS.map((p) => p.key).filter((k) => targets[k])
    if (!name || !platforms.length) continue
    const id = labels.get(name.toLowerCase())
    if (!id) {
      plan.problems.push(`Label "${name}" is not in this Cekat business yet. Create it in Settings › Labels with exactly this name, then preview again.`)
      continue
    }
    for (const p of platforms) addRule({ trigger_source: 'label', trigger_key: name, trigger_ref_id: id, ...ruleFor(p, targets[p]) }, `Label "${name}"`)
  }
  for (const e of events) {
    for (const p of AD_PLATFORMS.map((x) => x.key).filter((k) => e.targets[k])) addRule({ trigger_source: 'custom', trigger_key: e.key, ...ruleFor(p, e.targets[p]) }, `Event ${e.key}`)
  }
  return plan
}

async function planFrom(call: CekatCall, config: ConfigLike): Promise<PushPlan> {
  const [events, catalog] = await Promise.all([call('marketing_list_custom_events', {}), call('marketing_setup_conversions', {})])
  return buildPlan(config, existingEventKeys(events), labelIds(catalog))
}

/** Reads Cekat and plans; nothing is saved. Cekat's own check of the rules (without confirm) is included. */
export async function previewPush(call: CekatCall, config: ConfigLike): Promise<PushPreview> {
  let plan: PushPlan
  try {
    plan = await planFrom(call, config)
  } catch (e) {
    if (needsBusiness(e)) return { kind: 'choose-business', businesses: businesses(await call('central_get_business', {})) }
    throw e
  }
  let cekatCheck = ''
  if (plan.rules.length) {
    // Without confirm Cekat only returns the resulting rule set. Rules for events created on apply may be
    // refused here; that is expected and the note says so.
    cekatCheck = await call('marketing_setup_conversions', { rules: plan.rules }).catch((e) =>
      plan.createEvents.length ? `Cekat checks the event rules after the events are created. (${e instanceof Error ? e.message : String(e)})` : `Cekat refused the rules: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  return { kind: 'plan', plan, cekatCheck: cekatCheck.slice(0, MAX_CHECK_CHARS) }
}

/** Creates the missing events, then saves the rules (confirm=true). Rules of events that failed are skipped. */
export async function applyPush(call: CekatCall, config: ConfigLike): Promise<PushResult> {
  const plan = await planFrom(call, config)
  const result: PushResult = { createdEvents: [], failedEvents: [], rulesSaved: 0, rulesError: null, problems: plan.problems }
  for (const event of plan.createEvents) {
    try {
      await call('marketing_save_custom_event', { ...event })
      result.createdEvents.push(event.key)
    } catch (e) {
      result.failedEvents.push({ key: event.key, error: e instanceof Error ? e.message : String(e) })
    }
  }
  const failed = new Set(result.failedEvents.map((f) => f.key))
  const rules = plan.rules.filter((r) => !(r.trigger_source === 'custom' && failed.has(r.trigger_key)))
  if (rules.length) {
    try {
      await call('marketing_setup_conversions', { rules, confirm: true })
      result.rulesSaved = rules.length
    } catch (e) {
      result.rulesError = e instanceof Error ? e.message : String(e)
    }
  }
  return result
}
