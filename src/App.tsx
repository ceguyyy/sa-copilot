import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { skillsApi } from './lib/api'
import { DEFAULT_SKILLS } from './lib/defaultSkills'
import { DocumentPage } from './pages/DocumentPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { ProjectPage } from './pages/ProjectPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { SkillsPage } from './pages/SkillsPage'
import { TemplatesPage } from './pages/TemplatesPage'

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
  useEffect(() => {
    seedSkillsIfEmpty()
      .then(() => qc.invalidateQueries({ queryKey: ['skills'] }))
      .catch((e) => {
        seeding = null // allow a retry on next load
        console.error('Skill seeding failed:', e)
      })
  }, [qc])

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectPage />} />
        <Route path="projects/:projectId/docs/:documentId" element={<DocumentPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
