import { Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button, ErrorNote, Field, Input } from '../components/ui'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    setLoading(false)
    if (err) setError(err)
    else setSent(true)
  }

  return (
    <div className="grid min-h-screen md:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-forest p-12 text-paper md:flex md:flex-col md:justify-between">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-paper/60">Cekat · Presales Workbench</p>
        <div>
          <h1 className="font-display text-6xl leading-[0.95] font-semibold">
            From client brief
            <br />
            to signed <em className="text-ember">SOW</em>.
          </h1>
          <p className="mt-6 max-w-md text-paper/70">
            Requirement → Assessment → TOR → Timeline → SOW. Every draft versioned, every flow diagrammed.
          </p>
        </div>
        <ol className="grid grid-cols-5 gap-2 font-mono text-[10px] uppercase tracking-wider text-paper/50">
          {['Assess', 'TOR', 'Timeline', 'SOW', 'Onboard'].map((s, i) => (
            <li key={s} className="border-t border-paper/30 pt-2">
              <span className="text-ember">0{i + 1}</span> {s}
            </li>
          ))}
        </ol>
      </section>
      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <h2 className="font-display text-3xl font-semibold">Sign in</h2>
          {sent ? (
            <p className="rounded-md border border-line bg-panel p-4 text-sm">
              Magic link sent to <strong>{email}</strong>. Open it on this device to continue.
            </p>
          ) : (
            <>
              <Field label="Work email">
                <Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@cekat.ai" />
              </Field>
              <ErrorNote error={error} />
              <Button type="submit" loading={loading} icon={<Mail className="size-4" />} className="w-full py-2">
                Send magic link
              </Button>
            </>
          )}
        </form>
      </section>
    </div>
  )
}
