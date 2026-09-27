import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Paperclip, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { attachmentsApi } from '../lib/api'
import { ACCEPTED_FILES, extractText } from '../lib/extract'
import { FileChip } from './AttachFiles'
import { Button, ErrorNote, Field } from './ui'

interface Props {
  ownerKind: 'skill' | 'template'
  /** Undefined while the skill / format is not saved yet. */
  ownerId: string | undefined
}

/** Permanent reference files of a skill or format: the AI reads them every time it uses that skill / format. */
export function ReferenceFiles({ ownerKind, ownerId }: Props) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const key = ['reference-files', ownerKind, ownerId]
  const files = useQuery({ queryKey: key, queryFn: () => attachmentsApi.list(ownerKind, ownerId!), enabled: !!ownerId })
  const refresh = () => qc.invalidateQueries({ queryKey: key })

  const upload = useMutation({
    mutationFn: async (picked: File[]) => {
      for (const file of picked) {
        const extractedText = await extractText(file).catch(() => '')
        await attachmentsApi.upload({ file, extractedText, ownerKind, ownerId })
      }
    },
    onSettled: refresh,
  })
  const remove = useMutation({ mutationFn: attachmentsApi.remove, onSuccess: refresh })

  const what = ownerKind === 'skill' ? 'skill' : 'format'
  return (
    <Field label="Reference files" hint={`Examples, past documents or templates the AI reads every time it uses this ${what}. Converted to Markdown to save tokens.`}>
      {!ownerId ? (
        <p className="text-xs text-muted">Save the {what} first, then attach files.</p>
      ) : (
        <div className="space-y-2">
          {!!files.data?.length && (
            <ul className="divide-y divide-line rounded-md border border-line">
              {files.data.map((f) => (
                <li key={f.id} className="flex items-center gap-2 px-2 py-1.5">
                  <FileChip file={f} />
                  <span className="flex-1 font-mono text-[11px] text-muted">
                    {f.text_chars ? `${Math.round(f.text_chars / 1000)}k chars` : f.mime_type?.startsWith('image/') ? 'image' : 'no text'}
                  </span>
                  <button aria-label={`Remove ${f.name}`} className="rounded p-1 text-muted hover:bg-ember-soft hover:text-bad" onClick={() => remove.mutate(f.id)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" variant="outline" icon={<Paperclip className="size-4" />} loading={upload.isPending} onClick={() => input.current?.click()}>
            Add files
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept={ACCEPTED_FILES}
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (picked.length) upload.mutate(picked)
            }}
          />
          <ErrorNote error={files.error ?? upload.error ?? remove.error} />
        </div>
      )}
    </Field>
  )
}
