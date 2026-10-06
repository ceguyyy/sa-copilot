import type { AiActivity } from './activity.ts'

export type InboxStatus = 'working' | 'done' | 'error' | 'attention' | 'update'
export interface InboxItem {
  id:string; token:string; title:string; detail:string; status:InboxStatus; category:string
  at:number; href?:string; projectName?:string; job?:AiActivity; read:boolean
}
export function notificationToken(item:Pick<InboxItem,'status'|'at'>) { return `${item.status}:${item.at}` }
