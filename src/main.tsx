import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// After a rebuild the old hashed chunks are gone, so an open tab can't lazy-load them. Reload once to get
// the new build (the flag stops a reload loop if the chunk is missing for another reason).
const RELOAD_FLAG = 'sa-copilot:chunk-reload'
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return
    sessionStorage.setItem(RELOAD_FLAG, '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})
window.addEventListener('load', () => {
  try {
    setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 10_000)
  } catch {
    // storage unavailable: nothing to clear
  }
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
})

window.addEventListener('sa-activity-change',()=>{
  void queryClient.invalidateQueries({queryKey:['inbox']})
  void queryClient.invalidateQueries({queryKey:['dashboard']})
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
