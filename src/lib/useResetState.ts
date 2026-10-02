import { useState, type Dispatch, type SetStateAction } from 'react'

/**
 * Editable local state seeded from server data, and re-seeded whenever `source` changes (compared with Object.is).
 * A null/undefined source keeps the current state. This is React's "adjust state while rendering" pattern: the
 * reset happens before the render commits, instead of one render late as with setState in an effect.
 */
export function useResetState<T>(source: unknown, seed: () => T, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => (source == null ? fallback : seed()))
  const [seen, setSeen] = useState<unknown>(() => source)
  if (!Object.is(seen, source)) {
    setSeen(() => source)
    if (source != null) setState(seed)
  }
  return [state, setState]
}
