import { useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ThemeSync } from './components/ThemeSync'
import { authApi, skillsApi } from './lib/api'
import { desktop } from './lib/desktop'
import { DEFAULT_SKILLS } from './lib/defaultSkills'
import { SetupPage } from './pages/SetupPage'

import { AccountPage } from './pages/AccountPage'
import { WelcomePage } from './pages/WelcomePage'
import { Button, ErrorNote, Spinner } from './components/ui'

// Load editors and QA tools only when their page is opened.
const HomePage = lazy(() => import('./pages/HomePage').then(module => ({ default: module.HomePage })))
const InboxPage = lazy(() => import('./pages/InboxPage').then(module => ({ default: module.InboxPage })))
const TrashPage = lazy(() => import('./pages/TrashPage').then(module => ({ default: module.TrashPage })))
const DocumentPage = lazy(() => import('./pages/DocumentPage').then(module => ({ default: module.DocumentPage })))
const KnowledgePage = lazy(() => import('./pages/KnowledgePage').then(module => ({ default: module.KnowledgePage })))
const ProjectPage = lazy(() => import('./pages/ProjectPage').then(module => ({ default: module.ProjectPage })))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then(module => ({ default: module.ProjectsPage })))
const DemoPage = lazy(() => import('./pages/DemoPage').then(module => ({ default: module.DemoPage })))
const QaTestingPage = lazy(() => import('./pages/QaTestingPage').then(module => ({ default: module.QaTestingPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(module => ({ default: module.SettingsPage })))
const SaPostmanPage = lazy(() => import('./pages/SaPostmanPage').then(module => ({ default: module.SaPostmanPage })))

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
  if (!accountReady) return <WelcomePage email={account.data.account.email} onContinue={() => { navigate('/home', { replace: true }); setAccountReady(true) }} />

  if (desktop && setup.data && !setup.data.configured) return <SetupPage onDone={() => void setup.refetch()} />

  return (
    <>
      <ThemeSync />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ProjectsPage />} />
          <Route path="home" element={<HomePage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="projects/:projectId" element={<ProjectPage />} />
          <Route path="projects/:projectId/docs/:documentId" element={<DocumentPage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="demo" element={<DemoPage />} />
          <Route path="qa" element={<QaTestingPage />} />
          <Route path="sapostman" element={<SaPostmanPage />} />
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
