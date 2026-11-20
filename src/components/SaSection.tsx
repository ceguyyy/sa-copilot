import type {ReactNode} from 'react'
import {ChevronDown,ChevronRight,type LucideIcon} from 'lucide-react'
import {Card} from './ui'

export function SaSection({title,collapsed,onToggle,children,toggleIcon}:{title:string;collapsed:boolean;onToggle:()=>void;children:ReactNode;toggleIcon?:ReactNode}){
 return <Card className="sa-section min-w-0 self-start space-y-3 p-4"><button type="button" aria-expanded={!collapsed} aria-label={`${collapsed?'Expand':'Collapse'} ${title}`} className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold" onClick={onToggle}>{title}{toggleIcon??(collapsed?<ChevronRight className="size-4"/>:<ChevronDown className="size-4"/>)}</button><div hidden={collapsed} className="space-y-3">{children}</div></Card>
}

/** A side panel folded to a narrow vertical strip (wide screens) or a bar (narrow screens); clicking opens it again. */
export function SaRail({title,icon:Icon,onOpen}:{title:string;icon:LucideIcon;onOpen:()=>void}){
 return <aside className="flex rounded-xl border border-line bg-panel xl:sticky xl:top-6 xl:h-[calc(100vh-4rem)] xl:flex-col"><button type="button" aria-expanded={false} aria-label={`Open ${title}`} title={`Open ${title}`} className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-forest xl:flex-col xl:px-0 xl:py-4" onClick={onOpen}><Icon className="size-5"/><span className="xl:[writing-mode:vertical-rl]">{title}</span></button></aside>
}
