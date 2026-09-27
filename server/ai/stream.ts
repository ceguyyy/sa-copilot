// NDJSON streaming response + mapping provider errors to readable messages.
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { config } from '../config.ts'

export type Stream = { send: (obj: unknown) => void }

export function streamResponse(run: (s: Stream) => Promise<void>): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      try {
        await run({ send })
      } catch (e) {
        console.error(e)
        send({ type: 'error', error: describeError(e) })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } })
}

const routerHint = () => (config.anthropic.baseURL ? ` at ${config.anthropic.baseURL} — is 9router running?` : '')

export function describeError(e: unknown): string {
  if (e instanceof Anthropic.RateLimitError || e instanceof OpenAI.RateLimitError) return 'Rate limit reached — try again in a minute, or pick another model.'
  if (e instanceof Anthropic.AuthenticationError || e instanceof OpenAI.AuthenticationError) return 'API key is invalid or missing (check ANTHROPIC_API_KEY in .env).'
  if (e instanceof Anthropic.APIConnectionError || e instanceof OpenAI.APIConnectionError) return `Cannot reach the AI endpoint${routerHint()}`
  if (e instanceof Anthropic.APIError || e instanceof OpenAI.APIError) return `AI API error ${e.status ?? ''}: ${e.message}`
  if (e instanceof Error) return e.message
  return 'Unexpected error'
}
