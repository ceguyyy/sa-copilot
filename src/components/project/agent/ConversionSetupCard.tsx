import { CopyButton } from '../../CopyButton'
import { CekatPushPanel } from './CekatPushPanel'
import { Textarea } from '../../ui'
import { conversionSetupGuide, sdkDeveloperBrief } from '../../../../shared/pocConversionGuide.ts'
import type { PocConfig } from '../../../lib/types'

type Props = { pocId: string; draft: PocConfig; pocName: string }

/** Copy-ready setup checklist for Cekat and the brief for the client's developers, built from the POC's conversions. */
export function ConversionSetupCard({ pocId, draft, pocName }: Props) {
  const guide = conversionSetupGuide(pocName, draft)
  const brief = sdkDeveloperBrief(pocName, draft)

  return (
    <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <div>
        <h4 className="font-display text-base font-semibold">Ads Conversion Setup</h4>
        <p className="text-xs text-muted">Updates as you edit labels and SDK events above.</p>
      </div>
      {guide && <CekatPushPanel pocId={pocId} draft={draft} />}
      <GuideBlock
        title="Setup checklist (Cekat dashboard)"
        hint="Step by step for Marketing › Paid Ads and Marketing › Events."
        text={guide}
        empty="Set an ad event on a label or SDK event to build the checklist."
      />
      <GuideBlock
        title="Developer brief (client team)"
        hint="Send this to the client's developers who fire the SDK events."
        text={brief}
        empty="Add an SDK event with a key to build the brief."
      />
    </div>
  )
}

function GuideBlock({ title, hint, text, empty }: { title: string; hint: string; text: string; empty: string }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h5>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        {text && <CopyButton text={text} label="Copy" />}
      </div>
      <Textarea aria-label={title} rows={text ? 10 : 2} readOnly value={text} placeholder={empty} className="font-mono text-xs" />
    </div>
  )
}
