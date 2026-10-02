import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser, Page } from 'playwright-core'
import { LIVECHAT_TIMING, launchBrowser, readContactForm, sendAndWait, startChat } from './livechat.ts'

// Needs Edge or Chrome on the machine; run with QA_BROWSER_TESTS=1 (kept out of the default run).
const fixture = readFileSync(new URL('./fixtures/livechat.html', import.meta.url), 'utf8')
const fast = { ...LIVECHAT_TIMING, quietMs: 1_000, replyTimeoutMs: 3_000, maxTurnMs: 4_000, pollMs: 100 }

describe.skipIf(!process.env.QA_BROWSER_TESTS)('livechat driver', () => {
  let browser: Browser
  let page: Page
  beforeAll(async () => {
    browser = await launchBrowser(true)
    page = await browser.newPage()
    await page.setContent(fixture)
  })
  afterAll(async () => browser?.close())

  it('reads the pre-chat form, starts the chat and collects every reply bubble of one turn', async () => {
    expect(await readContactForm(page)).toEqual([
      { label: 'Phone Number', placeholder: 'Masukkan phone number', required: true },
      { label: 'DOB', placeholder: 'ddmmyyyyy', required: false },
      { label: 'Name', placeholder: 'Masukkan name', required: true },
    ])
    await startChat(page, { 'Phone Number': '6281234567890', Name: 'QA Tester' }, fast)
    expect(await sendAndWait(page, 'INV-001', fast)).toEqual(['Pesanan INV-001 sedang dicek', 'Status: dikirim'])
  }, 30_000)

  it('gives up waiting after maxTurnMs when the typing indicator never goes away', async () => {
    const started = Date.now()
    expect(await sendAndWait(page, 'ngetik', fast)).toEqual(['Sebentar ya'])
    expect(Date.now() - started).toBeLessThan(fast.maxTurnMs + 2_000)
  }, 30_000)

  it('returns no replies when the agent stays silent', async () => {
    expect(await sendAndWait(page, 'diam', fast)).toEqual([])
  }, 30_000)
})
