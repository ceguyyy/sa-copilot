// Drives a Cekat Web Livechat page (live.cekat.ai) with Playwright, using the browser already on the machine
// (Edge on Windows, Chrome elsewhere). Selectors come from the livechat widget: #contact-form (pre-chat form),
// #chat-input / #chat-submit, and .incoming-bubble for the agent's messages.
import { type Browser, type BrowserContext, type Page, chromium } from 'playwright-core'
import { type QaContactField, isLivechatUrl } from '../../shared/pocQa.ts'
import { HttpError } from '../http.ts'

const SEL = {
  form: '#contact-form',
  formSubmit: '#contact-form button[type="submit"], .start-chat-btn',
  input: '#chat-input',
  send: '#chat-submit',
  incoming: '#chat-messages-inner .incoming-bubble',
  typing: '#typing-indicator',
}

export const LIVECHAT_TIMING = {
  pageLoadMs: 60_000,
  /** How long the agent may take before its first reply bubble. */
  replyTimeoutMs: 120_000,
  /** No new bubble and no typing indicator for this long = the agent finished its turn (it may send several bubbles). */
  quietMs: 7_000,
  /** Hard cap on one agent turn, so a stuck typing indicator or an endless stream of bubbles can't hang the run. */
  maxTurnMs: 180_000,
  pollMs: 500,
}

export type LivechatTiming = typeof LIVECHAT_TIMING

const CHANNELS = process.platform === 'win32' ? ['msedge', 'chrome'] : ['chrome', 'msedge']

/** Launches Edge or Chrome; visible unless headless. */
export async function launchBrowser(headless: boolean): Promise<Browser> {
  for (const channel of CHANNELS) {
    try {
      return await chromium.launch({ channel, headless })
    } catch {
      // try the next installed browser
    }
  }
  throw new HttpError(500, 'No Microsoft Edge or Google Chrome found — install one of them to run QA on the livechat.')
}

/** Keeps the test browser on the Cekat livechat: any page navigation elsewhere (redirect, script) is blocked. */
export async function lockToLivechat(context: BrowserContext): Promise<void> {
  await context.route('**/*', (route) => {
    const request = route.request()
    return request.isNavigationRequest() && !isLivechatUrl(request.url()) ? route.abort('blockedbyclient') : route.continue()
  })
}

export async function openLivechat(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: LIVECHAT_TIMING.pageLoadMs })
  // The widget either shows the pre-chat form or the chat input.
  await page.locator(`${SEL.form}, ${SEL.input}`).first().waitFor({ state: 'visible', timeout: LIVECHAT_TIMING.pageLoadMs })
}

/** The pre-chat form's fields (label, placeholder, required); empty when the inbox has no form. */
export async function readContactForm(page: Page): Promise<QaContactField[]> {
  if (!(await page.locator(SEL.form).isVisible())) return []
  return page.locator(`${SEL.form} input`).evaluateAll((inputs) =>
    inputs
      .filter((el) => (el as HTMLInputElement).type !== 'hidden')
      .map((el, i) => {
        const input = el as HTMLInputElement
        const label = input.closest('div')?.querySelector('label')?.innerText || input.getAttribute('aria-label') || input.placeholder || input.name
        // Labels key the contact values, so an unlabelled field still needs a unique one.
        return { label: label.replace(/\s*\*\s*$/, '').trim() || `Field ${i + 1}`, placeholder: input.placeholder, required: input.required }
      }),
  )
}

/** Fills the pre-chat form by label and starts the chat; waits for the welcome message to settle. */
export async function startChat(page: Page, contact: Record<string, string>, timing: LivechatTiming = LIVECHAT_TIMING): Promise<void> {
  if (await page.locator(SEL.form).isVisible()) {
    const fields = await readContactForm(page)
    const inputs = page.locator(`${SEL.form} input:not([type="hidden"])`)
    for (const [i, field] of fields.entries()) {
      const value = contact[field.label]
      if (value) await inputs.nth(i).fill(value)
    }
    await page.locator(SEL.formSubmit).first().click()
  }
  await page.locator(SEL.input).waitFor({ state: 'visible', timeout: timing.pageLoadMs })
  await waitForQuiet(page, await incomingCount(page), timing)
}

const incomingCount = (page: Page) => page.locator(SEL.incoming).count()

/** Waits until no new bubble arrives and the typing indicator is gone for `quietMs`. */
async function waitForQuiet(page: Page, initialCount: number, timing: LivechatTiming): Promise<number> {
  let count = initialCount
  let quietSince = Date.now()
  const deadline = Date.now() + timing.maxTurnMs
  while (Date.now() - quietSince < timing.quietMs && Date.now() < deadline) {
    await page.waitForTimeout(timing.pollMs)
    const now = await incomingCount(page)
    const isTyping = await page.locator(SEL.typing).isVisible().catch(() => false)
    if (now !== count || isTyping) {
      count = now
      quietSince = Date.now()
    }
  }
  return count
}

/** Sends one customer message and returns the agent's reply bubbles (empty when it never answered). */
export async function sendAndWait(page: Page, text: string, timing: LivechatTiming = LIVECHAT_TIMING): Promise<string[]> {
  const before = await incomingCount(page)
  await page.locator(SEL.input).fill(text)
  await page.locator(SEL.send).click()
  try {
    await page.waitForFunction(
      ({ selector, before: n }) => document.querySelectorAll(selector).length > n,
      { selector: SEL.incoming, before },
      { timeout: timing.replyTimeoutMs, polling: timing.pollMs },
    )
  } catch {
    return []
  }
  await waitForQuiet(page, await incomingCount(page), timing)
  const texts = await page.locator(SEL.incoming).allInnerTexts()
  return texts.slice(before).map((t) => t.trim()).filter(Boolean)
}
