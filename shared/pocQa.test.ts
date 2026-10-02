import { describe, expect, it } from 'vitest'
import { dummyForLabel, fillVariables, isLivechatUrl, type QaReport, reportTotals, revisionInstruction } from './pocQa.ts'

describe('isLivechatUrl', () => {
  it('accepts only https Cekat livechat links', () => {
    expect(isLivechatUrl('https://live.cekat.ai/?chat=BPKH-W9CZ8P9r')).toBe(true)
    expect(isLivechatUrl('http://live.cekat.ai/?chat=x')).toBe(false)
    expect(isLivechatUrl('https://evil.example.com/?chat=x')).toBe(false)
    expect(isLivechatUrl('https://live.cekat.ai.evil.com/?chat=x')).toBe(false)
    expect(isLivechatUrl('not a url')).toBe(false)
  })
})

describe('fillVariables', () => {
  it('replaces {{key}} with the value and leaves unknown keys visible', () => {
    expect(fillVariables('Cek pesanan {{order}} atas nama {{nama}} {{x}}', { order: 'INV-001', nama: 'Budi' })).toBe('Cek pesanan INV-001 atas nama Budi {{x}}')
  })
})

describe('dummyForLabel', () => {
  it('makes a plausible value from the field label', () => {
    expect(dummyForLabel('Phone Number *', 2)).toMatch(/^628\d{9,11}$/)
    expect(dummyForLabel('Phone Number *', 2)).not.toBe(dummyForLabel('Phone Number *', 3))
    expect(dummyForLabel('DOB', 0, 'ddmmyyyyy')).toMatch(/^\d{8}$/)
    expect(dummyForLabel('Email')).toMatch(/@/)
    expect(dummyForLabel('Name *')).toMatch(/QA/)
  })
})

const report = (): QaReport => ({
  livechatUrl: 'https://live.cekat.ai/?chat=x',
  startedAt: '2026-10-02T00:00:00Z',
  finishedAt: '2026-10-02T00:05:00Z',
  summary: 'ok',
  revisionPrompt: 'Tambahkan aturan refund',
  cases: [
    {
      title: 'Booking',
      goal: '',
      error: '',
      steps: [
        { sent: 'Halo', replies: ['Hai'], expectedAi: 'Sapa', expectedAction: '', verdict: 'pass', reason: '', actionCheck: 'none' },
        { sent: 'Booking', replies: [], expectedAi: 'Tanya tanggal', expectedAction: 'Label: Booking', verdict: 'no_reply', reason: 'Timeout', actionCheck: 'pending' },
        { sent: 'Besok', replies: ['Ok'], expectedAi: 'Konfirmasi', expectedAction: 'cek_jadwal', verdict: 'fail', reason: 'Salah tanggal', actionCheck: 'pass' },
      ],
    },
  ],
})

describe('reportTotals', () => {
  it('counts replies and manual action checks separately', () => {
    expect(reportTotals(report())).toEqual({ steps: 3, pass: 1, fail: 2, actionsPending: 1, actionsPass: 1, actionsFail: 0 })
  })
})

describe('revisionInstruction', () => {
  it('turns the report into a Revise with AI instruction listing failed steps', () => {
    const text = revisionInstruction(report())
    expect(text).toContain('Tambahkan aturan refund')
    expect(text).toContain('Booking')
    expect(text).toContain('Salah tanggal')
  })
})
