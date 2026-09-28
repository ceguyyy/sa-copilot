import {
  AlignLeft,
  Building2,
  Calendar,
  CalendarRange,
  ChevronDown,
  CircleDot,
  Contact,
  File,
  Hash,
  Link,
  Mail,
  MessageCircle,
  Package,
  Phone,
  Repeat,
  SquareCheck,
  Type,
  UserCog,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import type { CrmColumnType } from '../../../lib/types'

/** Icon and accent hue per Cekat CRM column type (hue drives the colored icon chip, like the Cekat column picker). */
export const COLUMN_TYPE_STYLE: Record<CrmColumnType, { icon: LucideIcon; hue: number }> = {
  text: { icon: Type, hue: 150 },
  number: { icon: Hash, hue: 85 },
  date: { icon: Calendar, hue: 50 },
  timeline: { icon: CalendarRange, hue: 30 },
  email: { icon: Mail, hue: 45 },
  phone: { icon: Phone, hue: 265 },
  long_text: { icon: AlignLeft, hue: 255 },
  checkbox: { icon: SquareCheck, hue: 200 },
  select: { icon: CircleDot, hue: 215 },
  dropdown: { icon: ChevronDown, hue: 195 },
  references: { icon: Link, hue: 345 },
  agents: { icon: UserCog, hue: 350 },
  contacts: { icon: Contact, hue: 330 },
  companies: { icon: Building2, hue: 325 },
  conversation: { icon: MessageCircle, hue: 315 },
  orders: { icon: Package, hue: 20 },
  subscriptions: { icon: Repeat, hue: 15 },
  files: { icon: File, hue: 25 },
}

/** Pill colors for select/dropdown options, cycling through a fixed set of hues by option position. */
const OPTION_HUES = [32, 205, 145, 280, 350, 55, 180, 15]

export function optionStyle(index: number): CSSProperties {
  const hue = OPTION_HUES[index % OPTION_HUES.length]
  return { backgroundColor: `hsl(${hue} 90% 60% / 0.35)`, color: 'inherit' }
}
