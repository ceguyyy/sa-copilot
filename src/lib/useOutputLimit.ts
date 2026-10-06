// The SA's last "Max output tokens" choice, remembered per browser so each AI run starts from it.
import { useState } from 'react'
import { parseOutputLimit } from '../../shared/outputLimit.ts'

const STORAGE_KEY = 'sa-copilot.max-output-tokens'

/** Options passed along with an AI run. `maxTokens` undefined = Auto (each job's default). */
export type AiRunOptions = { maxTokens?: number }

function read(): number | undefined {
  try {
    return parseOutputLimit(localStorage.getItem(STORAGE_KEY))
  } catch {
    return undefined // storage blocked
  }
}

export function useOutputLimit(): [number | undefined, (value: number | undefined) => void] {
  const [value, setValue] = useState<number | undefined>(read)
  const update = (next: number | undefined) => {
    setValue(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY, String(next))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // not remembered; still used for this run
    }
  }
  return [value, update]
}
