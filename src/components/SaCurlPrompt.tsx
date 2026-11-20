// "Generate cURL from a prompt": the SA describes a request in plain words, the AI writes one cURL into the
// Import cURL box, and the SA reviews it before importing. Nothing is sent; secrets come back as placeholders.
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { parseCurl, type SaEndpoint } from '../../shared/saPostman'
import { saPostmanApi } from '../lib/api'
import { Button, ErrorNote, Textarea } from './ui'

const PROMPT_MAX = 8000

/** The generated command, or why it cannot be imported as it is. */
export function checkGeneratedCurl(result: { curl: string; explanation: string }): { curl: string; problem: string } {
  const curl = result.curl.trim()
  if (!curl) return { curl: '', problem: result.explanation.trim() || 'The AI did not return a cURL command. Describe the method, URL and body more precisely.' }
  try {
    parseCurl(curl)
    return { curl, problem: '' }
  } catch (e) {
    return { curl, problem: `Check the generated command before importing: ${e instanceof Error ? e.message : String(e)}` }
  }
}

interface Props {
  /** The current request, so the AI can reuse its URL, {{variables}} and headers. */
  endpoint: () => SaEndpoint
  disabled: boolean
  onGenerated: (curl: string) => void
}

export function SaCurlPrompt({ endpoint, disabled, onGenerated }: Props) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [note, setNote] = useState('')

  async function generate() {
    setBusy(true)
    setError(null)
    setNote('')
    try {
      const result = await saPostmanApi.assist({ mode: 'generate', history: [], prompt: prompt.trim(), endpoint: endpoint(), response: '', error: '' })
      const { curl, problem } = checkGeneratedCurl(result)
      if (curl) onGenerated(curl)
      setNote(problem || 'cURL generated below. Review it, then Import cURL.')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-dashed border-line p-2">
      <Textarea
        aria-label="Describe the request to generate a cURL"
        rows={2}
        maxLength={PROMPT_MAX}
        className="text-xs"
        placeholder="Describe the request, e.g. POST {{baseUrl}}/orders with JSON name, phone and items; Bearer token auth"
        value={prompt}
        disabled={busy || disabled}
        onChange={(ev) => setPrompt(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && prompt.trim()) void generate()
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" icon={<Sparkles className="size-3.5" />} loading={busy} disabled={disabled || !prompt.trim()} onClick={() => void generate()}>
          Generate cURL
        </Button>
        <span className="text-[11px] text-muted">Ctrl+Enter · nothing is sent; secrets become placeholders</span>
      </div>
      <ErrorNote error={error} />
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  )
}
