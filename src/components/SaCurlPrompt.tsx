// "Generate cURL with AI": the SA describes a request in plain words, the AI writes one cURL, and the SA reviews
// and edits it here before loading it into the request. Nothing is sent; secrets come back as placeholders.
import { Download, Sparkles } from 'lucide-react'
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
  /** Loads the reviewed command into the request editor; throws when it cannot be parsed. */
  onImport: (curl: string) => void
  /** Text area wrapping, from the SAPostman preferences. */
  wrap?: 'soft' | 'off'
}

export function SaCurlPrompt({ endpoint, disabled, onImport, wrap = 'soft' }: Props) {
  const [prompt, setPrompt] = useState('')
  const [curl, setCurl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [note, setNote] = useState('')

  async function generate() {
    setBusy(true)
    setError(null)
    setNote('')
    try {
      const result = await saPostmanApi.assist({ mode: 'generate', history: [], prompt: prompt.trim(), endpoint: endpoint(), response: '', error: '' })
      const checked = checkGeneratedCurl(result)
      if (checked.curl) setCurl(checked.curl)
      setNote(checked.problem || 'Review the command, edit it if needed, then load it into the request.')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  function load() {
    setError(null)
    try {
      onImport(curl.trim())
      setNote('Loaded into the request below. Fill in the placeholders, then Hit / Send.')
    } catch (e) {
      setError(e)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Describe the request in plain words. The AI writes one cURL using this request's {'{{variables}}'}; nothing is sent and secrets become placeholders.</p>
      <Textarea
        aria-label="Describe the request to generate a cURL"
        rows={3}
        maxLength={PROMPT_MAX}
        placeholder="e.g. POST {{baseUrl}}/orders with JSON name, phone and items; Bearer token auth"
        value={prompt}
        disabled={busy || disabled}
        onChange={(ev) => setPrompt(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && prompt.trim()) void generate()
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<Sparkles className="size-3.5" />} loading={busy} disabled={disabled || !prompt.trim()} onClick={() => void generate()}>
          Generate cURL
        </Button>
        <span className="text-[11px] text-muted">Ctrl+Enter</span>
      </div>
      <ErrorNote error={error} />
      {note && <p className="text-xs text-muted">{note}</p>}
      {curl && (
        <>
          <Textarea aria-label="Generated cURL" wrap={wrap} rows={5} className="font-mono text-xs" value={curl} onChange={(ev) => setCurl(ev.target.value)} />
          <Button variant="outline" icon={<Download className="size-3.5" />} disabled={disabled || busy || !curl.trim()} onClick={load}>
            Load into request
          </Button>
        </>
      )}
    </div>
  )
}
