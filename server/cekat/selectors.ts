// Every selector the Cekat dashboard automation relies on, in one place: when Cekat changes its UI, fix it here.
// Found by exploring chat.cekat.ai; see docs/cekat-ui-automation.md for how each one behaves.

export const CEKAT_URL = 'https://chat.cekat.ai'

/** New AI agents (/ai-agents-v2). No testids: ids, roles and the visible labels. */
export const AGENT = {
  list: `${CEKAT_URL}/ai-agents-v2`,
  page: (id: string, tab: 'behavior' | 'configuration') => `${CEKAT_URL}/ai-agents-v2/${id}?tab=${tab}`,
  createNew: 'Create New',
  createName: '#create-name',
  createTemplate: '#create-template',
  /** The only template offered (Customer Service AI). */
  template: 'helpdesk',
  createButton: { role: 'button' as const, name: 'Create AI Agent' },
  /**
   * The placeholder or preview to click under a behavior field's title: the first div after the closest ancestor
   * of the title that has one. Works for the segments (title in a wrapper div) and Welcome Message (title in a header button).
   */
  fieldArea: (title: string) => `xpath=(//p[normalize-space()='${title}'])[last()]/ancestor::*[following-sibling::div][1]/following-sibling::div[1]`,
  /** Only one rich-text (Lexical) editor is open at a time: the field just clicked. */
  editor: '.rte-content[contenteditable="true"]',
  addInstruction: { role: 'button' as const, name: 'Condition' },
  /** The title of the instruction just added (max 100). */
  instructionTitle: 'input[maxlength="100"]',
  save: { role: 'button' as const, name: 'Save', exact: true },
  checkboxAfter: (label: string) => `xpath=(//*[normalize-space()='${label}'])[last()]/following::input[@type='checkbox'][1]`,
  numberAfter: (label: string) => `xpath=(//*[normalize-space()='${label}'])[last()]/following::input[@type='number'][1]`,
  dropdownAfter: (label: string) => `xpath=(//*[normalize-space()='${label}'])[last()]/following::button[1]`,
}

/** AI Actions & Routing (?tab=actions-routing) and Settings › Labels. */
export const ROUTING = {
  page: (id: string) => `${CEKAT_URL}/ai-agents-v2/${id}?tab=actions-routing`,
  ready: 'Conversation Pipeline',
  /** Section headings; saved conditions add their own "Condition" buttons, so the add button is found per section. */
  sections: { transfer: 'Agent Transfer', label: 'Conversation Label', pipeline: 'Conversation Pipeline' } as const,
  /** The section's add button: the last "Condition" button in the closest container of its heading that has one. */
  addCondition: (heading: string) =>
    `xpath=((//p[normalize-space()='${heading}'])[last()]/ancestor::*[.//button[normalize-space()='Condition']][1]//button[normalize-space()='Condition'])[last()]`,
  conditionTitle: 'input[maxlength="100"]',
  labelPicker: `xpath=(//*[normalize-space()='Label'])[last()]`,
  labelSearch: 'input[placeholder="Search labels"]',
  currentPicker: `xpath=(//*[normalize-space()='Current'])[last()]`,
  targetPicker: `xpath=(//*[starts-with(normalize-space(),'Target')])[last()]`,
  pipelineSearch: 'input[placeholder="Search pipelines"]',
  /** An option in the label or pipeline picker: a button whose span is the name. */
  option: (name: string) => `button:has(> span:text-is(${JSON.stringify(name)}))`,
  pickerOptions: 'button:has(> span)',
  cancel: { role: 'button' as const, name: 'Cancel Edit' },
  labelsPage: `${CEKAT_URL}/settings/labels`,
  addLabel: { role: 'button' as const, name: 'Add Label' },
  labelName: '[role="dialog"] #name',
  labelCreate: '[role="dialog"] button:has-text("Create")',
}

/** Labels of the behavior fields, in page order. */
export const AGENT_FIELDS = {
  welcome: 'Welcome Message',
  communicationStyle: 'Communication Style',
  conversationFlow: 'Conversation Flow',
  rulesRestrictions: 'Rules & Restriction',
} as const

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
