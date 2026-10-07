const active=new Map<string,AbortController>(),early=new Map<string,ReturnType<typeof setTimeout>>()
export function startSaExecution(id:string){
  if(active.has(id))throw new Error('This execution ID is already running')
  const controller=new AbortController();active.set(id,controller)
  if(early.has(id)){clearTimeout(early.get(id));early.delete(id);controller.abort()}
  return {signal:controller.signal,finish:()=>active.delete(id)}
}
export function cancelSaExecution(id:string){
  const controller=active.get(id)
  if(controller){controller.abort();return}
  if(early.has(id)||early.size>=128)return
  const timer=setTimeout(()=>early.delete(id),10000);timer.unref();early.set(id,timer)
}
