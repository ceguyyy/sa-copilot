import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { deckVisuals, type DeckContent } from '../../../shared/deck/index.ts'
import type { TimelineContent } from '../../../shared/schemas.ts'
import { documentsApi, versionsApi } from '../../lib/api'
import { Textarea } from '../ui'

interface Props {
  value: DeckContent
  onChange: (v: DeckContent) => void
  readOnly?: boolean
}

type SectionKey = Exclude<keyof DeckContent, 'mockups'> | 'mockup0' | 'mockup1' | 'mockup2'

const SLIDES: { slide: number; label: string; section: SectionKey; visual: string }[] = [
  { slide: 1, label: 'Cover', section: 'cover', visual: '' },
  { slide: 31, label: 'End-to-end architecture', section: 'architecture', visual: 'architecture' },
  { slide: 32, label: 'Alur data di CRM', section: 'crmFlow', visual: 'crmFlow' },
  { slide: 33, label: 'Marketing journey', section: 'marketing', visual: 'marketing' },
  { slide: 34, label: 'Mockup use case 1', section: 'mockup0', visual: 'mockup1' },
  { slide: 35, label: 'Mockup use case 2', section: 'mockup1', visual: 'mockup2' },
  { slide: 36, label: 'Mockup use case 3', section: 'mockup2', visual: 'mockup3' },
  { slide: 37, label: 'Mockup CRM', section: 'crm', visual: 'crm' },
  { slide: 38, label: 'Mockup kanban', section: 'kanban', visual: 'kanban' },
  { slide: 39, label: 'Mockup analytics', section: 'analytics', visual: 'analytics' },
  { slide: 40, label: 'Timeline', section: 'timeline', visual: 'timeline' },
]

const readSection = (deck: DeckContent, key: SectionKey): unknown =>
  key.startsWith('mockup')
    ? deck.mockups[Number(key.slice(-1))]
    : // Decks made before the cover existed get an empty one to fill in.
      (deck[key as keyof DeckContent] ?? (key === 'cover' ? { title: '', presenter: '', presenterRole: '' } : undefined))

function writeSection(deck: DeckContent, key: SectionKey, value: unknown): DeckContent {
  if (!key.startsWith('mockup')) return { ...deck, [key]: value }
  const i = Number(key.slice(-1))
  return { ...deck, mockups: deck.mockups.map((m, j) => (j === i ? (value as DeckContent['mockups'][number]) : m)) }
}

/** The project's latest Timeline content, which slide 40 draws. */
function useProjectTimeline(): TimelineContent | null {
  const { projectId = '' } = useParams()
  const docs = useQuery({ queryKey: ['documents', projectId], queryFn: () => documentsApi.list(projectId), enabled: !!projectId })
  const timelineDoc = docs.data?.find((d) => d.type === 'timeline')
  const versions = useQuery({ queryKey: ['versions', timelineDoc?.id], queryFn: () => versionsApi.list(timelineDoc!.id), enabled: !!timelineDoc })
  return (versions.data?.[0]?.content as TimelineContent | undefined) ?? null
}

/**
 * Slide-by-slide editor for the generated slides 31–40: live preview of each visual (the same SVG that goes
 * into the .pptx) and the slide's content as JSON. For wording changes, "Revise with AI" is usually faster.
 */
export function DeckEditor({ value, onChange, readOnly }: Props) {
  const timeline = useProjectTimeline()
  const [active, setActive] = useState(SLIDES[0])
  const visuals = useMemo(() => {
    try {
      return deckVisuals(value, timeline)
    } catch {
      return [] // half-edited content: skip previews until it is valid again
    }
  }, [value, timeline])
  const visual = visuals.find((v) => v.key === active.visual)

  const [json, setJson] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setJson(JSON.stringify(readSection(value, active.section), null, 2))
    setError(null)
  }, [active, value])

  function edit(text: string) {
    setJson(text)
    try {
      onChange(writeSection(value, active.section, JSON.parse(text)))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <ol className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="Slides">
        {SLIDES.map((s) => (
          <li key={s.slide} className="shrink-0">
            <button
              onClick={() => setActive(s)}
              aria-current={active.slide === s.slide}
              className={clsx(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition',
                active.slide === s.slide ? 'bg-forest text-paper' : 'text-muted hover:bg-forest-soft hover:text-ink',
              )}
            >
              <span className="font-mono text-xs opacity-70">{s.slide}</span> {s.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="min-w-0 space-y-3">
        <div className="rounded-xl border border-line bg-white p-3">
          {visual ? (
            // Our own SVG builder: every text value is escaped, no scripts or external references.
            <div className="flex justify-center [&>svg]:h-auto [&>svg]:max-h-[460px] [&>svg]:w-auto [&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: visual.svg }} />
          ) : (
            <p className="p-6 text-center text-sm text-muted">
              {active.slide === 1
                ? 'Slide 1 keeps the template design — only the title and the presenter lines change. Leave the presenter empty to keep the template’s.'
                : active.slide === 40 && !timeline
                  ? 'Slide 40 draws the project’s Timeline — draft the Timeline deliverable first.'
                  : 'No preview — fix the content below.'}
            </p>
          )}
        </div>
        {active.slide === 40 && <p className="text-xs text-muted">The Gantt comes from the project’s Timeline document; edit it there. Here you set the prerequisites and the note.</p>}
        <Textarea
          aria-label={`Slide ${active.slide} content`}
          spellCheck={false}
          readOnly={readOnly}
          rows={16}
          className={clsx('font-mono text-xs', error && 'border-bad')}
          value={json}
          onChange={(e) => edit(e.target.value)}
        />
        {error && <p className="text-xs text-bad">JSON error: {error} — not applied yet.</p>}
      </div>
    </div>
  )
}
