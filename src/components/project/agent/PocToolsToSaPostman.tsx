// One click: every POC API tool becomes a SAPostman request with the exact payload Cekat sends.
import { ArrowRight, Send } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pocToolsCollection, type PocToolIntegration } from '../../../../shared/pocSaPostman.ts'
import { saPostmanApi } from '../../../lib/api'
import { Button, ErrorNote } from '../../ui'

export function PocToolsToSaPostman({ clientName, integrations }: { clientName: string; integrations: PocToolIntegration[] }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<{ name: string; count: number } | null>(null)
  const collection = pocToolsCollection(clientName, integrations)

  async function add() {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await saPostmanApi.importCollection({ name: collection.name, variables: [], endpoints: collection.endpoints })
      setDone({ name: result.collection.name, count: result.count })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          icon={<Send className="size-4" />}
          loading={busy}
          disabled={!collection.endpoints.length}
          title="Creates a SAPostman collection with one request per tool, carrying the payload Cekat sends (AI inputs + conversation)"
          onClick={() => void add()}
        >
          Add all to SAPostman
        </Button>
        {done && (
          <>
            <span className="text-sm text-ok">
              {done.count} request{done.count === 1 ? '' : 's'} in “{done.name}”
            </span>
            <Button variant="ghost" icon={<ArrowRight className="size-4" />} onClick={() => navigate('/sapostman')}>
              Open SAPostman
            </Button>
          </>
        )}
      </div>
      <ErrorNote error={error} />
    </div>
  )
}
