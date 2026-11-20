// Where the browser lands after logging in to an MCP server. Public on purpose (the system browser has no app
// session); it only accepts a single-use, unexpired state that this server issued when the login started.
import { Hono } from 'hono'
import { resetMcpServer } from '../ai/mcp.ts'
import { LoginCallbackError, finishLogin } from '../ai/mcpOAuth.ts'

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

function page(title: string, body: string, ok: boolean): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>body{font:16px system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#1d1d1b;background:#f6f4ee}
h1{font-size:1.4rem;color:${ok ? '#2f5d3a' : '#a33a1f'}}@media(prefers-color-scheme:dark){body{background:#161614;color:#ecebe6}}</style></head>
<body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`
}

export const mcpOAuthCallback = new Hono()

mcpOAuthCallback.get('/mcp-oauth/callback', async (c) => {
  const { state, code, error, error_description: description } = c.req.query()
  if (error) return c.html(page('Login cancelled', description || error, false), 400)
  try {
    const serverId = await finishLogin(state, code)
    resetMcpServer(serverId)
    return c.html(page('Connected', 'The MCP server is connected. You can close this tab and go back to SA Copilot.', true))
  } catch (e) {
    if (!(e instanceof LoginCallbackError)) console.error('MCP login callback failed:', e)
    const message = e instanceof LoginCallbackError ? e.message : 'The login could not be completed. Start it again from Settings › AI tools.'
    return c.html(page('Login failed', message, false), 400)
  }
})
