import {useState} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {LockKeyhole,KeyRound,Trash2} from 'lucide-react'
import {LibraryDialog} from './SaLibraryDialog'
import {Button,Input,Field,ErrorNote} from './ui'
import {CopyButton} from './CopyButton'
import {saPostmanApi} from '../lib/api'

export function SaVaultPanel({onClose}:{onClose:()=>void}){
  const qc=useQueryClient(),vault=useQuery({queryKey:['sa-vault'],queryFn:saPostmanApi.vault,refetchInterval:30000})
  const [password,setPassword]=useState(''),[name,setName]=useState(''),[value,setValue]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<Error|null>(null)
  const [resetting,setResetting]=useState(false),[newPassword,setNewPassword]=useState(''),[repeatPassword,setRepeatPassword]=useState(''),[confirmation,setConfirmation]=useState('')
  const action=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError(null);try{await fn();await qc.invalidateQueries({queryKey:['sa-vault']})}catch(e){setError(e as Error)}finally{setBusy(false)}}
  return <LibraryDialog title="Secret vault" onClose={onClose}><ErrorNote error={error??vault.error}/>
    <p className="text-xs leading-relaxed text-muted">Secrets are encrypted on this device and excluded from collection exports and backups. Use {'{{vault.name}}'} in auth, headers, params or body.</p>
    {resetting?<form className="space-y-3" onSubmit={e=>{e.preventDefault();if(confirmation!=='RESET'||newPassword!==repeatPassword)return;const input=newPassword;setNewPassword('');setRepeatPassword('');void action(async()=>{await saPostmanApi.resetVault(input);setResetting(false);setConfirmation('');setName('');setValue('');setPassword('')})}}>
      <p className="rounded-md border border-bad/30 bg-ember-soft p-3 text-sm text-bad">Creating a new vault permanently removes all secrets from the previous vault. Saved APIs keep their references; add the secrets again before sending.</p>
      <Field label="New vault password"><Input autoFocus type="password" autoComplete="new-password" minLength={12} maxLength={1024} value={newPassword} disabled={busy} required onChange={e=>setNewPassword(e.target.value)}/></Field>
      <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={repeatPassword} disabled={busy} required onChange={e=>setRepeatPassword(e.target.value)}/></Field>
      {repeatPassword&&newPassword!==repeatPassword&&<p className="text-xs text-bad">Passwords do not match.</p>}
      <Field label="Type RESET to remove the previous vault"><Input autoComplete="off" value={confirmation} disabled={busy} required onChange={e=>setConfirmation(e.target.value)}/></Field>
      <div className="flex gap-2"><Button type="submit" variant="danger" loading={busy} disabled={confirmation!=='RESET'||newPassword.length<12||newPassword!==repeatPassword}>Remove old vault &amp; create new</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>{setResetting(false);setNewPassword('');setRepeatPassword('');setConfirmation('')}}>Cancel</Button></div>
    </form>:!vault.data?<p className="text-sm text-muted">{vault.error?'Vault unavailable. Retry or create a new vault.':'Loading vault…'}</p>:!vault.data.unlocked?<form className="space-y-3" onSubmit={e=>{e.preventDefault();const input=password;setPassword('');void action(()=>saPostmanApi.unlockVault(input))}}>
      <Field label={vault.data.configured?'Vault password':'Create vault password'}><Input autoFocus type="password" autoComplete={vault.data.configured?'current-password':'new-password'} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)} minLength={vault.data.configured?1:12} required/></Field>
      {!vault.data.configured&&<p className="text-xs text-muted">At least 12 characters. Keep this password: there is no password recovery.</p>}
      <Button type="submit" loading={busy} disabled={!password} icon={<KeyRound className="size-4"/>}>{vault.data.configured?'Unlock':'Create vault'}</Button>
    </form>:<><div className="flex items-center justify-between"><span className="text-xs text-ok">Unlocked · auto-lock after 15 minutes</span><Button variant="outline" icon={<LockKeyhole className="size-3.5"/>} disabled={busy} onClick={()=>void action(()=>saPostmanApi.lockVault())}>Lock</Button></div>
      <div className="max-h-60 space-y-1 overflow-auto">{vault.data.entries.map(entry=><div key={entry.name} className="flex items-center gap-2 rounded border border-line px-2 py-1"><button className="min-w-0 flex-1 truncate text-left font-mono text-xs" title="Replace this secret" onClick={()=>{setName(entry.name);setValue('')}}>{`{{vault.${entry.name}}}`}</button><CopyButton compact text={`{{vault.${entry.name}}}`} label="Copy vault reference"/><Button variant="danger" className="size-7 p-0!" aria-label={`Delete secret ${entry.name}`} icon={<Trash2 className="size-3.5"/>} disabled={busy} onClick={()=>{if(confirm(`Delete vault secret ${entry.name}? Requests referencing it will need a replacement.`))void action(()=>saPostmanApi.deleteSecret(entry.name))}}/></div>)}</div>
      <form className="space-y-3 border-t border-line pt-3" onSubmit={e=>{e.preventDefault();const secret=value;setValue('');void action(async()=>{await saPostmanApi.saveSecret(name,secret);setName('')})}}><Field label="Secret name"><Input placeholder="api_token" pattern="[a-zA-Z0-9_.-]{1,100}" maxLength={100} value={name} disabled={busy} required onChange={e=>setName(e.target.value)}/></Field><Field label="New secret value"><Input type="password" autoComplete="off" value={value} disabled={busy} required onChange={e=>setValue(e.target.value)}/></Field><Button type="submit" disabled={busy||!name||!value} loading={busy}>{vault.data.entries.some(e=>e.name===name)?'Replace secret':'Save secret'}</Button></form>
    </>}
    {!resetting&&(vault.data?.configured||vault.error)&&<div className="border-t border-line pt-3"><Button variant="danger" disabled={busy} onClick={()=>{setResetting(true);setError(null);setPassword('')}}>Forgot password? Create new vault</Button></div>}
  </LibraryDialog>
}
