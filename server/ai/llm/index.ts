import { runAnthropic } from './anthropic.ts'
import { runOpenAI } from './openai.ts'
import { maxTokensFor } from './outputLimit.ts'
import type { RunRequest, RunResult } from './types.ts'
import { activityModel } from '../activity.ts'

/** Runs a request against the selected model in the wire format that model speaks. The SA's max output tokens
 * for this request (if any) replace the job's default. */
export function runModel(req: RunRequest): Promise<RunResult> {
  const withLimit = { ...req, maxTokens: maxTokensFor(req.maxTokens) }
  activityModel(req.model.id, { provider: req.model.provider, format: req.model.format, effort: req.effort ?? 'default', maxTokens: req.model.maxOutput ? Math.min(withLimit.maxTokens, req.model.maxOutput) : withLimit.maxTokens, attachmentCount: req.attachments.length })
  return withLimit.model.format === 'anthropic' ? runAnthropic(withLimit) : runOpenAI(withLimit)
}

export * from './types.ts'
export { cutOffMessage, maxTokensFor, withOutputLimit } from './outputLimit.ts'
