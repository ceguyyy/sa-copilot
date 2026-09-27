// SKILL.md-style import/export: YAML-ish frontmatter (name, description, output_type) + markdown body.
import { SKILL_OUTPUT_TYPES, type SkillOutputType } from '../../supabase/functions/_shared/schemas.ts'
import type { SkillInput } from './types'

type SkillFile = Omit<SkillInput, 'is_default'>

const quote = (s: string) => JSON.stringify(s)

export function skillToMarkdown(s: SkillFile): string {
  return `---\nname: ${quote(s.name)}\ndescription: ${quote(s.description)}\noutput_type: ${s.output_type}\n---\n\n${s.instructions}\n`
}

function unquote(raw: string): string {
  const v = raw.trim()
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v)
    } catch {
      return v.slice(1, -1)
    }
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1)
  return v
}

export function parseSkillMarkdown(text: string): SkillFile {
  const normalized = text.replace(/\r\n/g, '\n')
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(normalized)
  const meta: Record<string, string> = {}
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = /^(\w+):\s*(.*)$/.exec(line)
      if (m) meta[m[1]] = unquote(m[2])
    }
  }
  const body = (fm ? normalized.slice(fm[0].length) : normalized).trim()
  if (!body) throw new Error('Skill file is empty — it needs instructions below the frontmatter')

  const outputType = meta.output_type || 'chat'
  if (!(SKILL_OUTPUT_TYPES as readonly string[]).includes(outputType)) {
    throw new Error(`Unknown output_type "${outputType}". Use one of: ${SKILL_OUTPUT_TYPES.join(', ')}`)
  }
  const name = meta.name || /^#\s+(.+)$/m.exec(body)?.[1]?.trim() || 'Imported skill'
  return { name: name.slice(0, 120), output_type: outputType as SkillOutputType, description: meta.description ?? '', instructions: body }
}
