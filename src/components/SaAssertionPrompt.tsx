// "Generate checks from a prompt": plain-language checks become assertion rules that every send and the
// Collection Runner run. The current request and its last response (auth removed) help the AI pick real paths.
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { SaAssertionRule, SaEndpoint, SaResponse } from '../../shared/saPostman'
import { saPostmanApi } from '../lib/api'
import { Button, ErrorNote, Input } from './ui'

const RESPONSE_SAMPLE_MAX = 20_000

interface Props {
  endpoint: () => SaEndpoint
  response: SaResponse | null
  disabled: boolean
  /** Adds the generated rules to the request; throws when its script cannot take them. */
  onAdd: (rules: SaAssertionRule[]) => void
}

export function SaAssertionPrompt({ endpoint, response, disabled, onAdd }: Props) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [note, setNote] = useState('')

  async function generate() {
    setBusy(true)
    setError(null)
    setNote('')
    try {
      const result = await saPostmanApi.assertions({ prompt: prompt.trim(), endpoint: endpoint(), response: response?.body.slice(0, RESPONSE_SAMPLE_MAX) ?? '' })
      if (result.rules.length) onAdd(result.rules)
      setNote([`${result.rules.length} check${result.rules.length === 1 ? '' : 's'} added. They run on every send and in the Collection Runner.`, result.note].filter(Boolean).join(' '))
      if (result.rules.length) setPrompt('')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed border-line p-3">
      <h3 className="font-semibold">Generate checks with AI</h3>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Describe the checks"
          className="min-w-60 flex-1"
          placeholder='e.g. status 200, field slots tidak kosong, data.status = "confirmed"'
          maxLength={4000}
          value={prompt}
          disabled={busy || disabled}
          onChange={(ev) => setPrompt(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && prompt.trim()) void generate()
          }}
        />
        <Button icon={<Sparkles className="size-3.5" />} loading={busy} disabled={disabled || !prompt.trim()} onClick={() => void generate()}>
          Generate checks
        </Button>
      </div>
      {!response && <p className="text-xs text-muted">Tip: send the request once first so the AI can see the real response fields.</p>}
      <ErrorNote error={error} />
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  )
}
