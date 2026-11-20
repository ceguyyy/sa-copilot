// Labels (Settings › Labels) and the AI agent's Actions & Routing conditions: agent transfer, conversation label,
// conversation pipeline. Each condition is saved on its own.
import type { Page } from 'playwright-core'
import { AGENT, ROUTING } from './selectors.ts'

/** What routingBuild.ts drives; a fake implements it in tests. */
export interface RoutingUi {
  labelNames(): Promise<string[]>
  createLabel(name: string): Promise<void>
  pipelineNames(agentId: string): Promise<string[]>
  createPipelineStatus(name: string): Promise<void>
  addTransferCondition(agentId: string, title: string, description: string): Promise<void>
  addLabelCondition(agentId: string, title: string, label: string, description: string): Promise<void>
  addPipelineCondition(agentId: string, title: string, current: string | null, target: string, description: string): Promise<void>
  routingText(agentId: string): Promise<string>
}

type Section = keyof typeof ROUTING.sections

export class CekatRoutingUi implements RoutingUi {
  private readonly page: Page
  constructor(page: Page) {
    this.page = page
  }

  async labelNames(): Promise<string[]> {
    const { page } = this
    await page.goto(ROUTING.labelsPage, { waitUntil: 'domcontentloaded' })
    await page.getByRole(ROUTING.addLabel.role, { name: ROUTING.addLabel.name }).waitFor()
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    // Table columns: Color, Label Name, Created At, Actions.
    return page.locator('tr').evaluateAll((rows) => rows.map((r) => (r as HTMLTableRowElement).cells[1]?.innerText.trim() ?? '').filter(Boolean))
  }

  async createLabel(name: string): Promise<void> {
    const { page } = this
    if (!page.url().startsWith(ROUTING.labelsPage)) await this.labelNames()
    await page.getByRole(ROUTING.addLabel.role, { name: ROUTING.addLabel.name }).click()
    await page.locator(ROUTING.labelName).fill(name)
    await page.locator(ROUTING.labelCreate).click()
    await page.getByText(name, { exact: true }).first().waitFor()
  }

  private async openRouting(agentId: string): Promise<void> {
    const { page } = this
    await page.goto(ROUTING.page(agentId), { waitUntil: 'domcontentloaded' })
    await page.getByText(ROUTING.ready, { exact: true }).first().waitFor()
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  }

  /** Opens a new condition in a section and names it; the caller fills the rest. */
  private async newCondition(agentId: string, section: Section, title: string): Promise<void> {
    const { page } = this
    await this.openRouting(agentId)
    await page.locator(ROUTING.addCondition(ROUTING.sections[section])).click()
    await page.locator(ROUTING.conditionTitle).last().fill(title)
  }

  /** Picks one name in a label or pipeline picker; typing filters the list only key by key. */
  private async pick(picker: string, search: string, name: string): Promise<void> {
    const { page } = this
    await page.locator(picker).click()
    await page.locator(search).last().pressSequentially(name)
    await page.locator(ROUTING.option(name)).first().click()
    await page.keyboard.press('Escape')
  }

  private async describeAndSave(description: string): Promise<void> {
    const { page } = this
    const editor = page.locator(AGENT.editor)
    await editor.waitFor()
    await editor.fill(description)
    await page.getByRole(AGENT.save.role, { name: AGENT.save.name, exact: AGENT.save.exact }).click()
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(500)
  }

  /** The business's pipeline statuses, read from a pipeline condition's Target picker (nothing is saved). */
  async pipelineNames(agentId: string): Promise<string[]> {
    const { page } = this
    await this.openRouting(agentId)
    await page.locator(ROUTING.addCondition(ROUTING.sections.pipeline)).click()
    await page.locator(ROUTING.targetPicker).click()
    const search = page.locator(ROUTING.pipelineSearch).last()
    await search.waitFor()
    const names = await search.evaluate((input) => {
      let box: Element | null = input
      for (let i = 0; i < 4 && box; i++) box = box.parentElement
      return [...(box?.querySelectorAll('button > span') ?? [])].map((s) => (s.textContent ?? '').trim()).filter(Boolean)
    })
    await page.keyboard.press('Escape')
    await page.getByRole(ROUTING.cancel.role, { name: ROUTING.cancel.name }).click()
    return names
  }

  async createPipelineStatus(name: string): Promise<void> {
    const { page } = this
    await page.goto(ROUTING.pipelinePage, { waitUntil: 'domcontentloaded' })
    await page.getByRole(ROUTING.addStatus.role, { name: ROUTING.addStatus.name }).click()
    await page.locator(ROUTING.statusName).fill(name)
    await page.getByRole(ROUTING.statusAdd.role, { name: ROUTING.statusAdd.name, exact: ROUTING.statusAdd.exact }).click()
    await page.getByText(name, { exact: true }).first().waitFor()
  }

  async addTransferCondition(agentId: string, title: string, description: string): Promise<void> {
    await this.newCondition(agentId, 'transfer', title)
    await this.describeAndSave(description)
  }

  async addLabelCondition(agentId: string, title: string, label: string, description: string): Promise<void> {
    await this.newCondition(agentId, 'label', title)
    await this.pick(ROUTING.labelPicker, ROUTING.labelSearch, label)
    await this.describeAndSave(description)
  }

  async addPipelineCondition(agentId: string, title: string, current: string | null, target: string, description: string): Promise<void> {
    await this.newCondition(agentId, 'pipeline', title)
    if (current) await this.pick(ROUTING.currentPicker, ROUTING.pipelineSearch, current)
    await this.pick(ROUTING.targetPicker, ROUTING.pipelineSearch, target)
    await this.describeAndSave(description)
  }

  async routingText(agentId: string): Promise<string> {
    await this.openRouting(agentId)
    return this.page.locator('body').innerText()
  }
}
