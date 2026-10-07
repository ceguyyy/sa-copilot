import { HttpError } from '../http.ts'

let busy = false
let writes = 0
export const maintenanceBusy = () => busy
export function beginWrite() {
  if (busy) throw new HttpError(503, 'Data is temporarily locked during an update or cloud sync')
  writes++
  return () => { writes-- }
}
export async function acquireExclusive(): Promise<() => void> {
  if (busy) throw new HttpError(409, 'An update or cloud sync is already running')
  busy = true
  try {
    const deadline = Date.now() + 30_000
    while (writes) {
      if (Date.now() > deadline) throw new HttpError(409, 'Wait for active requests to finish before running maintenance')
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    let released = false
    return () => { if (!released) { released = true; busy = false } }
  } catch (error) { busy = false; throw error }
}
export async function exclusive<T>(run: () => Promise<T>): Promise<T> {
  const release = await acquireExclusive()
  try { return await run() } finally { release() }
}
