import {endpointFromRequest,type SaEndpoint,type SaField} from './saPostman.ts'
import type {SaVariable} from './saWorkspace.ts'
type Obj=Record<string,unknown>
const obj=(v:unknown):Obj=>v&&typeof v==='object'&&!Array.isArray(v)?v as Obj:{}
const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[]
const str=(v:unknown,fallback=''):string=>typeof v==='string'?v:fallback
export interface SaImport {name:string;variables:SaVariable[];endpoints:SaEndpoint[];warnings:string[]}
export function importApis(input:unknown):SaImport {
 const root=obj(input),warnings:string[]=[],endpoints:SaEndpoint[]=[]
 const fields=(input:unknown):SaField[]=>arr(input).map(v=>{const r=obj(v);return {name:str(r.key??r.name),value:str(r.value),description:str(r.description),enabled:r.disabled!==true}})
 const variables=(input:unknown):SaVariable[]=>fields(input).map(v=>({...v,secret:/token|password|secret|key/i.test(v.name)}))
 if(root.format==='sapostman-collection')return {name:str(root.name,'Imported collection'),variables:arr(root.variables) as SaVariable[],endpoints:arr(root.endpoints).map(v=>({...endpointFromRequest(),...obj(v),collectionId:null}) as SaEndpoint),warnings}
 if(obj(root.info).schema&&Array.isArray(root.item)){
  const auth=(value:unknown,e:SaEndpoint)=>{
   const a=obj(value),type=str(a.type),values=Object.fromEntries(fields(a[type]).map(v=>[v.name,v.value]))
   if(type==='bearer')e.auth={...e.auth,type:'bearer',token:values.token??''}
   else if(type==='basic')e.auth={...e.auth,type:'basic',username:values.username??'',password:values.password??''}
   else if(type==='apikey')e.auth={...e.auth,type:'api-key',key:values.key??'',value:values.value??'',location:values.in==='query'?'query':'header'}
   else if(type==='oauth2')e.auth={...e.auth,type:'oauth2',token:values.accessToken??''}
   else if(type&&type!=='noauth')warnings.push(`Unsupported Postman auth ${type}; configure it manually.`)
  }
  const walk=(items:unknown[],path:string[],inherited:unknown)=>{for(const item of items){const i=obj(item),nextAuth=i.auth??inherited;if(Array.isArray(i.item)){walk(i.item,[...path,str(i.name)],nextAuth);continue}const r=typeof i.request==='string'?{url:i.request}:obj(i.request);if(!r.url)continue;const u=obj(r.url);let url=str(r.url,str(u.raw));if(!url){const protocol=str(u.protocol,'https'),host=Array.isArray(u.host)?u.host.join('.'):str(u.host),p=Array.isArray(u.path)?u.path.join('/'):str(u.path);url=`${protocol}://${host}/${p}`}
   const e=endpointFromRequest({method:str(r.method,'GET').toUpperCase(),url,headers:fields(r.header)});e.name=[...path,str(i.name,'Request')].filter(Boolean).join(' / ');e.docs=str(r.description,str(obj(r.description).content));auth(r.auth??nextAuth,e)
   for(const variable of arr(u.variable)){const v=obj(variable),name=str(v.key);if(name){e.url=e.url.replace(new RegExp(`:${name}(?=/|\\?|$)`,'g'),`{{${name}}}`);e.variables=[...(e.variables??[]),{name,value:str(v.value)}]}}
   if(!str(u.raw)&&arr(u.query).length)e.params=fields(u.query)
   const b=obj(r.body),mode=str(b.mode);if(mode==='raw'){e.bodyMode='raw';e.body=str(b.raw);e.rawType=str(obj(obj(b.options).raw).language)==='json'?'JSON':'Text'}else if(mode==='urlencoded'||mode==='formdata'){e.bodyMode=mode==='formdata'?'form-data':'urlencoded';e.form=fields(b[mode]);if(arr(b[mode]).some(v=>obj(v).type==='file'))warnings.push(`${e.name}: choose file uploads manually; imported form-data contains text fields only.`);e.form=e.form.filter((_,index)=>obj(arr(b[mode])[index]).type!=='file')}else if(mode==='graphql'){e.bodyMode='graphql';e.body=str(obj(b.graphql).query);e.graphqlVariables=str(obj(b.graphql).variables,'{}')}else if(mode==='file')warnings.push(`${e.name}: binary file must be selected manually.`)
   if(i.event)warnings.push(`${e.name}: Postman JavaScript scripts were not imported; use SAPostman assertion rules.`)
   endpoints.push(e)
  }}
  walk(root.item as unknown[],[],root.auth)
  return finish(str(obj(root.info).name,'Postman collection'),variables(root.variable))
 }
 if(root.openapi||root.swagger){
  const deref=(input:unknown,depth=0):Obj=>{const v=obj(input);if(!v.$ref)return v;if(depth>12)throw new Error('Recursive OpenAPI reference cannot be expanded');const ref=str(v.$ref);if(!ref.startsWith('#/'))throw new Error(`External reference ${ref} is not supported; use a bundled OpenAPI file`);let found:unknown=root;for(const key of ref.slice(2).split('/'))found=obj(found)[key.replace(/~1/g,'/').replace(/~0/g,'~')];if(found===undefined)throw new Error(`Missing OpenAPI reference ${ref}`);return {...deref(found,depth+1),...Object.fromEntries(Object.entries(v).filter(([k])=>k!=='$ref'))}}
  const example=(input:unknown,depth=0):unknown=>{if(depth>8)return null;const s=deref(input);if(s.example!==undefined)return s.example;if(s.default!==undefined)return s.default;if(arr(s.enum).length)return arr(s.enum)[0];if(s.type==='array')return [example(s.items,depth+1)];if(s.properties)return Object.fromEntries(Object.entries(obj(s.properties)).map(([k,v])=>[k,example(v,depth+1)]));if(s.type==='integer'||s.type==='number')return 0;if(s.type==='boolean')return false;return ''}
  const schemes=obj(obj(root.components).securitySchemes??root.securityDefinitions)
  for(const [path,pathValue] of Object.entries(obj(root.paths))){const p=deref(pathValue);for(const method of ['get','post','put','patch','delete','head','options']){if(!p[method])continue;const op=deref(p[method]);const server=obj(arr(op.servers??p.servers??root.servers)[0]);let base=str(server.url);const serverVars=Object.entries(obj(server.variables)).map(([name,v])=>({name,value:String(obj(v).default??'' )}));for(const v of serverVars)base=base.replaceAll(`{${v.name}}`,v.value);if(!base&&root.host)base=`${str(arr(root.schemes)[0],'https')}://${str(root.host)}${str(root.basePath)}`;if(!base){base='{{base_url}}';warnings.push('Set base_url to the API server before sending.')}
   const e=endpointFromRequest({method:method.toUpperCase(),url:base.replace(/\/$/,'')+path.replace(/\{([^}]+)\}/g,'{{$1}}')});e.name=str(op.summary,str(op.operationId,`${e.method} ${path}`));e.docs=[str(op.summary),str(op.description),'Responses:',...Object.entries(obj(op.responses)).map(([status,r])=>`${status}: ${str(deref(r).description)}`)].filter(Boolean).join('\n\n');e.variables=[]
   for(const v of [...arr(p.parameters),...arr(op.parameters)]){const param=deref(v),name=str(param.name),schema=param.schema??param;const value=param.example??example(schema),row={name,value:typeof value==='object'?JSON.stringify(value):String(value??''),enabled:true,description:str(param.description)};if(param.in==='query')e.params.push(row);else if(param.in==='header')e.headers.push(row);else if(param.in==='path')e.variables.push(row);else if(param.in==='body'){e.bodyMode='raw';e.body=JSON.stringify(example(param.schema),null,2)}else if(param.in==='formData'){e.bodyMode='form-data';if(param.type==='file')warnings.push(`${e.name}: select file manually.`);else e.form.push(row)}}
   const body=deref(op.requestBody),content=obj(body.content),mime=Object.keys(content).find(k=>k.includes('json'))??Object.keys(content)[0];if(mime){const media=obj(content[mime]),sample=media.example??obj(Object.values(obj(media.examples))[0]).value??example(media.schema);if(mime==='application/x-www-form-urlencoded'||mime==='multipart/form-data'){e.bodyMode=mime.includes('multipart')?'form-data':'urlencoded';e.form=Object.entries(obj(sample)).map(([name,value])=>({name,value:typeof value==='object'?JSON.stringify(value):String(value??'')}))}else{e.bodyMode='raw';e.rawType=mime.includes('json')?'JSON':'Text';e.body=typeof sample==='string'?sample:JSON.stringify(sample,null,2);e.headers.push({name:'Content-Type',value:mime})}}
   const security=arr(op.security??root.security);if(security.length){const requirements=obj(security[0]),entries=Object.entries(requirements);if(entries.length>1)warnings.push(`${e.name}: multiple auth schemes require manual review.`);const [key]=entries[0]??[];const scheme=deref(schemes[key]);if(scheme.type==='apiKey')e.auth={...e.auth,type:'api-key',key:str(scheme.name),value:'{{token}}',location:scheme.in==='query'?'query':'header'};else if(scheme.type==='oauth2'||scheme.type==='openIdConnect'||scheme.scheme==='bearer')e.auth={...e.auth,type:'bearer',token:'{{token}}'};else if(scheme.scheme==='basic'||scheme.type==='basic')e.auth={...e.auth,type:'basic',username:'{{username}}',password:'{{password}}'}}
   endpoints.push(e)
  }}
  return finish(str(obj(root.info).title,'OpenAPI collection'),[{name:'base_url',value:'',enabled:true},{name:'token',value:'',secret:true,enabled:true}])
 }
 throw new Error('Choose an OpenAPI, Postman v2 collection, or SAPostman collection file')
 function finish(name:string,variables:SaVariable[]):SaImport {if(!endpoints.length)throw new Error('No supported API requests found');if(endpoints.length>500)throw new Error('Import supports at most 500 requests');return {name,variables,endpoints,warnings:[...new Set(warnings)]}}
}
