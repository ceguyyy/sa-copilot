// @vitest-environment jsdom
import {act,createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
import {SaCollectionTree} from './SaCollectionTree'
import {endpointFromRequest,type SaSaved} from '../../shared/saPostman'
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true
it('collapses collections and moves a dragged saved API into a closed collection',async()=>{
 const host=document.createElement('div'),root=createRoot(host),move=vi.fn().mockResolvedValue(undefined)
 const row={id:'request-1',name:'Forecast',version:2,config:{...endpointFromRequest(),collectionId:'a'}} as SaSaved
 try{
  await act(async()=>root.render(createElement(SaCollectionTree,{collections:[{id:'a',name:'Weather',created_at:'2026-10-07'},{id:'b',name:'Demo',created_at:'2026-10-07'}],requests:[row],busy:false,onSelect:vi.fn(),onMove:move})))
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Collapse collection Demo"]')!.click())
  const transfer={setData:vi.fn(),getData:()=>row.id,effectAllowed:'',dropEffect:''}
  const drag=new Event('dragstart',{bubbles:true});Object.defineProperty(drag,'dataTransfer',{value:transfer})
  await act(async()=>host.querySelector('[draggable="true"]')!.dispatchEvent(drag))
  expect(transfer.setData).toHaveBeenCalledWith('text/sapostman-id',row.id)
  const drop=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:transfer})
  await act(async()=>host.querySelector('[aria-label="Expand collection Demo"]')!.parentElement!.dispatchEvent(drop))
  expect(move).toHaveBeenCalledWith(row,'b')
  expect(host.querySelector('[aria-label="Collapse collection Demo"]')?.getAttribute('aria-expanded')).toBe('true')
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Collapse collections')!.click())
  expect(host.querySelector('[draggable="true"]')).toBeNull()
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Expand collections')!.click())
  expect(host.querySelector('[draggable="true"]')).not.toBeNull()
 }finally{act(()=>root.unmount())}
})
