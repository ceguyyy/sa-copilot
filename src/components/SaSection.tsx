import type {ReactNode} from 'react'
import {ChevronDown,ChevronRight} from 'lucide-react'
import {Card} from './ui'

export function SaSection({title,collapsed,onToggle,children}:{title:string;collapsed:boolean;onToggle:()=>void;children:ReactNode}){
 return <Card className="sa-section min-w-0 self-start space-y-3 p-4"><button type="button" aria-expanded={!collapsed} aria-label={`${collapsed?'Expand':'Collapse'} ${title}`} className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold" onClick={onToggle}>{title}{collapsed?<ChevronRight className="size-4"/>:<ChevronDown className="size-4"/>}</button><div hidden={collapsed} className="space-y-3">{children}</div></Card>
}
