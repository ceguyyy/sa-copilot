import type { DocType } from '../../shared/schemas.ts'

/** One-line description of each built-in deliverable, shown on the project pipeline and in Settings → Deliverables. */
export const STEP_HINT: Partial<Record<DocType, string>> = {
  assessment: '12 standard questions answered from the requirements',
  tor: 'Package + custom scope (Layanan / Sub Layanan)',
  timeline: 'Activities & SLA/Days — you set the mandays',
  sow_cekat: 'Internal Cekat format',
  sow_cif: 'Meta Client Integration Fund format',
  onboarding: 'Form the client fills before kickoff',
  user_journey: 'AI Agent scripts per topic — Cekat user journey template (.xlsx)',
  deck: 'Cekat deck with slides 31–40 made for this client (.pptx)',
}
