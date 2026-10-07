import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { executeSaRequest } from './routes/saPostman.ts'
import type { SaEndpoint, SaResponse, SaCheck } from '../shared/saPostman.ts'
import { resolveSaVariables } from '../shared/saPostman.ts'

const field = z.object({ name: z.string().max(256), value: z.string().max(500000), enabled: z.boolean().optional(), description: z.string().max(2000).optional() })
export const endpointSchema = z.object({
  variables: z.array(field.extend({secret:z.boolean().optional()})).max(100).optional().default([]),
  name: z.string().max(300), docs: z.string().max(100000), method: z.enum(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']), url: z.string().max(8192), headers: z.array(field).max(100), params: z.array(field).max(100), body: z.string().max(2000000),
  auth: z.object({ type: z.enum(['none','basic','bearer','api-key','jwt','oauth2']), username: z.string().max(1000), password: z.string().max(16000), token: z.string().max(16000), key: z.string().max(256), value: z.string().max(16000), location: z.enum(['header','query']) }),
  bodyMode: z.enum(['none','raw','urlencoded','form-data','binary','graphql']), rawType: z.enum(['JSON','Text','JavaScript','HTML','XML']), form: z.array(field).max(100), binaryName: z.string().max(256), binaryBase64: z.string().max(2800000), graphqlVariables: z.string().max(500000),
  scripts: z.object({ pre: z.string().max(20000), post: z.string().max(20000) }), settings: z.object({ timeoutMs: z.number().int().min(1000).max(120000) }),
})
const preSchema = z.object({ headers: z.record(z.string(), z.string()).optional(), params: z.record(z.string(), z.string()).optional() }).strict()
const assertionSchema = z.array(z.object({ name: z.string().max(300), target: z.enum(['status','header','json']), path: z.string().optional(), equals: z.unknown() }).strict()).max(100)
export function evaluateChecks(script: string, response: SaResponse): SaCheck[] {
  if (!script.trim()) return []
  const tests = assertionSchema.parse(JSON.parse(script))
  return tests.map(test => {
    let actual: unknown = response.status
    if (test.target === 'header') actual = response.headers[(test.path ?? '').toLowerCase()]
    if (test.target === 'json') {
      try { actual = (test.path ?? '').split('.').filter(Boolean).reduce<unknown>((v, key) => v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined, JSON.parse(response.body)) } catch { actual = undefined }
    }
    return { name: test.name, actual: actual ?? null, expected: test.equals, passed: JSON.stringify(actual) === JSON.stringify(test.equals) }
  })
}
export async function runEndpoint(e: SaEndpoint, fetcher: typeof fetch = fetch) {
  e=resolveSaVariables(e)
  const url = new URL(e.url), headers = new Headers(e.headers.filter(h => h.enabled !== false && h.name.trim()).map(h => [h.name, h.value] as [string,string]))
  for (const p of e.params.filter(p => p.enabled !== false && p.name)) url.searchParams.append(p.name, p.value)
  const auth = e.auth
  if (auth.type === 'basic') headers.set('Authorization', `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`)
  if (['bearer','jwt','oauth2'].includes(auth.type)) headers.set('Authorization', `Bearer ${auth.token}`)
  if (auth.type === 'api-key' && auth.key) { if (auth.location === 'query') url.searchParams.set(auth.key, auth.value); else headers.set(auth.key, auth.value) }
  if (e.scripts.pre.trim()) {
    const pre = preSchema.parse(JSON.parse(e.scripts.pre))
    for (const [k, v] of Object.entries(pre.headers ?? {})) headers.set(k, v)
    for (const [k, v] of Object.entries(pre.params ?? {})) url.searchParams.set(k, v)
  }
  // Validate post-response scripts before sending anything to the target.
  if (e.scripts.post.trim()) assertionSchema.parse(JSON.parse(e.scripts.post))
  let body = e.body, binary: Uint8Array | undefined
  const setType = (type: string) => { if (!headers.has('Content-Type')) headers.set('Content-Type', type) }
  if (e.bodyMode === 'none') body = ''
  if (e.bodyMode === 'raw') setType(({ JSON: 'application/json', Text: 'text/plain', JavaScript: 'application/javascript', HTML: 'text/html', XML: 'application/xml' })[e.rawType])
  if (e.bodyMode === 'urlencoded') { body = new URLSearchParams(e.form.filter(f => f.enabled !== false && f.name).map(f => [f.name, f.value])).toString(); headers.set('Content-Type','application/x-www-form-urlencoded') }
  if (e.bodyMode === 'graphql') { body = JSON.stringify({ query: e.body, variables: JSON.parse(e.graphqlVariables || '{}') }); headers.set('Content-Type', 'application/json') }
  if (e.bodyMode === 'binary') { binary = Buffer.from(e.binaryBase64, 'base64'); body = ''; setType('application/octet-stream') }
  if (e.bodyMode === 'form-data') {
    const boundary = `sa-${randomUUID()}`
    body = e.form.filter(f => f.enabled !== false && f.name).map(f => {
      if (/[\r\n"]/.test(f.name)) throw new Error('Form field names cannot contain quotes or newlines')
      return `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`
    }).join('') + `--${boundary}--\r\n`
    headers.set('Content-Type', `multipart/form-data; boundary=${boundary}`)
  }
  if (['GET','HEAD'].includes(e.method) && (body || binary?.length)) throw new Error('GET and HEAD cannot have a body; use Params instead')
  const response = await executeSaRequest({ method: e.method, url: url.toString(), headers: [...headers].map(([name,value]) => ({name,value})), body }, fetcher, e.settings.timeoutMs, binary)
  return { response, checks: evaluateChecks(e.scripts.post, response) }
}
