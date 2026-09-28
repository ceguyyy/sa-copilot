import type { CrmColumnType } from '../../../lib/types'
import { COLUMN_TYPE_STYLE } from './columnStyle'

export function ColumnTypeIcon({ type, size = 'md' }: { type: CrmColumnType; size?: 'sm' | 'md' }) {
  const { icon: Icon, hue } = COLUMN_TYPE_STYLE[type]
  const box = size === 'sm' ? 'size-5' : 'size-7'
  return (
    <span aria-hidden className={`inline-flex ${box} shrink-0 items-center justify-center rounded-md text-white`} style={{ backgroundColor: `hsl(${hue} 70% 45%)` }}>
      <Icon className={size === 'sm' ? 'size-3' : 'size-4'} />
    </span>
  )
}
