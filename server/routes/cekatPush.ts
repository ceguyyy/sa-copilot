// "Create in Cekat" for a POC, through the logged-in Cekat MCP server from Settings › AI tools.
import { Hono } from 'hono'
import { z } from 'zod'
import { McpToolError, callServerTool } from '../ai/mcp.ts'
import { hasLogin } from '../ai/mcpOAuth.ts'
import { applyPush, previewPush, type CekatCall } from '../cekat/pocPush.ts'
import { withCekatBrowser } from '../cekat/browser.ts'
import { boardNames, planCrmBuild, runCrmBuild } from '../cekat/crmBuild.ts'
import { CekatCrmUi } from '../cekat/crmUi.ts'
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
