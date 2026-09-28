import { useQuery } from '@tanstack/react-query'
import { Copy, ExternalLink, MonitorPlay } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNote, Select, Spinner } from '../components/ui'
import { demoOverviewApi } from '../lib/api'

const toolCls = 'inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-forest'

/**
 * The Healthcare demo app filling the whole content area (the page itself never scrolls).
 * Jump straight to any project's demo category from the picker.
 */
export function DemoPage() {
  const overview = useQuery({ queryKey: ['demo-overview'], queryFn: demoOverviewApi.get })
  const [target, setTarget] = useState('')
  const [copied, setCopied] = useState(false)

  if (overview.isLoading) return <Spinner />
  if (!overview.data) return <ErrorNote error={overview.error} />
  const d = overview.data
  const withScenarios = d.projects.filter((p) => p.pushed > 0)
  const url = target || d.appUrl

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    // Exactly the viewport minus <main>'s vertical padding, so only the demo inside the frame scrolls.
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-4.5rem)] flex-col md:-mx-10 md:-my-8 md:h-dvh">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2 md:px-6">
        <p className="flex items-center gap-2 font-display text-lg font-semibold">
          <MonitorPlay className="size-4 text-ember" /> Demo
        </p>
        <Select aria-label="Demo category" value={target} onChange={(e) => setTarget(e.target.value)} className="min-w-0 flex-1 py-1.5 text-xs sm:max-w-sm">
          <option value="">All demos</option>
          {withScenarios.map((p) => (
            <option key={p.id} value={p.link}>
              {p.client_name} — {p.name} ({p.pushed})
            </option>
          ))}
        </Select>
        <span className="flex-1" />
        {!d.configured && (
          <Link to="/" className="text-xs text-muted hover:text-forest">
            Scenarios are pushed from a project’s Demo tab
          </Link>
        )}
        <button className={toolCls} onClick={copy}>
          <Copy className="size-3.5" /> {copied ? 'Copied' : 'Copy link'}
        </button>
        <a className={toolCls} href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="size-3.5" /> Open
        </a>
      </div>
      <iframe
        key={url}
        title="Healthcare demo"
        src={url}
        className="min-h-0 w-full flex-1 border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  )
}
