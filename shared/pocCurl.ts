// A cURL command per POC API integration (Cekat → n8n webhook), to test the webhook from Postman or a terminal.

type Schema = Record<string, unknown>

const MAX_DEPTH = 5

const DUMMY_EMAIL = 'budi.santoso@example.com'
const DUMMY_DATE = '2026-10-05'
const DUMMY_TIME = '09:00'

/** Dummy text guessed from the field name (English or Indonesian); first match wins, so specific names come first. */
const STRING_BY_NAME: [RegExp, string][] = [
  [/e-?mail/, DUMMY_EMAIL],
  [/phone|telp|telepon|handphone|whatsapp|mobile|^wa$|_wa$|^hp$|_hp$|^no_?hp/, '6281234567890'],
  [/doctor|dokter/, 'dr. Andi Wijaya, Sp.PD'],
  [/birth|lahir|dob/, '1990-05-17'],
  [/date|tanggal|tgl/, DUMMY_DATE],
  [/time|jam|waktu|slot/, DUMMY_TIME],
  [/address|alamat/, 'Jl. Sudirman No. 10, Jakarta Pusat'],
  [/clinic|klinik|branch|cabang|outlet|hospital|rumah_?sakit/, 'Klinik Sehat Sudirman'],
  [/city|kota|domisili/, 'Jakarta'],
  [/nik|ktp/, '3171012345670001'],
  [/spesialis|specialt|poli/, 'Penyakit Dalam'],
  [/keluhan|complaint|symptom|gejala/, 'Demam dan batuk sejak 3 hari'],
  [/note|catatan|message|pesan|description|deskripsi/, 'Mohon dijadwalkan pagi hari'],
  [/gender|kelamin/, 'Laki-laki'],
  [/name|nama/, 'Budi Santoso'],
  [/status/, 'confirmed'],
  [/url|link|website/, 'https://example.com'],
  [/(^|_)id$|^id|kode|code|nomor|number|^no_/, 'ABC-12345'],
]

const NUMBER_BY_NAME: [RegExp, number][] = [
  [/age|umur|usia/, 35],
  [/price|harga|amount|total|biaya|fee|nominal/, 150000],
  [/lat/, -6.2088],
  [/lng|lon/, 106.8456],
]

const byName = <T>(rules: [RegExp, T][], key: string): T | undefined => rules.find(([re]) => re.test(key.toLowerCase()))?.[1]

function dummyString(s: Schema, key: string): string {
  if (s.format === 'date-time') return `${DUMMY_DATE}T${DUMMY_TIME}:00+07:00`
  if (s.format === 'email') return DUMMY_EMAIL
  const named = byName(STRING_BY_NAME, key)
  if (named) return named
  if (s.format === 'date') return DUMMY_DATE
  if (s.format === 'time') return DUMMY_TIME
  return key ? `Contoh ${key}` : 'Contoh'
}

function dummyNumber(s: Schema, key: string): number {
  const value = byName(NUMBER_BY_NAME, key) ?? 1
  return typeof s.minimum === 'number' && value < s.minimum ? s.minimum : value
}

/** A sample value for a JSON Schema: its example, default or first enum value, otherwise dummy data guessed from the field name. */
export function sampleFromSchema(schema: unknown, key = '', depth = 0): unknown {
  if (!schema || typeof schema !== 'object' || depth > MAX_DEPTH) return null
  const s = schema as Schema
  if (s.example !== undefined) return s.example
  if (Array.isArray(s.examples) && s.examples.length) return s.examples[0]
  if (s.default !== undefined) return s.default
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0]
  const type = Array.isArray(s.type) ? s.type[0] : s.type
  switch (type) {
    case 'object': {
      const props = (s.properties ?? {}) as Record<string, unknown>
      return Object.fromEntries(Object.entries(props).map(([name, def]) => [name, sampleFromSchema(def, name, depth + 1)]))
    }
    case 'array':
      return [sampleFromSchema(s.items ?? { type: 'string' }, key, depth + 1)]
    case 'integer':
    case 'number':
      return dummyNumber(s, key)
    case 'boolean':
      return true
    case 'string':
      return dummyString(s, key)
    default:
      return null
  }
}

/** Single-quotes a value for a POSIX shell (the syntax Postman's cURL import reads). */
const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

export type CurlIntegration = {
  httpMethod: string
  webhookAddress: string
  apiKey?: string
  aiInput: Record<string, unknown>
}

export const WEBHOOK_URL_PLACEHOLDER = 'https://workflows.cekat.ai/webhook/<path>'

export type CurlRequest = { method: string; url: string; apiKey?: string; body: Record<string, unknown> }

/** A runnable cURL: JSON body for POST/PUT/…, query string for GET. */
export function curlCommand({ method, url, apiKey, body }: CurlRequest): string {
  const target = url.trim() || WEBHOOK_URL_PLACEHOLDER
  const auth = apiKey?.trim() ? [`-H ${quote(`Authorization: Bearer ${apiKey.trim()}`)}`] : []

  if (method === 'GET') {
    const query = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])).toString()
    return [`curl -X GET ${quote(query ? `${target}?${query}` : target)}`, ...auth].join(' \\\n  ')
  }
  return [`curl -X ${method} ${quote(target)}`, `-H ${quote('Content-Type: application/json')}`, ...auth, `--data-raw ${quote(JSON.stringify(body, null, 2))}`].join(
    ' \\\n  ',
  )
}

/**
 * The integration's use case on the POC's one n8n gateway workflow: the body carries "action" = the integration
 * name (unless the AI Input already has an action field), so Switch Action routes it to its branch.
 */
export function curlForIntegration(integration: CurlIntegration & { name?: string }): string {
  const sample = sampleFromSchema(integration.aiInput)
  const fields = sample && typeof sample === 'object' && !Array.isArray(sample) ? (sample as Record<string, unknown>) : {}
  const name = integration.name?.trim()
  const body = name && !('action' in fields) ? { action: name, ...fields } : fields
  return curlCommand({ method: integration.httpMethod, url: integration.webhookAddress, apiKey: integration.apiKey, body })
}
