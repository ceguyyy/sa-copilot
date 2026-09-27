import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { SowContent } from '../../../supabase/functions/_shared/schemas.ts'
import { Markdown } from '../Markdown'
import { Button, Input, Textarea } from '../ui'

type Section = SowContent['sections'][number]

export function SowEditor({ value, onChange, readOnly }: { value: SowContent; onChange: (v: SowContent) => void; readOnly?: boolean }) {
  const [editing, setEditing] = useState<number | null>(null)

  const setMeta = (i: number, patch: Partial<SowContent['meta'][number]>) =>
    onChange({ ...value, meta: value.meta.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) })
  const setSection = (i: number, patch: Partial<Section>) =>
    onChange({ ...value, sections: value.sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
  const moveSection = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= value.sections.length) return
    const next = [...value.sections]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange({ ...value, sections: next })
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-line bg-panel p-5">
        <h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted">Document details</h3>
        <dl className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          {value.meta.map((m, i) => (
            <div key={i} className="grid grid-cols-[140px_1fr_auto] items-center gap-2">
              {readOnly ? (
                <>
                  <dt className="text-xs font-semibold text-muted">{m.key}</dt>
                  <dd className="col-span-2 text-sm">{m.value}</dd>
                </>
              ) : (
                <>
                  <Input aria-label="Field name" className="py-1 text-xs font-semibold" value={m.key} onChange={(e) => setMeta(i, { key: e.target.value })} />
                  <Input aria-label={m.key} className="py-1" value={m.value} onChange={(e) => setMeta(i, { value: e.target.value })} />
                  <button aria-label={`Remove ${m.key}`} className="p-1 text-muted hover:text-bad" onClick={() => onChange({ ...value, meta: value.meta.filter((_, idx) => idx !== i) })}>
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </dl>
        {!readOnly && (
          <Button variant="ghost" className="mt-2" icon={<Plus className="size-4" />} onClick={() => onChange({ ...value, meta: [...value.meta, { key: 'Field', value: '' }] })}>
            Add field
          </Button>
        )}
      </section>

      <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
        {value.sections.map((s, i) => (
          <a key={i} href={`#sec-${i}`} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:border-forest hover:text-forest">
            {i + 1}. {s.title}
          </a>
        ))}
      </nav>

      {value.sections.map((s, i) => (
        <article key={i} id={`sec-${i}`} className="scroll-mt-6 border-t border-line pt-5">
          <header className="mb-3 flex items-center gap-2">
            <span className="font-mono text-xs text-ember">{String(i + 1).padStart(2, '0')}</span>
            {readOnly || editing !== i ? (
              <h3 className="flex-1 font-display text-xl font-semibold">{s.title}</h3>
            ) : (
              <Input aria-label="Section title" className="flex-1 font-display text-lg" value={s.title} onChange={(e) => setSection(i, { title: e.target.value })} />
            )}
            {!readOnly && (
              <div className="flex items-center text-muted">
                <button aria-label="Move up" className="p-1 hover:text-forest" onClick={() => moveSection(i, -1)}>
                  <ArrowUp className="size-4" />
                </button>
                <button aria-label="Move down" className="p-1 hover:text-forest" onClick={() => moveSection(i, 1)}>
                  <ArrowDown className="size-4" />
                </button>
                <button aria-label={editing === i ? 'Preview' : 'Edit'} className="p-1 hover:text-forest" onClick={() => setEditing(editing === i ? null : i)}>
                  {editing === i ? <Eye className="size-4" /> : <Pencil className="size-4" />}
                </button>
                <button
                  aria-label="Delete section"
                  className="p-1 hover:text-bad"
                  onClick={() => confirm(`Delete section "${s.title}"?`) && onChange({ ...value, sections: value.sections.filter((_, idx) => idx !== i) })}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )}
          </header>
          {editing === i && !readOnly ? (
            <Textarea rows={Math.min(30, Math.max(8, s.markdown.split('\n').length + 2))} className="font-mono text-xs" value={s.markdown} onChange={(e) => setSection(i, { markdown: e.target.value })} />
          ) : (
            <Markdown>{s.markdown}</Markdown>
          )}
        </article>
      ))}

      {!readOnly && (
        <Button
          variant="outline"
          icon={<Plus className="size-4" />}
          onClick={() => {
            onChange({ ...value, sections: [...value.sections, { title: 'New section', markdown: '' }] })
            setEditing(value.sections.length)
          }}
        >
          Add section
        </Button>
      )}
    </div>
  )
}
