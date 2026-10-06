import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { authApi } from '../lib/api'
import { Button, ErrorNote, Field, Input } from './ui'
import { RecoveryCode } from './RecoveryCode'

export function AccountRecovery() {
  const [password, setPassword] = useState('')
  const generate = useMutation({ mutationFn: () => authApi.recoveryCode(password), onSuccess: () => setPassword('') })
  return <section className="space-y-4">
    <div className="flex items-start gap-3">
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-forest" />
      <div><h3 className="font-semibold">Account recovery</h3><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">Create a single-use recovery code in case you forget your password. Generating a new code invalidates the previous one.</p></div>
    </div>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); generate.mutate() }}>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-sm"><Field label="Current password"><Input type="password" autoComplete="current-password" placeholder="Enter your current password" required minLength={12} maxLength={128} disabled={generate.isPending} value={password} onChange={e => setPassword(e.target.value)} /></Field></div>
        <Button className="min-h-9 shrink-0" type="submit" variant="outline" icon={<KeyRound className="size-4" />} loading={generate.isPending}>Generate recovery code</Button>
      </div>
      <ErrorNote error={generate.error} />
    </form>
    {generate.data && <RecoveryCode code={generate.data.recoveryCode} />}
  </section>
}
