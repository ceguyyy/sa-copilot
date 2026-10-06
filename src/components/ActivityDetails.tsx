import type { AiActivity } from '../../shared/activity'
import { formatElapsed } from '../lib/elapsed'

export function ActivityDetails({ job, now, projectName, compact = false }: { job: AiActivity; now: number; projectName?: string; compact?: boolean }) {
  const rows = [
    ['Project', projectName ?? job.projectId ?? 'Global workspace'],
    ['Model', job.model ?? 'Selecting model'],
    ['Provider / API', [job.provider, job.format].filter(Boolean).join(' / ') || 'Preparing'],
    ['Duration', formatElapsed((job.finishedAt ?? now) - job.startedAt)],
    ['Started', new Date(job.startedAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }) + ' WIB'],
    ['Last activity', `${formatElapsed(Math.max(0, (job.finishedAt ?? now) - (job.updatedAt ?? job.startedAt)))} ago`],
    ['Output', `${(job.characters ?? 0).toLocaleString()} characters`],
    ['Model calls / Tools', `${job.modelCalls ?? 0} / ${job.toolCalls ?? 0}`],
    ...(job.versionNo ? [['Result version', `v${job.versionNo}`]] : []),
    ...(job.batchId ? [['Revision batch', job.batchId]] : []),
    ...(job.tool ? [['Last tool', job.tool]] : []),
    ...(!compact ? [
      ['Effort / Output limit', `${job.effort ?? 'default'} / ${job.maxTokens?.toLocaleString() ?? 'pending'} tokens`],
      ['Attachments', String(job.attachmentCount ?? 0)],
      ...(job.documentType ? [['Document type', job.documentType]] : []),
      ...(job.documentId ? [['Document ID', job.documentId]] : []),
      ...(job.added !== undefined ? [['Questions added', String(job.added)]] : []),
      ['Job ID', job.id],
    ] : []),
  ]
  return <span className="activity-details">
    <span className={`activity-stage ${job.status}`}>{job.detail}</span>
    {rows.map(([label, value]) => <span className="activity-metadata-row" key={label}><span>{label}</span><span>{value}</span></span>)}
  </span>
}
