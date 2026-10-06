export interface RecentWork { projectId: string; documentId?: string; visitedAt: number }
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const route = new RegExp(`^/projects/(${uuid})(?:/docs/(${uuid}))?/?$`, 'i')
const key = (accountId: string) => `sa-copilot.recent-work.${accountId}`

export function rememberWork(accountId: string, pathname: string) {
  const match = route.exec(pathname)
  if (!match) return
  try { localStorage.setItem(key(accountId), JSON.stringify({ projectId: match[1], ...(match[2] ? { documentId: match[2] } : {}), visitedAt: Date.now() })) } catch { /* Storage may be unavailable. */ }
}
export function readRecentWork(accountId?: string): RecentWork | null {
  if (!accountId) return null
  try {
    const value = JSON.parse(localStorage.getItem(key(accountId)) ?? 'null') as RecentWork | null
    if (!value || typeof value.visitedAt !== 'number' || !route.test(`/projects/${value.projectId}${value.documentId ? `/docs/${value.documentId}` : ''}`)) return null
    return value
  } catch { return null }
}
