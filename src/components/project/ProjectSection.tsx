import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'

/** Keep children mounted when collapsed so drafts and running jobs survive. */
export function ProjectSection({ title, description, icon: Icon, expanded, onToggle, children, anchor }: { title: string; description?: string; icon: LucideIcon; expanded: boolean; onToggle: () => void; children: ReactNode; anchor?: string }) {
  const id = useId()
  return <section id={anchor} className="scroll-mt-6 overflow-hidden rounded-2xl border border-line bg-panel shadow-sm">
    <button type="button" aria-expanded={expanded} aria-controls={id} onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-forest-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest sm:p-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-forest-soft text-forest"><Icon className="size-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-base font-semibold">{title}</span>{description && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>}</span>
      <ChevronDown className={`size-5 shrink-0 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button>
    <div id={id} hidden={!expanded} className="border-t border-line p-4 sm:p-5">{children}</div>
  </section>
}
