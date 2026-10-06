import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '../lib/api'
import { Button, ErrorNote, Field, Input } from './ui'
import { RecoveryCode } from './RecoveryCode'

export function AccountRecovery() {
  const [password, setPassword] = useState('')
  const generate = useMutation({ mutationFn: () => authApi.recoveryCode(password), onSuccess: () => setPassword('') })
  return <section className="space-y-3 border-t border-line pt-4">
    <h3 className="font-semibold">Pemulihan akun</h3>
    <p className="text-sm text-muted">Buat kode pemulihan untuk digunakan jika lupa password. Membuat kode baru membatalkan kode sebelumnya.</p>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); generate.mutate() }}>
      <Field label="Password saat ini"><Input type="password" autoComplete="current-password" required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></Field>
      <ErrorNote error={generate.error} />
      <Button type="submit" variant="outline" loading={generate.isPending}>Buat kode pemulihan baru</Button>
    </form>
    {generate.data && <RecoveryCode code={generate.data.recoveryCode} />}
  </section>
}
