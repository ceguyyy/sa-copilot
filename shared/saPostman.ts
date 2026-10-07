export interface SaField { name: string; value: string; enabled?: boolean; description?: string }
export interface SaRequest { method: string; url: string; headers: SaField[]; body: string }
export interface SaResponse { status: number; statusText: string; headers: Record<string, string>; body: string; durationMs: number; bytes: number; truncated: boolean }
export interface SaEndpoint extends SaRequest {
  variables?: (SaField & { secret?: boolean })[]
  name: string; docs: string; params: SaField[]
  auth: { type: 'none' | 'basic' | 'bearer' | 'api-key' | 'jwt' | 'oauth2'; username: string; password: string; token: string; key: string; value: string; location: 'header' | 'query' }
  bodyMode: 'none' | 'raw' | 'urlencoded' | 'form-data' | 'binary' | 'graphql'
  rawType: 'JSON' | 'Text' | 'JavaScript' | 'HTML' | 'XML'
  form: SaField[]; binaryName: string; binaryBase64: string; graphqlVariables: string
  scripts: { pre: string; post: string }
  settings: { timeoutMs: number }
}
export interface SaSaved { id: string; name: string; version: number; config: SaEndpoint; updated_at: string }
export interface SaVersion { id: string; request_id: string; version: number; config: SaEndpoint; created_at: string }
export interface SaHistory { id: string; name: string; request: SaEndpoint; response: SaResponse | null; error: string | null; checks: SaCheck[]; created_at: string }
export interface SaCheck { name: string; passed: boolean; actual: unknown; expected: unknown }
export interface SaExecution { response: SaResponse | null; error: string | null; checks: SaCheck[]; historyId: string; historyError?: string }
export function endpointFromRequest(request?: Partial<SaRequest>): SaEndpoint {
  return { method: 'GET', url: '', headers: [], body: '', ...request, name: '', docs: '', params: [], auth: { type: 'none', username: '', password: '', token: '', key: 'X-API-Key', value: '', location: 'header' }, bodyMode: request?.body ? 'raw' : 'none', rawType: 'JSON', form: [], binaryName: '', binaryBase64: '', graphqlVariables: '{}', scripts: { pre: '', post: '' }, settings: { timeoutMs: 30000 } }
}
export function redactSaEndpoint(endpoint: SaEndpoint): SaEndpoint {
  const e = structuredClone(endpoint)
  const sensitive = [endpoint.auth.password,endpoint.auth.token,endpoint.auth.value,...endpoint.headers.filter(h=>/authorization|cookie|key|token|secret/i.test(h.name)).map(h=>h.value)].join(' ')
  const secretRefs = new Set([...sensitive.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map(m=>m[1]))
  // Follow nested references so a secret alias cannot expose the underlying value.
  for(let round=0;round<20;round++)for(const v of endpoint.variables??[])if(v.secret||secretRefs.has(v.name.trim())||/password|token|secret|key/i.test(v.name)){
    secretRefs.add(v.name.trim());for(const m of v.value.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g))secretRefs.add(m[1])
  }
  e.variables = (e.variables ?? []).map(v => secretRefs.has(v.name.trim()) ? {...v,value:'[REDACTED]'} : v)
  e.auth = { ...e.auth, password: '', token: '', value: '' }
  e.headers = e.headers.map(h => /authorization|cookie|key|token|secret/i.test(h.name) ? { ...h, value: '[REDACTED]' } : h)
  e.params = e.params.map(h => /password|key|token|secret/i.test(h.name) ? { ...h, value: '[REDACTED]' } : h)
  try { const u = new URL(e.url); for (const key of [...u.searchParams.keys()]) if (/password|key|token|secret/i.test(key)) u.searchParams.set(key, '[REDACTED]'); e.url = u.toString() } catch { /* invalid drafts */ }
  e.binaryBase64 = ''
  e.form = e.form.map(f => /password|key|token|secret/i.test(f.name) ? {...f,value:'[REDACTED]'} : f)
  const redact = (value: unknown): unknown => {
    if(Array.isArray(value)) return value.map(redact)
    if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,/password|secret|token|api.?key/i.test(key)?'[REDACTED]':redact(v)]))
    return value
  }
  try { e.body = JSON.stringify(redact(JSON.parse(e.body))) } catch { /* non-JSON bodies need manual review */ }
  try { e.graphqlVariables = JSON.stringify(redact(JSON.parse(e.graphqlVariables))) } catch { /* invalid draft */ }
  e.scripts = {pre:'',post:e.scripts.post}
  return e
}

export function resolveSaVariables(endpoint: SaEndpoint): SaEndpoint {
  const variables = new Map<string,string>()
  for (const row of endpoint.variables ?? []) {
    if(row.enabled === false || !row.name.trim()) continue
    const name = row.name.trim()
    if(!/^[\w.-]+$/.test(name)) throw new Error(`Invalid variable name: ${name}`)
    if(variables.has(name)) throw new Error(`Duplicate variable: ${name}`)
    variables.set(name,row.value)
  }
  const substitute = (text:string,stack:string[]=[]):string => text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g,(_,name:string)=>{
    if(!variables.has(name)) throw new Error(`Missing variable: ${name}. Add it in Variables before sending.`)
    if(stack.includes(name)||stack.length>=20) throw new Error(`Circular variable reference: ${name}`)
    const value=variables.get(name)!
    if(value==='[REDACTED]') throw new Error(`Re-enter variable ${name} before sending`)
    return substitute(value,[...stack,name])
  })
  const e = structuredClone(endpoint)
  const rows = (items:SaField[]) => items.map(v => v.enabled===false ? v : {...v,name:substitute(v.name),value:substitute(v.value)})
  e.url=substitute(e.url);e.headers=rows(e.headers);e.params=rows(e.params)
  if(['raw','graphql'].includes(e.bodyMode))e.body=substitute(e.body)
  if(['form-data','urlencoded'].includes(e.bodyMode))e.form=rows(e.form)
  if(e.bodyMode==='graphql')e.graphqlVariables=substitute(e.graphqlVariables)
  if(e.auth.type==='basic'){e.auth.username=substitute(e.auth.username);e.auth.password=substitute(e.auth.password)}
  if(['bearer','jwt','oauth2'].includes(e.auth.type))e.auth.token=substitute(e.auth.token)
  if(e.auth.type==='api-key'){e.auth.key=substitute(e.auth.key);e.auth.value=substitute(e.auth.value)}
  e.scripts={pre:substitute(e.scripts.pre),post:substitute(e.scripts.post)}
  if(JSON.stringify(e).length>8_000_000)throw new Error('Resolved request is too large')
  return e
}

// Parse arguments only: pasted commands are never executed by a shell.
export function parseCurl(input: string): SaRequest {
  const source = input.trim().replace(/[\\^`]\r?\n/g, '')
  const args: string[] = []
  let word = '', quote = '', started = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\\' && quote !== "'" && i + 1 < source.length && (!quote || ['"', '\\', '$', '`'].includes(source[i + 1]))) { word += source[++i]; started = true }
    else if (quote) { if (ch === quote) quote = ''; else word += ch }
    else if (ch === "'" || ch === '"') { quote = ch; started = true }
    else if (/\s/.test(ch)) { if (started) { args.push(word); word = ''; started = false } }
    else { word += ch; started = true }
  }
  if (quote) throw new Error('Unclosed quote in cURL')
  if (started) args.push(word)
  if (!/^curl(?:\.exe)?$/i.test(args.shift() ?? '')) throw new Error('Paste one cURL command')
  const request: SaRequest = { method: 'GET', url: '', headers: [], body: '' }
  let explicitMethod = false
  let getData = false, urlEncoded = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const value = () => { const v = args[++i]; if (v === undefined) throw new Error(`Missing value for ${arg}`); return v }
    if (arg === '-G' || arg === '--get') getData = true
    else if (arg === '-X' || arg === '--request') { request.method = value().toUpperCase(); explicitMethod = true }
    else if (arg === '-H' || arg === '--header') {
      const header = value(), colon = header.indexOf(':')
      if (colon < 1) throw new Error('Headers must use Name: Value')
      request.headers.push({ name: header.slice(0, colon).trim(), value: header.slice(colon + 1).trim() })
    } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '--json'].includes(arg)) {
      let data = value()
      if (arg !== '--data-raw' && data.startsWith('@')) throw new Error('File upload is not supported; paste the body instead')
      if (arg === '--data-urlencode') {
        const equals = data.indexOf('=')
        if (equals < 0 && data.includes('@')) throw new Error('File upload is not supported; paste the value instead')
        data = equals > 0 ? `${data.slice(0, equals)}=${encodeURIComponent(data.slice(equals + 1))}` : encodeURIComponent(equals === 0 ? data.slice(1) : data)
        urlEncoded = true
      }
      request.body += (request.body ? '&' : '') + data
      if (!explicitMethod) request.method = 'POST'
      if (arg === '--json') request.headers.push({ name: 'Content-Type', value: 'application/json' }, { name: 'Accept', value: 'application/json' })
    } else if (arg === '--url') request.url = value()
    else if (['-s', '--silent', '-S', '--show-error', '-L', '--location', '--compressed', '-i', '--include'].includes(arg)) { /* Response is displayed in the UI; redirects are shown for review. */ }
    else if (arg.startsWith('-')) throw new Error(`Unsupported cURL option: ${arg}`)
    else if (!request.url) request.url = arg
    else throw new Error('Only one request can be imported at a time')
  }
  if (!request.url) throw new Error('cURL has no URL')
  if (getData) {
    if (!explicitMethod) request.method = 'GET'
    if (request.body) {
      const hash = request.url.indexOf('#'), fragment = hash < 0 ? '' : request.url.slice(hash)
      const base = hash < 0 ? request.url : request.url.slice(0, hash)
      request.url = `${base}${base.includes('?') ? /[?&]$/.test(base) ? '' : '&' : '?'}${request.body}${fragment}`
      request.body = ''
    }
  } else if (urlEncoded && !request.headers.some(h => h.name.toLowerCase() === 'content-type')) {
    request.headers.push({name:'Content-Type',value:'application/x-www-form-urlencoded'})
  }
  return request
}
