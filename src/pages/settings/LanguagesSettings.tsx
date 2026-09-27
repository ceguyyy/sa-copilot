import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Plus, Save, Star, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button, ErrorNote, Input, Spinner } from '../../components/ui'
import { languagesApi, type LanguageSettings } from '../../lib/api'
import { useLanguages } from '../../lib/useLanguages'

/** CRUD for the project language dropdown, with one main language used by default for new projects. */
export function LanguagesSettings() {
  const qc = useQueryClient()
  const languages = useLanguages()
  const [draft, setDraft] = useState<LanguageSettings | null>(null)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (languages.data) setDraft(languages.data)
  }, [languages.data])

  const save = useMutation({
    mutationFn: languagesApi.save,
    onSuccess: (data) => qc.setQueryData(['languages'], data),
  })

  if (languages.isLoading || !draft) return languages.error ? <ErrorNote error={languages.error} /> : <Spinner />

  const dirty = JSON.stringify(draft) !== JSON.stringify(languages.data)
  const duplicate = (name: string, except: number) => draft.items.some((l, i) => i !== except && l.trim().toLowerCase() === name.trim().toLowerCase())

  function rename(index: number, name: string) {
    const old = draft!.items[index]
    setDraft({ items: draft!.items.map((l, i) => (i === index ? name : l)), main: draft!.main === old ? name : draft!.main })
  }

  function remove(index: number) {
    const items = draft!.items.filter((_, i) => i !== index)
    setDraft({ items, main: draft!.items[index] === draft!.main ? (items[0] ?? '') : draft!.main })
  }

  function add(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name || duplicate(name, -1)) return
    setDraft({ ...draft!, items: [...draft!.items, name] })
    setNewName('')
  }

  return (
    <div className="max-w-2xl space-y-4">
      <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
        {draft.items.map((lang, i) => {
          const isMain = lang === draft.main
          return (
            <li key={i} className="flex items-center gap-2 p-2">
              <Input aria-label={`Language ${i + 1}`} maxLength={40} value={lang} onChange={(e) => rename(i, e.target.value)} className={clsx('flex-1', duplicate(lang, i) && 'border-bad')} />
              <button
                type="button"
                role="switch"
                aria-checked={isMain}
                title={isMain ? 'Main language (default for new projects)' : 'Make this the main language'}
                onClick={() => setDraft({ ...draft, main: lang })}
                className={clsx(
                  'flex w-24 shrink-0 items-center justify-center gap-1 rounded-full border px-2 py-1 text-xs transition',
                  isMain ? 'border-ember bg-ember text-paper' : 'border-line text-muted hover:border-ember hover:text-ember',
                )}
              >
                <Star className={clsx('size-3', isMain && 'fill-current')} /> {isMain ? 'Main' : 'Set main'}
              </button>
              <button
                type="button"
                aria-label={`Delete ${lang}`}
                title={draft.items.length === 1 ? 'Keep at least one language' : 'Delete (projects using it keep their language)'}
                disabled={draft.items.length === 1}
                onClick={() => remove(i)}
                className="rounded p-1.5 text-muted hover:bg-ember-soft hover:text-bad disabled:opacity-40"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          )
        })}
      </ul>

      <form onSubmit={add} className="flex gap-2">
        <Input placeholder="Add a language, e.g. Español" maxLength={40} value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" />
        <Button type="submit" variant="outline" icon={<Plus className="size-4" />} disabled={!newName.trim() || duplicate(newName, -1)}>
          Add
        </Button>
      </form>

      <ErrorNote error={save.error} />
      <div className="flex gap-2 border-t border-line pt-4">
        <Button icon={<Save className="size-4" />} loading={save.isPending} disabled={!dirty} onClick={() => save.mutate({ items: draft.items.map((l) => l.trim()), main: draft.main.trim() })}>
          Save
        </Button>
        <Button variant="ghost" icon={<Undo2 className="size-4" />} disabled={!dirty} onClick={() => setDraft(languages.data!)}>
          Discard
        </Button>
      </div>
    </div>
  )
}
