import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, UserRound } from 'lucide-react'
import { AccountRecovery } from '../../components/AccountRecovery'
import { Button, Card, ErrorNote } from '../../components/ui'
import { authApi } from '../../lib/api'

export function AccountSettings() {
  const qc = useQueryClient()
  const account = useQuery({ queryKey: ['account'], queryFn: authApi.session })
  const logout = useMutation({ mutationFn: authApi.logout, onSuccess: () => { qc.clear(); window.location.reload() } })
  return <Card className="overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-forest-soft text-forest"><UserRound className="size-5" /></span>
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-muted">Your account</p><p className="break-all font-semibold">{account.data?.account?.email ?? (account.isPending ? 'Loading account...' : 'Account unavailable')}</p></div>
      </div>
      <Button variant="outline" icon={<LogOut className="size-4" />} loading={logout.isPending} onClick={() => logout.mutate()}>Sign out</Button>
    </div>
    {(account.error || logout.error) && <div className="px-5 pb-5 sm:px-6"><ErrorNote error={account.error ?? logout.error} /></div>}
    <div className="border-t border-line p-5 sm:p-6"><AccountRecovery /></div>
  </Card>
}
