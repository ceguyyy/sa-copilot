import { Download, ExternalLink, Maximize2, Minus, Plus, Scan, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { drawioUrl } from '../../shared/drawio.ts'
import { downloadBlob } from '../lib/download'

type MermaidApi = (typeof import('mermaid'))['default']
let initializedFor: 'light' | 'dark' | null = null

const currentScheme = (): 'light' | 'dark' => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

/** Mermaid's theme follows the app's light/dark choice (re-initialized when it changes). */
async function getMermaid(): Promise<MermaidApi> {
  const mermaid = (await import('mermaid')).default
  const scheme = currentScheme()
  if (initializedFor !== scheme) {
    mermaid.initialize({ startOnLoad: false, theme: scheme === 'dark' ? 'dark' : 'neutral', securityLevel: 'strict', fontFamily: 'IBM Plex Sans' })
    initializedFor = scheme
  }
  return mermaid
}

const ZOOM_STEP = 1.25
const MIN_ZOOM = 0.25
const MAX_ZOOM = 6

const toolCls = 'flex items-center gap-1 rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted transition hover:border-forest hover:text-ink'

/** Full-window view of a rendered diagram with zoom; scroll to pan, Esc to close. */
function Fullscreen({ svg, title, onClose, onDrawio }: { svg: string; title: string; onClose: () => void; onDrawio: () => void }) {
  const [zoom, setZoom] = useState(1)
  const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') setZoom((z) => clamp(z * ZOOM_STEP))
      else if (e.key === '-') setZoom((z) => clamp(z / ZOOM_STEP))
      else if (e.key === '0') setZoom(1)
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${title} — full screen`} className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="flex items-center gap-2 border-b border-line bg-panel px-4 py-2">
        <p className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{title}</p>
        <button className={toolCls} aria-label="Zoom out" onClick={() => setZoom((z) => clamp(z / ZOOM_STEP))}>
          <Minus className="size-3.5" />
        </button>
        <span className="w-12 text-center font-mono text-xs text-muted">{Math.round(zoom * 100)}%</span>
        <button className={toolCls} aria-label="Zoom in" onClick={() => setZoom((z) => clamp(z * ZOOM_STEP))}>
          <Plus className="size-3.5" />
        </button>
        <button className={toolCls} aria-label="Fit" title="Reset zoom (0)" onClick={() => setZoom(1)}>
          <Scan className="size-3.5" /> Fit
        </button>
        <button className={toolCls} onClick={onDrawio}>
          <ExternalLink className="size-3.5" /> Edit in draw.io
        </button>
        <button className={toolCls} aria-label="Close full screen" title="Close (Esc)" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-8" onWheel={(e) => e.ctrlKey && (e.preventDefault(), setZoom((z) => clamp(z * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP))))}>
        {/* Width follows the zoom so scrollbars appear for panning; at 100% the diagram fits the window. */}
        <div className="mermaid-host mx-auto [&>svg]:!h-auto [&>svg]:!w-full [&>svg]:!max-w-none" style={{ width: `${zoom * 100}%` }} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>,
    document.body,
  )
}

/** Renders Mermaid source; shows the parser error instead of crashing on invalid input. */
export function MermaidView({ source, filename, title, className }: { source: string; filename?: string; title?: string; className?: string }) {
  const id = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const [scheme, setScheme] = useState(currentScheme)
  const counter = useRef(0)

  // Re-render when the app switches light/dark.
  useEffect(() => {
    const observer = new MutationObserver(() => setScheme(currentScheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = ++counter.current
    const timer = setTimeout(async () => {
      try {
        const mermaid = await getMermaid()
        await mermaid.parse(source)
        const { svg: out } = await mermaid.render(`${id}-${run}`, source)
        if (!cancelled) {
          setSvg(out)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [source, id, scheme])

  async function openDrawio() {
    window.open(await drawioUrl(source, { dark: scheme === 'dark' }), '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={className}>
      {error && (
        <pre className="mb-2 overflow-auto rounded-md border border-bad/30 bg-ember-soft p-3 font-mono text-xs whitespace-pre-wrap text-bad">
          Mermaid error: {error}
        </pre>
      )}
      {svg && (
        <div className="space-y-2">
          <div className="flex flex-wrap justify-end gap-1">
            <button className={toolCls} onClick={() => setFull(true)} title="Full screen preview">
              <Maximize2 className="size-3" /> Full screen
            </button>
            <button className={toolCls} onClick={openDrawio} title="Open as an editable diagram in draw.io">
              <ExternalLink className="size-3" /> draw.io
            </button>
            {filename && (
              <button className={toolCls} onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${filename}.svg`)}>
                <Download className="size-3" /> SVG
              </button>
            )}
          </div>
          {/* Mermaid output rendered with securityLevel "strict" (sanitized, no scripts). */}
          <button type="button" className="block w-full cursor-zoom-in" onClick={() => setFull(true)} aria-label="Open full screen preview">
            <div className="mermaid-host flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />
          </button>
          {full && <Fullscreen svg={svg} title={title ?? filename ?? 'Diagram'} onClose={() => setFull(false)} onDrawio={openDrawio} />}
        </div>
      )}
    </div>
  )
}
