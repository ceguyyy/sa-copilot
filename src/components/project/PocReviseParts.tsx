import type { ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '../ui'
import { ChangeBlock } from './PocHistory'

export type RevisionChange = { label: string; before: string; after: string }

type PreviewProps = { label: string; changes: RevisionChange[]; onAccept: () => void; onDiscard: () => void }

/** The AI's proposed revision as a diff, with Accept / Discard. */
export function RevisionPreview({ label, changes, onAccept, onDiscard }: PreviewProps) {
  const hasChanges = changes.length > 0
  return (
    <div role="region" aria-label={`AI revision of ${label}`} className="space-y-3 rounded-lg border border-ember/50 bg-ember-soft/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">AI revision — {label}</p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" icon={<X className="size-4" />} onClick={onDiscard}>
            Discard
          </Button>
          {hasChanges && (
            <Button type="button" variant="primary" icon={<Check className="size-4" />} onClick={onAccept}>
              Accept
            </Button>
          )}
        </div>
      </div>
      {hasChanges ? changes.map((c) => <ChangeBlock key={c.label} change={c} />) : <p className="text-sm text-muted">The AI proposed no changes.</p>}
      {hasChanges && <p className="text-xs text-muted">Accept updates the draft only — press Save to keep it as a new version.</p>}
    </div>
  )
}

/** A field label with its "Revise with AI" action (a <label> would forward clicks to the button) and the revision preview. */
export function ReviseField({ label, action, preview, children }: { label: string; action: ReactNode; preview: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
        {action}
      </div>
      {children}
      {preview}
    </div>
  )
}

/** A POC section heading with its "Revise with AI" action. */
export function ReviseHeading({ title, action }: { title: string; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-display text-base font-semibold">{title}</h4>
      {action}
    </div>
  )
}
