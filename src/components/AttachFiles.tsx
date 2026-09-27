import { FileText, Image as ImageIcon, Loader2, Paperclip, X } from 'lucide-react'
import { useRef } from 'react'
import type { AttachedFile } from '../lib/api'
import { ACCEPTED_FILES } from '../lib/extract'
import type { RequestFiles } from '../lib/useRequestFiles'

export function FileChip({ file, onRemove }: { file: Pick<AttachedFile, 'name' | 'mime_type'>; onRemove?: () => void }) {
  const Icon = file.mime_type?.startsWith('image/') ? ImageIcon : FileText
  return (
    <span className="inline-flex max-w-56 items-center gap-1 rounded-full border border-line bg-panel py-0.5 pr-1 pl-2 text-[11px] text-ink">
      <Icon className="size-3 shrink-0 text-muted" />
      <span className="truncate" title={file.name}>
        {file.name}
      </span>
      {onRemove && (
        <button type="button" aria-label={`Remove ${file.name}`} onClick={onRemove} className="rounded-full p-0.5 text-muted hover:bg-ember-soft hover:text-bad">
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

/** Paperclip button + chips of the files attached to the next request. */
export function AttachFiles({ state, disabled }: { state: RequestFiles; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        title="Attach files to this request (PDF, Word, Excel, PowerPoint, images…)"
        disabled={disabled || state.uploading}
        onClick={() => input.current?.click()}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted transition hover:bg-forest-soft hover:text-forest disabled:opacity-50"
      >
        {state.uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
        {state.files.length === 0 && 'Attach'}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ACCEPTED_FILES}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (picked.length) state.add(picked)
        }}
      />
      {state.files.map((f) => (
        <FileChip key={f.id} file={f} onRemove={disabled ? undefined : () => state.remove(f.id)} />
      ))}
      {state.error ? <span className="text-[11px] text-bad">{(state.error as Error).message}</span> : null}
    </div>
  )
}
