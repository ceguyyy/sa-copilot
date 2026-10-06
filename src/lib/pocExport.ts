import type { PocApiIntegration, PocCrm } from './types'

type POCConfigLike = {
  agentBehavior: string
  welcomeMessage: string
  welcomeImage?: string | null
  agentTransferConditions: string
  stopAiAfterHandoff: boolean
  silentAgentHandoff: boolean
  labels: ReadonlyArray<{ readonly name: string; readonly condition: string }>
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
    agentBehavior: config.agentBehavior,
    welcomeMessage: config.welcomeMessage,
    labels: config.labels,
    pipeline: config.pipeline,
    knowledgeBase: config.knowledgeBase,
    apiIntegrations,
    crm: config.crm ?? { boards: [] },
    additionalSettings: config.additionalSettings,
  }
}
