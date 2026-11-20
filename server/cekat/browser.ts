// A visible Edge/Chrome window with SA Copilot's own Cekat profile: the SA logs in once and the session stays on
// this computer (never the password; the profile lives next to the uploads and is not part of a backup).
import { type BrowserContext, type Page, chromium } from 'playwright-core'
import { cekatProfileDir } from '../dataDirs.ts'
import { HttpError } from '../http.ts'
import { CEKAT_URL } from './selectors.ts'

const CHANNELS = process.platform === 'win32' ? ['msedge', 'chrome'] : ['chrome', 'msedge']
/** How long the SA has to log in when the saved session has expired. */
export const LOGIN_WAIT_MS = 5 * 60_000

export const profileDir = cekatProfileDir

let running = false

/** Runs one job in the Cekat window; only one at a time, because they share the profile. */
export async function withCekatBrowser<T>(onStatus: (text: string) => void, job: (page: Page) => Promise<T>): Promise<T> {
  if (running) throw new HttpError(409, 'Another Build in Cekat is still running. Wait for it to finish.')
  running = true
  let context: BrowserContext | null = null
  try {
    context = await launch()
    const page = context.pages()[0] ?? (await context.newPage())
    page.setDefaultTimeout(20_000)
    await ensureLoggedIn(page, onStatus)
    return await job(page)
  } finally {
    running = false
    await context?.close().catch(() => {})
  }
}

async function launch(): Promise<BrowserContext> {
  for (const channel of CHANNELS) {
    try {
      return await chromium.launchPersistentContext(profileDir(), { channel, headless: false, viewport: { width: 1440, height: 900 } })
    } catch (e) {
      // A profile already open in another window is a real problem, not a missing browser.
      if (/already in use|ProcessSingleton|user data directory/i.test(e instanceof Error ? e.message : '')) {
        throw new HttpError(409, 'The Cekat browser window from SA Copilot is still open. Close it and try again.')
      }
    }
  }
  throw new HttpError(500, 'No Microsoft Edge or Google Chrome found — install one of them to build in Cekat.')
}

const isLoginPage = (url: string) => new URL(url).pathname.startsWith('/login')

async function ensureLoggedIn(page: Page, onStatus: (text: string) => void): Promise<void> {
  await page.goto(`${CEKAT_URL}/home`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  if (!isLoginPage(page.url())) return
  onStatus('Log in to Cekat in the browser window that opened (the session is kept for next time).')
  await page.waitForURL((url) => !isLoginPage(url.toString()), { timeout: LOGIN_WAIT_MS }).catch(() => {
    throw new HttpError(408, 'Cekat login was not finished in time. Start Build in Cekat again.')
  })
  onStatus('Logged in to Cekat.')
}
