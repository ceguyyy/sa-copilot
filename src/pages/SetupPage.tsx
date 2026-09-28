import { ConnectionsForm } from '../components/ConnectionsForm'

/** First run of the desktop app: the only required setting is the 9router API key. Everything else lives in Settings → Connections. */
export function SetupPage({ onDone }: { onDone: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-ember">Welcome</p>
        <h1 className="font-display text-3xl font-semibold">Set up SA Copilot</h1>
        <p className="text-sm text-muted">
          Open the 9router dashboard, sign in to your AI provider, create an API key and paste it below. Outline, Notion, the demo app and folders can be set
          later in Settings → Connections.
        </p>
      </header>
      <ConnectionsForm requiredOnly onSaved={(s) => s.configured && onDone()} />
    </div>
  )
}
