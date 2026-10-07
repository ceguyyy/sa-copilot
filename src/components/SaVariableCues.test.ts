// @vitest-environment jsdom
import {act,createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,vi} from 'vitest'
import {SaVariableCues} from './SaVariableCues'
import {endpointFromRequest} from '../../shared/saPostman'
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true
it('opens a missing variable on hover and saves an edited value',async()=>{
 const host=document.createElement('div'),root=createRoot(host),save=vi.fn().mockResolvedValue(undefined)
 try{
  await act(async()=>root.render(createElement(SaVariableCues,{endpoint:endpointFromRequest({url:'https://example.com/{{customer}}'}),busy:false,onSave:save})))
  const cue=host.querySelector('button[aria-label="Edit variable customer"]')!
  expect(cue.textContent).toContain('invalid')
  await act(async()=>cue.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})))
  const input=host.querySelector('input[aria-label="Value for customer"]') as HTMLInputElement
  expect(input).not.toBeNull()
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'C123');input.dispatchEvent(new Event('input',{bubbles:true}))})
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Save variable')!.click())
  expect(save).toHaveBeenCalledWith([{name:'customer',value:'C123',secret:false,enabled:true}])
  expect(host.querySelector('[role="dialog"]')).toBeNull()
 }finally{act(()=>root.unmount())}
})
it('marks inline URL variables valid only when they resolve',async()=>{
 const host=document.createElement('div'),root=createRoot(host)
 try{
  const endpoint={...endpointFromRequest({url:'{{base}}'}),variables:[{name:'base',value:'https://example.com'}]}
  await act(async()=>root.render(createElement(SaVariableCues,{endpoint,busy:false,inlineName:'base',onSave:vi.fn()})))
  expect(host.querySelector('button[data-valid]')?.getAttribute('data-valid')).toBe('true')
  await act(async()=>root.render(createElement(SaVariableCues,{endpoint:{...endpoint,variables:[{name:'base',value:'{{missing}}'}]},busy:false,inlineName:'base',onSave:vi.fn()})))
  expect(host.querySelector('button[data-valid]')?.getAttribute('data-valid')).toBe('false')
 }finally{act(()=>root.unmount())}
})
