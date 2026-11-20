// The Cekat AI agent dashboard steps (new agents, /ai-agents-v2). Each field is saved on its own so a failure
// leaves everything before it in place, and the run can report exactly what is missing.
import type { Page } from 'playwright-core'
import { AGENT } from './selectors.ts'

export type Creativity = 'Consistent' | 'Balanced' | 'Creative'

export interface AgentSettings {
  stopAiAfterTransfer: boolean
  silentTransfer: boolean
  ignoreTeamHandoff: boolean
  historyLimit: number
  readFileLimit: number
  contextLimit: number
  creativity: Creativity
  messageAwait: number
  messageLimit: number
  sessionOnlyMemory: boolean
}

/** What agentBuild.ts drives; a fake implements it in tests. */
export interface AgentUi {
  hasAgent(name: string): Promise<boolean>
  createAgent(name: string): Promise<string>
  fillField(agentId: string, title: string, text: string): Promise<void>
  addInstruction(agentId: string, title: string, text: string): Promise<void>
  applySettings(agentId: string, settings: AgentSettings): Promise<void>
  /** The behavior page's text, to check what was saved. */
  behaviorText(agentId: string): Promise<string>
}

export class CekatAgentUi implements AgentUi {
  private readonly page: Page
  constructor(page: Page) {
    this.page = page
  }

  async hasAgent(name: string): Promise<boolean> {
    await this.page.goto(AGENT.list, { waitUntil: 'domcontentloaded' })
    await this.page.getByText(AGENT.createNew, { exact: true }).waitFor()
    return (await this.page.getByText(name, { exact: true }).count()) > 0
  }

  async createAgent(name: string): Promise<string> {
    const { page } = this
    await page.goto(AGENT.list, { waitUntil: 'domcontentloaded' })
    await page.getByText(AGENT.createNew, { exact: true }).click()
    await page.locator(AGENT.createName).fill(name)
    await page.locator(AGENT.createTemplate).selectOption(AGENT.template)
    await page.getByRole(AGENT.createButton.role, { name: AGENT.createButton.name }).click()
    await page.waitForURL(/\/ai-agents-v2\/[0-9a-f-]{36}/)
    return /\/ai-agents-v2\/([0-9a-f-]{36})/.exec(page.url())![1]
  }

  private async open(agentId: string, tab: 'behavior' | 'configuration', ready: string): Promise<void> {
    const { page } = this
    const want = AGENT.page(agentId, tab)
    if (page.url() !== want) await page.goto(want, { waitUntil: 'domcontentloaded' })
    await page.getByText(ready, { exact: true }).first().waitFor()
  }

  private async save(): Promise<void> {
    const { page } = this
    await page.getByRole(AGENT.save.role, { name: AGENT.save.name, exact: AGENT.save.exact }).click()
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(500)
  }

  async fillField(agentId: string, title: string, text: string): Promise<void> {
    const { page } = this
    await this.open(agentId, 'behavior', title)
    await page.locator(AGENT.fieldArea(title)).click()
    const editor = page.locator(AGENT.editor)
    await editor.waitFor()
    await editor.fill(text)
    await this.save()
  }

  async addInstruction(agentId: string, title: string, text: string): Promise<void> {
    const { page } = this
    await this.open(agentId, 'behavior', 'Additional Instructions')
    await page.getByRole(AGENT.addInstruction.role, { name: AGENT.addInstruction.name }).click()
    await page.locator(AGENT.instructionTitle).last().fill(title)
    const editor = page.locator(AGENT.editor)
    await editor.waitFor()
    await editor.fill(text)
    await this.save()
  }

  async applySettings(agentId: string, s: AgentSettings): Promise<void> {
    const { page } = this
    await this.open(agentId, 'configuration', 'Session Only Memory')
    // Toggles are a visually hidden checkbox (sr-only) inside the switch: read the box, click the switch.
    const check = async (label: string, on: boolean) => {
      const box = page.locator(AGENT.checkboxAfter(label))
      if ((await box.isChecked()) === on) return
      await page.locator(`${AGENT.checkboxAfter(label)}/..`).click()
      if ((await box.isChecked()) !== on) throw new Error(`Could not switch "${label}" ${on ? 'on' : 'off'}.`)
    }
    const number = (label: string, value: number) => page.locator(AGENT.numberAfter(label)).fill(String(value))
    await check('Stop AI after transfer', s.stopAiAfterTransfer)
    await check('Silent transfer', s.silentTransfer)
    await check('Ignore Team Handoff', s.ignoreTeamHandoff)
    await number('AI History Limit', s.historyLimit)
    await number('AI Read File Limit', s.readFileLimit)
    await number('AI Context Limit', s.contextLimit)
    await page.locator(AGENT.dropdownAfter('AI Creativity Level')).click()
    await page.getByText(s.creativity, { exact: true }).last().click()
    await number('Message Await', s.messageAwait)
    await number('AI Message Limit', s.messageLimit)
    await check('Session Only Memory', s.sessionOnlyMemory)
    await this.save()
  }

  async behaviorText(agentId: string): Promise<string> {
    await this.page.goto(AGENT.page(agentId, 'behavior'), { waitUntil: 'domcontentloaded' })
    await this.page.getByText('Additional Instructions', { exact: true }).first().waitFor()
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    return this.page.locator('body').innerText()
  }
}
