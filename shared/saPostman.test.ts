import { describe, it, expect } from 'vitest'
import { parseCurl } from './saPostman.ts'
import { curlCommand } from './pocCurl.ts'

describe('cURL import', () => {
  it('imports the Open-Meteo GET example with URL-encoded query parameters', () => {
    const request = parseCurl(`curl --get "https://api.open-meteo.com/v1/forecast" \\\n  --data-urlencode "latitude=-6.2088" \\\n  --data-urlencode "longitude=106.8456" \\\n  --data-urlencode "current=temperature_2m" \\\n  --data-urlencode "timezone=Asia/Jakarta"`)
    expect(request.method).toBe('GET')
    expect(request.body).toBe('')
    expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({latitude:'-6.2088',longitude:'106.8456',current:'temperature_2m',timezone:'Asia/Jakarta'})
  })
  it('handles -G after data, preserves query/fragment and encodes reserved characters once', () => {
    const r=parseCurl(`curl 'https://example.com?existing=1#result' --data-urlencode 'q=a & b+%/é' -G`)
    expect(new URL(r.url).searchParams.get('q')).toBe('a & b+%/é')
    expect(new URL(r.url).searchParams.get('existing')).toBe('1')
    expect(new URL(r.url).hash).toBe('#result')
    expect(parseCurl(`curl https://example.com --data-urlencode 'q=a b'`).headers).toContainEqual({name:'Content-Type',value:'application/x-www-form-urlencoded'})
    expect(()=>parseCurl('curl https://example.com --data-urlencode q@secrets')).toThrow('File upload')
  })
  it('imports the exact generated POC body including shell-quoted apostrophes', () => {
    const body = { action: 'create_ticket', name: "O'Brien", text: 'line\nnext' }
    const request = parseCurl(curlCommand({ method: 'POST', url: 'https://example.com/hook', apiKey: 'demo', body }))
    expect(JSON.parse(request.body)).toEqual(body)
    expect(request.headers).toContainEqual({ name: 'Authorization', value: 'Bearer demo' })
  })
  it('infers POST and preserves escaped JSON', () => {
    expect(parseCurl('curl https://example.com --data-raw "{\\"action\\":\\"test\\"}"').body).toBe('{"action":"test"}')
    expect(parseCurl("curl https://example.com -d '{}' ").method).toBe('POST')
  })
  it('rejects unsupported file reads and multiple commands', () => {
    expect(() => parseCurl('curl https://example.com --data @secrets')).toThrow('File upload')
    expect(() => parseCurl('curl https://example.com; rm -rf /')).toThrow()
    expect(() => parseCurl("curl 'unterminated")).toThrow('Unclosed quote')
  })
})
