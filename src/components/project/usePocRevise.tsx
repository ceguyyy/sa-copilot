import { useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AiDraftButton } from '../AiDraftButton'
import { AiJobStatus } from '../AiJobStatus'
import { ErrorNote } from '../ui'
import { RevisionPreview, type RevisionChange } from './PocReviseParts'
import { revisePoc, type PocRevision } from '../../lib/ai'
import { pocChanges } from '../../../shared/pocDiff.ts'
import { fieldText, isSameTarget, reviseTargetLabel, withFieldText, type PocReviseTarget } from '../../../shared/pocRevise.ts'
import type { PocConfig } from '../../lib/types'

type Pending = { target: PocReviseTarget; label: string; revision: PocRevision; changes: RevisionChange[]; resetKey: string }

type Options = {
  pocId: string | undefined
  draft: PocConfig
  setDraft: React.Dispatch<React.SetStateAction<PocConfig>>
  /** Another POC or a new server version: a proposal made for the old draft no longer applies. */
  resetKey: string
  isDisabled?: boolean
}

const PLACEHOLDER = 'e.g. lebih formal, tambahkan aturan refund, pakai nama persona Agata… (kosong = rapikan & lengkapi)'

function applyRevision(config: PocConfig, target: PocReviseTarget, revision: PocRevision): PocConfig {
  if (revision.kind === 'field' && target.kind === 'field') return withFieldText(config, target, revision.text)
  return revision.kind === 'section' ? { ...config, ...revision.patch } : config
}

function previewChanges(base: PocConfig, target: PocReviseTarget, label: string, revision: PocRevision): RevisionChange[] {
  if (revision.kind === 'field' && target.kind === 'field') {
    const before = fieldText(base, target)
    return before === revision.text ? [] : [{ label, before, after: revision.text }]
  }
  return pocChanges(base, applyRevision(base, target, revision))
}

/** "Revise with AI" for POC sections and text fields: the AI proposes, the SA reviews the diff, then accepts or discards. */
export function usePocRevise({ pocId, draft, setDraft, resetKey, isDisabled }: Options) {
  const [proposal, setPending] = useState<Pending | null>(null)
  const [status, setStatus] = useState('')
  const [startedAt, setStartedAt] = useState(0)
  const pending = proposal?.resetKey === resetKey ? proposal : null

  const mutation = useMutation({
    mutationFn: async ({ target, instruction, maxTokens }: { target: PocReviseTarget; instruction: string; maxTokens?: number }): Promise<Pending> => {
      if (!pocId) throw new Error('Select a POC first')
      const base = draft
      const label = reviseTargetLabel(base, target)
      setPending(null)
      setStartedAt(Date.now())
      setStatus('Reading project sources…')
      const revision = await revisePoc(
        // The welcome image is never revised and can be a large embedded file.
        { pocId, config: { ...base, welcomeImage: null }, target, instruction: instruction || undefined, maxTokens },
        { onProgress: (c) => setStatus(`Revising ${label}… ${c.toLocaleString()} chars`), onTool: setStatus },
      )
      return { target, label, revision, changes: previewChanges(base, target, label, revision), resetKey }
    },
    onSuccess: setPending,
    onSettled: () => setStatus(''),
  })

  const isBusy = mutation.isPending || !!isDisabled
  const isRunning = (target: PocReviseTarget) => mutation.isPending && isSameTarget(mutation.variables?.target, target)

  const accept = () => {
    if (!pending) return
    setDraft((prev) => applyRevision(prev, pending.target, pending.revision))
    setPending(null)
  }

  const button = (target: PocReviseTarget, opts: { iconOnly?: boolean } = {}): ReactNode => (
    <AiDraftButton
      label={target.kind === 'section' ? 'Revise with AI' : `Revise ${reviseTargetLabel(draft, target)} with AI`}
      iconOnly={opts.iconOnly}
      runLabel="Revise"
      placeholder={PLACEHOLDER}
      isLoading={isRunning(target)}
      isDisabled={isBusy}
      onRun={(instruction, { maxTokens }) => mutation.mutate({ target, instruction, maxTokens })}
    />
  )

  const preview = (target: PocReviseTarget): ReactNode => {
    if (isRunning(target)) return status && <AiJobStatus text={status} startedAt={startedAt} />
    if (mutation.isError && isSameTarget(mutation.variables?.target, target)) return <ErrorNote error={mutation.error} />
    if (!pending || !isSameTarget(pending.target, target)) return null
    return <RevisionPreview label={pending.label} changes={pending.changes} onAccept={accept} onDiscard={() => setPending(null)} />
  }

  /** Runs a revision with a ready-made instruction (e.g. from a QA report); the preview shows where `preview(target)` is rendered. */
  const run = (target: PocReviseTarget, instruction: string) => mutation.mutate({ target, instruction })

  return { button, preview, run, isBusy }
}
