// The AI agent's Knowledge Base: the "Default" text (a Tiptap editor) and the Q&A list. Websites and files are
// left to the SA: adding a website starts a crawl and training in Cekat.
import type { Page } from 'playwright-core'
import { AGENT, KB } from './selectors.ts'

export interface QnaPair { question: string; answer: string }

/** What kbBuild.ts drives; a fake implements it in tests. */
export interface KbUi {
  fillText(agentId: string, text: string): Promise<void>
  addQna(agentId: string, pairs: QnaPair[]): Promise<void>
  /** The saved text and Q&A, to check them. */
  read(agentId: string): Promise<{ text: string; qna: QnaPair[] }>
}

export class CekatKbUi implements KbUi {
  private readonly page: Page
  constructor(page: Page) {
    this.page = page
  }

  private async open(agentId: string): Promise<void> {
    const { page } = this
    await page.goto(KB.page(agentId), { waitUntil: 'domcontentloaded' })
    await page.getByText(KB.ready).first().waitFor()
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  }

  private async save(): Promise<void> {
    const { page } = this
    await page.getByRole(AGENT.save.role, { name: AGENT.save.name, exact: AGENT.save.exact }).click()
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(500)
  }

  async fillText(agentId: string, text: string): Promise<void> {
    await this.open(agentId)
    const editor = this.page.locator(KB.textEditor)
    await editor.click()
    await editor.fill(text)
    await this.save()
  }

  async addQna(agentId: string, pairs: QnaPair[]): Promise<void> {
    const { page } = this
    await this.open(agentId)
    await page.locator(KB.qnaTab).click()
    for (const pair of pairs) {
      // Reuse an empty row the list may already show; otherwise add one.
      let index = await page.locator(KB.question).evaluateAll((els) => els.findIndex((e) => !(e as HTMLTextAreaElement).value.trim()))
      if (index < 0) {
        const before = await page.locator(KB.question).count()
        await page.locator(KB.addQna).click()
        await page.waitForFunction(([sel, n]) => document.querySelectorAll(sel).length > n, [KB.question, before] as const)
        index = before
      }
      await page.locator(KB.question).nth(index).fill(pair.question)
      await page.locator(KB.answer).nth(index).fill(pair.answer)
    }
    await this.save()
  }

  async read(agentId: string): Promise<{ text: string; qna: QnaPair[] }> {
    const { page } = this
    await this.open(agentId)
    const text = await page.locator(KB.textEditor).innerText()
    await page.locator(KB.qnaTab).click()
    const questions = await page.locator(KB.question).evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))
    const answers = await page.locator(KB.answer).evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))
    return { text, qna: questions.map((question, i) => ({ question, answer: answers[i] ?? '' })) }
  }
}
