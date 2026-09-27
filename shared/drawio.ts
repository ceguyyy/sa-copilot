// Links that open a diagram in the draw.io editor (app.diagrams.net), the same way draw.io's own MCP tool server
// does (github.com/jgraph/drawio-mcp): the diagram rides in the URL #fragment, which browsers never send to the server.

const DRAWIO_BASE = 'https://app.diagrams.net/'

async function deflateRawBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** draw.io's `#create=` payload: {type, compressed, data: base64(deflateRaw(encodeURIComponent(source)))}. */
export async function drawioCreatePayload(mermaid: string): Promise<{ type: 'mermaid'; compressed: true; data: string }> {
  return { type: 'mermaid', compressed: true, data: await deflateRawBase64(encodeURIComponent(mermaid)) }
}

/** URL that opens the Mermaid diagram as an editable draw.io diagram. */
export async function drawioUrl(mermaid: string, options: { dark?: boolean } = {}): Promise<string> {
  const params = new URLSearchParams({ grid: '0', pv: '0', border: '10', edit: '_blank' })
  if (options.dark) params.set('dark', '1')
  return `${DRAWIO_BASE}?${params}#create=${encodeURIComponent(JSON.stringify(await drawioCreatePayload(mermaid)))}`
}

/** A Windows Internet Shortcut (.url) that opens the diagram in draw.io when double-clicked. */
export async function drawioShortcut(mermaid: string): Promise<string> {
  return `[InternetShortcut]\r\nURL=${await drawioUrl(mermaid)}\r\n`
}
