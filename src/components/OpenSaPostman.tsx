import { useNavigate } from 'react-router-dom'
import { Send } from 'lucide-react'
import { Button } from './ui'

export function OpenSaPostman({ curl, title }: { curl: string; title: string }) {
  const navigate = useNavigate()
  return <Button variant="outline" icon={<Send className="size-4" />} disabled={!curl.trim()} onClick={() => navigate('/sapostman', { state: { curl, title, returnTo: window.location.pathname + window.location.search } })}>Test in SAPostman</Button>
}
