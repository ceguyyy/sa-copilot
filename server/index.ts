// Local SA Copilot server: REST API + AI stream + the built frontend, on 127.0.0.1 only.
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Hono } from 'hono'
import { ai } from './ai/handler.ts'
import { config } from './config.ts'
import { setupDatabase } from './db.ts'
import { toHttpError } from './http.ts'
import { api } from './routes.ts'
import { extras } from './routes/extras.ts'
import { themes } from './themes.ts'
import { seedDefaultServers } from './ai/mcp.ts'

const app = new Hono()

app.onError((e, c) => {
  const err = toHttpError(e)
  if (err.status >= 500) console.error(e)
  return c.json({ error: err.message }, err.status as 400)
})

app.route('/api', api)
app.route('/api', extras)
app.route('/api', themes)
app.route('/api/ai', ai)
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

// Built frontend (npm run build). In dev, Vite serves the UI and proxies /api here instead.
if (existsSync(config.distDir)) {
  const root = path.relative(process.cwd(), config.distDir) || '.'
  app.use('/*', serveStatic({ root }))
  const indexHtml = await readFile(path.join(config.distDir, 'index.html'), 'utf8')
  app.get('*', (c) => c.html(indexHtml)) // SPA fallback for client-side routes
}

try {
  await setupDatabase()
  await seedDefaultServers()
} catch (e) {
  console.error(`\nCannot set up PostgreSQL: ${e instanceof Error ? e.message : e}`)
  console.error('Check DATABASE_URL in .env and that the PostgreSQL service is running (pgAdmin / services.msc).\n')
  process.exit(1)
}

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, ({ port }) => {
  console.log(`SA Copilot running at http://localhost:${port}`)
})
