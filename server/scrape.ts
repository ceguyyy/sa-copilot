import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { parse } from 'parse5'
import { HttpError } from './http.ts'

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 5
const TIMEOUT_MS = 15_000
const blockedAddresses = new BlockList()
function addBlockedSubnet(blocklist: BlockList, subnet: string, family: 'ipv4' | 'ipv6'): void {
  const [network, prefix] = subnet.split('/')
  blocklist.addSubnet(network, Number(prefix), family)
}

for (const subnet of [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
  '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16',
  '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
]) addBlockedSubnet(blockedAddresses, subnet, 'ipv4')
for (const subnet of ['::/128', '::1/128', 'fc00::/7', 'fe80::/10', 'ff00::/8', '2001:db8::/32']) {
  addBlockedSubnet(blockedAddresses, subnet, 'ipv6')
}
const mappedIpv4Addresses = new BlockList()
addBlockedSubnet(mappedIpv4Addresses, '::ffff:0:0/96', 'ipv6')

export function isPublicIp(address: string): boolean {
  const family = isIP(address)
  if (!family) return false
  if (family === 6) {
    if (mappedIpv4Addresses.check(address, 'ipv6')) return false
    const globalIpv6 = new BlockList()
    addBlockedSubnet(globalIpv6, '2000::/3', 'ipv6')
    if (!globalIpv6.check(address, 'ipv6')) return false
  }
  return !blockedAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4')
}

export function normalizeWebUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new HttpError(400, 'Enter a valid website URL')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) {
    throw new HttpError(400, 'Only public HTTP or HTTPS websites can be imported')
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || (isIP(hostname) && !isPublicIp(hostname))) {
    throw new HttpError(400, 'Only public HTTP or HTTPS websites can be imported')
  }
  url.hash = ''
  return url
}

type HtmlNode = {
  nodeName?: string
  tagName?: string
  value?: string
  childNodes?: HtmlNode[]
}

const skippedTags = new Set(['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'head'])
const blockTags = new Set(['article', 'blockquote', 'br', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'main', 'p', 'section', 'tr'])

function textOf(node: HtmlNode): string {
  if (node.nodeName === '#text') return node.value ?? ''
  if (node.tagName && skippedTags.has(node.tagName)) return ''
  const children = (node.childNodes ?? []).map(textOf).join(' ')
  return blockTags.has(node.tagName ?? '') ? `\n${children}\n` : children
}

function findTag(node: HtmlNode, tagName: string): HtmlNode | undefined {
  if (node.tagName === tagName) return node
  for (const child of node.childNodes ?? []) {
    const found = findTag(child, tagName)
    if (found) return found
  }
  return undefined
}

function cleanText(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t\f\v ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

export function extractHtmlContent(html: string): { title: string; text: string } {
  const document = parse(html) as unknown as HtmlNode
  const titleNode = findTag(document, 'title')
  const bodyNode = findTag(document, 'body')
  return {
    title: cleanText(titleNode ? textOf(titleNode) : ''),
    text: cleanText(textOf(bodyNode ?? document)),
  }
}

async function getPublicAddress(hostname: string): Promise<PinnedAddress> {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return { address: host, family: isIP(host) as 4 | 6 }
  let addresses: Awaited<ReturnType<typeof lookup>>[]
  try {
    addresses = await lookup(host, { all: true, verbatim: true })
  } catch {
    throw new HttpError(400, 'The website host could not be resolved')
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new HttpError(400, 'Only public HTTP or HTTPS websites can be imported')
  }
  return { address: addresses[0].address, family: addresses[0].family as 4 | 6 }
}

type PinnedAddress = { address: string; family: 4 | 6 }
type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void

/** DNS lookup that always answers with the already-checked public address (no DNS rebinding). Node's
 * happy-eyeballs connect asks with `all: true` and then needs an address list, not a single address. */
export function pinnedLookup(pinned: PinnedAddress) {
  return (_hostname: string, options: { all?: boolean }, callback: LookupCallback) => {
    if (options?.all) callback(null, [{ address: pinned.address, family: pinned.family }])
    else callback(null, pinned.address, pinned.family)
  }
}

// Many sites (Cloudflare, WAFs) refuse unknown bots, so look like a regular browser.
const REQUEST_HEADERS = {
  accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'accept-language': 'id,en;q=0.8',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 SA-Copilot',
}

type PageResponse = { status: number; location: string | null; contentType: string; body: Buffer }

async function requestPage(url: URL): Promise<PageResponse> {
  const pinned = await getPublicAddress(url.hostname)
  const transport = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const request = transport.get(url, {
      headers: REQUEST_HEADERS,
      lookup: pinnedLookup(pinned) as unknown as http.RequestOptions['lookup'],
      timeout: TIMEOUT_MS,
    }, (response) => {
      const status = response.statusCode ?? 0
      const location = response.headers.location ?? null
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.resume()
        resolve({ status, location, contentType: '', body: Buffer.alloc(0) })
        return
      }
      if (status < 200 || status >= 300) {
        response.resume()
        reject(new HttpError(502, `The website returned HTTP ${status}${status === 403 || status === 429 ? ' (it blocks automated access — copy the page text into a note instead)' : ''}`))
        return
      }
      const contentType = response.headers['content-type'] ?? ''
      if (!/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType)) {
        response.resume()
        reject(new HttpError(415, 'This URL does not serve an HTML page'))
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new HttpError(413, 'The website page is too large to import'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve({ status, location: null, contentType, body: Buffer.concat(chunks) }))
    })
    request.on('timeout', () => request.destroy(new HttpError(504, 'The website took too long to respond')))
    request.on('error', (error: NodeJS.ErrnoException) =>
      reject(error instanceof HttpError ? error : new HttpError(502, `Could not fetch this website${error.code ? ` (${error.code})` : ''}`)),
    )
  })
}

export async function scrapeWebPage(input: string): Promise<{ url: URL; title: string; text: string }> {
  let url = normalizeWebUrl(input)
  let response: PageResponse
  for (let redirects = 0; ; redirects += 1) {
    response = await requestPage(url)
    if (!response.location) break
    if (redirects >= MAX_REDIRECTS) throw new HttpError(502, 'The website redirected too many times')
    try {
      url = normalizeWebUrl(new URL(response.location, url).href)
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw new HttpError(502, 'The website returned an invalid redirect')
    }
  }
  const { title, text } = extractHtmlContent(response.body.toString('utf8'))
  if (!text) throw new HttpError(422, 'No readable page text was found at this URL')
  return { url, title, text }
}