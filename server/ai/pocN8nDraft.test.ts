import { describe, expect, it, vi } from 'vitest'

vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')
const { FOLLOW_RULES, draftN8nWorkflow, writeWorkflowAsText } = await import('./pocN8nDraft.ts')
const { pocConfig } = await import('../validation.ts')

const poc = pocConfig.parse({
  apiIntegrations: [
    { name: 'buat_tiket', httpMethod: 'POST', webhookAddress: 'https://workflows.cekat.ai/webhook/gw' },
    { name: 'cek_status', httpMethod: 'POST', webhookAddress: 'https://workflows.cekat.ai/webhook/gw' },
  ],
})

type Call = { task: string; label: string; onProgress?: (chars: number) => void }

describe('draftN8nWorkflow', () => {
  it('writes ONE gateway workflow with every API integration as a use case routed by action', async () => {
    const calls: Call[] = []
    const run = vi.fn(async (req: Call) => {
      calls.push(req)
      return { data: { name: 'Gateway' } }
    })
    const result = await draftN8nWorkflow({ system: [], pocName: 'POC', current: poc, instruction: '' }, run)

    expect(result).toEqual({ name: 'Gateway' })
    expect(calls).toHaveLength(1)
    expect(calls[0].task).toMatch(/ONE n8n gateway workflow/)
    expect(calls[0].task).toContain('"buat_tiket", "cek_status"')
    expect(calls[0].task).toMatch(/1 use case = 1 cURL/)
    expect(calls[0].task).toContain('https://workflows.cekat.ai/webhook/gw')
  })

  it('reports progress as one workflow, done when it finishes', async () => {
    const reports: { chars: number; done: number; total: number }[] = []
    const run = async (req: Call) => {
      req.onProgress?.(100)
      return { data: { name: 'x' } }
    }
    await draftN8nWorkflow({ system: [], pocName: 'POC', current: poc, instruction: '', onProgress: (chars, info) => reports.push({ chars, ...info }) }, run)
    expect(reports[0]).toEqual({ chars: 0, done: 0, total: 1 })
    expect(reports).toContainEqual({ chars: 100, done: 0, total: 1 })
    expect(reports.at(-1)).toEqual({ chars: 100, done: 1, total: 1 })
  })

  it('passes the SA instruction on and fails with the model error', async () => {
    const tasks: string[] = []
    await draftN8nWorkflow({ system: [], pocName: 'POC', current: poc, instruction: 'pakai format PRC' }, async (req: Call) => {
      tasks.push(req.task)
      return { data: {} }
    })
    expect(tasks[0]).toContain('Instruction from the SA: pakai format PRC')
    const failing = async () => {
      throw new Error('AI API error 400')
    }
    await expect(draftN8nWorkflow({ system: [], pocName: 'POC', current: poc, instruction: '' }, failing)).rejects.toThrow('AI API error 400')
  })

  it('asks for the use cases the flow needs when the POC has no API integration yet', async () => {
    const tasks: string[] = []
    const run = async (req: Call) => {
      tasks.push(req.task)
      return { data: { name: 'Create CRM ticket' } }
    }
    await draftN8nWorkflow({ system: [], pocName: 'POC', current: pocConfig.parse({}), instruction: '' }, run)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatch(/no API integration yet/i)
  })
})

describe('writeWorkflowAsText', () => {
  const answer = ['## NAME', 'Buat tiket', '## DESCRIPTION', 'x', '## WORKFLOW', '```json', '{"nodes":[],"connections":{}}', '```', '## CASES', '### buat_tiket', 'Buat tiket', '```bash', 'curl x', '```', '## TEST NOTES', 'ok'].join('\n')
  const req = { system: [], task: 'Write it', label: 'buat_tiket', maxTokens: 64000 }

  it('asks once more for a compact workflow with less effort when the first answer was cut off', async () => {
    const calls: { task: string; effort?: string }[] = []
    const call = async (task: string, effort?: string) => {
      calls.push({ task, effort })
      return calls.length === 1 ? { text: '## NAME\nhalf', stopInput: null, stopReason: 'max_tokens' } : { text: answer, stopInput: null, stopReason: 'end_turn' }
    }
    const { data } = await writeWorkflowAsText(req, call)
    expect(data.name).toBe('Buat tiket')
    expect(calls).toHaveLength(2)
    expect(calls[1].task).toMatch(/compact/i)
    expect(calls[1].effort).toBe('low')
  })

  it('drops the follow-the-rules line from the retry so the rules stop fighting the compact answer', async () => {
    const calls: string[] = []
    const call = async (task: string) => {
      calls.push(task)
      return calls.length === 1 ? { text: '## NAME\nhalf', stopInput: null, stopReason: 'max_tokens' } : { text: answer, stopInput: null, stopReason: 'end_turn' }
    }
    await writeWorkflowAsText({ ...req, task: `Write it\n${FOLLOW_RULES}\nWrite in the project language.` }, call)
    expect(calls[0]).toContain(FOLLOW_RULES)
    expect(calls[1]).not.toContain(FOLLOW_RULES)
    expect(calls[1]).toContain('Write in the project language.')
  })

  it('explains how to fix it when even the compact workflow does not fit', async () => {
    const call = async () => ({ text: '', stopInput: null, stopReason: 'max_tokens' })
    await expect(writeWorkflowAsText(req, call)).rejects.toThrow(/buat_tiket.*Max output tokens/)
  })

  it('does not retry an answer that finished', async () => {
    let n = 0
    const call = async () => {
      n++
      return { text: answer, stopInput: null, stopReason: 'end_turn' }
    }
    await writeWorkflowAsText(req, call)
    expect(n).toBe(1)
  })
})
