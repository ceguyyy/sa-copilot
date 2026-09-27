import { useState } from 'react'
import { attachmentsApi, type AttachedFile } from './api'
import { extractText } from './extract'

const MAX_FILES = 10

/** One-off files for a single AI request: upload on pick, send their ids with the request, then clear. */
export function useRequestFiles() {
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<unknown>(null)

  async function add(picked: File[]) {
    setError(null)
    const room = MAX_FILES - files.length
    if (picked.length > room) setError(new Error(`Up to ${MAX_FILES} files per request`))
    for (const file of picked.slice(0, Math.max(room, 0))) {
      setUploading((n) => n + 1)
      try {
        // Browser text is only a fallback; the server converts with markitdown.
        const extractedText = await extractText(file).catch(() => '')
        const saved = await attachmentsApi.upload({ file, extractedText, ownerKind: 'request' })
        setFiles((prev) => [...prev, saved])
      } catch (e) {
        setError(e)
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  function remove(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
    attachmentsApi.remove(id).catch(() => {}) // leftovers are purged by the server anyway
  }

  return { files, ids: files.map((f) => f.id), add, remove, clear: () => setFiles([]), uploading: uploading > 0, error }
}

export type RequestFiles = ReturnType<typeof useRequestFiles>
