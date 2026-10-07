import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, Cloud, Eye, EyeOff, KeyRound, Layers3, ShieldCheck } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import { authApi } from '../lib/api'
import { Button, Card, ErrorNote, Field, Input } from '../components/ui'
import { ConnectionsForm } from '../components/ConnectionsForm'
import { RecoveryCode } from '../components/RecoveryCode'
import { CopyButton } from '../components/CopyButton'
import { desktop } from '../lib/desktop'
import appPackage from '../../package.json'

function PasswordInput({ visible, onToggle, ...props }: InputHTMLAttributes<HTMLInputElement> & { visible: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="py-3! pr-12" />
      <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
        onClick={onToggle}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted transition hover:text-ink"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export function AccountPage({ configured, onDone, onRecoveryPending }: { configured: boolean; onDone: () => void; onRecoveryPending: () => void }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [message, setMessage] = useState('')
  const [codeSaved, setCodeSaved] = useState(false)
  const finish = () => { qc.clear(); onDone() }
  const submit = useMutation({
    mutationFn: async () => {
      if (mode !== 'login' && password !== confirmPassword) throw new Error('Passwords do not match')
      if (mode === 'reset') {
        return authApi.resetPassword(email, recoveryCode.trim(), password)
      }
      return (mode === 'register' ? authApi.register : authApi.login)(email, password)
    },
    onSuccess: data => {
      setPassword(''); setConfirmPassword(''); setRecoveryCode('')
      if ('message' in data) { setMessage(data.message); setMode('login'); return }
      if ('recoveryCode' in data) { onRecoveryPending(); setCodeSaved(false); setNewCode(String(data.recoveryCode)); return }
      finish()
    },
  })
  const changeMode = (next: typeof mode) => { setMode(next); setPassword(''); setConfirmPassword(''); setRecoveryCode(''); setPasswordVisible(false); setConfirmPasswordVisible(false); setMessage(''); submit.reset() }
  const busy = submit.isPending
  const mismatch = mode !== 'login' && !!confirmPassword && password !== confirmPassword
  const titles = { login: 'Welcome back.', register: 'Your next solution starts here.', reset: 'Let’s get you back in.' }
  const descriptions = {
    login: 'Sign in to connect your account and continue your work.',
    register: 'Create your account to connect cloud backups across your computers.',
    reset: 'Use your saved recovery code to set a new password for the same account.',
  }
  return <main className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 sm:py-8">
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between border-b border-line pb-5">
      <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl border border-forest/20 bg-forest-soft text-forest"><Layers3 className="size-5"/></span><span className="font-display text-xl font-semibold">SA Copilot</span></div>
      <span className="font-mono text-xs text-muted">v{appPackage.version}</span>
    </header>
    <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 py-10 lg:grid-cols-[1fr_460px] lg:gap-20 lg:py-14">
      <section className="max-w-lg space-y-6">
        <p className="font-mono text-[11px] uppercase tracking-[.22em] text-ember">Your solution workspace</p>
        <h1 className="font-display text-4xl font-semibold leading-[1.12] sm:text-5xl lg:text-6xl">From discovery<br/>to delivery.</h1>
        <p className="max-w-md text-base leading-relaxed text-muted">Bring requirements, architecture, POCs and API testing together. Keep your thinking connected as your solution takes shape.</p>
        <div className="hidden space-y-5 border-t border-line pt-6 lg:block">
          <div className="flex gap-3"><Layers3 className="mt-0.5 size-4 shrink-0 text-forest"/><div><p className="text-sm font-medium">One place for your project</p><p className="mt-1 text-sm text-muted">Requirements, deliverables and implementation context.</p></div></div>
          <div className="flex gap-3"><Cloud className="mt-0.5 size-4 shrink-0 text-forest"/><div><p className="text-sm font-medium">Continue on another computer</p><p className="mt-1 text-sm text-muted">Move your workspace with cloud backup and restore.</p></div></div>
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-forest"/><div><p className="text-sm font-medium">Your working data stays local</p><p className="mt-1 text-sm text-muted">Cloud snapshots are transferred when you choose.</p></div></div>
        </div>
      </section>
      <div className="min-w-0 space-y-4">
        {!configured && <Card className="space-y-3 border border-warn/30 p-5"><p className="text-sm font-semibold text-warn">Connect your cloud workspace first</p>{desktop ? <ConnectionsForm onSaved={() => { void qc.invalidateQueries({ queryKey: ['account'] }) }} /> : <p className="text-sm leading-relaxed text-muted">Set CLOUD_DATABASE_URL in .env, run db/supabase-sync.sql in Supabase, then restart the server.</p>}</Card>}
        <Card className="rounded-2xl border border-line p-6 shadow-[0_8px_32px_color-mix(in_oklab,var(--ink)_4%,transparent)] sm:p-8">
          {newCode ? <div className="space-y-5"><div className="flex size-11 items-center justify-center rounded-xl bg-forest-soft text-forest"><KeyRound className="size-5"/></div><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-ember">Account ready</p><h2 className="mt-2 font-display text-2xl font-semibold">Keep your way back in.</h2></div><RecoveryCode code={newCode}/><CopyButton text={newCode} label="Copy recovery code"/><label className="flex cursor-pointer items-start gap-2 text-sm leading-relaxed"><input type="checkbox" className="mt-1 accent-forest" checked={codeSaved} onChange={e=>setCodeSaved(e.target.checked)}/>I have saved my recovery code somewhere safe.</label><Button className="w-full py-3!" disabled={!codeSaved} onClick={finish} icon={<ArrowRight className="size-4"/>}>Continue to workspace</Button></div> : <>
            {mode === 'reset' ? <Button variant="ghost" className="mb-5 -ml-3" disabled={busy} onClick={()=>changeMode('login')} icon={<ArrowLeft className="size-4"/>}>Back to sign in</Button> : <div className="mb-7 grid grid-cols-2 gap-1 rounded-lg border border-line bg-paper p-1" aria-label="Account access">{(['login','register'] as const).map(tab=><button type="button" key={tab} disabled={busy} aria-pressed={mode===tab} onClick={()=>changeMode(tab)} className={`rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${mode===tab?'bg-forest text-paper shadow-sm':'text-muted hover:text-ink'}`}>{tab==='login'?'Sign in':'Create account'}</button>)}</div>}
            <div className="mb-6 space-y-2"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-ember">{mode==='reset'?'Account recovery':mode==='register'?'Get started':'Your workspace awaits'}</p><h2 className="font-display text-3xl font-semibold leading-tight">{titles[mode]}</h2><p className="text-sm leading-relaxed text-muted">{descriptions[mode]}</p></div>
            <form className="space-y-4" onSubmit={e=>{e.preventDefault();if(!busy&&configured)submit.mutate()}}>
              {message&&<p className="flex gap-2 rounded-lg border border-ok/25 bg-forest-soft p-3 text-sm text-ok" role="status"><Check className="mt-0.5 size-4 shrink-0"/>{message}</p>}
              <Field label="Email address"><Input type="email" autoComplete="username" placeholder="you@company.com" className="py-3!" disabled={busy} required value={email} onChange={e=>setEmail(e.target.value)}/></Field>
              {mode==='reset'&&<Field label="Recovery code" hint="The 43-character code you saved when your account was created or recovered."><Input autoComplete="off" spellCheck={false} className="py-3! font-mono" placeholder="Paste your recovery code" disabled={busy} required minLength={43} maxLength={43} value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value.trim())}/></Field>}
              <Field label={mode==='reset'?'New password':'Password'} hint={mode==='login'?undefined:'Use at least 12 characters.'}><PasswordInput visible={passwordVisible} onToggle={()=>setPasswordVisible(v=>!v)} disabled={busy} autoComplete={mode==='login'?'current-password':'new-password'} placeholder={mode==='login'?'Enter your password':'Create a strong password'} minLength={12} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/></Field>
              {mode!=='login'&&<Field label={mode==='reset'?'Confirm new password':'Confirm password'}><PasswordInput visible={confirmPasswordVisible} onToggle={()=>setConfirmPasswordVisible(v=>!v)} disabled={busy} aria-invalid={mismatch} aria-describedby={mismatch?'account-password-mismatch':undefined} autoComplete="new-password" placeholder="Enter your password again" minLength={12} maxLength={128} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></Field>}
              {mismatch&&<p id="account-password-mismatch" className="text-xs text-bad" role="status">Passwords do not match.</p>}
              {mode==='login'&&<div className="flex justify-end"><button type="button" disabled={busy} onClick={()=>changeMode('reset')} className="text-sm font-medium text-forest underline-offset-4 hover:underline disabled:opacity-50">Forgot password?</button></div>}
              {mode==='reset'&&<p className="rounded-lg border border-line bg-paper p-3 text-xs leading-relaxed text-muted">Your account and backups are preserved. The recovery code can only be used once; save the replacement code after resetting.</p>}
              <ErrorNote error={submit.error}/>
              <Button type="submit" className="w-full py-3!" loading={busy} disabled={!configured||mismatch} icon={<ArrowRight className="size-4"/>}>{mode==='register'?'Create account':mode==='reset'?'Reset password':'Sign in'}</Button>
            </form>
            <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-muted">{mode==='reset'?'Lost your recovery code? Contact your workspace administrator for account recovery.':'This installation uses one account. Existing local data is linked to the first account that signs in.'}</p>
          </>}
        </Card>
      </div>
    </div>
    <footer className="mx-auto w-full max-w-6xl border-t border-line pt-4 font-mono text-[10px] text-muted">SA COPILOT <span className="mx-2 text-line">/</span> Solution Architect workspace</footer>
  </main>
}
