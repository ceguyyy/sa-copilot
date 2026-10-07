import {useState} from 'react'
import {ArrowRight, CheckCircle2, HardDrive, Layers3, ShieldCheck} from 'lucide-react'
import {Button, Card} from '../components/ui'
import {CloudSettings} from './settings/CloudSettings'
import appPackage from '../../package.json'

export function WelcomePage({email,onContinue}:{email:string;onContinue:()=>void}){
  const [busy,setBusy]=useState(false),[restored,setRestored]=useState(false)
  return <main className="min-h-dvh px-5 py-6 sm:px-10 sm:py-8">
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
      <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl border border-forest/20 bg-forest-soft text-forest"><Layers3 className="size-5"/></span><span className="font-display text-xl font-semibold">SA Copilot</span></div>
      <span className="max-w-full break-all rounded-full border border-line bg-panel px-3 py-1.5 text-xs text-muted">{email}</span>
    </header>
    <div className="mx-auto max-w-6xl py-8 sm:py-12">
      <div className="mb-8 max-w-2xl space-y-3"><p className="font-mono text-[11px] uppercase tracking-[.22em] text-ember">Welcome to your workspace</p><h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">Choose where to pick up.</h1><p className="text-sm leading-relaxed text-muted">Continue with this computer’s data, or restore a cloud snapshot to bring your work from another computer.</p></div>
      <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-8">
          <Card className="space-y-5 rounded-2xl border border-forest/25 p-6">
            <span className="flex size-11 items-center justify-center rounded-xl bg-forest-soft text-forest">{restored?<CheckCircle2 className="size-5"/>:<HardDrive className="size-5"/>}</span>
            <div className="space-y-2"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-ember">{restored?'Restore complete':'This computer'}</p><h2 className="font-display text-2xl font-semibold">{restored?'Your workspace is ready.':'Continue your work.'}</h2><p className="text-sm leading-relaxed text-muted">{restored?'Your cloud snapshot has been restored. Open your workspace to continue.':'Open the projects, documents and APIs already on this computer.'}</p></div>
            <Button className="w-full py-3!" icon={<ArrowRight className="size-4"/>} disabled={busy} onClick={onContinue}>{restored?'Open workspace':'Continue with local data'}</Button>
            <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">{busy?'A backup or restore is in progress. Please wait before opening the workspace.':'You can manage backups later in Settings → Cloud.'}</p>
          </Card>
          <div className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-forest"/><p>Cloud transfer is manual. Use one computer at a time; edits from different computers are not merged automatically.</p></div>
        </aside>
        <CloudSettings onBusyChange={setBusy} onRestored={()=>setRestored(true)}/>
      </div>
    </div>
    <footer className="mx-auto max-w-6xl border-t border-line py-4 font-mono text-[10px] text-muted">SA COPILOT <span className="mx-2 text-line">/</span> v{appPackage.version}</footer>
  </main>
}
