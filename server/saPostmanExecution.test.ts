import { describe,it,expect,vi } from 'vitest'
import { endpointFromRequest, redactSaEndpoint } from '../shared/saPostman.ts'
import { runEndpoint } from './saPostmanExecution.ts'
vi.mock('./config.ts',()=>({config:{port:3000}}))
const response=()=>new Response('{"ok":true}',{status:201,headers:{'x-test':'yes'}})
describe('SAPostman endpoint execution',()=>{
 it('applies params, basic auth, disabled headers, pre rules and assertions',async()=>{
  const e=endpointFromRequest({method:'POST',url:'https://example.com?old=1',body:'{}',headers:[{name:'Disabled',value:'no',enabled:false}]})
  e.params=[{name:'hello',value:'a b'}];e.auth={...e.auth,type:'basic',username:'u',password:'p'}
  e.scripts={pre:'{"headers":{"X-Test":"yes"}}',post:'[{"name":"Created","target":"status","equals":201},{"name":"OK","target":"json","path":"ok","equals":true}]'}
  const fetcher=vi.fn().mockResolvedValue(response());const result=await runEndpoint(e,fetcher)
  expect(String(fetcher.mock.calls[0][0])).toContain('hello=a+b')
  const headers=fetcher.mock.calls[0][1].headers as Headers
  expect(headers.get('Authorization')).toBe('Basic dTpw');expect(headers.has('Disabled')).toBe(false)
  expect(result.checks.every(c=>c.passed)).toBe(true)
 })
 it('sends form data, urlencoded, GraphQL and binary bodies',async()=>{
  const e=endpointFromRequest({method:'POST',url:'https://example.com'})
  const fetcher=vi.fn().mockImplementation(async()=>response())
  e.form=[{name:'message',value:'hello & world'}];e.bodyMode='urlencoded';await runEndpoint(e,fetcher)
  expect(fetcher.mock.lastCall?.[1].body).toBe('message=hello+%26+world')
  e.bodyMode='form-data';await runEndpoint(e,fetcher);expect(fetcher.mock.lastCall?.[1].body).toContain('name="message"')
  e.bodyMode='graphql';e.body='query { ok }';e.graphqlVariables='{"id":1}';await runEndpoint(e,fetcher)
  expect(JSON.parse(fetcher.mock.lastCall?.[1].body)).toEqual({query:'query { ok }',variables:{id:1}})
  e.bodyMode='binary';e.binaryBase64='aGVsbG8=';await runEndpoint(e,fetcher);expect(await (fetcher.mock.lastCall![1].body as Blob).text()).toBe('hello')
 })
 it('validates scripts before sending and reports failed assertions',async()=>{
  const e=endpointFromRequest({url:'https://example.com'}),fetcher=vi.fn().mockResolvedValue(response())
  e.scripts.post='not JSON';await expect(runEndpoint(e,fetcher)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled()
  e.scripts.post='[{"name":"Wrong status","target":"status","equals":200}]';expect((await runEndpoint(e,fetcher)).checks[0].passed).toBe(false)
 })
 it('removes credentials from snapshots and keeps original untouched',()=>{
  const e=endpointFromRequest({url:'https://example.com?token=secret',body:'{"password":"secret","ok":true}',headers:[{name:'Authorization',value:'secret'}]})
  e.auth.password='secret';const safe=redactSaEndpoint(e)
  expect(JSON.stringify(safe)).not.toContain('secret');expect(e.auth.password).toBe('secret')
 })
 it('resolves endpoint variables while preserving the saved template',async()=>{
  const e=endpointFromRequest({method:'POST',url:'{{base_url}}/hook',body:'{"id":"{{customer_id}}"}'})
  e.variables=[{name:'host',value:'https://example.com'},{name:'base_url',value:'{{host}}'},{name:'customer_id',value:'C123'},{name:'credential',value:'private',secret:true}]
  e.auth={...e.auth,type:'bearer',token:'{{credential}}'};e.params=[{name:'id',value:'{{customer_id}}'}]
  const fetcher=vi.fn().mockResolvedValue(response());await runEndpoint(e,fetcher)
  expect(String(fetcher.mock.calls[0][0])).toBe('https://example.com/hook?id=C123')
  expect(fetcher.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer private')
  expect(fetcher.mock.calls[0][1].body).toBe('{"id":"C123"}')
  expect(e.url).toBe('{{base_url}}/hook')
  expect(redactSaEndpoint(e).variables?.find(v=>v.name==='credential')?.value).toBe('[REDACTED]')
 })
 it('blocks missing and circular variables before HTTP execution',async()=>{
  const e=endpointFromRequest({url:'{{base}}'}),fetcher=vi.fn()
  await expect(runEndpoint(e,fetcher)).rejects.toThrow('Missing variable: base')
  e.variables=[{name:'base',value:'{{next}}'},{name:'next',value:'{{base}}'}]
  await expect(runEndpoint(e,fetcher)).rejects.toThrow('Circular variable')
  expect(fetcher).not.toHaveBeenCalled()
 })
})
