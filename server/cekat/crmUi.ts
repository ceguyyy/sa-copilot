// The Cekat CRM dashboard steps the builder needs, each checking its own result. Columns are addressed by id
// (data-crm-resize-col), never by name, because Cekat keeps old names in some testids until a reload.
import type { Page } from 'playwright-core'
import { CRM } from './selectors.ts'

export interface UiColumn { id: string; name: string }
export type OptionKind = 'select' | 'dropdown'

/** What crmBuild.ts drives; a fake implements it in tests. */
export interface CrmUi {
  boardNames(): Promise<string[]>
  createBoard(name: string, keyName: string): Promise<string>
  columns(boardId: string): Promise<UiColumn[]>
  addColumn(typeLabel: string, name: string): Promise<string>
  setOptions(columnId: string, labels: string[], kind: OptionKind): Promise<string[]>
  deleteColumn(column: UiColumn): Promise<void>
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export class CekatCrmUi implements CrmUi {
  private readonly page: Page
  constructor(page: Page) {
    this.page = page
  }

  /** The business's board names, from the sidebar (crm_list_boards in Cekat MCP is not reliable). */
  async boardNames(): Promise<string[]> {
    await this.openCrm()
    await this.page.locator(CRM.boardItems).first().waitFor({ state: 'attached' }).catch(() => {})
    return this.page.locator(CRM.boardItems).evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim()))
  }

  private async openCrm(): Promise<void> {
    await this.page.goto(CRM.page, { waitUntil: 'domcontentloaded' })
    await this.page.locator(CRM.boardsHeading).first().waitFor({ state: 'attached' })
    await this.openSidebar()
  }

  async createBoard(name: string, keyName: string): Promise<string> {
    const { page } = this
    await this.openCrm()
    const before = new URL(page.url()).searchParams.get('board_id')
    await page.locator(CRM.addBoard).first().click()
    await page.locator(CRM.blankTemplate).click()
    await page.locator(CRM.boardName).fill(name)
    await page.locator(CRM.managingCustom).click()
    await page.locator(CRM.managingCustomName).fill(keyName)
    await page.locator(CRM.accessPublic).click()
    await page.locator(CRM.createBoard).click()
    await page.waitForURL((url) => {
      const id = url.searchParams.get('board_id')
      return !!id && id !== before
    })
    await page.locator(CRM.addColumn).waitFor()
    return new URL(page.url()).searchParams.get('board_id')!
  }

  /** The boards sidebar covers its own buttons while collapsed (about 56 px wide); open it and wait for it. */
  private async openSidebar(): Promise<void> {
    const { page } = this
    const sidebar = page.locator(CRM.sidebar).first()
    await sidebar.waitFor()
    const width = async () => (await sidebar.boundingBox())?.width ?? 0
    if ((await width()) >= CRM.sidebarOpenMinWidth) return
    await page.getByRole(CRM.expandSidebar.role, { name: CRM.expandSidebar.name }).click()
    await page.waitForFunction(([sel, min]) => (document.querySelector(sel)?.getBoundingClientRect().width ?? 0) >= min, [CRM.sidebar, CRM.sidebarOpenMinWidth] as const)
    // The width animates (300 ms); let it settle so the add button is not still moving.
    await page.waitForTimeout(400)
  }

  /** The board's columns except the key column (whose id is the board id) and "Add New Column". */
  async columns(boardId: string): Promise<UiColumn[]> {
    return this.page.locator('th[data-crm-resize-col]').evaluateAll(
      (ths, key) =>
        ths
          .map((th) => ({ id: th.getAttribute('data-crm-resize-col') ?? '', name: ((th.querySelector('input') as HTMLInputElement | null)?.value ?? th.textContent ?? '').trim() }))
          .filter((c) => c.id && c.id !== key),
      boardId,
    )
  }

  async addColumn(typeLabel: string, name: string): Promise<string> {
    const { page } = this
    const before = new Set((await this.columns('')).map((c) => c.id))
    await page.locator(CRM.addColumn).click()
    await page.locator(CRM.columnTypeButtons).filter({ hasText: new RegExp(`^\\s*${escapeRe(typeLabel)}\\s*$`) }).first().click()
    const handle = await page.waitForFunction(
      (known) => [...document.querySelectorAll('th[data-crm-resize-col]')].map((th) => th.getAttribute('data-crm-resize-col')).find((id) => id && !known.includes(id)) ?? null,
      [...before],
    )
    const id = (await handle.jsonValue()) as string
    await this.renameColumn(id, name)
    return id
  }

  /** Renames a column: a new one sometimes opens with its name in edit mode; otherwise Column settings › Rename. */
  async renameColumn(id: string, name: string): Promise<void> {
    const { page } = this
    const input = page.locator(`${CRM.header(id)} input`)
    const isEditing = await input.waitFor({ timeout: 3_000 }).then(() => true, () => false)
    if (!isEditing) {
      await page.locator(CRM.header(id)).hover()
      await page.locator(CRM.headerSettings(id)).click()
      await page.getByRole(CRM.menuRename.role, { name: CRM.menuRename.name, exact: true }).click()
      await input.waitFor()
    }
    await input.fill(name)
    await input.press('Enter')
    await page.waitForFunction(
      ([sel, want]) => !document.querySelector(`${sel} input`) && (document.querySelector(sel)?.textContent ?? '').trim() === want,
      [CRM.header(id), name] as const,
    )
  }

  /**
   * Replaces the options of a Select/Dropdown column. Needs at least one item on the board to open the editor.
   * Returns the default options a Dropdown keeps because Cekat cannot delete them there.
   */
  async setOptions(columnId: string, labels: string[], kind: OptionKind): Promise<string[]> {
    if (kind === 'dropdown') return this.setDropdownOptions(columnId, labels)
    const { page } = this
    await page.locator(CRM.firstRowCell(columnId)).click()
    await page.locator(CRM.labelsEdit).click()
    let count = await page.locator(CRM.labelInputs).count()
    for (let i = 0; i < labels.length; i++) {
      if (i >= count) {
        await page.locator(CRM.labelAdd).click()
        await page.locator(CRM.labelInput(i)).waitFor()
        count++
      }
      await page.locator(CRM.labelInput(i)).fill(labels[i])
    }
    // Remove the defaults left over, from the last row up so earlier indexes stay put.
    for (let i = count - 1; i >= labels.length; i--) {
      await page.locator(CRM.labelMore(i)).click()
      await page.getByRole(CRM.labelDelete.role, { name: CRM.labelDelete.name }).click()
      await page.locator(CRM.labelInput(i)).waitFor({ state: 'detached' })
    }
    await page.locator(CRM.labelApply).click()
    await page.keyboard.press('Escape')
    await page.locator(CRM.labelsModal).waitFor({ state: 'detached' }).catch(() => {})
    return []
  }

  private async setDropdownOptions(columnId: string, labels: string[]): Promise<string[]> {
    const { page } = this
    await page.locator(CRM.firstRowCell(columnId)).click()
    await page.getByRole(CRM.dropdownEdit.role, { name: CRM.dropdownEdit.name }).click()
    await page.locator(CRM.dropdownModal).waitFor()
    const options = page.locator(CRM.dropdownOptions)
    const existing = await options.count()
    for (let i = 0; i < Math.min(existing, labels.length); i++) await options.nth(i).fill(labels[i])
    for (let i = existing; i < labels.length; i++) {
      await page.locator(CRM.dropdownCreate).fill(labels[i])
      await page.getByRole(CRM.dropdownCreateButton.role, { name: CRM.dropdownCreateButton.name }).click()
      await page.waitForFunction(([sel, n]) => document.querySelectorAll(sel).length > n, [CRM.dropdownOptions, i] as const)
    }
    const kept = existing > labels.length ? await options.evaluateAll((els, from) => els.slice(from).map((e) => (e as HTMLInputElement).value), labels.length) : []
    await page.locator(CRM.dropdownApply).click()
    await page.keyboard.press('Escape')
    await page.locator(CRM.dropdownModal).waitFor({ state: 'detached' }).catch(() => {})
    return kept
  }

  /** Deletes a column after checking it still has the expected name: Cekat deletes without asking. */
  async deleteColumn(column: UiColumn): Promise<void> {
    const { page } = this
    const header = page.locator(CRM.header(column.id))
    const shown = ((await header.textContent()) ?? '').trim()
    if (shown !== column.name) throw new Error(`Column "${column.name}" now shows "${shown}"; it was not deleted.`)
    await header.hover()
    await page.locator(CRM.headerSettings(column.id)).click()
    await page.getByRole(CRM.menuDelete.role, { name: CRM.menuDelete.name, exact: true }).click()
    await header.waitFor({ state: 'detached' })
  }
}
