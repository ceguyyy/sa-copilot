import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { DocType } from '../../shared/schemas.ts'
import { generate } from './ai'

export interface GenerateParams {
  docType: DocType
  documentId?: string
  skillId?: string
  instruction?: string
  diagramKind?: string
  templateId?: string
  attachmentIds?: string[]
}

/** Runs AI generation with progress + refreshes every cache the new version touches. */
export function useGenerate(projectId: string) {
  const qc = useQueryClient()
  const [running, setRunning] = useState<DocType | null>(null)
  const [chars, setChars] = useState(0)
  const [error, setError] = useState<unknown>(null)
  /** What the AI is doing right now, e.g. "Searching cekat docs: broadcast". */
  const [activity, setActivity] = useState('')

  async function run(params: GenerateParams) {
    setRunning(params.docType)
    setChars(0)
    setError(null)
    setActivity('')
    try {
      const done = await generate({ projectId, ...params }, setChars, setActivity)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['documents', projectId] }),
        qc.invalidateQueries({ queryKey: ['versions', done.documentId] }),
        qc.invalidateQueries({ queryKey: ['files', projectId] }),
      ])
      return done
    } catch (e) {
      setError(e)
      return null
    } finally {
      setRunning(null)
      setActivity('')
    }
  }

  return { run, running, chars, error, activity }
}
