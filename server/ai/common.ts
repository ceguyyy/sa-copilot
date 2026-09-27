// Helpers shared by the project AI endpoints (handler.ts) and the skill/template assistant (assist.ts).
import type { Effort, ToolDef } from './llm/index.ts'
import { mcpToolDefs } from './mcp.ts'
import { getEffort, type ModelInfo } from './models.ts'
import type { Stream } from './stream.ts'

export const BASE_SYSTEM = `You are the personal Solution Architect copilot of a presales Solution Architect at PT Teknologi Cekat Indonesia (Cekat AI) — an AI Agent builder and Omnichannel CRM (WhatsApp, Instagram, Facebook, Live Chat, marketplace).
You help turn client requirements into: Assessment Requirement, TOR, Timeline, SOW (Cekat internal format and Meta CIF format), Onboarding Forms, custom deliverables, and UML/flow diagrams in Mermaid.
Rules:
- Ground every statement in the provided requirements and knowledge. When information is missing, say so explicitly and mark it as needing client confirmation instead of inventing numbers, prices, vendors or dates.
- When a documentation tool is available, use it to check how Cekat features actually work before describing them.
- Default language is Bahasa Indonesia unless the requirement or the user uses English.
- Be concrete and professional, like an experienced presales SA.`

/** The saved effort, else the .env default for Claude models; other models get their provider's default. */
export async function resolveEffort(model: ModelInfo, fallback: Effort): Promise<Effort | undefined> {
  const saved = await getEffort()
  if (saved !== 'default') return saved
  return model.format === 'anthropic' ? fallback : undefined
}

/** MCP tools (e.g. Cekat docs) if the model can call tools. A failing MCP server never blocks the request. */
export async function toolsFor(model: ModelInfo): Promise<ToolDef[]> {
  if (!model.tools) return []
  return mcpToolDefs().catch((e) => {
    console.error('MCP tools unavailable:', e)
    return []
  })
}

export function toolEvents(out: Stream) {
  return (name: string, input: unknown) => out.send({ type: 'tool', name, input })
}

export function systemPrompt(skillInstructions: string | undefined, contextText: string): string[] {
  return [BASE_SYSTEM, ...(skillInstructions ? [`# SKILL INSTRUCTIONS\n${skillInstructions}`] : []), contextText]
}
