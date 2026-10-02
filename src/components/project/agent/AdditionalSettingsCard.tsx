import { Field, Input } from '../../ui'
import type { SetPocDraft } from '../pocConfig'
import type { PocAdditionalSettings } from '../../../lib/types'

type Props = { settings: PocAdditionalSettings; setDraft: SetPocDraft }
type NumberKey = 'aiHistoryLimit' | 'aiReadFileLimit' | 'aiContextLimit' | 'messageAwait' | 'aiMessageLimit'

const NUMBER_FIELDS: { key: NumberKey; label: string }[] = [
  { key: 'aiHistoryLimit', label: 'AI History Limit' },
  { key: 'aiReadFileLimit', label: 'AI Read File Limit' },
  { key: 'aiContextLimit', label: 'AI Context Limit' },
]
const selectClass = 'w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink'

/** The Cekat agent's Additional Settings tab. */
export function AdditionalSettingsCard({ settings, setDraft }: Props) {
  const set = (patch: Partial<PocAdditionalSettings>) => setDraft((prev) => ({ ...prev, additionalSettings: { ...prev.additionalSettings, ...patch } }))
  const numberField = (key: NumberKey, label: string) => (
    <Field key={key} label={label}>
      <Input type="number" value={settings[key]} onChange={(e) => set({ [key]: Number(e.target.value) || 0 })} />
    </Field>
  )

  return (
    <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <h4 className="font-display text-base font-semibold">Additional Settings</h4>
      <div className="grid gap-4 md:grid-cols-2">
        {NUMBER_FIELDS.map((f) => numberField(f.key, f.label))}
        <Field label="AI Temperature">
          <select className={selectClass} value={settings.aiTemperature} onChange={(e) => set({ aiTemperature: e.target.value as PocAdditionalSettings['aiTemperature'] })}>
            <option value="low">Low</option>
            <option value="balanced">Balanced</option>
            <option value="creative">Creative</option>
          </select>
        </Field>
        {numberField('messageAwait', 'Message Await')}
        {numberField('aiMessageLimit', 'AI Message Limit')}
        <Field label="Watcher">
          <select className={selectClass} value={settings.watcher} onChange={(e) => set({ watcher: e.target.value as PocAdditionalSettings['watcher'] })}>
            <option value="off">Off</option>
            <option value="standard">Standard</option>
            <option value="strict">Strict</option>
          </select>
        </Field>
        <Field label="Timezone"><Input value={settings.timezone} onChange={(e) => set({ timezone: e.target.value })} /></Field>
        <Field label="Session-Only Memory">
          <select className={selectClass} value={settings.sessionOnlyMemory} onChange={(e) => set({ sessionOnlyMemory: e.target.value as PocAdditionalSettings['sessionOnlyMemory'] })}>
            <option value="off">Off</option>
            <option value="session_only">Session only</option>
            <option value="per_thread">Per thread</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 rounded-lg border border-line bg-panel p-3 text-sm">
          <input type="checkbox" checked={settings.ignoreTeamHandoff} onChange={(e) => set({ ignoreTeamHandoff: e.target.checked })} />
          Ignore team handoff
        </label>
      </div>
    </div>
  )
}
