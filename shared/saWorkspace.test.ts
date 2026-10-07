import {describe,it,expect} from 'vitest'
import {scopedEndpoint,resolvedDraft,extractVariables,compareJson,jsonPath} from './saWorkspace.ts'
import {endpointFromRequest,redactSaEndpoint,type SaResponse} from './saPostman.ts'
describe('SAPostman workspace data',()=>{
 it('resolves scope precedence, ignores disabled overrides and resolves cross-scope references',()=>{
  const e={...endpointFromRequest({url:'{{base}}/{{id}}'}),variables:[{name:'id',value:'api'}]}
  const scoped=scopedEndpoint(e,[{name:'base',value:'{{host}}/v1'},{name:'id',value:'collection'}],[{name:'host',value:'https://example.com'},{name:'id',value:'env'},{name:'base',value:'ignored',enabled:false}],[{name:'id',value:'run'}])
  expect(resolvedDraft(scoped).url).toBe('https://example.com/v1/run')
  expect(e.variables[0].value).toBe('api')
  expect(()=>scopedEndpoint(e,[{name:'x',value:'1'},{name:'x',value:'2'}])).toThrow('Duplicate')
 })
 it('passes a secret response token into following requests and redacts it in snapshots',()=>{
  const e={...endpointFromRequest(),extracts:[{name:'token',path:'data.tokens[0]'}]}
  const vars=extractVariables(e,{body:'{"data":{"tokens":["secret-value"]}}'} as SaResponse)
  const next=scopedEndpoint({...endpointFromRequest({url:'https://example.com'}),auth:{...e.auth,type:'bearer',token:'{{token}}'}},[],[],vars)
  expect(resolvedDraft(next).auth.token).toBe('secret-value')
  expect(redactSaEndpoint(next).variables?.[0].value).toBe('[REDACTED]')
  expect(()=>extractVariables(e,{body:'{}'} as SaResponse)).toThrow('missing')
  expect(jsonPath({constructor:'own'},'constructor')).toBe('own')
  expect(jsonPath({},'constructor')).toBeUndefined()
  expect(jsonPath({'a.b':{id:42}},'$["a.b"]["id"]')).toBe(42)
 })
 it('compares added, removed, changed and array fields without conflating missing with null',()=>{
  const diffs=compareJson({a:1,removed:null,items:[1]},{a:2,added:null,items:[1,2]})
  expect(diffs.map(d=>d.kind)).toEqual(['changed','removed','added','added'])
  expect(diffs.find(d=>d.path==='$["items"][1]')?.after).toBe(2)
  expect(compareJson({a:1},{a:1})).toEqual([])
 })
})
