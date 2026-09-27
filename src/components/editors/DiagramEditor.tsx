import { DIAGRAM_KINDS, type DiagramContent, type DiagramKind } from '../../../shared/schemas.ts'
import { slugify } from '../../lib/download'
import { MermaidView } from '../MermaidView'
import { Field, Input, Select, Textarea } from '../ui'

export function DiagramEditor({ value, onChange, readOnly }: { value: DiagramContent; onChange: (v: DiagramContent) => void; readOnly?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1fr_180px]">
        <Field label="Title">
          <Input readOnly={readOnly} value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
        </Field>
        <Field label="Kind">
          <Select disabled={readOnly} value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value as DiagramKind })}>
            {DIAGRAM_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Field label="Mermaid source">
          <Textarea
            spellCheck={false}
            readOnly={readOnly}
            rows={24}
            className="font-mono text-xs"
            value={value.mermaid}
            onChange={(e) => onChange({ ...value, mermaid: e.target.value })}
          />
        </Field>
        <div className="rounded-xl border border-line bg-panel p-4">
          <MermaidView source={value.mermaid} filename={slugify(value.title || 'diagram')} />
        </div>
      </div>
      <Field label="Explanation">
        <Textarea rows={3} readOnly={readOnly} value={value.explanation} onChange={(e) => onChange({ ...value, explanation: e.target.value })} />
      </Field>
    </div>
  )
}
