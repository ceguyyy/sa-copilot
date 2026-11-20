// Every selector the Cekat dashboard automation relies on, in one place: when Cekat changes its UI, fix it here.
// Found by exploring chat.cekat.ai; see docs/cekat-ui-automation.md for how each one behaves.

export const CEKAT_URL = 'https://chat.cekat.ai'

export const CRM = {
  page: `${CEKAT_URL}/crm`,
  boardsHeading: '[data-testid="crm.nav.board.txt"]',
  expandSidebar: { role: 'button' as const, name: 'Expand sidebar' },
  sidebar: 'aside.group\\/sidebar',
  /** Collapsed the sidebar is w-14 (56 px); anything this wide is open. */
  sidebarOpenMinWidth: 150,
  addBoard: '[data-testid="crm.nav.add-board.btn"]',
  /** One button per board in the sidebar; aria-label is the board name. */
  boardItems: '[data-testid^="crm.nav.view.div."]',
  blankTemplate: '[data-testid="crm.board-create.blank.btn"]',
  boardName: '[data-testid="crm.board-create.blank-name.input"]',
  /** "What you're managing": 6 = Custom, whose text becomes the key column's name. */
  managingCustom: '[data-testid="crm.board-create.blank-options.radio.6"]',
  managingCustomName: '[data-testid="crm.board-create.blank-board.input"]',
  accessPublic: '[data-testid="crm.board-create.public.radio"]',
  createBoard: '[data-testid="crm.board-create.create.btn"]',
  addColumn: '[data-testid="crm.board-table.header-add.btn"]',
  columnTypeButtons: '[data-testid^="crm.board-table.header-add-search.btn."]',
  header: (columnId: string) => `th[data-crm-resize-col="${columnId}"]`,
  headerSettings: (columnId: string) => `th[data-crm-resize-col="${columnId}"] button[aria-label^="Column settings for"]`,
  firstRowCell: (columnId: string) => `[data-testid="crm.board-table.row.div.0"] td[data-crm-resize-col="${columnId}"]`,
  menuRename: { role: 'button' as const, name: 'Rename', exact: true },
  menuDelete: { role: 'button' as const, name: 'Delete', exact: true },
  labelsModal: '[data-testid="crm.board-label.modal"]',
  labelsEdit: '[data-testid="crm.board-label.edit.btn"]',
  labelInput: (i: number) => `[data-testid="crm.board-label.edit.input.${i}"]`,
  labelInputs: '[data-testid^="crm.board-label.edit.input."]',
  labelMore: (i: number) => `[data-option-item]:has([data-testid="crm.board-label.edit.input.${i}"]) > button`,
  labelDelete: { role: 'button' as const, name: 'Delete Label' },
  labelAdd: '[data-testid="crm.board-label.edit-add-new.btn"]',
  labelApply: '[data-testid="crm.board-label.edit-apply.btn"]',
  // Dropdown columns use another editor without testids: rename in place, add through "Create as new label"
  // (saved at once), no way to delete an option, and an empty option makes Apply fail with HTTP 400.
  dropdownEdit: { role: 'button' as const, name: 'Edit Options' },
  dropdownModal: '[data-crm-cell-type-modal]',
  dropdownCreate: '[data-crm-cell-type-modal] input[placeholder="Create or find options"]',
  dropdownOptions: '[data-crm-cell-type-modal] input:not([placeholder="Create or find options"])',
  dropdownCreateButton: { role: 'button' as const, name: 'Create as new label' },
  dropdownApply: '[data-crm-cell-type-modal] button:has-text("Apply")',
}
