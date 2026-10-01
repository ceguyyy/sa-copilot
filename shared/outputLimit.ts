// Max output tokens the SA picks for one AI generation ("Auto" = each job's own default).

export const OUTPUT_LIMIT_OPTIONS = [8000, 16000, 32000, 64000, 128000] as const

const MIN_OUTPUT_TOKENS = 1024
const MAX_OUTPUT_TOKENS = 128000

/** A valid limit, or undefined for "use the job's default". */
export function parseOutputLimit(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n) || n < MIN_OUTPUT_TOKENS || n > MAX_OUTPUT_TOKENS) return undefined
  return n
}

export const formatTokens = (n: number) => `${Number((n / 1000).toFixed(1))}k`
