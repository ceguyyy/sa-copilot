// Global catalog of Cekat n8n nodes (name, node type, trigger/action, example JSON), given to the AI as knowledge.
import { Hono } from 'hono'
import { nodesFromWorkflow } from '../../shared/n8nNodes.ts'
import { query, queryOne, withTransaction } from '../db.ts'
import { HttpError, idParam, notFound, parseJson } from '../http.ts'
import { n8nNodeInput, n8nNodePatch, n8nWorkflowImport, toSetClause } from '../validation.ts'

export const n8nNodes = new Hono()

n8nNodes.get('/n8n-nodes', async (c) => c.json(await query('select * from n8n_node_skills order by kind desc, node_type, name')))

n8nNodes.post('/n8n-nodes', async (c) => {
  const n = await parseJson(c, n8nNodeInput)
  const row = await queryOne(
    'insert into n8n_node_skills (name, node_type, kind, description, example) values ($1, $2, $3, $4, $5) returning *',
    [n.name, n.node_type, n.kind, n.description, n.example],
  )
  return c.json(row, 201)
})

/** Adds every node of a pasted n8n workflow export (credential ids are stripped). */
n8nNodes.post('/n8n-nodes/import', async (c) => {
  const { workflow } = await parseJson(c, n8nWorkflowImport)
  const parsed = typeof workflow === 'string' ? (() => {
    try {
      return JSON.parse(workflow)
    } catch {
      throw new HttpError(400, 'Not valid JSON — paste the workflow exported from n8n')
    }
  })() : workflow
  const nodes = nodesFromWorkflow(parsed)
  if (!nodes.length) throw new HttpError(400, 'No nodes found — paste a workflow exported from n8n (it has a "nodes" array)')
  const rows = await withTransaction(async (tx) => {
    const inserted = []
    for (const n of nodes) {
      const { rows } = await tx.query(
        'insert into n8n_node_skills (name, node_type, kind, description, example) values ($1, $2, $3, $4, $5) returning *',
        [n.name, n.node_type, n.kind, n.description, n.example],
      )
      inserted.push(rows[0])
    }
    return inserted
  })
  return c.json(rows, 201)
})

n8nNodes.patch('/n8n-nodes/:id', async (c) => {
  const id = idParam(c)
  const set = toSetClause(await parseJson(c, n8nNodePatch), 2)
  return c.json(notFound(await queryOne(`update n8n_node_skills set ${set.sql} where id = $1 returning *`, [id, ...set.values]), 'n8n node'))
})

n8nNodes.delete('/n8n-nodes/:id', async (c) => {
  await query('delete from n8n_node_skills where id = $1', [idParam(c)])
  return c.body(null, 204)
})
