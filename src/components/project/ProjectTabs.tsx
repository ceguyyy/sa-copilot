import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import type { KeyboardEvent } from 'react'

export interface ProjectTab<Id extends string> {
  id: Id
  label: string
  icon: LucideIcon
  /** Live summary under the label, e.g. "4/6 drafted". */
  meta?: string
}

interface Props<Id extends string> {
  tabs: ProjectTab<Id>[]
  active: Id
  onSelect: (id: Id) => void
}

/**
 * Section switcher laid out as a wrapping grid of cards so it never scrolls. Columns follow the width of the
 * content area (not the window, since the chat panel takes the right side): 2 or 4 balanced columns.
 * Arrow keys move between tabs.
 */
export function ProjectTabs<Id extends string>({ tabs, active, onSelect }: Props<Id>) {
  function onKeyDown(e: KeyboardEvent, index: number) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = tabs[(index + step + tabs.length) % tabs.length]
    onSelect(next.id)
    document.getElementById(`project-tab-${next.id}`)?.focus()
  }

  return (
    <div className="@container">
      <div role="tablist" aria-label="Project sections" className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
        {tabs.map(({ id, label, icon: Icon, meta }, i) => {
          const selected = id === active
          return (
            <button
              key={id}
              id={`project-tab-${id}`}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={clsx(
                'group relative flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition',
                'focus-visible:ring-2 focus-visible:ring-ember/60 focus-visible:outline-none',
                selected
                  ? 'border-forest bg-forest text-paper shadow-[0_6px_18px_-10px_var(--forest)]'
                  : 'border-line bg-panel text-ink hover:-translate-y-0.5 hover:border-forest/50 hover:shadow-[0_6px_16px_-12px_var(--ink)]',
              )}
            >
              {/* Accent bar marks the active section. */}
              <span className={clsx('absolute inset-y-0 left-0 w-1 transition', selected ? 'bg-ember' : 'bg-transparent group-hover:bg-forest/30')} />
              <span
                className={clsx(
                  'flex size-9 shrink-0 items-center justify-center rounded-lg transition',
                  selected ? 'bg-paper/15 text-paper' : 'bg-forest-soft text-forest group-hover:bg-forest group-hover:text-paper',
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{label}</span>
                {meta && <span className={clsx('block truncate font-mono text-[11px]', selected ? 'text-paper/70' : 'text-muted')}>{meta}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
