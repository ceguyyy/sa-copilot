import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

type Variant = 'primary' | 'ai' | 'ghost' | 'danger' | 'outline'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-forest text-paper hover:brightness-110 active:brightness-95 shadow-[0_1px_0_rgba(0,0,0,.15)]',
  ai: 'bg-ember text-paper hover:brightness-110 active:brightness-95 shadow-[0_2px_0_color-mix(in_oklab,var(--ember)_55%,black)]',
  ghost: 'text-ink hover:bg-forest-soft',
  outline: 'border border-line bg-panel text-ink hover:border-forest',
  danger: 'text-bad hover:bg-ember-soft',
}

export function Button({
  variant = 'primary',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

const fieldCls =
  'w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-forest focus:outline-none'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(fieldCls, props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(fieldCls, 'leading-relaxed', props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(fieldCls, 'pr-8', props.className)} />
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-xl border border-line bg-panel', className)}>{children}</div>
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'forest' | 'ember' | 'warn' | 'ok'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-line/60 text-muted',
    forest: 'bg-forest-soft text-forest',
    ember: 'bg-ember-soft text-ember',
    warn: 'bg-ember-soft text-warn',
    ok: 'bg-forest-soft text-ok',
  }
  return <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide', tones[tone])}>{children}</span>
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" /> {label ?? 'Loading…'}
    </div>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <div role="alert" className="rounded-md border border-bad/30 bg-ember-soft px-3 py-2 text-sm text-bad">
      {error instanceof Error ? error.message : String(error)}
    </div>
  )
}

export function PageHeader({ kicker, title, actions }: { kicker?: string; title: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        {kicker && <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember">{kicker}</p>}
        <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
