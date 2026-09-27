// Conversational assistant that drafts a skill, a custom deliverable template, or a color theme.
// It may research with MCP tools (Cekat docs) and ends a turn by proposing field values via `propose_update`;
// the UI fills the editor (or previews the theme) with the proposal and the user decides whether to save.
import { z } from 'zod'
import { UUID_RE } from '../http.ts'
import { DOC_LABELS, SKILL_OUTPUT_TYPES } from '../../shared/schemas.ts'
import { THEME_TOKENS, TOKEN_ROLES, themeProblems } from '../../shared/theme.ts'
import { NO_FILES, attachmentIds, ownerFiles, requestFiles } from '../attachments.ts'
import { config } from '../config.ts'
import { query } from '../db.ts'
import { loadGlobalKnowledgeText } from './context.ts'
import { resolveEffort, systemPrompt, toolEvents, toolsFor } from './common.ts'
import { runModel, type ToolDef, type Turn } from './llm/index.ts'
import { callMcpTool, probeMcpServer } from './mcp.ts'
import { activeModel } from './models.ts'
import type { Stream } from './stream.ts'

const PROPOSE_TOOL = 'propose_update'

const assistInput = z.object({
  kind: z.enum(['skill', 'template', 'theme', 'mcp']),
  current: z.record(z.string(), z.unknown()).default({}),
  /** The skill / format being edited, so its reference files are visible to the assistant. */
  ownerId: z.string().regex(UUID_RE).nullable().optional(),
  attachmentIds,
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(20_000) }))
    .min(1)
    .max(40),
})

const str = (description: string) => ({ type: 'string', description })

type Kind = z.infer<typeof assistInput>['kind']

const paletteSchema = {
  type: 'object',
  properties: Object.fromEntries(THEME_TOKENS.map((t) => [t, { type: 'string', description: `#rrggbb — ${TOKEN_ROLES[t]}` }])),
  required: [...THEME_TOKENS],
  additionalProperties: false,
}

/** A theme that fails contrast is sent back to the model with the problems this many times. */
const THEME_REPAIRS = 2

const PROBE_TOOL: ToolDef = {
  name: 'check_mcp_server',
  description: 'Connect to a remote MCP server (Streamable HTTP, https only) and list its tools. Use it to verify a URL before proposing it.',
  inputSchema: {
    type: 'object',
    properties: { url: { type: 'string', description: 'https:// MCP endpoint URL' } },
    required: ['url'],
    additionalProperties: false,
  },
}

const PROPOSALS: Record<Kind, ToolDef> = {
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
  mcp: {
    name: PROPOSE_TOOL,
    description: 'Propose one MCP server to add. The user reviews it and clicks Add.',
    inputSchema: {
      type: 'object',
      properties: { name: str('Short display name, e.g. "Microsoft Learn"'), url: str('https:// Streamable HTTP MCP endpoint') },
      required: ['name', 'url'],
      additionalProperties: false,
    },
  },
  theme: {
    name: PROPOSE_TOOL,
    description: 'Propose the complete color theme: a name plus a light and a dark palette.',
    inputSchema: {
      type: 'object',
      properties: { name: str('Short theme name'), light: paletteSchema, dark: paletteSchema },
      required: ['name', 'light', 'dark'],
      additionalProperties: false,
    },
  },
}

const ROLE: Record<Kind, string> = {
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
  mcp: `# YOUR TASK: AI tools helper
You help the SA configure the MCP servers this app's AI may consult (documentation lookups while chatting and drafting).
What the app supports: remote MCP servers over Streamable HTTP, no login/API-key headers, and it only uses tools that don't declare side effects.
Useful public examples: any GitBook docs site at <site>/~gitbook/mcp (e.g. https://docs.cekat.ai/~gitbook/mcp), Microsoft Learn https://learn.microsoft.com/api/mcp, Context7 library docs https://mcp.context7.com/mcp, DeepWiki (GitHub repos) https://mcp.deepwiki.com/mcp.
Also answer questions about the current setup (listed below), explain what a server's tools do, or suggest turning one off.
Always verify a URL with check_mcp_server before proposing it; if it fails, say so instead of proposing. Propose one server at a time via ${PROPOSE_TOOL}.`,
  theme: `# YOUR TASK: color theme designer
You design a color theme for this app (a calm, professional presales workbench). A theme has a LIGHT and a DARK palette with these tokens:
${THEME_TOKENS.map((t) => `- ${t}: ${TOKEN_ROLES[t]}`).join('\n')}
Requirements: every color is #rrggbb. Both palettes must be readable — ink on paper/panel ≥ 4.5:1, paper on forest ≥ 4.5:1, paper on ember ≥ 3:1, muted on panel ≥ 3:1, forest on forest-soft and ember on ember-soft ≥ 3:1. In dark mode, paper/panel are dark and forest/ember become lighter tints so the paper-colored text on them stays readable.
Keep ok/warn/bad recognizably green/amber/red. Don't ask questions unless the request is truly unclear — propose a theme right away by calling ${PROPOSE_TOOL}, with one short sentence about the idea.`,
}

export async function assist(body: unknown, out: Stream): Promise<void> {
  const input = assistInput.parse(body)
  const model = await activeModel()
  const isTheme = input.kind === 'theme'
  const isMcp = input.kind === 'mcp'
  // Themes and tool setup need neither Cekat docs nor the knowledge base.
  const [docTools, effort, knowledge] = await Promise.all([
    isTheme || isMcp ? [] : toolsFor(model),
    resolveEffort(model, config.anthropic.chatEffort),
    isTheme || isMcp ? '' : loadGlobalKnowledgeText(),
  ])
  // The tools helper gets a connection checker instead of documentation tools.
  const tools = isMcp ? [PROBE_TOOL] : docTools
  const runTool = isMcp ? (_name: string, args: unknown) => probeMcpServer((args as { url?: unknown } | null)?.url) : callMcpTool
  const current = isMcp
    ? `# CONFIGURED MCP SERVERS\n${JSON.stringify(await query('select name, url, enabled from mcp_servers order by created_at'), null, 2)}`
    : `# CURRENT DRAFT (what the editor holds now)\n${JSON.stringify(input.current, null, 2)}`
  const ownerKind = input.kind === 'skill' || input.kind === 'template' ? input.kind : null
  const [refs, files] = await Promise.all([
    ownerKind ? ownerFiles(ownerKind, input.ownerId ?? undefined, model.vision) : NO_FILES,
    requestFiles(input.attachmentIds, model.vision),
  ])
  const system = [ROLE[input.kind], current, refs.text].filter(Boolean).join('\n\n')
  const run = (turns: Turn[]) =>
    runModel({
      model,
      system: systemPrompt(system, knowledge),
      turns,
      attachments: [...refs.images, ...files.images],
      tools,
      runTool,
      ...(model.tools ? { stopTool: PROPOSALS[input.kind] } : {}),
      effort,
      maxTokens: 16000,
      onText: (text) => out.send({ type: 'delta', text }),
      onProgress: (chars) => out.send({ type: 'progress', chars }),
      onToolUse: toolEvents(out),
    })

  // Files attached to this message ride along with the latest user turn.
  let turns: Turn[] = input.messages.map((m, i, all) =>
    i === all.length - 1 && m.role === 'user' && files.text ? { ...m, content: `${m.content}\n\n${files.text}` } : m,
  )
  let result = await run(turns)
  // Unreadable theme → show the model exactly which color pairs fail and let it fix them.
  for (let i = 0; isTheme && result.stopInput && i < THEME_REPAIRS; i++) {
    const problems = themeProblems(result.stopInput)
    if (!problems.length) break
    out.send({ type: 'tool', name: 'contrast__check', input: { fixing: `${problems.length} low-contrast pairs` } })
    turns = [
      ...turns,
      { role: 'assistant', content: `Proposed theme: ${JSON.stringify(result.stopInput)}` },
      { role: 'user', content: `The contrast check failed:\n- ${problems.join('\n- ')}\nAdjust only the colors needed and call ${PROPOSE_TOOL} again.` },
    ]
    result = await run(turns)
  }
  if (result.stopInput) out.send({ type: 'proposal', data: result.stopInput })
  out.send({ type: 'done', stop_reason: result.stopReason })
}
