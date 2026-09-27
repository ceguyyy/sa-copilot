import type { DeckContent } from '../../../shared/deck/types.ts'
import type {
  AnyDocContent,
  AssessmentContent,
  DiagramContent,
  DocType,
  OnboardingContent,
  SowContent,
  TimelineContent,
  TorContent,
} from '../../../shared/schemas.ts'
import { DeckEditor } from './DeckEditor'
import { DiagramEditor } from './DiagramEditor'
import { OnboardingEditor } from './OnboardingEditor'
import { AssessmentEditor, TorEditor } from './SimpleEditors'
import { SowEditor } from './SowEditor'
import { TimelineEditor } from './TimelineEditor'

interface Props {
  type: DocType
  value: AnyDocContent
  onChange: (v: AnyDocContent) => void
  readOnly?: boolean
}

/** Picks the right editor for a document type. */
export function DocEditor({ type, value, onChange, readOnly }: Props) {
  switch (type) {
    case 'assessment':
      return <AssessmentEditor value={value as AssessmentContent} onChange={onChange} readOnly={readOnly} />
    case 'tor':
      return <TorEditor value={value as TorContent} onChange={onChange} readOnly={readOnly} />
    case 'timeline':
      return <TimelineEditor value={value as TimelineContent} onChange={onChange} readOnly={readOnly} />
    case 'sow_cekat':
    case 'sow_cif':
    case 'custom':
      return <SowEditor value={value as SowContent} onChange={onChange} readOnly={readOnly} />
    case 'onboarding':
      return <OnboardingEditor value={value as OnboardingContent} onChange={onChange} readOnly={readOnly} />
    case 'deck':
      return <DeckEditor value={value as DeckContent} onChange={onChange} readOnly={readOnly} />
    case 'diagram':
      return <DiagramEditor value={value as DiagramContent} onChange={onChange} readOnly={readOnly} />
  }
}
