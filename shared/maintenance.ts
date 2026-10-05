export interface UpdateStatus {
  supported: boolean
  version: string
  branch?: string
  current?: string
  latest?: string
  behind?: number
  ahead?: number
  dirty?: boolean
  reason?: string
  job?: { phase: string; running: boolean; error?: string; safetyBackup?: string; restartRequired?: boolean }
}

export interface CloudStatus {
  configured: boolean
  workspace: string
  device: string
  localRevision: number
  remoteRevision: number
  updatedAt?: string
  updatedBy?: string
}
