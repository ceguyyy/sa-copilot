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

/** Knowledge Base (?tab=knowledge-base). "Q&A" also names a global shortcut to Settings › Quick Reply, so the
 * sub-tabs are found next to their siblings. */
export const KB = {
  page: (id: string) => `${CEKAT_URL}/ai-agents-v2/${id}?tab=knowledge-base`,
  ready: 'Characters',
  textEditor: '.tiptap.ProseMirror',
  qnaTab: `xpath=//button[normalize-space()='Website']/following-sibling::button[normalize-space()='Q&A'][1]`,
  addQna: 'button:text-is("Add New Q&A")',
  question: 'textarea[placeholder="What is the package price?"]',
  answer: 'textarea[placeholder="Harga paketnya 100rb..."]',
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
  /** Settings › Pipeline Statuses: "Add Status" opens an inline form (name, colour) with Cancel / Add. */
  pipelinePage: `${CEKAT_URL}/settings/pipeline-settings`,
  addStatus: { role: 'button' as const, name: 'Add Status' },
  statusName: 'input[type="text"] >> nth=0',
  statusAdd: { role: 'button' as const, name: 'Add', exact: true },
}

/**
 * Devtools › API Tools (the business's webhook tools) and the agent's Integrations › AI Tools, where each tool is
 * activated per agent. Creating ignores the HTTP method and Max Tool Calls (saved as POST / null), so both are set
 * again through "Edit Tool" › Save, which sends the whole tool (PUT /ai_tools/:id).
 */
export const API_TOOLS = {
  page: `${CEKAT_URL}/developers/api-tools`,
  tool: (id: string) => `${CEKAT_URL}/developers/api-tools?tool_id=${id}`,
  create: { role: 'button' as const, name: 'Create New Tool' },
  name: { role: 'textbox' as const, name: 'Name' },
  method: { role: 'combobox' as const, name: 'HTTP Method' },
  description: { role: 'textbox' as const, name: 'Description ?' },
  webhook: { role: 'textbox' as const, name: 'Webhook Address' },
  apiKey: { role: 'textbox' as const, name: 'API Key (Bearer)' },
  custom: { role: 'radio' as const, name: 'Custom' },
  /** The AI Inputs JSON Schema (Custom) is a Monaco editor; insertText keeps the JSON as typed. */
  schemaEditor: '.monaco-editor',
  schemaLines: '.monaco-editor .view-lines',
  createTool: { role: 'button' as const, name: 'Create Tool' },
  edit: { role: 'button' as const, name: /Edit\s*Tool/ },
  save: { role: 'button' as const, name: 'Save', exact: true },
  /** POST (create) and PUT (update) of a tool. */
  apiPath: '/ai_tools',
  /** Activating a tool on an agent. */
  assignPath: '/ai_agents/ai_tools/assign',
  /** Tool names on the list page. */
  names: 'h2',
  integrations: (agentId: string) => `${CEKAT_URL}/ai-agents-v2/${agentId}?tab=integrations`,
  /**
   * A tool's card in Integrations › AI Tools: the closest ancestor of its name with a button. The page renders the
   * list twice, one copy hidden, so callers keep the visible one.
   */
  card: (name: string) => `xpath=//h2[normalize-space()=${JSON.stringify(name)}]/ancestor::*[.//button][1]`,
  activate: { role: 'button' as const, name: 'Activate', exact: true },
  /** An active tool shows one button reading "Active" (and "Deactivate" on hover). */
  active: { role: 'button' as const, name: /^Active(\s|$)/ },
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
