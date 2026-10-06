import { describe, expect, it } from 'vitest'
import { curlForIntegration, sampleFromSchema } from './pocCurl.ts'

const schema = {
  type: 'object',
  properties: {
    doctor: { type: 'string', example: 'dr. Andi' },
    date: { type: 'string', format: 'date' },
    slot: { type: 'string', enum: ['pagi', 'sore'] },
    pax: { type: 'integer', default: 2 },
    paid: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
    patient: { type: 'object', properties: { name: { type: 'string' } } },
  },
}

describe('sampleFromSchema', () => {
  it('prefers the schema example, default or first enum value', () => {
    const sample = sampleFromSchema(schema) as Record<string, unknown>
    expect(sample.doctor).toBe('dr. Andi')
    expect(sample.slot).toBe('pagi')
    expect(sample.pax).toBe(2)
  })

  it('fills the rest with realistic dummy data guessed from the field name', () => {
    const sample = sampleFromSchema({
      type: 'object',
      properties: {
        patient_name: { type: 'string' },
        phone_number: { type: 'string' },
        email: { type: 'string' },
        doctor_name: { type: 'string' },
        appointment_date: { type: 'string' },
        birth_date: { type: 'string', format: 'date' },
        jam: { type: 'string' },
        alamat: { type: 'string' },
        nik: { type: 'string' },
        keluhan: { type: 'string' },
        age: { type: 'integer' },
        total_harga: { type: 'number' },
        paid: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
        patient: { type: 'object', properties: { name: { type: 'string' } } },
        misc: { type: 'string' },
        count: { type: 'integer', minimum: 3 },
      },
    })
    expect(sample).toEqual({
      patient_name: 'Budi Santoso',
      phone_number: '6281234567890',
      email: 'budi.santoso@example.com',
      doctor_name: 'dr. Andi Wijaya, Sp.PD',
      appointment_date: '2026-10-05',
      birth_date: '1990-05-17',
      jam: '09:00',
      alamat: 'Jl. Sudirman No. 10, Jakarta Pusat',
      nik: '3171012345670001',
      keluhan: 'Demam dan batuk sejak 3 hari',
      age: 35,
      total_harga: 150000,
      paid: true,
      tags: ['Contoh tags'],
      patient: { name: 'Budi Santoso' },
      misc: 'Contoh misc',
      count: 3,
    })
  })
})

describe('curlForIntegration', () => {
  it('builds a POST with a JSON body and the bearer key, ready for Postman import', () => {
    const curl = curlForIntegration({
      httpMethod: 'POST',
      webhookAddress: 'https://workflows.cekat.ai/webhook/x-cek',
      apiKey: 'k1',
      aiInput: { type: 'object', properties: { note: { type: 'string', example: "it's ok" } } },
    })
    expect(curl).toBe(
      [
        "curl -X POST 'https://workflows.cekat.ai/webhook/x-cek' \\",
        "  -H 'Content-Type: application/json' \\",
        "  -H 'Authorization: Bearer k1' \\",
        `  --data-raw '{\n  "note": "it'\\''s ok"\n}'`,
      ].join('\n'),
    )
  })

  it('sends GET parameters as a query string and leaves out the key when there is none', () => {
    const curl = curlForIntegration({
      httpMethod: 'GET',
      webhookAddress: 'https://workflows.cekat.ai/webhook/x-cek',
      aiInput: { type: 'object', properties: { q: { type: 'string', example: 'a b' }, n: { type: 'integer' } } },
    })
    expect(curl).toBe("curl -X GET 'https://workflows.cekat.ai/webhook/x-cek?q=a+b&n=1'")
  })

  it('routes to its use case on the gateway workflow: "action" = the integration name, first in the body', () => {
    const curl = curlForIntegration({
      name: 'create_ticket',
      httpMethod: 'POST',
      webhookAddress: 'https://workflows.cekat.ai/webhook/gw',
      aiInput: { type: 'object', properties: { note: { type: 'string', example: 'x' } } },
    })
    expect(curl).toContain(`--data-raw '{\n  "action": "create_ticket",\n  "note": "x"\n}'`)
  })

  it('keeps an action field the AI Input already defines', () => {
    const curl = curlForIntegration({
      name: 'create_ticket',
      httpMethod: 'POST',
      webhookAddress: '',
      aiInput: { type: 'object', properties: { action: { type: 'string', enum: ['open_ticket'] } } },
    })
    expect(curl).toContain('"action": "open_ticket"')
    expect(curl).toContain("'https://workflows.cekat.ai/webhook/<path>'")
  })
})
