import { runAnthropic } from './anthropic.ts'
import { runOpenAI } from './openai.ts'
import type { RunRequest, RunResult } from './types.ts'

/** Runs a request against the selected model in the wire format that model speaks. */
export function runModel(req: RunRequest): Promise<RunResult> {
  return req.model.format === 'anthropic' ? runAnthropic(req) : runOpenAI(req)
}

export * from './types.ts'
