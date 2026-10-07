// @vitest-environment jsdom
import {act,createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
import {SaRunner} from './SaRunner'
import {saPostmanApi} from '../lib/api'
import {endpointFromRequest,type SaSaved,type SaExecution} from '../../shared/saPostman'
vi.mock('../lib/api',()=>({saPostmanApi:{execute:vi.fn()}}))
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true
const rows:SaSaved[]=[{id:'login',name:'Login',version:1,updated_at:'',config:{...endpointFromRequest({url:'{{base}}/login'}),collectionId:'c',extracts:[{name:'token',path:'access_token'}]}},{id:'profile',name:'Profile',version:1,updated_at:'',config:{...endpointFromRequest({url:'{{base}}/profile'}),collectionId:'c',auth:{...endpointFromRequest().auth,type:'bearer',token:'{{token}}'}}}]
const response=(status=200,body='{}'):SaExecution=>({response:{status,statusText:'OK',headers:{},body,bytes:2,durationMs:1,truncated:false},checks:[],error:null,historyId:'x'})
it('waits for explicit Run and passes extracted tokens to subsequent requests',async()=>{
 const host=document.createElement('div'),root=createRoot(host)
 vi.mocked(saPostmanApi.execute).mockResolvedValueOnce(response(200,'{"access_token":"run-token"}')).mockResolvedValueOnce(response())
 try{await act(async()=>root.render(createElement(SaRunner,{collections:[{id:'c',name:'Demo',created_at:'',variables:[{name:'base',value:'https://example.com'}]}],requests:rows,onFinish:vi.fn()})))
  await act(async()=>{const select=host.querySelector('select')!;select.value='c';select.dispatchEvent(new Event('change',{bubbles:true}))})
  expect(saPostmanApi.execute).not.toHaveBeenCalled()
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Run collection')!.click())
  expect(saPostmanApi.execute).toHaveBeenCalledTimes(2)
  expect(vi.mocked(saPostmanApi.execute).mock.calls[1][0].variables).toContainEqual(expect.objectContaining({name:'token',value:'run-token',secret:true}))
  expect(rows[1].config.variables).toBeUndefined()
 }finally{act(()=>root.unmount());vi.resetAllMocks()}
})
it('stops the remaining requests on HTTP failure',async()=>{
 const host=document.createElement('div'),root=createRoot(host);vi.mocked(saPostmanApi.execute).mockResolvedValue(response(401))
 try{await act(async()=>root.render(createElement(SaRunner,{collections:[{id:'c',name:'Demo',created_at:''}],requests:rows,onFinish:vi.fn()})))
  await act(async()=>{host.querySelector('select')!.value='c';host.querySelector('select')!.dispatchEvent(new Event('change',{bubbles:true}))})
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Run collection')!.click())
  expect(saPostmanApi.execute).toHaveBeenCalledTimes(1)
  expect(host.textContent).toContain('401')
 }finally{act(()=>root.unmount());vi.resetAllMocks()}
})
