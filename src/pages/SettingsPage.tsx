import clsx from 'clsx'
import { Archive, Cpu, FileStack, KeyRound, Languages, LayoutTemplate, Palette, Plug, Sparkles } from 'lucide-react'
import { Navigate, NavLink, useParams } from 'react-router-dom'
import { McpServersPanel } from '../components/McpServersPanel'
import { ModelPicker } from '../components/ModelPicker'
import { PageHeader } from '../components/ui'
import { desktop } from '../lib/desktop'
import { BackupSettings } from './settings/BackupSettings'
import { ConnectionsSettings } from './settings/ConnectionsSettings'
import { DeliverablesSettings } from './settings/DeliverablesSettings'
import { FormatsSettings } from './settings/FormatsSettings'
import { LanguagesSettings } from './settings/LanguagesSettings'
import { SkillsSettings } from './settings/SkillsSettings'
import { ThemeSettings } from './settings/ThemeSettings'

const TABS = [
  {
    id: 'deliverables',
    label: 'Deliverables',
    icon: FileStack,
    intro: 'The built-in deliverables (Assessment, TOR, Timeline, SOW, Onboarding, User Journey, Deck): edit the format each one is drafted with, attach the latest template, or have the AI update it.',
  },
  {
    id: 'connections',
    label: 'Connections',
    icon: KeyRound,
    intro: 'Every setting that used to live in .env — AI key and endpoint, model, Outline, Notion, the demo app and folders. Saving applies it immediately.',
  },
  {
    id: 'formats',
    label: 'Formats',
    icon: LayoutTemplate,
    intro: 'Your own deliverable formats (proposal, BRD, UAT plan…) beyond the built-in ones. Pick one in a project under Custom deliverables and the AI drafts it.',
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: Sparkles,
    intro: 'How the AI writes each output: tone, language, coverage and standard wording for every built-in document, custom formats and chat.',
  },
  {
    id: 'tools',
    label: 'AI tools',
    icon: Plug,
    intro: 'Documentation and other sources the AI may look things up in while it works.',
  },
  {
    id: 'model',
    label: 'AI model',
    icon: Cpu,
    intro: 'Which 9router provider and model answer, and how hard they think. Applies to chat, drafting and the design assistants.',
  },
  {
    id: 'languages',
    label: 'Languages',
    icon: Languages,
    intro: 'The choices in the project language dropdown. The ★ main language is preselected for new projects.',
  },
  {
    id: 'backup',
    label: 'Backup',
    icon: Archive,
    intro: 'Move all your data to another device: download a backup here, restore it there.',
  },
  {
    id: 'theme',
    label: 'Theme',
    icon: Palette,
    intro: 'Light, dark or follow Windows — and the colors. Pick a preset or have the AI design one.',
  },
] as const

type TabId = (typeof TABS)[number]['id']

/** Connections edits the desktop app's settings; in the browser/dev server they come from .env instead. */
const VISIBLE_TABS = TABS.filter((t) => t.id !== 'connections' || desktop)

/** One place to configure everything: formats, skills, AI tools and the model. The tab lives in the URL. */
export function SettingsPage() {
  const { tab } = useParams()
  const current = VISIBLE_TABS.find((t) => t.id === tab)
  if (!current) return <Navigate to="/settings/deliverables" replace />

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader kicker="Configure the copilot" title="Settings" />
      <nav aria-label="Settings sections" className="flex flex-wrap gap-1 border-b border-line">
        {VISIBLE_TABS.map(({ id, label, icon: Icon }) => (
          <NavLink
            key={id}
            to={`/settings/${id}`}
            className={({ isActive }) =>
              clsx(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition',
                isActive ? 'border-ember font-semibold text-ink' : 'border-transparent text-muted hover:text-ink',
              )
            }
          >
            <Icon className="size-4" /> {label}
          </NavLink>
        ))}
      </nav>
      <p className="max-w-3xl text-sm text-muted">{current.intro}</p>
      <TabContent tab={current.id} />
    </div>
  )
}

function TabContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'deliverables':
      return <DeliverablesSettings />
    case 'formats':
      return <FormatsSettings />
    case 'skills':
      return <SkillsSettings />
    case 'tools':
      return <McpServersPanel />
    case 'model':
      return (
        <div className="max-w-sm rounded-xl bg-forest p-5 text-paper">
          <ModelPicker />
        </div>
      )
    case 'languages':
      return <LanguagesSettings />
    case 'connections':
      return <ConnectionsSettings />
    case 'backup':
      return <BackupSettings />
    case 'theme':
      return <ThemeSettings />
  }
}
