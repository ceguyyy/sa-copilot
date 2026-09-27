import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { skillsApi } from './lib/api'
import { DEFAULT_SKILLS } from './lib/defaultSkills'
import { supabase } from './lib/supabase'
import { DocumentPage } from './pages/DocumentPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { LoginPage } from './pages/LoginPage'
import { ProjectPage } from './pages/ProjectPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { SkillsPage } from './pages/SkillsPage'

let seeding: Promise<void> | null = null

/** First sign-in: give the SA a working skill library. Guarded so StrictMode / auth refreshes never double-seed. */
function seedSkillsIfEmpty(): Promise<void> {
  seeding ??= skillsApi.list().then(async (skills) => {
    if (skills.length === 0) await skillsApi.createMany(DEFAULT_SKILLS)
  })
  return seeding
}

export default function App() {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    seedSkillsIfEmpty()
      .then(() => qc.invalidateQueries({ queryKey: ['skills'] }))
      .catch((e) => {
        seeding = null // allow a retry on next sign-in
        console.error('Skill seeding failed:', e)
      })
  }, [session?.user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined) return <Spinner />
  if (!session) return <LoginPage />

  return (
    <Routes>
      <Route element={<Layout email={session.user.email ?? ''} />}>
        <Route index element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectPage />} />
        <Route path="projects/:projectId/docs/:documentId" element={<DocumentPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
