import { Plus, Trash2, X } from 'lucide-react'
import { Button, Input, Select, Textarea } from '../../ui'
import type { SetPocDraft } from '../pocConfig'
import type { SdkEvent, SdkEventProperty } from '../../../lib/types'
import { CONVERSION_LIMITS, SDK_EVENT_KEY_RE, SDK_PROPERTY_TYPES, emptySdkEvent, sdkEventKeyFrom, type SdkPropertyType } from '../../../../shared/pocConversions.ts'
import { AdTargetsFields } from './AdTargetsFields'

type Props = { events: SdkEvent[]; setDraft: SetPocDraft }

const keyError = (key: string) => (key && !SDK_EVENT_KEY_RE.test(key) ? 'Use lowercase letters, digits and _, starting with a letter' : '')

/** Custom events the client's system sends to Cekat with the SDK, and the ads conversion each one sends. */
export function SdkEventsCard({ events, setDraft }: Props) {
  const setEvents = (update: (events: SdkEvent[]) => SdkEvent[]) => setDraft((prev) => ({ ...prev, sdkEvents: update(prev.sdkEvents) }))
  const updateEvent = (index: number, patch: Partial<SdkEvent>) => setEvents((all) => all.map((e, i) => (i === index ? { ...e, ...patch } : e)))
  const canAdd = events.length < CONVERSION_LIMITS.sdkEvents

  return (
    <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <div>
        <h4 className="font-display text-base font-semibold">SDK Events</h4>
        <p className="text-xs text-muted">
          Events the client's own system sends to Cekat with the SDK or HTTP (Marketing › Events), e.g. a payment confirmed in their backend. Each one can be sent on to the ad platforms as a conversion.
        </p>
      </div>
      {events.map((event, index) => (
        <SdkEventRow key={`sdk-event-${index}`} event={event} index={index} onChange={(patch) => updateEvent(index, patch)} onRemove={() => setEvents((all) => all.filter((_, i) => i !== index))} />
      ))}
      <Button variant="outline" icon={<Plus className="size-4" />} disabled={!canAdd} onClick={() => setEvents((all) => [...all, emptySdkEvent()])}>
        Add SDK event
      </Button>
    </div>
  )
}

type RowProps = { event: SdkEvent; index: number; onChange: (patch: Partial<SdkEvent>) => void; onRemove: () => void }

function SdkEventRow({ event, index, onChange, onRemove }: RowProps) {
  const context = event.name || `SDK event ${index + 1}`
  // The key follows the name until the SA edits it.
  const setName = (name: string) => onChange(event.key === '' || event.key === sdkEventKeyFrom(event.name) ? { name, key: sdkEventKeyFrom(name) } : { name })
  const error = keyError(event.key)

  return (
    <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Input aria-label={`${context} name`} value={event.name} maxLength={CONVERSION_LIMITS.sdkEventName} onChange={(e) => setName(e.target.value)} placeholder="Event name, e.g. Order paid" />
        <div className="space-y-1">
          <Input aria-label={`${context} key`} value={event.key} maxLength={CONVERSION_LIMITS.sdkEventKey} onChange={(e) => onChange({ key: e.target.value })} placeholder="event_key" className="font-mono" aria-invalid={!!error} />
          {error && <p className="text-xs text-bad">{error}</p>}
        </div>
        <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={onRemove}>
          Remove
        </Button>
      </div>
      <Textarea aria-label={`${context} description`} rows={2} value={event.description} maxLength={CONVERSION_LIMITS.sdkEventDescription} onChange={(e) => onChange({ description: e.target.value })} placeholder="When the client system sends this event" />
      <PropertiesEditor context={context} properties={event.properties} onChange={(properties) => onChange({ properties })} />
      <div className="space-y-1 border-t border-line pt-3">
        <p className="text-xs text-muted">Send as ads conversion (CAPI)</p>
        <AdTargetsFields targets={event.targets} context={context} onChange={(targets) => onChange({ targets })} />
      </div>
    </div>
  )
}

type PropertiesProps = { context: string; properties: SdkEventProperty[]; onChange: (properties: SdkEventProperty[]) => void }

function PropertiesEditor({ context, properties, onChange }: PropertiesProps) {
  const update = (index: number, patch: Partial<SdkEventProperty>) => onChange(properties.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Properties</p>
      {properties.map((property, index) => (
        <div key={`property-${index}`} className="grid grid-cols-[1fr_auto_auto] gap-2">
          <div className="space-y-1">
            <Input aria-label={`${context} property ${index + 1} key`} value={property.key} maxLength={CONVERSION_LIMITS.propertyKey} onChange={(e) => update(index, { key: e.target.value })} placeholder="property_key, e.g. value" className="font-mono" />
            {keyError(property.key) && <p className="text-xs text-bad">{keyError(property.key)}</p>}
          </div>
          <Select aria-label={`${context} property ${index + 1} type`} value={property.type} onChange={(e) => update(index, { type: e.target.value as SdkPropertyType })}>
            {SDK_PROPERTY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
          <Button variant="ghost" icon={<X className="size-4" />} aria-label={`Remove ${context} property ${index + 1}`} onClick={() => onChange(properties.filter((_, i) => i !== index))} />
        </div>
      ))}
      <Button variant="outline" icon={<Plus className="size-4" />} disabled={properties.length >= CONVERSION_LIMITS.sdkEventProperties} onClick={() => onChange([...properties, { key: '', type: 'string' }])}>
        Add property
      </Button>
    </div>
  )
}
