import type { Dispatch, SetStateAction } from 'react'
import { splitLegacyBehavior } from '../../../shared/pocBehavior.ts'
import { emptyTargets, normalizeSdkEvents, normalizeTargets } from '../../../shared/pocConversions.ts'
import { normalizeCrm } from '../../../shared/pocCrm.ts'
import { emptyFlow, normalizeFlow } from '../../../shared/pocFlow.ts'
import { emptyN8n, normalizeN8n } from '../../../shared/pocN8n.ts'
import { emptyChatFlows, normalizeChatFlows } from '../../../shared/pocChatFlow.ts'
import type { PocApiIntegration, PocConfig, PocLabel, PocPipelineStep } from '../../lib/types'

export type SetPocDraft = Dispatch<SetStateAction<PocConfig>>

export const emptyConfig = (): PocConfig => ({
  agentBehavior: '',
  communicationStyle: '',
  conversationFlow: '',
  rulesRestrictions: '',
  customInstructions: [],
  welcomeMessage: '',
  welcomeImage: null,
  agentTransferConditions: '',
  stopAiAfterHandoff: false,
  silentAgentHandoff: false,
  labels: [],
  sdkEvents: [],
  pipeline: [],
  knowledgeBase: {
    textSections: [],
    websites: [],
    qna: [],
    files: [],
  },
  apiIntegrations: [],
  crm: { boards: [] },
  flow: emptyFlow(),
  n8n: emptyN8n(),
  chatFlows: emptyChatFlows(),
  livechatUrl: '',
  additionalSettings: {
    aiHistoryLimit: 20,
    aiReadFileLimit: 3,
    aiContextLimit: 10,
    aiTemperature: 'balanced',
    messageAwait: 5,
    aiMessageLimit: 1000,
    watcher: 'off',
    timezone: '(GMT+7:00) Bangkok, Hanoi, Jakarta',
    sessionOnlyMemory: 'off',
    ignoreTeamHandoff: false,
  },
})

export const defaultLabel = (): PocLabel => ({ name: '', condition: '', conversion: emptyTargets() })
export const defaultPipelineStep = (): PocPipelineStep => ({ order: 1, status: '', condition: '' })
export const defaultApiIntegration = (): PocApiIntegration => ({
  name: '',
  httpMethod: 'POST',
  description: '',
  webhookAddress: '',
  aiInput: { type: 'object', properties: {}, required: [], additionalProperties: false },
  targetMethod: 'GET',
  targetUrl: '',
  authUrl: '',
})

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

export type PocSection = 'agent' | 'flow' | 'chatFlow' | 'n8n' | 'crm' | 'marketing'
export const POC_SECTIONS: { id: PocSection; label: string; disabled?: boolean }[] = [
  { id: 'agent', label: 'POC Agent' },
  { id: 'flow', label: 'Flow & Happy Case' },
  { id: 'chatFlow', label: 'POC Flow' },
  { id: 'n8n', label: 'n8n Workflows' },
  { id: 'crm', label: 'POC CRM' },
  { id: 'marketing', label: 'POC Marketing', disabled: true },
]

/** POCs saved before the n8n target fields, CRM section and flow existed get empty ones; a legacy behavior prompt moves into the segments. */
export function normalizeConfig(config: PocConfig): PocConfig {
  return {
    ...splitLegacyBehavior(config),
    labels: (config.labels ?? []).map((l) => ({ ...l, conversion: normalizeTargets(l.conversion) })),
    sdkEvents: normalizeSdkEvents(config.sdkEvents),
    apiIntegrations: config.apiIntegrations.map((a) => ({ ...defaultApiIntegration(), ...a })),
    crm: normalizeCrm(config.crm),
    flow: normalizeFlow(config.flow),
    n8n: normalizeN8n(config.n8n),
    chatFlows: normalizeChatFlows(config.chatFlows),
    livechatUrl: config.livechatUrl ?? '',
  }
}
