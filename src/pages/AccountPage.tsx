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
        if (password !== confirmPassword) throw new Error('Konfirmasi password tidak sama')
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
    <p className="text-sm text-muted">Login atau register untuk menghubungkan backup dan data cloud ke akun Anda. Gunakan akun yang sama pada komputer lain untuk restore.</p>
    <p className="text-sm text-muted">Data lokal yang sudah ada akan dikaitkan ke akun pertama yang login. Satu profil instalasi hanya dapat digunakan oleh satu akun.</p>
    {!configured && <Card className="space-y-3 p-5">
      <p>Konfigurasi koneksi cloud terlebih dahulu.</p>
      {desktop ? <ConnectionsForm onSaved={() => { void qc.invalidateQueries({ queryKey: ['account'] }) }} /> : <p className="text-sm text-muted">Isi CLOUD_DATABASE_URL di .env, jalankan db/supabase-sync.sql di Supabase, lalu restart server.</p>}
    </Card>}
    <Card className="space-y-4 p-5">
      {newCode ? <><RecoveryCode code={newCode} /><Button onClick={finish}>Sudah disimpan, lanjutkan</Button></> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit.mutate() }}>
        <h2 className="text-lg font-semibold">{mode === 'register' ? 'Register akun' : mode === 'reset' ? 'Reset password' : 'Login'}</h2>
        {mode === 'reset' && <p className="text-sm text-muted">Masukkan kode pemulihan yang Anda simpan. Reset tetap memakai akun dan backup yang sama. Setelah berhasil, kode tidak bisa dipakai lagi.</p>}
        {message && <p className="text-sm text-ok" role="status">{message}</p>}
        <Field label="Email"><Input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
        {mode === 'reset' && <Field label="Kode pemulihan"><Input autoComplete="off" required minLength={43} maxLength={43} value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} /></Field>}
        <Field label={mode === 'reset' ? 'Password baru' : 'Password'} hint="Minimal 12 karakter"><Input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></Field>
        {mode === 'reset' && <Field label="Konfirmasi password baru"><Input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></Field>}
        <ErrorNote error={submit.error} />
        <Button type="submit" loading={submit.isPending} disabled={!configured}>{mode === 'register' ? 'Register' : mode === 'reset' ? 'Reset password' : 'Login'}</Button>
        <Button type="button" variant="ghost" disabled={submit.isPending} onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Belum punya akun? Register' : 'Kembali ke login'}</Button>
        {mode === 'login' && <Button type="button" variant="ghost" disabled={submit.isPending} onClick={() => changeMode('reset')}>Lupa password?</Button>}
      </form>}
    </Card>
  </main>
}
