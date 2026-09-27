import type {
  AnyDocContent,
  AssessmentContent,
  DiagramContent,
  DocType,
  OnboardingContent,
  SowContent,
  TimelineContent,
  TorContent,
} from './schemas.ts'
import { computeSchedule } from './timeline.ts'

export function escapeCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')
}

export function mdTable(headers: string[], rows: unknown[][]): string {
  const head = `| ${headers.join(' | ')} |`
  const sep = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((r) => `| ${r.map(escapeCell).join(' | ')} |`)
  return [head, sep, ...body].join('\n')
}

const STATUS_LABEL = { answered: 'Answered', needs_confirmation: 'Perlu konfirmasi', not_applicable: 'N/A' }

export function toMarkdown(type: DocType, title: string, content: AnyDocContent): string {
  const out = [`# ${title}`]
  switch (type) {
    case 'assessment': {
      const c = content as AssessmentContent
      if (c.summary) out.push(c.summary)
      out.push(
        mdTable(
          ['No', 'Assessment Kebutuhan Proses Bisnis', 'Feedback', 'Status'],
          c.rows.map((r) => [r.no, r.question, r.feedback, STATUS_LABEL[r.status] ?? r.status]),
        ),
      )
      break
    }
    case 'tor': {
      const c = content as TorContent
      out.push(
        mdTable(
          ['Layanan', 'Sub Layanan', 'Deskripsi', 'Note', 'Raised By'],
          c.rows.map((r) => [r.layanan, r.sub_layanan, r.deskripsi, r.note, r.raised_by]),
        ),
      )
      break
    }
    case 'timeline': {
      const c = content as TimelineContent
      const s = computeSchedule(c.rows, c.start_date || undefined)
      out.push(`Total: **${s.totalDays} mandays** (${s.totalWeeks} weeks)${s.endDate ? ` · ${c.start_date} → ${s.endDate}` : ''}`)
      out.push(
        mdTable(
          ['No', 'Activity', 'Module', 'Function', 'PIC', 'SLA/Days', 'Start', 'End'],
          s.rows.map((r) => [r.no, r.activity, r.module, r.function, r.pic, r.days, r.startDate ?? `D${r.startDay + 1}`, r.endDate ?? `D${Math.max(r.endDay, r.startDay + 1)}`]),
        ),
      )
      if (c.notes.length) out.push(`**Keterangan:**\n${c.notes.map((n) => `- ${n}`).join('\n')}`)
      break
    }
    case 'sow_cekat':
    case 'sow_cif':
    case 'custom': {
      const c = content as SowContent
      if (c.meta.length) out.push(c.meta.map((m) => `**${m.key}:** ${m.value}`).join('  \n'))
      for (const s of c.sections) out.push(`## ${s.title}\n\n${s.markdown}`)
      break
    }
    case 'onboarding': {
      const c = content as OnboardingContent
      for (const s of c.sections) {
        out.push(`## ${s.title}`)
        if (s.description) out.push(s.description)
        out.push(
          mdTable(
            ['Field', 'Type', 'Required', 'Value', 'Help'],
            s.fields.map((f) => [f.label, f.options.length ? `${f.type}: ${f.options.map((o) => o.trim()).filter(Boolean).join(' / ')}` : f.type, f.required ? 'Yes' : '', f.value, f.help]),
          ),
        )
      }
      break
    }
    case 'diagram': {
      const c = content as DiagramContent
      out.push(`_${c.kind} diagram_`)
      out.push('```mermaid\n' + c.mermaid + '\n```')
      if (c.explanation) out.push(c.explanation)
      break
    }
  }
  return out.join('\n\n') + '\n'
}
