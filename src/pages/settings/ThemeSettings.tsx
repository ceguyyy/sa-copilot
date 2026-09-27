import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, Monitor, Moon, Save, Sun, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { themeProblems, type Palette, type Theme, type ThemeMode } from '../../../shared/theme.ts'
import { AssistantChat } from '../../components/AssistantChat'
import { Button, ErrorNote, Spinner } from '../../components/ui'
import { themeApi, type ThemeSettings as Settings } from '../../lib/api'
import { resolveMode, setThemePreview } from '../../lib/theme'

const MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

const STARTERS = [
  'Biru navy korporat dengan aksen emas, kesan premium',
  'Hijau tosca segar seperti brand Cekat',
  'Minimalis monokrom dengan aksen ungu',
  'Hangat dan lembut: krem, cokelat kopi, aksen terracotta',
]

/** What the AI sees as the starting point (without the internal id). */
const toCurrent = (t: Theme | undefined): Record<string, unknown> => (t ? { name: t.name, light: t.light, dark: t.dark } : {})

/** Four swatches that show a palette at a glance: page, card, primary, accent. */
function Swatch({ palette }: { palette: Palette }) {
  return (
    <div className="flex h-12 overflow-hidden rounded-md border" style={{ borderColor: palette.line, background: palette.paper }}>
      <div className="w-1/4" style={{ background: palette.forest }} />
      <div className="flex flex-1 flex-col justify-center gap-1 px-2" style={{ background: palette.panel }}>
        <div className="h-1.5 w-3/4 rounded" style={{ background: palette.ink }} />
        <div className="h-1.5 w-1/2 rounded" style={{ background: palette.muted }} />
      </div>
      <div className="w-1/5" style={{ background: palette.ember }} />
    </div>
  )
}

function ThemeCard({ theme, scheme, active, onPick, onDelete }: { theme: Theme; scheme: 'light' | 'dark'; active: boolean; onPick: () => void; onDelete?: () => void }) {
  return (
    <li className="relative">
      <button
        onClick={onPick}
        aria-pressed={active}
        className={clsx(
          'w-full space-y-2 rounded-lg border bg-panel p-2 text-left transition',
          active ? 'border-ember ring-2 ring-ember/40' : 'border-line hover:border-forest',
        )}
      >
        <Swatch palette={theme[scheme]} />
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {active && <Check className="size-3.5 text-ember" />}
          {theme.name}
        </span>
      </button>
      {onDelete && (
        <button
          aria-label={`Delete ${theme.name}`}
          title="Delete theme"
          onClick={onDelete}
          className="absolute top-3 right-3 rounded bg-panel/90 p-1 text-muted hover:text-bad"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </li>
  )
}

/** Light / dark / system mode, preset and saved themes, and an AI designer for new themes. */
export function ThemeSettings() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['theme'], queryFn: themeApi.get })
  const [draft, setDraft] = useState<Theme | null>(null)
  const put = (data: Settings) => qc.setQueryData(['theme'], data)
  const refresh = () => qc.invalidateQueries({ queryKey: ['theme'] })

  // The AI proposal is shown live across the whole app until it is saved or discarded.
  useEffect(() => {
    setThemePreview(draft)
    return () => setThemePreview(null)
  }, [draft])

  const update = useMutation({
    mutationFn: themeApi.update,
    onSuccess: (data) => put({ ...data, presets: settings.data?.presets ?? [] }),
  })
  const save = useMutation({
    mutationFn: (t: Theme) => themeApi.save({ name: t.name, light: t.light, dark: t.dark }),
    onSuccess: () => {
      setDraft(null)
      return refresh()
    },
  })
  const remove = useMutation({ mutationFn: themeApi.remove, onSuccess: refresh })

  if (settings.isLoading) return <Spinner />
  const s = settings.data
  if (!s) return <ErrorNote error={settings.error} />

  const scheme = resolveMode(s.mode)
  const draftProblems = draft ? themeProblems(draft) : []

  function applyProposal(data: Record<string, unknown>) {
    const theme = { id: 'draft', name: typeof data.name === 'string' ? data.name : 'AI theme', light: data.light, dark: data.dark } as Theme
    if (!themeProblems(theme).some((p) => p.includes('must be #rrggbb'))) setDraft(theme)
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="font-display text-lg font-semibold">Mode</h3>
        <div className="inline-flex rounded-md border border-line bg-panel p-0.5" role="radiogroup" aria-label="Color mode">
          {MODES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              role="radio"
              aria-checked={s.mode === value}
              onClick={() => update.mutate({ mode: value })}
              className={clsx('flex items-center gap-1.5 rounded px-3 py-1.5 text-sm', s.mode === value ? 'bg-forest text-paper' : 'text-muted hover:text-ink')}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        {s.mode === 'system' && <p className="text-xs text-muted">Follows Windows: currently {scheme}.</p>}
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-semibold">Themes</h3>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {s.presets.map((t) => (
            <ThemeCard key={t.id} theme={t} scheme={scheme} active={!draft && s.activeId === t.id} onPick={() => (setDraft(null), update.mutate({ activeId: t.id }))} />
          ))}
          {s.custom.map((t) => (
            <ThemeCard
              key={t.id}
              theme={t}
              scheme={scheme}
              active={!draft && s.activeId === t.id}
              onPick={() => (setDraft(null), update.mutate({ activeId: t.id }))}
              onDelete={() => confirm(`Delete theme "${t.name}"?`) && remove.mutate(t.id)}
            />
          ))}
        </ul>
        <ErrorNote error={update.error ?? remove.error} />
      </section>

      {draft && (
        <section className="space-y-3 rounded-xl border border-ember/40 bg-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              Previewing <strong>{draft.name}</strong> — the whole app uses it until you save or discard.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" icon={<X className="size-4" />} onClick={() => setDraft(null)}>
                Discard
              </Button>
              <Button icon={<Save className="size-4" />} loading={save.isPending} disabled={draftProblems.length > 0} onClick={() => save.mutate(draft)}>
                Save theme
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['light', 'dark'] as const).map((m) => (
              <div key={m} className="space-y-1">
                <p className="font-mono text-[11px] uppercase text-muted">{m}</p>
                <Swatch palette={draft[m]} />
              </div>
            ))}
          </div>
          {draftProblems.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-warn">
              {draftProblems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <ErrorNote error={save.error} />
        </section>
      )}

      <AssistantChat
        kind="theme"
        current={toCurrent(draft ?? [...s.presets, ...s.custom].find((t) => t.id === s.activeId))}
        onProposal={applyProposal}
        placeholder="Tema seperti apa? (warna brand, suasana, contoh…)"
        starters={STARTERS}
        intro="Describe the look you want. The AI designs a light and a dark palette, checks that text stays readable, and previews it live."
        appliedNote="Theme previewed across the app — save it above, or keep chatting to tweak it."
      />
    </div>
  )
}
