import { cleanupTrash, guardTrash } from './trash.ts'
import { connections } from './connections.ts'
import { inbox } from './inbox.ts'
// Local SA Copilot server: REST API + AI stream + the built frontend, on 127.0.0.1 only.
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Hono } from 'hono'
import { recoverActivity } from './ai/activity.ts'
import { ai } from './ai/handler.ts'
import { config } from './config.ts'
import { setupDatabase } from './db.ts'
import { HttpError, toHttpError } from './http.ts'
import { api } from './routes.ts'
import { extras } from './routes/extras.ts'
import { n8nNodes } from './routes/n8nNodes.ts'
import { themes } from './themes.ts'
import { languages } from './languages.ts'
import { questions } from './routes/questions.ts'
import { qaSuites } from './routes/qaSuites.ts'
import { demo } from './demo.ts'
import { attachments, purgeOldRequestFiles } from './attachments.ts'
import { seedDefaultServers } from './ai/mcp.ts'
import { backup } from './backup/routes.ts'
import { maintenance } from './maintenance/routes.ts'
import { beginWrite } from './maintenance/lock.ts'

import { office } from './routes/office.ts'

import { auth, validateAccount } from './auth.ts'
import { desktopUpdate } from './maintenance/desktopUpdate.ts'
import { saPostman } from './routes/saPostman.ts'
import { saPostmanWorkspace } from './routes/saPostmanWorkspace.ts'

const app = new Hono()
app.route('/api/desktop-update', desktopUpdate)
app.get('/api/health', (c) => c.json({ ready: true }))
app.route('/api', auth)
app.use('/api/*', async (c, next) => {
  if (!await validateAccount(c)) throw new HttpError(401, 'Login required')
  await next()
})

app.use('/api/*', async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) || /^\/api\/(cloud|updates)(\/|$)/.test(c.req.path)) return next()
  const done = beginWrite()
  try { await next() } finally { done() }
})

app.onError((e, c) => {
  const err = toHttpError(e)
  if (err.status >= 500) console.error(e)
  return c.json({ error: err.message }, err.status as 400)
})

app.use('/api/*', guardTrash)
app.route('/api', office)
app.route('/api', saPostman)
app.route('/api', saPostmanWorkspace)
app.route('/api', connections)
app.route('/api', inbox)
app.route('/api', api)
app.route('/api', extras)
app.route('/api', n8nNodes)
app.route('/api', backup)
app.route('/api', maintenance)
app.route('/api', themes)
app.route('/api', languages)
app.route('/api', questions)
app.route('/api', qaSuites)
app.route('/api', demo)
app.route('/api', attachments)
app.route('/api/ai', ai)
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

// Built frontend (npm run build). In dev, Vite serves the UI and proxies /api here instead.
if (existsSync(config.distDir)) {
  const root = path.relative(process.cwd(), config.distDir) || '.'
  // index.html is read per request and never cached, so a rebuild is picked up without restarting the server;
  // the hashed assets it points to can be cached.
  const noCache = { 'Cache-Control': 'no-cache' }
  const indexHtml = () => readFile(path.join(config.distDir, 'index.html'), 'utf8')
  app.get('/', async (c) => c.html(await indexHtml(), 200, noCache))
  app.use('/*', serveStatic({ root }))
  app.get('*', async (c) => c.html(await indexHtml(), 200, noCache)) // SPA fallback for client-side routes
}

try {
  await setupDatabase()
  await recoverActivity()
  await seedDefaultServers()
  await purgeOldRequestFiles()
} catch (e) {
  console.error(`\nCannot set up PostgreSQL: ${e instanceof Error ? e.message : e}`)
  console.error('Check DATABASE_URL in .env and that the PostgreSQL service is running (pgAdmin / services.msc).\n')
  process.exit(1)
}

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, ({ port }) => {
  console.log(`SA Copilot running at http://localhost:${port}`)
})

// Cleanup never runs alongside cloud restore or active writes. Busy maintenance retries next hour.
void cleanupTrash().catch(e => console.error('Trash cleanup deferred:', e))
setInterval(() => { void cleanupTrash().catch(e => console.error('Trash cleanup deferred:', e)) }, 60 * 60_000).unref()
