import { describe, expect, test } from 'vitest'
import { drawioCreatePayload, drawioShortcut, drawioUrl } from './drawio.ts'

async function inflate(base64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return decodeURIComponent(await new Response(stream).text())
}

const SOURCE = 'flowchart TD\n  A[Mulai — pelanggan chat] --> B{Butuh agent?}\n  B -->|Ya| C[Eskalasi]'

describe('drawio', () => {
  test('payload round-trips back to the Mermaid source (unicode included)', async () => {
    const payload = await drawioCreatePayload(SOURCE)
    expect(payload).toMatchObject({ type: 'mermaid', compressed: true })
    expect(await inflate(payload.data)).toBe(SOURCE)
  })

  test('url keeps the diagram in the #fragment only', async () => {
    const url = new URL(await drawioUrl(SOURCE, { dark: true }))
    expect(url.origin).toBe('https://app.diagrams.net')
    expect(url.searchParams.get('dark')).toBe('1')
    expect(url.search).not.toContain('create')
    const payload = JSON.parse(decodeURIComponent(url.hash.slice('#create='.length)))
    expect(await inflate(payload.data)).toBe(SOURCE)
  })

  test('shortcut is a valid Internet Shortcut file', async () => {
    const file = await drawioShortcut(SOURCE)
    expect(file).toMatch(/^\[InternetShortcut\]\r\nURL=https:\/\/app\.diagrams\.net\/\?.*#create=/)
  })
})
