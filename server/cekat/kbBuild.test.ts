import { describe, expect, it } from 'vitest'
import { planKb, runKbBuild } from './kbBuild.ts'
import type { KbUi, QnaPair } from './kbUi.ts'

const config = {
  knowledgeBase: {
    textSections: [
      { title: 'Jam buka', content: 'Senin–Jumat 09.00–17.00' },
      { title: '', content: 'Tanpa judul' },
      { title: 'Kosong', content: '  ' },
    ],
    websites: [{ url: 'https://klinik.example' }],
    qna: [{ question: 'Ada parkir?', answer: 'Ada, gratis 2 jam.' }, { question: 'Tanpa jawaban', answer: '' }],
    files: [{ name: 'harga.pdf' }],
  },
}

function fakeUi(read?: { text: string; qna: QnaPair[] }) {
  const calls: string[] = []
  let text = ''
  let qna: QnaPair[] = []
  const ui: KbUi = {
    fillText: async (_id, t) => void (calls.push('text'), (text = t)),
    addQna: async (_id, pairs) => void (calls.push(`qna ${pairs.length}`), (qna = pairs)),
    read: async () => read ?? { text: text.replace(/\n/g, '\n\n'), qna },
  }
  return { ui, calls }
}

describe('planKb', () => {
  it('joins the text sections under their titles and keeps complete Q&A pairs', () => {
    const plan = planKb(config)
    expect(plan.text).toBe('## Jam buka\nSenin–Jumat 09.00–17.00\n\nTanpa judul')
    expect(plan.qna).toEqual([{ question: 'Ada parkir?', answer: 'Ada, gratis 2 jam.' }])
    expect(plan.manual).toEqual([expect.stringContaining('https://klinik.example'), expect.stringContaining('harga.pdf')])
  })
})

describe('runKbBuild', () => {
  it('fills the text and Q&A, then finds both after saving', async () => {
    const { ui, calls } = fakeUi()
    const result = await runKbBuild(ui, 'agent-1', config, () => {})
    expect(calls).toEqual(['text', 'qna 1'])
    expect(result.textChars).toBeGreaterThan(0)
    expect(result.qna).toBe(1)
    expect(result.problems).toHaveLength(2) // the website and the file to add by hand
  })

  it('reports text or Q&A missing after saving', async () => {
    const { ui } = fakeUi({ text: '', qna: [] })
    const result = await runKbBuild(ui, 'agent-1', config, () => {})
    expect(result.problems).toEqual(expect.arrayContaining([expect.stringContaining('knowledge base text was not found'), expect.stringContaining('"Ada parkir?" was not found')]))
  })

  it('does nothing for an empty knowledge base', async () => {
    const { ui, calls } = fakeUi()
    expect(await runKbBuild(ui, 'agent-1', {}, () => {})).toEqual({ textChars: 0, qna: 0, problems: [] })
    expect(calls).toEqual([])
  })
})
