// REST endpoints for project files on disk, custom deliverable templates and MCP tool servers.
import { Hono } from 'hono'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { invalidateMcpCache, mcpTools } from '../ai/mcp.ts'
import { query, queryOne } from '../db.ts'
import { deleteProjectFile, exportProjectFiles, listProjectFiles, projectFilePath, revealInExplorer } from '../exports.ts'
import { HttpError, idParam, notFound, parseJson } from '../http.ts'
import { mcpServerInput, mcpServerPatch, templateInput, templatePatch, toSetClause } from '../validation.ts'

export const extras = new Hono()

// ---------- project files (auto-exported deliverables) ----------

extras.get('/projects/:id/files', async (c) => c.json(await listProjectFiles(idParam(c))))

extras.post('/projects/:id/files/export', async (c) => c.json({ exported: await exportProjectFiles(idParam(c)) }))

extras.post('/projects/:id/files/open', async (c) => {
  const { dir } = await listProjectFiles(idParam(c))
  await revealInExplorer(dir, true)
  return c.body(null, 204)
})

extras.get('/projects/:id/files/:name', async (c) => {
  const file = await projectFilePath(idParam(c), c.req.param('name'))
  const data = await readFile(file).catch(() => {
    throw new HttpError(404, 'File not found')
  })
  const name = path.basename(file)
  return c.body(data, 200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
  })
})

extras.post('/projects/:id/files/:name/open', async (c) => {
  await revealInExplorer(await projectFilePath(idParam(c), c.req.param('name')), false)
  return c.body(null, 204)
})

extras.delete('/projects/:id/files/:name', async (c) => {
  await deleteProjectFile(idParam(c), c.req.param('name'))
  return c.body(null, 204)
})

// ---------- custom deliverable templates ----------

extras.get('/templates', async (c) => c.json(await query('select * from doc_templates order by name')))

extras.post('/templates', async (c) => {
  const t = await parseJson(c, templateInput)
  const row = await queryOne('insert into doc_templates (name, description, instructions) values ($1, $2, $3) returning *', [
    t.name,
    t.description,
    t.instructions,
  ])
  return c.json(row, 201)
})

extras.patch('/templates/:id', async (c) => {
  const id = idParam(c)
  const set = toSetClause(await parseJson(c, templatePatch), 2)
  return c.json(notFound(await queryOne(`update doc_templates set ${set.sql} where id = $1 returning *`, [id, ...set.values]), 'Template'))
})

extras.delete('/templates/:id', async (c) => {
  await query('delete from doc_templates where id = $1', [idParam(c)])
  return c.body(null, 204)
})

// ---------- MCP tool servers ----------

extras.get('/mcp-servers', async (c) => {
  const [servers, tools] = await Promise.all([
    query<{ id: string }>('select * from mcp_servers order by created_at'),
    mcpTools().catch(() => []),
  ])
  // `tools` is empty for a disabled or unreachable server — the UI shows that as "no tools".
  return c.json(servers.map((s) => ({ ...s, tools: tools.filter((t) => t.serverId === s.id).map((t) => t.name) })))
})

extras.post('/mcp-servers', async (c) => {
  const s = await parseJson(c, mcpServerInput)
  const row = await queryOne('insert into mcp_servers (name, url) values ($1, $2) returning *', [s.name, s.url])
  invalidateMcpCache()
  return c.json(row, 201)
})

extras.patch('/mcp-servers/:id', async (c) => {
  const id = idParam(c)
  const set = toSetClause(await parseJson(c, mcpServerPatch), 2)
  const row = await queryOne(`update mcp_servers set ${set.sql} where id = $1 returning *`, [id, ...set.values])
  invalidateMcpCache()
  return c.json(notFound(row, 'MCP server'))
})

extras.delete('/mcp-servers/:id', async (c) => {
  await query('delete from mcp_servers where id = $1', [idParam(c)])
  invalidateMcpCache()
  return c.body(null, 204)
})
