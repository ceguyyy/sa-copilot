import { Plus, Trash2 } from 'lucide-react'
import { Button, Input, Textarea } from '../../ui'
import { ReviseField, ReviseHeading } from '../PocReviseParts'
import type { SetPocDraft } from '../pocConfig'
import type { PocRevise } from '../usePocRevise'
import type { PocKnowledgeBase } from '../../../lib/types'

type Props = { knowledgeBase: PocKnowledgeBase; setDraft: SetPocDraft; revise: PocRevise }
type ListKey = 'textSections' | 'websites' | 'qna'

/** Knowledge base: static text, website sources, Q&A and uploaded files. */
export function KnowledgeBaseCard({ knowledgeBase, setDraft, revise }: Props) {
  const setList = <K extends ListKey>(key: K, update: (items: PocKnowledgeBase[K]) => PocKnowledgeBase[K]) =>
    setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, [key]: update(prev.knowledgeBase[key]) } }))
  const updateItem = <K extends ListKey>(key: K, index: number, patch: Partial<PocKnowledgeBase[K][number]>) =>
    setList(key, (items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)) as PocKnowledgeBase[K])

  return (
    <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <ReviseHeading title="Knowledge Base" action={revise.button({ kind: 'section', section: 'knowledgeBase' })} />
      {revise.preview({ kind: 'section', section: 'knowledgeBase' })}
      <div className="space-y-3">
        <h5 className="text-sm font-semibold uppercase tracking-wide text-muted">Static text</h5>
        {knowledgeBase.textSections.map((item, index) => (
          <div key={`kb-section-${index}`} className="grid gap-3 rounded-lg border border-line bg-panel p-3">
            <Input value={item.title} onChange={(e) => updateItem('textSections', index, { title: e.target.value })} placeholder="Section title" />
            <ReviseField label="Content" action={revise.button({ kind: 'field', field: 'kbTextContent', index }, { iconOnly: true })} preview={revise.preview({ kind: 'field', field: 'kbTextContent', index })}>
              <Textarea aria-label="Static knowledge text" rows={3} value={item.content} onChange={(e) => updateItem('textSections', index, { content: e.target.value })} placeholder="Static knowledge text" />
            </ReviseField>
          </div>
        ))}
        <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setList('textSections', (items) => [...items, { title: '', content: '' }])}>
          Add text section
        </Button>
      </div>

      <div className="space-y-3">
        <h5 className="text-sm font-semibold uppercase tracking-wide text-muted">Website sources</h5>
        {knowledgeBase.websites.map((site, index) => (
          <div key={`site-${index}`} className="grid gap-3 rounded-lg border border-line bg-panel p-3 md:grid-cols-[1.2fr_1fr_auto]">
            <Input value={site.url} onChange={(e) => updateItem('websites', index, { url: e.target.value })} placeholder="https://example.com" />
            <Input value={site.note} onChange={(e) => updateItem('websites', index, { note: e.target.value })} placeholder="Notes" />
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setList('websites', (items) => items.filter((_, i) => i !== index))}>
              Remove
            </Button>
          </div>
        ))}
        <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setList('websites', (items) => [...items, { url: '', note: '' }])}>
          Add website
        </Button>
      </div>

      <div className="space-y-3">
        <h5 className="text-sm font-semibold uppercase tracking-wide text-muted">Q&A</h5>
        {knowledgeBase.qna.map((item, index) => (
          <div key={`qna-${index}`} className="grid gap-3 rounded-lg border border-line bg-panel p-3">
            <Input value={item.question} onChange={(e) => updateItem('qna', index, { question: e.target.value })} placeholder="Question" />
            <ReviseField label="Answer" action={revise.button({ kind: 'field', field: 'qnaAnswer', index }, { iconOnly: true })} preview={revise.preview({ kind: 'field', field: 'qnaAnswer', index })}>
              <Textarea aria-label="Answer" rows={3} value={item.answer} onChange={(e) => updateItem('qna', index, { answer: e.target.value })} placeholder="Answer" />
            </ReviseField>
          </div>
        ))}
        <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setList('qna', (items) => [...items, { question: '', answer: '' }])}>
          Add Q&A
        </Button>
      </div>

      <div className="space-y-3">
        <h5 className="text-sm font-semibold uppercase tracking-wide text-muted">Files</h5>
        {knowledgeBase.files.length === 0 ? <p className="text-sm text-muted">No uploaded KB files yet.</p> : knowledgeBase.files.map((file, index) => (
          <div key={`file-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel p-3">
            <span className="text-sm">{file.name}</span>
            <span className="font-mono text-xs text-muted">{file.size} bytes</span>
          </div>
        ))}
      </div>
    </div>
  )
}
