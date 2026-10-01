// The max output tokens the SA picked for one AI request. Set once per HTTP request and read by runModel,
// so every endpoint and every model call inside it (retries, parallel workflows) honours the choice.
import { AsyncLocalStorage } from 'node:async_hooks'
import { formatTokens, parseOutputLimit } from '../../../shared/outputLimit.ts'

const chosen = new AsyncLocalStorage<number | undefined>()

/** Runs `fn` with the limit from the request body's `maxTokens` (absent or invalid = each job's default). */
export function withOutputLimit<T>(body: unknown, fn: () => T): T {
  const raw = body && typeof body === 'object' ? (body as { maxTokens?: unknown }).maxTokens : undefined
  return chosen.run(parseOutputLimit(raw), fn)
}

/** The SA's choice for this request, or the job's own default. */
export const maxTokensFor = (jobDefault: number): number => chosen.getStore() ?? jobDefault

/** Readable error when an answer hit the output limit (the model's own cap can be lower than the choice). */
export function cutOffMessage(what: string, jobDefault: number, modelMaxOutput: number | null, hint = 'or ask for a shorter result'): string {
  const limit = Math.min(maxTokensFor(jobDefault), modelMaxOutput ?? Infinity)
  const capped = modelMaxOutput !== null && modelMaxOutput < maxTokensFor(jobDefault) ? ' (this model cannot write more — pick another model)' : ''
  return `${what} was cut off at ${formatTokens(limit)} output tokens${capped} — run it again with a higher "Max output tokens", ${hint}.`
}
