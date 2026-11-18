import { composeAgentBehavior, customInstructionsOf, type BehaviorConfig } from '../../shared/pocBehavior.ts'
import { normalizeTargets, type AdEventTargets, type SdkEvent } from '../../shared/pocConversions.ts'
import type { PocApiIntegration, PocCrm } from './types'

type POCConfigLike = BehaviorConfig & {
  welcomeMessage: string
  welcomeImage?: string | null
  agentTransferConditions: string
  stopAiAfterHandoff: boolean
  silentAgentHandoff: boolean
  labels: ReadonlyArray<{ readonly name: string; readonly condition: string; readonly conversion?: AdEventTargets }>
  sdkEvents?: ReadonlyArray<SdkEvent>
  pipeline: ReadonlyArray<{ readonly order: number; readonly status: string; readonly condition: string }>
  knowledgeBase: {
    readonly textSections: ReadonlyArray<{ readonly title: string; readonly content: string }>
    readonly websites: ReadonlyArray<{ readonly url: string; readonly note: string }>
    readonly qna: ReadonlyArray<{ readonly question: string; readonly answer: string }>
    readonly files: ReadonlyArray<{ readonly name: string; readonly size: number }>
  }
  apiIntegrations: ReadonlyArray<PocApiIntegration>
  crm?: PocCrm
  additionalSettings: {
    readonly aiHistoryLimit: number
    readonly aiReadFileLimit: number
    readonly aiContextLimit: number
    readonly aiTemperature: 'low' | 'balanced' | 'creative'
    readonly messageAwait: number
    readonly aiMessageLimit: number
    readonly watcher: 'off' | 'standard' | 'strict'
    readonly timezone: string
    readonly sessionOnlyMemory: 'off' | 'session_only' | 'per_thread'
    readonly ignoreTeamHandoff: boolean
  }
}

export function sanitizePocExport(name: string, config: POCConfigLike) {
  const apiIntegrations = config.apiIntegrations.map(({ apiKey: _apiKey, ...integration }) => integration)
  return {
    name,
    // The full prompt to paste into Cekat, plus the segments it is composed from.
    agentBehavior: composeAgentBehavior(config),
    communicationStyle: config.communicationStyle ?? '',
    conversationFlow: config.conversationFlow ?? '',
    rulesRestrictions: config.rulesRestrictions ?? '',
    customInstructions: customInstructionsOf(config),
    welcomeMessage: config.welcomeMessage,
    labels: config.labels.map((l) => ({ name: l.name, condition: l.condition, conversion: normalizeTargets(l.conversion) })),
    sdkEvents: config.sdkEvents ?? [],
    pipeline: config.pipeline,
    knowledgeBase: config.knowledgeBase,
    apiIntegrations,
    crm: config.crm ?? { boards: [] },
    additionalSettings: config.additionalSettings,
  }
}
