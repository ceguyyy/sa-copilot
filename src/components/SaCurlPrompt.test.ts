import { describe, expect, it } from 'vitest'
import { checkGeneratedCurl } from './SaCurlPrompt'

describe('checkGeneratedCurl', () => {
  it('accepts an importable command', () => {
    const curl = `curl -X POST '{{baseUrl}}/orders' -H 'Content-Type: application/json' --data-raw '{"name":"Budi"}'`
    expect(checkGeneratedCurl({ curl: `  ${curl}\n`, explanation: 'ok' })).toEqual({ curl, problem: '' })
  })

  it('passes on the AI explanation when no command came back', () => {
    expect(checkGeneratedCurl({ curl: '', explanation: 'Which endpoint do you mean?' })).toEqual({ curl: '', problem: 'Which endpoint do you mean?' })
    expect(checkGeneratedCurl({ curl: ' ', explanation: '' }).problem).toMatch(/did not return a cURL/)
  })

  it('keeps a command that does not parse, with a warning to check it', () => {
    const result = checkGeneratedCurl({ curl: 'wget https://example.com', explanation: '' })
    expect(result.curl).toBe('wget https://example.com')
    expect(result.problem).toMatch(/^Check the generated command/)
  })
})
