import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { Layout } from './components/Layout'
import { ThemeSync } from './components/ThemeSync'
import { authApi, skillsApi } from './lib/api'
import { desktop } from './lib/desktop'
import { DEFAULT_SKILLS } from './lib/defaultSkills'
import { DocumentPage } from './pages/DocumentPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { ProjectPage } from './pages/ProjectPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { DemoPage } from './pages/DemoPage'
import { QaTestingPage } from './pages/QaTestingPage'
import { SettingsPage } from './pages/SettingsPage'
import { SetupPage } from './pages/SetupPage'

import { AccountPage } from './pages/AccountPage'
import { CloudSettings } from './pages/settings/CloudSettings'
import { Button, ErrorNote, Spinner } from './components/ui'

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
  const navigate = useNavigate()
  const [registrationPending, setRegistrationPending] = useState(false)
  const [accountReady, setAccountReady] = useState(false)
  const account = useQuery({ queryKey: ['account'], queryFn: authApi.session, retry: false, refetchInterval: 60_000, enabled: !registrationPending })
  // Desktop app only: until the 9router key is set, show the Setup screen instead of the app.
  const setup = useQuery({ queryKey: ['desktop-config'], queryFn: () => desktop!.getConfig(), enabled: !!desktop })
  useEffect(() => {
    if (!account.data?.account || !accountReady) return
    seedSkillsIfEmpty()
      .then(() => qc.invalidateQueries({ queryKey: ['skills'] }))
      .catch((e) => {
        seeding = null // allow a retry on next load
        console.error('Skill seeding failed:', e)
      })
  }, [qc, account.data?.account, accountReady])

  if (account.isPending) return <Spinner label="Loading account..." />
  if (account.error) return <div className="p-8"><ErrorNote error={account.error} /><Button onClick={() => void account.refetch()}>Try again</Button></div>
  if (!account.data?.account) return <AccountPage configured={!!account.data?.configured} onRecoveryPending={() => setRegistrationPending(true)} onDone={() => { setRegistrationPending(false); setAccountReady(false); void account.refetch() }} />
  if (!accountReady) return <div className="mx-auto max-w-3xl space-y-4 p-8"><h1 className="text-2xl font-semibold">Welcome, {account.data.account.email}</h1><p>Restore your cloud backup or continue with this computer's local data.</p><CloudSettings /><Button onClick={() => { navigate('/home', { replace: true }); setAccountReady(true) }}>Continue with local data</Button></div>

  if (desktop && setup.data && !setup.data.configured) return <SetupPage onDone={() => void setup.refetch()} />

  return (
    <>
      <ThemeSync />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ProjectsPage />} />
          <Route path="home" element={<HomePage />} />
          <Route path="projects/:projectId" element={<ProjectPage />} />
          <Route path="projects/:projectId/docs/:documentId" element={<DocumentPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="demo" element={<DemoPage />} />
          <Route path="qa" element={<QaTestingPage />} />
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
