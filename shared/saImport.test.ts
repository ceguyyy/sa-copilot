import {expect,it} from 'vitest'
import {importApis} from './saImport.ts'
import {endpointFromRequest} from './saPostman.ts'
it('imports nested Postman requests with inherited auth and warns about unsupported scripts',()=>{
 const result=importApis({info:{name:'Tickets',schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'},variable:[{key:'base',value:'https://example.com'}],auth:{type:'bearer',bearer:[{key:'token',value:'{{token}}'}]},item:[{name:'Support',item:[{name:'Create',request:{method:'POST',url:{raw:'{{base}}/tickets'},body:{mode:'raw',raw:'{"title":"Test"}',options:{raw:{language:'json'}}}},event:[{listen:'test'}]}]}]})
 expect(result.endpoints[0]).toMatchObject({name:'Support / Create',method:'POST',bodyMode:'raw',rawType:'JSON',auth:{type:'bearer',token:'{{token}}'}})
 expect(result.warnings[0]).toContain('JavaScript')
 expect(result.variables[0].name).toBe('base')
})
it('imports OpenAPI local refs, query/path params, JSON examples and security',()=>{
 const result=importApis({openapi:'3.0.3',info:{title:'Tickets'},servers:[{url:'https://example.com'}],security:[{bearer:[]}],components:{securitySchemes:{bearer:{type:'http',scheme:'bearer'}},schemas:{Ticket:{type:'object',properties:{title:{type:'string',example:'Help'}}}}},paths:{'/tickets/{id}':{parameters:[{name:'id',in:'path',schema:{type:'integer',example:42}}],post:{summary:'Update ticket',parameters:[{name:'notify',in:'query',schema:{type:'boolean',default:true}}],requestBody:{content:{'application/json':{schema:{$ref:'#/components/schemas/Ticket'}}}},responses:{200:{description:'Updated'}}}}}})
 expect(result.endpoints[0]).toMatchObject({url:'https://example.com/tickets/{{id}}',params:[{name:'notify',value:'true'}],variables:[{name:'id',value:'42'}],auth:{type:'bearer'},bodyMode:'raw'})
 expect(JSON.parse(result.endpoints[0].body)).toEqual({title:'Help'})
 expect(()=>importApis({openapi:'3.0.0',paths:{'/x':{$ref:'https://example.com/spec'}}})).toThrow('External reference')
})
it('round-trips native collections without sending and rejects unsupported files',()=>{
 const e={...endpointFromRequest({url:'{{base}}/ping'}),name:'Ping'}
 expect(importApis({format:'sapostman-collection',name:'Demo',variables:[{name:'base',value:'https://example.com'}],endpoints:[e]}).endpoints[0].url).toBe(e.url)
 expect(()=>importApis({})).toThrow('Choose an OpenAPI')
})
