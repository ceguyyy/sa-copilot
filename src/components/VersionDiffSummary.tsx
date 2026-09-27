import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { summarizeVersionDiff } from '../lib/ai'
import { Markdown } from './Markdown'
import { Button, ErrorNote } from './ui'

interface Props {
  documentId: string
  fromVersionId: string
  toVersionId: string
}

/** "What changed?" in plain language, on top of the line diff between two saved versions. */
export function VersionDiffSummary({ documentId, fromVersionId, toVersionId }: Props) {
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function run() {
    setRunning(true)
    setText('')
    setError(null)
    try {
      await summarizeVersionDiff({ documentId, fromVersionId, toVersionId }, (t) => setText((s) => s + t))
    } catch (e) {
      setError(e)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-ember/40 bg-ember-soft/40 p-3">
      {!text && !running && (
        <Button variant="ai" icon={<Sparkles className="size-4" />} onClick={run}>
          Summarize changes with AI
        </Button>
      )}
      {(text || running) && <div className="rounded-lg bg-panel p-3 text-sm">{text ? <Markdown>{text}</Markdown> : <p className="font-mono text-xs text-ember">Comparing versions…</p>}</div>}
      <ErrorNote error={error} />
    </div>
  )
}
