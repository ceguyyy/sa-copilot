import { OUTPUT_LIMIT_OPTIONS, formatTokens, parseOutputLimit } from '../../shared/outputLimit.ts'

type Props = {
  value: number | undefined
  onChange: (value: number | undefined) => void
  className?: string
}

/** "Max output tokens" for one AI run. Thinking counts too; the model's own cap still applies. */
export function MaxTokensSelect({ value, onChange, className }: Props) {
  return (
    <label className={`flex items-center justify-between gap-2 ${className ?? ''}`}>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted" title="Includes the model's thinking. Raise it when a result gets cut off; lower it for faster, shorter answers.">
        Max output tokens
      </span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(parseOutputLimit(e.target.value))}
        className="rounded-md border border-line bg-paper px-2 py-1 text-sm focus:border-forest focus:outline-none"
      >
        <option value="">Auto</option>
        {OUTPUT_LIMIT_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {formatTokens(n)}
          </option>
        ))}
      </select>
    </label>
  )
}
