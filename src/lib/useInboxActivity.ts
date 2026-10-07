import {useEffect,useState} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {inboxApi} from './api'

export function useInboxActivity(){
  const qc=useQueryClient(),[visible,setVisible]=useState(()=>!document.hidden)
  useEffect(()=>{
    const refresh=()=>{const shown=!document.hidden;setVisible(shown);if(shown)void qc.invalidateQueries({queryKey:['inbox']})}
    document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh)
    return ()=>{document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh)}
  },[qc])
  return useQuery({queryKey:['inbox'],queryFn:inboxApi.list,enabled:visible,
    refetchInterval:q=>!visible?false:q.state.data?.some(item=>item.status==='working')?2000:60000,
    refetchIntervalInBackground:false,refetchOnWindowFocus:true})
}
