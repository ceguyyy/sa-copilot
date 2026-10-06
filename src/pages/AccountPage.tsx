import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../lib/api'
import { Button, Card, ErrorNote, Field, Input } from '../components/ui'
import { ConnectionsForm } from '../components/ConnectionsForm'
import { RecoveryCode } from '../components/RecoveryCode'
import { desktop } from '../lib/desktop'

export function AccountPage({ configured, onDone, onRecoveryPending }: { configured: boolean; onDone: () => void; onRecoveryPending: () => void }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newCode, setNewCode] = useState('')
  const [message, setMessage] = useState('')
  const finish = () => { qc.clear(); onDone() }
  const submit = useMutation({
    mutationFn: async () => {
      if (mode === 'reset') {
        if (password !== confirmPassword) throw new Error('Passwords do not match')
        return authApi.resetPassword(email, recoveryCode.trim(), password)
      }
      return (mode === 'register' ? authApi.register : authApi.login)(email, password)
    },
    onSuccess: data => {
      setPassword(''); setConfirmPassword(''); setRecoveryCode('')
      if ('message' in data) { setMessage(data.message); setMode('login'); return }
      if ('recoveryCode' in data) { onRecoveryPending(); setNewCode(String(data.recoveryCode)); return }
      finish()
    },
  })
  const changeMode = (next: typeof mode) => { setMode(next); setPassword(''); setConfirmPassword(''); setRecoveryCode(''); setMessage(''); submit.reset() }
  return <main className="mx-auto max-w-xl space-y-5 p-8">
    <h1 className="font-display text-3xl font-semibold">SA Copilot v2.0.1</h1>
    <p className="text-sm text-muted">Sign in or create an account to connect your cloud data and backups. Use the same account on another computer to restore your workspace.</p>
    <p className="text-sm text-muted">Existing local data will be linked to the first account that signs in. Each installation profile can only be used by one account.</p>
    {!configured && <Card className="space-y-3 p-5">
      <p>Configure your cloud connection first.</p>
      {desktop ? <ConnectionsForm onSaved={() => { void qc.invalidateQueries({ queryKey: ['account'] }) }} /> : <p className="text-sm text-muted">Set CLOUD_DATABASE_URL in .env, run db/supabase-sync.sql in Supabase, then restart the server.</p>}
    </Card>}
    <Card className="space-y-4 p-5">
      {newCode ? <><RecoveryCode code={newCode} /><Button onClick={finish}>I have saved my code, continue</Button></> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit.mutate() }}>
        <h2 className="text-lg font-semibold">{mode === 'register' ? 'Create an account' : mode === 'reset' ? 'Reset password' : 'Sign in'}</h2>
        {mode === 'reset' && <p className="text-sm text-muted">Enter your saved recovery code. Resetting your password keeps the same account and backups. The code cannot be reused after a successful reset.</p>}
        {message && <p className="text-sm text-ok" role="status">{message}</p>}
        <Field label="Email"><Input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
        {mode === 'reset' && <Field label="Recovery code"><Input autoComplete="off" required minLength={43} maxLength={43} value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} /></Field>}
        <Field label={mode === 'reset' ? 'New password' : 'Password'} hint="At least 12 characters"><Input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></Field>
        {mode === 'reset' && <Field label="Confirm new password"><Input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></Field>}
        <ErrorNote error={submit.error} />
        <Button type="submit" loading={submit.isPending} disabled={!configured}>{mode === 'register' ? 'Register' : mode === 'reset' ? 'Reset password' : 'Sign in'}</Button>
        <Button type="button" variant="ghost" disabled={submit.isPending} onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Need an account? Register' : 'Back to sign in'}</Button>
        {mode === 'login' && <Button type="button" variant="ghost" disabled={submit.isPending} onClick={() => changeMode('reset')}>Forgot password?</Button>}
      </form>}
    </Card>
  </main>
}
