import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ThemeSync } from './components/ThemeSync'
import { skillsApi } from './lib/api'
import { desktop } from './lib/desktop'
import { DEFAULT_SKILLS } from './lib/defaultSkills'
import { DocumentPage } from './pages/DocumentPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { ProjectPage } from './pages/ProjectPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { DemoPage } from './pages/DemoPage'
import { SettingsPage } from './pages/SettingsPage'
import { SetupPage } from './pages/SetupPage'

let seeding: Promise<void> | null = null

/** First run: give the SA a working skill library. Guarded so StrictMode never double-seeds. */
function seedSkillsIfEmpty(): Promise<void> {
  seeding ??= skillsApi.list().then(async (skills) => {
    if (skills.length === 0) await skillsApi.createMany(DEFAULT_SKILLS)
  })
  return seeding
}

export default function App() {
  const qc = useQueryClient()
  // Desktop app only: until the 9router key is set, show the Setup screen instead of the app.
  const setup = useQuery({ queryKey: ['desktop-config'], queryFn: () => desktop!.getConfig(), enabled: !!desktop })
  useEffect(() => {
    seedSkillsIfEmpty()
      .then(() => qc.invalidateQueries({ queryKey: ['skills'] }))
      .catch((e) => {
        seeding = null // allow a retry on next load
        console.error('Skill seeding failed:', e)
      })
  }, [qc])

  if (desktop && setup.data && !setup.data.configured) return <SetupPage onDone={() => void setup.refetch()} />

  return (
    <>
      <ThemeSync />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectPage />} />
          <Route path="projects/:projectId/docs/:documentId" element={<DocumentPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="demo" element={<DemoPage />} />
          <Route path="settings/:tab?" element={<SettingsPage />} />
          {/* Old addresses of pages that moved into Settings */}
          <Route path="skills" element={<Navigate to="/settings/skills" replace />} />
          <Route path="templates" element={<Navigate to="/settings/formats" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  )
}
