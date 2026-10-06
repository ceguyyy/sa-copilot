import { Hono } from 'hono'

export const office = new Hono()

office.get('/office', async (c) => {
  const appUrl = process.env.CLAUDE_OFFICE_URL?.trim() || 'http://localhost:8000'
  const apiUrl = process.env.CLAUDE_OFFICE_API_URL?.trim() || appUrl
  try {
    const url = new URL(appUrl)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS URL')
    const health = new URL('health', apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`)
    const response = await fetch(health, { signal: AbortSignal.timeout(4000), redirect: 'error' })
    return c.json({ appUrl: url.href, connected: response.ok, message: response.ok ? null : `Claude Office health: HTTP ${response.status}` })
  } catch (error) {
    return c.json({ appUrl, connected: false, message: error instanceof Error ? error.message : 'Claude Office is unavailable' })
  }
})
