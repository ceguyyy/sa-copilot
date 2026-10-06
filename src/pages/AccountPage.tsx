import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../lib/api'
import { Button, Card, ErrorNote, Field, Input } from '../components/ui'
import { ConnectionsForm } from '../components/ConnectionsForm'
import { desktop } from '../lib/desktop'

export function AccountPage({ configured, onDone }: { configured: boolean; onDone: () => void }) {
  const qc = useQueryClient()
  const [register, setRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useMutation({
    mutationFn: () => (register ? authApi.register : authApi.login)(email, password),
    onSuccess: () => { setPassword(''); qc.clear(); onDone() },
  })
  return <main className="mx-auto max-w-xl space-y-5 p-8">
    <h1 className="font-display text-3xl font-semibold">SA Copilot v2.0</h1>
    <p className="text-sm text-muted">Login atau register untuk menghubungkan backup dan data cloud ke akun Anda. Gunakan akun yang sama pada komputer lain untuk restore.</p>
    <p className="text-sm text-muted">Data lokal yang sudah ada akan dikaitkan ke akun pertama yang login. Satu profil instalasi hanya dapat digunakan oleh satu akun.</p>
    {!configured && <Card className="space-y-3 p-5">
      <p>Konfigurasi koneksi cloud terlebih dahulu.</p>
      {desktop ? <ConnectionsForm onSaved={() => { void qc.invalidateQueries({ queryKey: ['account'] }) }} /> : <p className="text-sm text-muted">Isi CLOUD_DATABASE_URL di .env, jalankan db/supabase-sync.sql di Supabase, lalu restart server.</p>}
    </Card>}
    <Card className="p-5">
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); login.mutate() }}>
        <h2 className="text-lg font-semibold">{register ? 'Register akun' : 'Login'}</h2>
        <Field label="Email"><Input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="Password" hint="Minimal 12 karakter"><Input type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></Field>
        <ErrorNote error={login.error} />
        <Button type="submit" loading={login.isPending} disabled={!configured}>{register ? 'Register' : 'Login'}</Button>
        <Button type="button" variant="ghost" disabled={login.isPending} onClick={() => { setRegister(!register); login.reset() }}>{register ? 'Sudah punya akun? Login' : 'Belum punya akun? Register'}</Button>
      </form>
    </Card>
  </main>
}
