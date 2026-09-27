import { useQuery } from '@tanstack/react-query'
import { languagesApi } from './api'

/** Languages managed in Settings → Languages (list + main language). */
export function useLanguages() {
  return useQuery({ queryKey: ['languages'], queryFn: languagesApi.get, staleTime: 60_000 })
}
