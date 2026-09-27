import clsx from 'clsx'
import { Cpu, LayoutTemplate, Palette, Plug, Sparkles } from 'lucide-react'
import { Navigate, NavLink, useParams } from 'react-router-dom'
import { McpServersPanel } from '../components/McpServersPanel'
import { ModelPicker } from '../components/ModelPicker'
import { PageHeader } from '../components/ui'
import { FormatsSettings } from './settings/FormatsSettings'
import { SkillsSettings } from './settings/SkillsSettings'
import { ThemeSettings } from './settings/ThemeSettings'

const TABS = [
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
    id: 'theme',
    label: 'Theme',
    icon: Palette,
    intro: 'Light, dark or follow Windows — and the colors. Pick a preset or have the AI design one.',
  },
] as const

type TabId = (typeof TABS)[number]['id']

/** One place to configure everything: formats, skills, AI tools and the model. The tab lives in the URL. */
export function SettingsPage() {
  const { tab } = useParams()
  const current = TABS.find((t) => t.id === tab)
  if (!current) return <Navigate to="/settings/formats" replace />

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader kicker="Configure the copilot" title="Settings" />
      <nav aria-label="Settings sections" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map(({ id, label, icon: Icon }) => (
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
    case 'theme':
      return <ThemeSettings />
  }
}
