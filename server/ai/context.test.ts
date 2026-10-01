import { describe, expect, it, vi } from 'vitest'
import type { ProjectContext } from './context.ts'

const emptyContext = (): ProjectContext => ({
  project: { name: 'Procurement', client_name: 'Acme', status: 'active' },
  sources: [],
  docs: [],
  knowledgeDocs: [],
  questions: [],
  n8nNodes: [],
})

describe('renderContextText', () => {
  it('always tells the AI that Cekat CRM select/dropdown values are option numbers in n8n', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')
    const { renderContextText } = await import('./context.ts')
    const text = renderContextText(emptyContext())
    expect(text).toContain('CEKAT CRM VIA N8N — SELECT/DROPDOWN VALUES')
    expect(text).toContain('0 for Invoice, 1 for PO, 2 for Delivery')
    expect(text).toContain('N8N WORKFLOW RULES')
    vi.unstubAllEnvs()
  })

  it('states the computed timeline mandays so every document uses the same numbers', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')
    const { renderContextText } = await import('./context.ts')
    const rows = [
      { no: '1', activity: 'Kickoff', module: '', function: '', pic: '', days: 1, parallel: false },
      { no: '2', activity: 'AI Setting', module: '', function: '', pic: '', days: 3, parallel: false },
      { no: '', activity: '', module: '', function: '', pic: '', days: 2, parallel: true },
    ]
    const ctx = { ...emptyContext(), docs: [{ id: 'd1', type: 'timeline' as const, title: 'Timeline', version: 1, content: { title: 'Timeline', start_date: '', rows, notes: [] } }] }
    expect(renderContextText(ctx)).toContain('Timeline totals: 6 total mandays (every row, parallel ones included), 5 IT delivery mandays (AI Setting + Integration & APIs), duration 4 working days (1 weeks)')
    vi.unstubAllEnvs()
  })
})
