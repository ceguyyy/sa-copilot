// Devtools › API Tools: create a webhook tool for the business, then activate it on one AI agent
// (AI agent › Integrations › AI Tools).
import type { Page } from 'playwright-core'
import { API_TOOLS } from './selectors.ts'

export interface ApiToolSpec {
  name: string
  description: string
  method: 'GET' | 'POST'
  webhookAddress: string
  apiKey: string
  /** The AI Inputs as a JSON Schema object. */
  schema: Record<string, unknown>
}

/** What apiToolsBuild.ts drives; a fake implements it in tests. */
export interface ApiToolsUi {
  /** Tool names that already exist in the business. */
  names(): Promise<Set<string>>
  /** Creates the tool and returns its id. */
  create(tool: ApiToolSpec): Promise<string>
  activate(agentId: string, name: string): Promise<void>
  isActive(agentId: string, name: string): Promise<boolean>
}

const IDLE = { timeout: 15_000 }
const CARD_ATTEMPTS = 3

export class CekatApiToolsUi implements ApiToolsUi {
  private readonly page: Page
  constructor(page: Page) {
    this.page = page
  }

  private async openList(): Promise<void> {
    const { page } = this
    await page.goto(API_TOOLS.page, { waitUntil: 'domcontentloaded' })
    await page.getByRole(API_TOOLS.create.role, { name: API_TOOLS.create.name }).waitFor()
    await page.waitForLoadState('networkidle', IDLE).catch(() => {})
  }

  async names(): Promise<Set<string>> {
    await this.openList()
    return new Set((await this.page.locator(API_TOOLS.names).allInnerTexts()).map((n) => n.trim()))
  }

  /** Method, webhook, API key and the schema, as both the create and the edit form show them. */
  private async fillForm(tool: ApiToolSpec): Promise<void> {
    const { page } = this
    await page.getByRole(API_TOOLS.method.role, { name: API_TOOLS.method.name }).selectOption(tool.method)
    await page.getByRole(API_TOOLS.webhook.role, { name: API_TOOLS.webhook.name }).fill(tool.webhookAddress)
    await page.getByRole(API_TOOLS.apiKey.role, { name: API_TOOLS.apiKey.name }).fill(tool.apiKey)
    await page.getByRole(API_TOOLS.custom.role, { name: API_TOOLS.custom.name }).check()
    await this.fillSchema(tool)
  }

  /**
   * Monaco auto-closes brackets and quotes while text is inserted, leaving them after the cursor; an invalid schema
   * is saved as null. So the JSON goes in on one line, whatever follows the cursor is deleted, and the result is checked.
   */
  private async fillSchema(tool: ApiToolSpec): Promise<void> {
    const { page } = this
    const json = JSON.stringify(tool.schema)
    await page.locator(API_TOOLS.schemaEditor).first().click()
    await page.keyboard.press('Control+A')
    await page.keyboard.insertText(json)
    await page.keyboard.press('Control+Shift+End')
    await page.keyboard.press('Delete')
    const shown = (await page.locator(API_TOOLS.schemaLines).first().innerText()).replace(/ /g, ' ').trim()
    if (shown !== json) throw new Error(`The AI Inputs of API tool "${tool.name}" did not go in as written.`)
  }

  private saved(method: 'POST' | 'PUT') {
    return this.page.waitForResponse((r) => r.request().method() === method && new URL(r.url()).pathname.startsWith(API_TOOLS.apiPath), IDLE)
  }

  async create(tool: ApiToolSpec): Promise<string> {
    const { page } = this
    await this.openList()
    await page.getByRole(API_TOOLS.create.role, { name: API_TOOLS.create.name }).click()
    await page.getByRole(API_TOOLS.name.role, { name: API_TOOLS.name.name }).fill(tool.name)
    await page.getByRole(API_TOOLS.description.role, { name: API_TOOLS.description.name }).fill(tool.description)
    await this.fillForm(tool)
    const created = this.saved('POST')
    await page.getByRole(API_TOOLS.createTool.role, { name: API_TOOLS.createTool.name }).click()
    const response = await created
    const body = (await response.json().catch(() => ({}))) as { data?: { id?: string }; message?: string }
    const id = body.data?.id
    if (!response.ok() || !id) throw new Error(`Cekat did not create API tool "${tool.name}": ${body.message ?? response.status()}`)

    // Creating saves POST and no Max Tool Calls whatever the form says; saving the edit form sets them.
    await page.goto(API_TOOLS.tool(id), { waitUntil: 'domcontentloaded' })
    await page.getByRole(API_TOOLS.edit.role, { name: API_TOOLS.edit.name }).click()
    await this.fillForm(tool)
    const updated = this.saved('PUT')
    await page.getByRole(API_TOOLS.save.role, { name: API_TOOLS.save.name, exact: API_TOOLS.save.exact }).click()
    const saved = await updated
    const data = ((await saved.json().catch(() => ({}))) as { data?: { method?: string; schema?: unknown } }).data
    if (!saved.ok() || data?.method !== tool.method || !data?.schema) {
      throw new Error(`Cekat did not save API tool "${tool.name}" as filled in (method ${data?.method ?? '?'}, AI inputs ${data?.schema ? 'set' : 'missing'}).`)
    }
    return id
  }

  private async card(agentId: string, name: string) {
    const { page } = this
    const card = page.locator(API_TOOLS.card(name)).filter({ visible: true }).first()
    // Right after a tool is created the agent's list can still be the old one; loading the page again picks it up.
    for (let attempt = 1; ; attempt++) {
      await page.goto(API_TOOLS.integrations(agentId), { waitUntil: 'domcontentloaded' })
      try {
        await card.waitFor({ timeout: 15_000 })
        return card
      } catch (e) {
        if (attempt >= CARD_ATTEMPTS) throw new Error(`API tool "${name}" is not listed in the agent's Integrations › AI Tools.`, { cause: e })
      }
    }
  }

  async activate(agentId: string, name: string): Promise<void> {
    const card = await this.card(agentId, name)
    const button = card.getByRole(API_TOOLS.activate.role, { name: API_TOOLS.activate.name, exact: API_TOOLS.activate.exact })
    if (!(await button.count())) return
    // The list re-sorts once a tool is active, so the reply is awaited rather than the card; isActive checks it after.
    const assigned = this.page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === API_TOOLS.assignPath, IDLE)
    await button.click()
    if (!(await assigned).ok()) throw new Error(`Cekat did not activate API tool "${name}" on the agent.`)
  }

  async isActive(agentId: string, name: string): Promise<boolean> {
    const card = await this.card(agentId, name)
    return (await card.getByRole(API_TOOLS.active.role, { name: API_TOOLS.active.name }).count()) > 0
  }
}
