// Splits one large diagram into several smaller diagram documents — e.g. an activity diagram with 10 swimlanes
// becomes 10 diagrams, one per lane — each keeping its hand-offs to the other lanes as labelled boundary nodes.
import { z } from 'zod'
import { DIAGRAM_KINDS, type DiagramContent } from '../../shared/schemas.ts'
import { config } from '../config.ts'
import { query, queryOne } from '../db.ts'
import { exportDocumentFiles } from '../exports.ts'
import { HttpError, UUID_RE } from '../http.ts'
import { BASE_SYSTEM, resolveEffort } from './common.ts'
import { SUBMIT_TOOL, parseJsonObject } from './extract.ts'
import { runModel, type ToolDef } from './llm/index.ts'
import { activeModel } from './models.ts'
import type { Stream } from './stream.ts'

const MAX_PARTS = 30

const splitInput = z.object({
  documentId: z.string().regex(UUID_RE),
  /** Optional: how to split ("per actor", "per fase"…); default is one diagram per lane / swimlane. */
  instruction: z.string().max(2000).default(''),
})

const diagramSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: [...DIAGRAM_KINDS] },
    title: { type: 'string', description: 'Original title + the lane name, e.g. "Booking flow — Customer"' },
    mermaid: { type: 'string', description: 'Valid Mermaid source only, no ``` fences' },
    explanation: { type: 'string', description: 'One or two sentences: what this lane does and whom it hands off to' },
  },
  required: ['kind', 'title', 'mermaid', 'explanation'],
  additionalProperties: false,
}

const resultSchema = {
  type: 'object',
  properties: { diagrams: { type: 'array', items: diagramSchema } },
  required: ['diagrams'],
  additionalProperties: false,
}

const TASK = `Split the diagram below into several smaller, self-contained Mermaid diagrams.
Default rule: one diagram per lane / swimlane / subgraph / participant / actor (whichever structure the diagram uses).
For each part:
- Keep every step of that lane in its original order, with its decisions and loops.
- Where the flow hands off to or receives from another lane, keep a small boundary node labelled with that lane (e.g. "→ Agent: eskalasi") instead of dropping the connection.
- Use the same diagram kind unless another fits a single lane clearly better; keep the original language.
- Every part must be valid Mermaid on its own.
If the diagram has no lanes at all, split it into its main phases instead.`

export async function splitDiagram(body: unknown, out: Stream): Promise<void> {
  const input = splitInput.parse(body)
  const doc = await queryOne<{ id: string; project_id: string; title: string; type: string }>(
    'select id, project_id, title, type from documents where id = $1',
    [input.documentId],
  )
  if (!doc) throw new HttpError(404, 'Document not found')
  if (doc.type !== 'diagram') throw new HttpError(400, 'Only diagrams can be split')
  const latest = await queryOne<{ content: DiagramContent }>(
    'select content from document_versions where document_id = $1 order by version_no desc limit 1',
    [doc.id],
  )
  if (!latest) throw new HttpError(400, 'This diagram has no saved version yet')

  const model = await activeModel()
  const structured = !config.anthropic.proxied
  const stopTool: ToolDef = { name: SUBMIT_TOOL, description: 'Submit all the split diagrams at once.', inputSchema: resultSchema }
  const source = `# DIAGRAM TO SPLIT: ${latest.content.title} (${latest.content.kind})\n${latest.content.mermaid}\n\n# EXPLANATION\n${latest.content.explanation || '-'}`
  const ask = [TASK, input.instruction && `Instruction from the SA: ${input.instruction}`, source].filter(Boolean).join('\n\n')

  const result = await runModel({
    model,
    system: [BASE_SYSTEM],
    turns: [{ role: 'user', content: structured ? ask : `${ask}\n\nReturn them ONLY by calling the ${SUBMIT_TOOL} tool once.` }],
    attachments: [],
    tools: [],
    runTool: async () => 'No tools available',
    ...(structured ? { jsonSchema: resultSchema } : { stopTool }),
    effort: await resolveEffort(model, config.anthropic.generateEffort),
    maxTokens: 64000,
    onProgress: (chars) => out.send({ type: 'progress', chars }),
  })
  if (result.stopReason === 'max_tokens') throw new HttpError(502, 'Output was cut off — try splitting into fewer parts.')

  const raw = (result.stopInput ?? parseJsonObject(result.text))?.diagrams
  const parts = Array.isArray(raw)
    ? raw.filter((d): d is DiagramContent => !!d && typeof d.mermaid === 'string' && d.mermaid.trim() !== '').slice(0, MAX_PARTS)
    : []
  if (parts.length < 2) throw new HttpError(502, 'The AI could not find separate lanes to split this diagram into.')

  const ids: string[] = []
  for (const part of parts) {
    const content: DiagramContent = {
      kind: DIAGRAM_KINDS.includes(part.kind) ? part.kind : latest.content.kind,
      title: String(part.title || doc.title).slice(0, 300),
      mermaid: part.mermaid,
      explanation: String(part.explanation ?? ''),
    }
    const created = await queryOne<{ id: string }>('insert into documents (project_id, type, title) values ($1, $2, $3) returning id', [
      doc.project_id,
      'diagram',
      content.title,
    ])
    await query(`insert into document_versions (document_id, content, origin, note) values ($1, $2, 'ai', $3)`, [
      created!.id,
      content,
      `Split from "${doc.title}" · ${model.id}`,
    ])
    exportDocumentFiles(created!.id).catch((e) => console.error('Auto-export failed:', e))
    ids.push(created!.id)
  }
  out.send({ type: 'done', documentIds: ids })
}
