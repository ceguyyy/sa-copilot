import { useLanguages } from '../lib/useLanguages'
import { Select } from './ui'

interface Props {
  /** Empty = not chosen yet; the main language is shown and used. */
  value: string
  onChange: (language: string) => void
  className?: string
}

/** Dropdown of the languages managed in Settings → Languages. */
export function LanguageSelect({ value, onChange, className }: Props) {
  const languages = useLanguages()
  const items = languages.data?.items ?? []
  const shown = value || languages.data?.main || ''
  // A project may use a language that was later removed from the list; keep it selectable.
  const options = shown && !items.includes(shown) ? [...items, shown] : items

  return (
    <Select
      aria-label="Language"
      title="The AI writes this project's documents and replies in this language"
      className={className}
      value={shown}
      disabled={!languages.data}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((l) => (
        <option key={l} value={l}>
          {l}
          {l === languages.data?.main ? ' ★' : ''}
          {!items.includes(l) ? ' (removed)' : ''}
        </option>
      ))}
    </Select>
  )
}
