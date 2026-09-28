// Healthcare demo app integration: scenarios drafted here are pushed to the demo's Supabase (`scenarios`,
// `categories` tables via PostgREST) and shown at <DEMO_APP_URL>#/category/<id>/scenario/<id>.
// The demo key only ever lives on this server.
import { Hono } from 'hono'
import { z } from 'zod'
import { config } from './config.ts'
import { query, queryOne } from './db.ts'
import { HttpError, idParam, notFound, parseJson } from './http.ts'

const TIMEOUT_MS = 20_000
const AUTHOR = 'SA Copilot'

// ---------- scenario shape (mirrors src/types/scenario.ts of the demo repo) ----------

const cardItem = z.object({ label: z.string(), val: z.string() })
const step = z.object({
  userReply: z.string().trim().min(1),
  aiResponse: z.string().trim().min(1),
  chips: z.array(z.string()).optional(),
  enableCard: z.boolean().optional(),
  card: z.object({ title: z.string(), sub: z.string(), items: z.array(cardItem), status: z.string() }).optional(),
  enableFlow: z.boolean().optional(),
  flow: z
    .object({
      title: z.string(),
      description: z.string().optional(),
      buttonText: z.string().optional(),
      fields: z.array(
        z.object({
          id: z.string(),
          label: z.string().min(1),
          type: z.enum(['text', 'select', 'date', 'radio', 'checkbox']),
          placeholder: z.string().optional(),
          options: z.array(z.string()).optional(),
        }),
      ),
      submitResponseText: z.string().optional(),
    })
    .optional(),
})

export const scenarioPayload = z.object({
  name: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  tag: z.string().max(60).default('Use Case Demo'),
  triggerType: z.enum(['INBOUND_USER', 'OUTBOUND_SYSTEM']).default('INBOUND_USER'),
  outboundPill: z.string().max(80).optional(),
  description: z.string().max(2000).default(''),
  cekatComponents: z.array(z.string()).default([]),
  apiScopes: z.array(z.string()).default([]),
  ruleNote: z.string().max(2000).default(''),
  stepsDetail: z.array(z.string()).default([]),
  initialText: z.string().max(2000).default(''),
  steps: z.array(step).min(1).max(30),
})
export type ScenarioPayload = z.infer<typeof scenarioPayload>

/** Drops disabled cards/flows and empty extras so the demo renders only what is switched on. */
export function cleanScenario(raw: unknown): ScenarioPayload {
  const s = scenarioPayload.parse(raw)
  return {
    ...s,
    outboundPill: s.triggerType === 'OUTBOUND_SYSTEM' && s.outboundPill?.trim() ? s.outboundPill.trim() : undefined,
    steps: s.steps.map((st) => ({
      userReply: st.userReply,
      aiResponse: st.aiResponse,
      ...(st.chips?.filter((c) => c.trim()).length ? { chips: st.chips.filter((c) => c.trim()) } : {}),
      ...(st.enableCard && st.card ? { enableCard: true, card: st.card } : {}),
      ...(st.enableFlow && st.flow?.fields.length ? { enableFlow: true, flow: st.flow } : {}),
    })),
  }
}

// ---------- demo Supabase REST ----------

export const demoConfigured = () => Boolean(config.demo.supabaseUrl && config.demo.supabaseKey)

async function rest(path: string, init: RequestInit = {}): Promise<unknown> {
  if (!demoConfigured()) throw new HttpError(400, 'Demo is not connected — set DEMO_SUPABASE_URL and DEMO_SUPABASE_KEY in .env and restart')
  let res: Response
  try {
    res = await fetch(`${config.demo.supabaseUrl}/${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: config.demo.supabaseKey,
        Authorization: `Bearer ${config.demo.supabaseKey}`,
        ...init.headers,
      },
    })
  } catch (e) {
    throw new HttpError(502, `Cannot reach the demo database: ${e instanceof Error ? e.message : e}`)
  }
  const body = await res.text()
  if (!res.ok) throw new HttpError(502, `Demo database answered ${res.status}: ${body.slice(0, 200)}`)
  return body ? JSON.parse(body) : null
}

interface ProjectRow {
  id: string
  name: string
  client_name: string
  description: string | null
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

/** One demo category per project, e.g. "klinik-x-3fa9". */
export const demoCategoryId = (p: ProjectRow) => `${slug(p.client_name) || 'client'}-${p.id.slice(0, 4)}`

async function loadProject(id: string): Promise<ProjectRow> {
  return notFound(await queryOne<ProjectRow>('select id, name, client_name, description from projects where id = $1', [id]), 'Project')
}

const demoLink = (categoryId: string, scenarioId?: string) =>
  `${config.demo.appUrl.replace(/#.*$/, '').replace(/\/?$/, '/')}#/category/${categoryId}${scenarioId ? `/scenario/${scenarioId}` : ''}`

// ---------- routes ----------

export const demo = new Hono()

demo.get('/projects/:id/demo', async (c) => {
  const project = await loadProject(idParam(c))
  const categoryId = demoCategoryId(project)
  const scenarios = await query('select * from demo_scenarios where project_id = $1 order by created_at', [project.id])
  let remote: string[] | null = null
  let remoteError: string | null = null
  if (demoConfigured()) {
    try {
      const rows = (await rest(`scenarios?select=id&categoryId=eq.${encodeURIComponent(categoryId)}`)) as { id: string }[]
      remote = rows.map((r) => r.id)
    } catch (e) {
      remoteError = e instanceof Error ? e.message : String(e)
    }
  }
  return c.json({ configured: demoConfigured(), appUrl: config.demo.appUrl, categoryId, categoryLink: demoLink(categoryId), scenarios, remote, remoteError })
})

demo.patch('/demo-scenarios/:id', async (c) => {
  const id = idParam(c)
  const { payload } = await parseJson(c, z.object({ payload: z.unknown() }))
  const clean = cleanScenario(payload)
  return c.json(notFound(await queryOne('update demo_scenarios set payload = $2 where id = $1 returning *', [id, clean]), 'Demo scenario'))
})

demo.delete('/demo-scenarios/:id', async (c) => {
  const id = idParam(c)
  const row = await queryOne<{ pushed_at: string | null }>('select pushed_at from demo_scenarios where id = $1', [id])
  if (row?.pushed_at && demoConfigured()) await rest(`scenarios?id=eq.${id}`, { method: 'DELETE' })
  await query('delete from demo_scenarios where id = $1', [id])
  return c.body(null, 204)
})

/** Upserts the project's category and the chosen (default: all) scenarios into the demo app. */
demo.post('/projects/:id/demo/push', async (c) => {
  const project = await loadProject(idParam(c))
  const { ids } = await parseJson(c, z.object({ ids: z.array(z.string().uuid()).max(100).optional() }))
  const rows = await query<{ id: string; payload: ScenarioPayload }>(
    `select id, payload from demo_scenarios where project_id = $1 ${ids ? 'and id = any($2::uuid[])' : ''} order by created_at`,
    ids ? [project.id, ids] : [project.id],
  )
  if (!rows.length) throw new HttpError(400, 'No scenarios to push — generate some first')
  const categoryId = demoCategoryId(project)
  const total = (await query<{ n: number }>('select count(*)::int as n from demo_scenarios where project_id = $1', [project.id]))[0].n

  await rest('categories', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: categoryId,
      title: `${project.client_name} — ${project.name}`.slice(0, 120),
      description: (project.description ?? `Demo use cases for ${project.client_name}`).slice(0, 300),
      icon: 'fa-hospital-user',
      badge: `${total} SA Scenarios`,
      isCustom: true,
    }),
  })
  await rest('scenarios', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    // Only the columns the demo's `scenarios` table has (see saveScenario in the demo repo).
    body: JSON.stringify(
      rows.map(({ id, payload: s }) => ({
        id,
        categoryId,
        name: s.name,
        title: s.title,
        tag: s.tag,
        triggerType: s.triggerType,
        outboundPill: s.outboundPill ?? null,
        description: s.description,
        initialText: s.initialText,
        cekatComponents: s.cekatComponents,
        apiScopes: s.apiScopes,
        ruleNote: s.ruleNote,
        stepsDetail: s.stepsDetail,
        steps: s.steps,
        saAuthor: AUTHOR,
      })),
    ),
  })
  await query('update demo_scenarios set pushed_at = now() where id = any($1::uuid[])', [rows.map((r) => r.id)])
  return c.json({ pushed: rows.length, categoryId, link: demoLink(categoryId, rows[0].id) })
})

/** All projects' demo categories, for the sidebar Demo page. */
demo.get('/demo', async (c) => {
  const projects = await query<ProjectRow & { scenarios: number; pushed: number }>(
    `select p.id, p.name, p.client_name, p.description,
       count(s.id)::int as scenarios, count(s.pushed_at)::int as pushed
     from projects p left join demo_scenarios s on s.project_id = p.id
     group by p.id order by max(s.updated_at) desc nulls last, p.updated_at desc`,
  )
  return c.json({
    configured: demoConfigured(),
    appUrl: config.demo.appUrl,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      client_name: p.client_name,
      scenarios: p.scenarios,
      pushed: p.pushed,
      link: demoLink(demoCategoryId(p)),
    })),
  })
})
