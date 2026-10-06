import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, FileText, FolderOpen, PlugZap, RotateCw, Save } from 'lucide-react'
import { useState } from 'react'
import { desktop, type ConfigPatch, type DesktopStatus, type FolderKey, type SecretKey, type ValueKey } from '../lib/desktop'
import { Button, ErrorNote, Field, Input, Select } from './ui'
import { useResetState } from '../lib/useResetState'
import { ConnectionEnvImport } from './ConnectionEnvImport'
import { connectionsApi } from '../lib/api'

type FieldDef =
  | { kind: 'value'; key: ValueKey; label: string; placeholder?: string; hint?: string; effort?: boolean }
  | { kind: 'secret'; key: SecretKey; label: string; hint?: string }

type Section = { title: string; fields: FieldDef[] }

const FOLDER_LABELS: Record<FolderKey, string> = {
  data: 'Data root (everything below lives here)',
  database: 'Database',
  uploads: 'Uploaded files',
  backups: 'Automatic backups (before a restore)',
  logs: 'Logs',
  exports: 'Exported deliverables',
}

const SECTIONS: Section[] = [
  {
    title: 'AI',
    fields: [
      { kind: 'secret', key: 'routerApiKey', label: '9router API key (required)', hint: 'Create it in the 9router dashboard → API keys.' },
      {
        kind: 'value',
        key: 'aiBaseUrl',
        label: 'AI endpoint',
        placeholder: 'Empty = the 9router bundled with SA Copilot',
        hint: 'Another 9router, or https://api.anthropic.com to call Claude directly (then the key above is your Anthropic key).',
      },
      { kind: 'value', key: 'aiModel', label: 'Default model', placeholder: 'cc/claude-opus-5-5' },
      { kind: 'value', key: 'chatEffort', label: 'Chat effort', effort: true },
      { kind: 'value', key: 'generateEffort', label: 'Drafting effort', effort: true },
    ],
  },
  {
    title: 'Outline wiki',
    fields: [
      { kind: 'value', key: 'outlineApiUrl', label: 'Outline API URL', placeholder: 'https://wiki.cekat.ai/api' },
      { kind: 'secret', key: 'outlineApiKey', label: 'Outline API key' },
    ],
  },
  {
    title: 'Healthcare demo app',
    fields: [
      { kind: 'value', key: 'demoAppUrl', label: 'Demo app URL', placeholder: 'https://healthcare-demo-cekat.vercel.app/' },
      { kind: 'value', key: 'demoSupabaseUrl', label: 'Supabase REST URL', placeholder: 'https://<ref>.supabase.co/rest/v1' },
      { kind: 'secret', key: 'demoSupabaseKey', label: 'Supabase key' },
    ],
  },
  {
    title: 'Notion',
    fields: [
      { kind: 'secret', key: 'notionToken', label: 'Internal Integration Secret' },
      { kind: 'value', key: 'notionParentPage', label: 'Parent page link', placeholder: 'https://www.notion.so/…' },
    ],
  },
  {
    title: 'Supabase cloud backup and sync',
    fields: [
      { kind: 'secret', key: 'cloudDatabaseUrl', label: 'PostgreSQL Session pooler URL', hint: 'Copy from Supabase Connect. Includes the database password; encrypted on this device. Run db/supabase-sync.sql first.' },

    ],
  },
  {
    title: 'Folders',
    fields: [
      { kind: 'value', key: 'docsDir', label: 'Export folder', placeholder: 'Empty = Documents/SA Copilot' },
      { kind: 'value', key: 'deckTemplate', label: 'Pitch deck template (.pptx)', placeholder: 'Empty = bundled template' },
    ],
  },
]

/** Every former .env setting. Secrets are write-only: the field shows whether one is saved, never its value. */
export function ConnectionsForm({ requiredOnly = false, onSaved }: { requiredOnly?: boolean; onSaved?: (s: DesktopStatus) => void }) {
  const qc = useQueryClient()
  const configKey = desktop ? ['desktop-config'] : ['source-connections']
  const client = desktop ?? connectionsApi
  const status = useQuery({ queryKey: configKey, queryFn: () => client.getConfig() })
  const [values, setValues] = useResetState<Partial<Record<ValueKey, string>>>(status.data, () => status.data?.values ?? {}, {})
  const [secrets, setSecrets] = useState<Partial<Record<SecretKey, string>>>({})

  const save = useMutation({
    mutationFn: () => {
      const patch: ConfigPatch = { values, secrets: Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== undefined)) }
      return client.saveConfig(patch)
    },
    onSuccess: (s) => {
      setSecrets({})
      qc.setQueryData(configKey, s)
      void qc.invalidateQueries()
      onSaved?.(s)
    },
  })
  const test = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/models')
      const body = (await res.json()) as { models?: unknown[]; selected?: string; error?: string }
      if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`)
      return `${body.models?.length ?? 0} models available — selected ${body.selected}`
    },
  })
  const restartRouter = useMutation({
    mutationFn: () => desktop!.restartRouter(),
    onSuccess: (s) => qc.setQueryData(['desktop-config'], s),
  })

  if (!status.data) return <ErrorNote error={status.error} />
  const s = status.data
  const sections = requiredOnly ? SECTIONS.slice(0, 1) : SECTIONS

  const renderField = (f: FieldDef) => {
    if (f.kind === 'secret') {
      return (
        <Field key={f.key} label={f.label} hint={f.hint}>
          <Input
            type="password"
            autoComplete="off"
            value={secrets[f.key] ?? ''}
            placeholder={s.secretsSet[f.key] ? '•••••• saved — type to replace' : 'Not set'}
            onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })}
          />
          {s.secretsSet[f.key] && !requiredOnly && (
            <button type="button" className="text-xs text-bad hover:underline" onClick={() => setSecrets({ ...secrets, [f.key]: '' })}>
              Remove saved key on save
            </button>
          )}
        </Field>
      )
    }
    if (f.effort) {
      return (
        <Field key={f.key} label={f.label}>
          <Select value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
            <option value="">Default</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </Field>
      )
    }
    return (
      <Field key={f.key} label={f.label} hint={f.hint}>
        <Input value={values[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
      </Field>
    )
  }

  return (
    <div className="space-y-6">
      {!requiredOnly && <ConnectionEnvImport disabled={save.isPending} onApply={patch => {
        setValues(current => ({...current, ...patch.values}))
        setSecrets(current => ({...current, ...patch.secrets}))
        save.reset()
      }} />}
      {!requiredOnly && desktop && (
        <fieldset className="space-y-2 rounded-lg border border-line bg-panel p-4">
          <legend className="px-1 font-display text-base font-semibold">Where your data is stored</legend>
          <ul className="divide-y divide-line">
            {(Object.keys(FOLDER_LABELS) as FolderKey[]).map((key) => (
              <li key={key} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{FOLDER_LABELS[key]}</p>
                  <p className="truncate font-mono text-xs text-muted" title={s.folders[key]}>
                    {s.folders[key]}
                  </p>
                </div>
                <Button variant="ghost" icon={<FolderOpen className="size-4" />} onClick={() => void desktop!.openFolder(key)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">The export folder can be changed under Folders below; the data root is fixed per device and survives updates.</p>
        </fieldset>
      )}
      {sections.map((section) => (
        <fieldset key={section.title} className="space-y-3 rounded-lg border border-line bg-panel p-4">
          <legend className="px-1 font-display text-base font-semibold">{section.title}</legend>
          <div className="grid gap-3 md:grid-cols-2">{section.fields.map(renderField)}</div>
          {section.title === 'AI' && (
            <div className="flex flex-wrap gap-2">
              {s.routerDashboardUrl && (
                <Button variant="outline" icon={<ExternalLink className="size-4" />} onClick={() => void desktop!.openExternal(s.routerDashboardUrl)}>
                  Open 9router dashboard
                </Button>
              )}
              <Button variant="outline" icon={<PlugZap className="size-4" />} loading={test.isPending} onClick={() => test.mutate()}>
                Test connection
              </Button>
              {!requiredOnly && desktop && (
                <Button variant="ghost" icon={<RotateCw className="size-4" />} loading={restartRouter.isPending} onClick={() => restartRouter.mutate()}>
                  Restart AI router
                </Button>
              )}
              {test.data && <p className="w-full text-sm text-ok">{test.data}</p>}
              <ErrorNote error={test.error ?? restartRouter.error} />
            </div>
          )}
        </fieldset>
      ))}
      <ErrorNote error={save.error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          icon={<Save className="size-4" />}
          loading={save.isPending}
          disabled={requiredOnly && !s.secretsSet.routerApiKey && !secrets.routerApiKey}
          onClick={() => save.mutate()}
        >
          {requiredOnly ? 'Save and continue' : 'Save'}
        </Button>
        <span className="text-xs text-muted">{desktop ? 'Saving restarts the SA Copilot server (a few seconds).' : 'Saving updates the server .env file. Restart the SA Copilot server to apply changes.'}</span>
        {save.isSuccess && !desktop && <p role="status" className="w-full text-sm text-ok">Connections saved to .env. Restart the server before testing the new connections.</p>}
        {!requiredOnly && desktop && (
          <Button variant="ghost" icon={<FileText className="size-4" />} onClick={() => void desktop!.openLogs()}>
            Open logs
          </Button>
        )}
      </div>
    </div>
  )
}
