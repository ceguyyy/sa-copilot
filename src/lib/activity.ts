import type { AiActivity } from '../../shared/activity'

const tasks: Record<string, string> = {
  chat: 'Project conversation', 'find-questions': 'Find client questions',
  'meeting-notes': 'Process meeting notes', 'consistency': 'Check document consistency',
  'audit-summary': 'Summarize project activity', 'split-diagram': 'Split diagram',
  'version-diff': 'Compare document versions', 'demo-scenarios': 'Create demo scenarios',
  'poc-draft': 'Draft proof of concept', 'poc-revise': 'Revise proof of concept',
  'poc-n8n-review': 'Review n8n workflow', 'poc-qa-prepare': 'Prepare POC testing',
  'poc-qa-run': 'Run POC tests', 'qa-suite-cases': 'Generate test cases',
  'qa-suite-prepare': 'Prepare test suite', 'qa-suite-run': 'Run test suite', assist: 'AI assistant',
}
export function taskLabel(job: AiActivity) {
  return tasks[job.task] ?? job.task.replaceAll('-', ' ')
}
export function taskGroup(job: AiActivity) {
  if (job.task.includes('qa')) return 'TESTING'
  if (job.task.includes('poc')) return 'BUILD'
  if (job.task.startsWith('generate')) return 'DOCUMENT'
  if (job.task === 'chat' || job.task === 'assist') return 'ASSISTANT'
  return 'ANALYSIS'
}
