// Mock a request from an example response: saved with the request, served locally by SA Copilot, and publishable to
// Cekat as an Automation flow with an https URL (for agents and the POC builder while the client API is not ready).
import { CloudUpload, Server, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { SaMock, SaResponse } from '../../shared/saPostman'
import { saPostmanApi } from '../lib/api'
import { CopyButton } from './CopyButton'
import { Button, ErrorNote } from './ui'

interface Props {
  mock: SaMock | undefined
  response: SaResponse | null
  /** The saved request; a mock is served only once the request is saved. */
  requestId: string | undefined
  /** Unsaved edits: the served mock is the last saved one. */
  dirty: boolean
  disabled: boolean
  onChange: (mock: SaMock | undefined) => void
}

const mockFromResponse = (r: SaResponse): SaMock => ({ status: r.status, contentType: r.headers['content-type'] ?? 'application/json', body: r.body })

export function SaMockPanel({ mock, response, requestId, dirty, disabled, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [published, setPublished] = useState('')
  const localUrl = requestId ? `${window.location.origin}/api/sapostman/mock/${requestId}` : ''
  const ready = !!mock && !!requestId && !dirty

  async function publish() {
    if (!requestId) return
    setBusy(true)
    setError(null)
    try {
      setPublished((await saPostmanApi.publishMock(requestId)).url)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  if (!mock && !response) return null
  return (
    <div className="space-y-2 rounded-md border border-dashed border-line p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Server className="size-4 text-forest" />
        <span className="font-semibold">Mock</span>
        {mock ? (
          <span className="text-xs text-muted">
            {mock.status} · {mock.contentType} · {mock.body.length.toLocaleString()} chars
          </span>
        ) : (
          <span className="text-xs text-muted">Serve this response as a mock while the real API is not ready.</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {response && (
          <Button variant="outline" disabled={disabled} onClick={() => onChange(mockFromResponse(response))}>
            {mock ? 'Replace with this response' : 'Use this response as mock'}
          </Button>
        )}
        {mock && (
          <>
            <Button variant="outline" icon={<CloudUpload className="size-4" />} loading={busy} disabled={disabled || !ready} title="Publish the mock as a Cekat Automation flow (needs Cekat MCP)" onClick={() => void publish()}>
              Publish to Cekat
            </Button>
            <Button variant="ghost" icon={<Trash2 className="size-4" />} disabled={disabled} onClick={() => onChange(undefined)}>
              Remove mock
            </Button>
          </>
        )}
      </div>
      {mock && !ready && <p className="text-xs text-warn">Save the request to serve this mock.</p>}
      {mock && localUrl && (
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Local (this computer):</span>
          <code className="break-all">{localUrl}</code>
          <CopyButton text={localUrl} label="Copy" />
        </p>
      )}
      {published && (
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Cekat (https):</span>
          <code className="break-all">{published}</code>
          <CopyButton text={published} label="Copy" />
        </p>
      )}
      {published && <p className="text-xs text-muted">Use it as the API's target URL or webhook address in the POC; the agent then gets this response.</p>}
      <ErrorNote error={error} />
    </div>
  )
}
