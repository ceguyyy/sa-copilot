import { Hono } from 'hono'
import { z } from 'zod'
import { HttpError, parseJson } from '../http.ts'
import { config } from '../config.ts'
import type { SaRequest, SaResponse } from '../../shared/saPostman.ts'

const schema = z.object({ method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']), url: z.string().max(8192), headers: z.array(z.object({ name: z.string().max(256), value: z.string().max(16384) })).max(100), body: z.string().max(2_000_000) })
export async function executeSaRequest(request: SaRequest, fetcher: typeof fetch = fetch, timeoutMs = 30000, binary?: Uint8Array): Promise<SaResponse> {
  let url: URL
  try { url = new URL(request.url) } catch { throw new HttpError(400, 'Enter a valid HTTP or HTTPS URL') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new HttpError(400, 'Use HTTP or HTTPS without credentials in the URL')
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && Number(url.port || (url.protocol === 'https:' ? 443 : 80)) === config.port) throw new HttpError(400, 'Requests to the SA Copilot server are not allowed')
  const headers = new Headers()
  for (const h of request.headers) {
    if (!h.name.trim()) continue
    if (/^(host|content-length|connection|transfer-encoding|upgrade|proxy-.*)$/i.test(h.name)) throw new HttpError(400, `Header ${h.name} is managed by the HTTP client`)
    try { headers.append(h.name.trim(), h.value) } catch { throw new HttpError(400, 'Invalid request header') }
  }
  if (['GET', 'HEAD'].includes(request.method) && request.body) throw new HttpError(400, 'GET and HEAD requests cannot have a body')
  const start = performance.now()
  const signal = AbortSignal.timeout(timeoutMs)
  let response: Response
  try { response = await fetcher(url, { method: request.method, headers, body: binary ? new Blob([new Uint8Array(binary)]) : request.body || undefined, redirect: 'manual', signal }) }
  catch (e) { throw new HttpError(502, signal.aborted ? `Request timed out after ${timeoutMs / 1000} seconds` : `Request failed: ${e instanceof Error ? e.message : 'Network error'}`) }
  const chunks: Uint8Array[] = []
  let bytes = 0, truncated = false
  const reader = response.body?.getReader()
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const remaining = 2_000_000 - bytes
      chunks.push(value.subarray(0, remaining)); bytes += Math.min(value.length, remaining)
      if (value.length > remaining || bytes === 2_000_000) { truncated = true; await reader.cancel(); break }
    }
  } catch { throw new HttpError(502, 'Response could not be read or timed out') }
  return { status: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers), body: Buffer.concat(chunks).toString('utf8'), durationMs: Math.round(performance.now() - start), bytes, truncated }
}
export const saPostman = new Hono()
saPostman.post('/sapostman/send', async c => c.json(await executeSaRequest(await parseJson(c, schema))))
