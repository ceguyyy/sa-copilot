import { describe, expect, it } from 'vitest'
import { extractHtmlContent, isPublicIp, normalizeWebUrl, pinnedLookup } from './scrape.ts'

describe('normalizeWebUrl', () => {
  it('accepts a public HTTP or HTTPS URL', () => {
    expect(normalizeWebUrl(' https://example.com/path ')).toBeInstanceOf(URL)
    expect(normalizeWebUrl('http://example.com')).toBeInstanceOf(URL)
  })

  it('rejects credentials, unsupported protocols, and local hostnames', () => {
    for (const value of ['file:///etc/passwd', 'ftp://example.com', 'https://user:pass@example.com', 'http://localhost']) {
      expect(() => normalizeWebUrl(value)).toThrow()
    }
  })
})

describe('isPublicIp', () => {
  it('allows public addresses and blocks private or reserved addresses', () => {
    expect(isPublicIp('8.8.8.8')).toBe(true)
    expect(isPublicIp('2606:4700:4700::1111')).toBe(true)
    for (const address of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fc00::1', '::ffff:127.0.0.1']) {
      expect(isPublicIp(address)).toBe(false)
    }
  })
})

describe('extractHtmlContent', () => {
  it('returns readable page text and title without executable content', () => {
    expect(extractHtmlContent('<html><head><title>Policy</title><script>secret()</script></head><body><h1>Terms</h1><p>Read this.</p></body></html>'))
      .toEqual({ title: 'Policy', text: 'Terms\nRead this.' })
  })
})
describe('pinnedLookup', () => {
  it('answers with an address list when Node asks for all addresses (happy eyeballs)', () => {
    const calls: unknown[][] = []
    pinnedLookup({ address: '93.184.215.14', family: 4 })('example.com', { all: true }, (...args: unknown[]) => calls.push(args))
    expect(calls).toEqual([[null, [{ address: '93.184.215.14', family: 4 }]]])
  })

  it('answers with a single address otherwise', () => {
    const calls: unknown[][] = []
    pinnedLookup({ address: '2606:2800::1', family: 6 })('example.com', {}, (...args: unknown[]) => calls.push(args))
    expect(calls).toEqual([[null, '2606:2800::1', 6]])
  })
})
