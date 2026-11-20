// "Create in Cekat" for a POC, through the logged-in Cekat MCP server from Settings › AI tools.
import { Hono } from 'hono'
import { z } from 'zod'
import { McpToolError, callServerTool } from '../ai/mcp.ts'
import { hasLogin } from '../ai/mcpOAuth.ts'
import { applyPush, previewPush, type CekatCall } from '../cekat/pocPush.ts'
import { withCekatBrowser } from '../cekat/browser.ts'
import { boardNames, planCrmBuild, runCrmBuild } from '../cekat/crmBuild.ts'
import { CekatCrmUi } from '../cekat/crmUi.ts'
import { planAgentBuild, runAgentBuild } from '../cekat/agentBuild.ts'
import { CekatAgentUi } from '../cekat/agentUi.ts'
import { planRouting, runRoutingBuild } from '../cekat/routingBuild.ts'
import { CekatRoutingUi } from '../cekat/routingUi.ts'
import { planKb, runKbBuild } from '../cekat/kbBuild.ts'
import { CekatKbUi } from '../cekat/kbUi.ts'
import { planApiTools, runApiToolsBuild } from '../cekat/apiToolsBuild.ts'
import { CekatApiToolsUi } from '../cekat/apiToolsUi.ts'
import { webhookFlowMaker, type FlowMaker } from '../cekat/webhookFlow.ts'
import { streamResponse } from '../ai/stream.ts'
import { boardFromAi, boardToAi, normalizeCrm, type CrmBoard } from '../../shared/pocCrm.ts'
import { queryOne } from '../db.ts'
import { HttpError, idParam, notFound, parseJson } from '../http.ts'
import { pocConfig, pocCrm } from '../validation.ts'

export const CEKAT_MCP_URL = 'https://mcp.cekat.ai/mcp'

/** The SA's current (possibly unsaved) draft, so what is created matches what is on screen. */
const pushInput = z.object({ config: pocConfig })
const businessInput = z.object({ businessId: z.string().uuid() })
/** One board as it is on screen (unsaved edits included), validated like a saved POC board. */
const crmBuildInput = z.object({ board: z.unknown() })
const agentBuildInput = z.object({ config: pocConfig, name: z.string().trim().min(1).max(100) })

/** The board, with the key-duplicate rule applied the same way the AI output gets it. */
function boardFrom(raw: unknown): CrmBoard {
  const board = normalizeCrm(pocCrm.parse({ boards: [raw] })).boards[0]
  if (!board) throw new HttpError(400, 'No CRM board to build.')
  return boardFromAi(boardToAi(board))
}

async function cekatCall(): Promise<CekatCall> {
  const server = await queryOne<{ id: string }>(`select id from mcp_servers where enabled and rtrim(url, '/') = $1 order by created_at limit 1`, [CEKAT_MCP_URL])
  if (!server || !(await hasLogin(server.id))) throw new HttpError(400, 'Connect Cekat first: Settings › AI tools (MCP) › Add Cekat MCP, then log in.')
  return (tool, args) => callServerTool(server.id, tool, args)
}

/** Cekat's refusals (permissions, validation) are shown to the SA as they are. */
async function cekat<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    if (e instanceof McpToolError) throw new HttpError(502, `Cekat: ${e.message}`)
    throw e
  }
}

/**
 * Builds the Automation flows behind API tools that call a client endpoint. Only those need Cekat MCP; without it
 * (null) such tools are skipped and the rest of the agent is still built.
 */
async function flowMaker(config: z.infer<typeof pocConfig>): Promise<FlowMaker | null> {
  if (!planApiTools(config).tools.some((t) => t.flow)) return null
  try {
    return await webhookFlowMaker(await cekatCall())
  } catch {
    return null
  }
}

export const cekatPush = new Hono()

cekatPush.post('/pocs/:id/cekat/preview', async (c) => {
  notFound(await queryOne('select id from pocs where id = $1', [idParam(c)]), 'POC')
  const { config } = await parseJson(c, pushInput)
  const call = await cekatCall()
  return c.json(await cekat(() => previewPush(call, config)))
})

cekatPush.post('/pocs/:id/cekat/apply', async (c) => {
  notFound(await queryOne('select id from pocs where id = $1', [idParam(c)]), 'POC')
  const { config } = await parseJson(c, pushInput)
  const call = await cekatCall()
  return c.json(await cekat(() => applyPush(call, config)))
})

cekatPush.post('/cekat/business', async (c) => {
  const { businessId } = await parseJson(c, businessInput)
  const call = await cekatCall()
  await cekat(() => call('central_select_business', { businessId }))
  return c.body(null, 204)
})

/** What "Build in Cekat" would create for one CRM board; reads Cekat only. */
cekatPush.post('/pocs/:id/cekat/crm/preview', async (c) => {
  notFound(await queryOne('select id from pocs where id = $1', [idParam(c)]), 'POC')
  const board = boardFrom((await parseJson(c, crmBuildInput)).board)
  const call = await cekatCall()
  // crm_list_boards fails on some businesses; the build checks the names on the dashboard again anyway.
  const existing = await call('crm_list_boards', {}).then(boardNames, () => new Set<string>())
  return c.json(planCrmBuild(board, existing))
})

/** Builds one CRM board from scratch in a visible browser window, streaming each step. */
cekatPush.post('/pocs/:id/cekat/crm/build', async (c) => {
  notFound(await queryOne('select id from pocs where id = $1', [idParam(c)]), 'POC')
  const board = boardFrom((await parseJson(c, crmBuildInput)).board)
  const call = await cekatCall()
  return streamResponse(async (out) => {
    const log = (text: string) => out.send({ type: 'status', text })
    const result = await withCekatBrowser(log, (page) => runCrmBuild(new CekatCrmUi(page), call, board, log))
    out.send({ type: 'result', data: result })
    out.send({ type: 'done' })
  })
})

/** What "Build AI agent in Cekat" would do. Agent names are checked on the dashboard when the build starts. */
cekatPush.post('/pocs/:id/cekat/agent/preview', async (c) => {
  notFound(await queryOne('select id from pocs where id = $1', [idParam(c)]), 'POC')
  const { config, name } = await parseJson(c, agentBuildInput)
  const kb = planKb(config)
  const tools = planApiTools(config)
  return c.json({
    ...planAgentBuild(name, config, false),
    routing: planRouting(config),
    kb: { textChars: kb.text.length, qna: kb.qna.length, manual: kb.manual },
    tools: { names: tools.tools.map((t) => t.spec.name), viaFlow: tools.tools.filter((t) => t.flow).map((t) => t.spec.name), problems: tools.problems },
  })
})

/**
 * Creates the POC's AI agent and its API tools in a visible browser window, streaming each step. Only the Automation
 * flows behind tools that call a client endpoint need Cekat MCP.
 */
cekatPush.post('/pocs/:id/cekat/agent/build', async (c) => {
  notFound(await queryOne('select id from pocs where id = $1', [idParam(c)]), 'POC')
  const { config, name } = await parseJson(c, agentBuildInput)
  return streamResponse(async (out) => {
    const log = (text: string) => out.send({ type: 'status', text })
    const flows = await flowMaker(config)
    const result = await withCekatBrowser(log, async (page) => {
      const agent = await runAgentBuild(new CekatAgentUi(page), name, config, log)
      const kb = await runKbBuild(new CekatKbUi(page), agent.agentId, config, log)
      const routing = await runRoutingBuild(new CekatRoutingUi(page), agent.agentId, config, log)
      const tools = await runApiToolsBuild(new CekatApiToolsUi(page), agent.agentId, config, log, flows)
      return {
        ...agent,
        kbQna: kb.qna,
        createdLabels: routing.createdLabels,
        createdStatuses: routing.createdStatuses,
        conditions: routing.conditions,
        apiTools: tools.activated,
        apiToolFlows: tools.flows,
        problems: [...kb.problems, ...routing.problems, ...tools.problems, ...agent.problems],
      }
    })
    out.send({ type: 'result', data: result })
    out.send({ type: 'done' })
  })
})
