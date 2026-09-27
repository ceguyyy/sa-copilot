// Conversational assistant that drafts a skill or a custom deliverable template.
// It may research with MCP tools (Cekat docs) and ends a turn by proposing field values via `propose_update`;
// the UI fills the editor with the proposal and the user decides whether to save.
import { z } from 'zod'
import { DOC_LABELS, SKILL_OUTPUT_TYPES } from '../../shared/schemas.ts'
import { config } from '../config.ts'
import { loadGlobalKnowledgeText } from './context.ts'
import { resolveEffort, systemPrompt, toolEvents, toolsFor } from './common.ts'
import { runModel, type ToolDef } from './llm/index.ts'
import { callMcpTool } from './mcp.ts'
import { activeModel } from './models.ts'
import type { Stream } from './stream.ts'

const PROPOSE_TOOL = 'propose_update'

const assistInput = z.object({
  kind: z.enum(['skill', 'template']),
  current: z.record(z.string(), z.unknown()).default({}),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(20_000) }))
    .min(1)
    .max(40),
})

const str = (description: string) => ({ type: 'string', description })

const PROPOSALS: Record<'skill' | 'template', ToolDef> = {
  skill: {
    name: PROPOSE_TOOL,
    description: 'Propose the complete skill. Always send every field, including unchanged ones.',
    inputSchema: {
      type: 'object',
      properties: {
        name: str('Short skill name'),
        output_type: { type: 'string', enum: [...SKILL_OUTPUT_TYPES], description: 'Which output this skill writes' },
        description: str('One-line summary shown in the skills list'),
        instructions: str('Full markdown instructions the copilot follows when writing this output'),
      },
      required: ['name', 'output_type', 'description', 'instructions'],
      additionalProperties: false,
    },
  },
  template: {
    name: PROPOSE_TOOL,
    description: 'Propose the complete deliverable template. Always send every field, including unchanged ones.',
    inputSchema: {
      type: 'object',
      properties: {
        name: str('Deliverable name, e.g. "Proposal Teknis" or "BRD"'),
        description: str('One-line summary of when to use this deliverable'),
        instructions: str(
          'Markdown instructions for the writer: the ordered list of sections (with what goes in each), which meta fields to fill, tone, language, and any tables to include',
        ),
      },
      required: ['name', 'description', 'instructions'],
      additionalProperties: false,
    },
  },
}

const ROLE: Record<'skill' | 'template', string> = {
  skill: `# YOUR TASK: skill editor
You help the SA write a "skill": the instruction set the copilot follows when producing one output type (${Object.entries(DOC_LABELS)
    .map(([k, v]) => `${k} = ${v}`)
    .join(', ')}, chat = free conversation).
The JSON structure of each document is fixed by the app; the skill controls content, tone, language, level of detail, which items to cover and standard wording.
Ask short clarifying questions when the request is vague. When you have enough, call ${PROPOSE_TOOL} with the full skill. Use the documentation tools to ground Cekat-specific instructions in how the product really works.`,
  template: `# YOUR TASK: custom deliverable designer
You help the SA design a new deliverable type (beyond the built-in Assessment/TOR/Timeline/SOW/Onboarding).
Every custom deliverable is written as: \`meta\` (key/value facts such as client, date, version, owner) + \`sections\` (title + markdown body, which may contain tables and lists).
Your instructions must list the sections in order, say what goes in each, which meta keys to fill, and the language/tone. Ask short clarifying questions when needed, then call ${PROPOSE_TOOL}. Use the documentation tools for Cekat-specific content.`,
}

export async function assist(body: unknown, out: Stream): Promise<void> {
  const input = assistInput.parse(body)
  const model = await activeModel()
  const [tools, effort, knowledge] = await Promise.all([toolsFor(model), resolveEffort(model, config.anthropic.chatEffort), loadGlobalKnowledgeText()])
  const current = `# CURRENT DRAFT (what the editor holds now)\n${JSON.stringify(input.current, null, 2)}`

  const result = await runModel({
    model,
    system: systemPrompt(`${ROLE[input.kind]}\n\n${current}`, knowledge),
    turns: input.messages,
    attachments: [],
    tools,
    runTool: callMcpTool,
    ...(model.tools ? { stopTool: PROPOSALS[input.kind] } : {}),
    effort,
    maxTokens: 16000,
    onText: (text) => out.send({ type: 'delta', text }),
    onProgress: (chars) => out.send({ type: 'progress', chars }),
    onToolUse: toolEvents(out),
  })
  if (result.stopInput) out.send({ type: 'proposal', data: result.stopInput })
  out.send({ type: 'done', stop_reason: result.stopReason })
}
