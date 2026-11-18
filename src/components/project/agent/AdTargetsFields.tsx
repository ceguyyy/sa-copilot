import { useId } from 'react'
import { Input } from '../../ui'
import { AD_PLATFORMS, CONVERSION_LIMITS, STANDARD_AD_EVENTS, isStandardAdEvent, type AdEventTargets, type AdPlatform } from '../../../../shared/pocConversions.ts'

type Props = { targets: AdEventTargets; onChange: (targets: AdEventTargets) => void; context: string }

/** Event name per ad platform: search the standard events or type a custom one; empty = not sent. */
export function AdTargetsFields({ targets, onChange, context }: Props) {
  const id = useId()
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {AD_PLATFORMS.map(({ key, label }) => (
        <AdEventInput key={key} platform={key} label={label} listId={`${id}-${key}`} value={targets[key]} context={context} onChange={(value) => onChange({ ...targets, [key]: value })} />
      ))}
    </div>
  )
}

type InputProps = { platform: AdPlatform; label: string; listId: string; value: string; context: string; onChange: (value: string) => void }

function AdEventInput({ platform, label, listId, value, context, onChange }: InputProps) {
  const isCustom = value.trim() !== '' && !isStandardAdEvent(platform, value)
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
        {isCustom && <span className="rounded bg-ember-soft px-1.5 py-0.5 text-[10px] text-ink normal-case tracking-normal">Custom event</span>}
      </span>
      <Input
        aria-label={`${label} event for ${context}`}
        list={listId}
        value={value}
        maxLength={CONVERSION_LIMITS.eventName}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Not sent — search or type"
      />
      <datalist id={listId}>
        {STANDARD_AD_EVENTS[platform].flatMap(({ group, events }) => events.map((event) => <option key={`${group}-${event}`} value={event} label={group} />))}
      </datalist>
    </label>
  )
}
