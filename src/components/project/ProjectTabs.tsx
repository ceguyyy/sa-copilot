import type { LucideIcon } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs'

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

/** Overrides for shadcn's trigger: a card per section, the active one filled with the primary color. */
const trigger = [
  'group relative h-auto min-w-0 justify-start gap-3 overflow-hidden rounded-xl border border-border bg-card px-3 py-2.5 text-left whitespace-normal text-foreground shadow-none',
  'hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm',
  'data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md',
  'dark:text-foreground dark:data-[state=active]:border-primary dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground',
].join(' ')

/**
 * Section switcher (shadcn Tabs) laid out as a wrapping grid of cards so it never scrolls. Columns follow the width
 * of the content area (not the window, since the chat panel takes the right side): 2 or 4 balanced columns. The
 * sections themselves are rendered by the page; Radix gives the arrow-key navigation.
 */
export function ProjectTabs<Id extends string>({ tabs, active, onSelect }: Props<Id>) {
  return (
    <Tabs value={active} onValueChange={(value) => onSelect(value as Id)} className="@container">
      {/* shadcn fixes the list at h-9 through a group-data variant, so the auto height is set on the same variant. */}
      <TabsList aria-label="Project sections" className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto @3xl:grid-cols-4">
        {tabs.map(({ id, label, icon: Icon, meta }) => (
          <TabsTrigger key={id} id={`project-tab-${id}`} value={id} className={trigger}>
            {/* Accent bar marks the active section. */}
            <span className="absolute inset-y-0 left-0 w-1 bg-transparent transition group-hover:bg-primary/30 group-data-[state=active]:bg-ember" />
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary transition group-hover:bg-primary group-hover:text-primary-foreground group-data-[state=active]:bg-primary-foreground/15 group-data-[state=active]:text-primary-foreground">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{label}</span>
              {meta && <span className="block truncate font-mono text-[11px] text-muted-foreground group-data-[state=active]:text-primary-foreground/70">{meta}</span>}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
