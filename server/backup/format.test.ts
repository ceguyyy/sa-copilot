import { readFileSync } from 'node:fs'
import path from 'node:path'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES, DEVICE_LOCAL_TABLES, BackupError, isSafeFileName, packBackup, unpackBackup } from './format.ts'

const schema = readFileSync(path.resolve(import.meta.dirname, '../../db/schema.sql'), 'utf8')

describe('BACKUP_TABLES', () => {
  it('covers exactly the tables in db/schema.sql', () => {
    const inSchema = [...schema.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1])
    expect([...BACKUP_TABLES, ...DEVICE_LOCAL_TABLES].sort()).toEqual([...new Set(inSchema)].sort())
  })

  it('lists every referenced table before the table that references it', () => {
    const pairs: [child: string, parent: string][] = []
    for (const m of schema.matchAll(/create table if not exists (\w+) \(([\s\S]*?)\n\);/g)) {
      for (const r of m[2].matchAll(/references (\w+)/g)) pairs.push([m[1], r[1]])
    }
    for (const m of schema.matchAll(/alter table (\w+) add column[^;]*references (\w+)/g)) pairs.push([m[1], m[2]])
    const order = BACKUP_TABLES as readonly string[]
    for (const [child, parent] of pairs) {
      if (child !== parent) expect(order.indexOf(parent), `${parent} before ${child}`).toBeLessThan(order.indexOf(child))
    }
  })
})

describe('isSafeFileName', () => {
  it('accepts upload keys and rejects paths', () => {
    expect(isSafeFileName('3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b-Brief_v2.pdf')).toBe(true)
    for (const bad of ['', '.', '..', '../x', 'a/b', 'a\\b', '.hidden', 'x'.repeat(256)]) expect(isSafeFileName(bad), bad).toBe(false)
  })
})

describe('packBackup / unpackBackup', () => {
  const tables = { projects: [{ id: 'p1', name: 'Xhealth' }], documents: [] }
  const files = { 'abc-Brief.pdf': strToU8('%PDF-1.7') }

  it('round-trips tables, files and a manifest with counts', () => {
    const { data, manifest } = packBackup({ tables, files }, '1.0.0', new Date('2026-09-28T00:00:00Z'))
    expect(manifest).toEqual({
      format: 'sa-copilot-backup',
      formatVersion: 1,
      appVersion: '1.0.0',
      createdAt: '2026-09-28T00:00:00.000Z',
      tables: { projects: 1, documents: 0 },
      files: 1,
    })
    const back = unpackBackup(data)
    expect(back.manifest).toEqual(manifest)
    expect(back.tables.projects).toEqual([{ id: 'p1', name: 'Xhealth' }])
    expect(new TextDecoder().decode(back.files['abc-Brief.pdf'])).toBe('%PDF-1.7')
    expect(back.warnings).toEqual([])
  })

  it('warns about tables this version does not know and drops them', () => {
    const { data } = packBackup({ tables: { ...tables, old_table: [{ x: 1 }] }, files: {} }, '0.9.0')
    const back = unpackBackup(data)
    expect(back.tables).not.toHaveProperty('old_table')
    expect(back.warnings).toEqual(['Skipped unknown table "old_table" (1 rows)'])
  })

  it('rejects a zip without a manifest', () => {
    expect(() => unpackBackup(zipSync({ 'db/projects.json': strToU8('[]') }))).toThrow(new BackupError('Not an SA Copilot backup (manifest.json missing)'))
  })

  it('rejects another format or a newer format version', () => {
    const manifest = (m: object) => zipSync({ 'manifest.json': strToU8(JSON.stringify(m)) })
    expect(() => unpackBackup(manifest({ format: 'other', formatVersion: 1 }))).toThrow(BackupError)
    expect(() => unpackBackup(manifest({ format: 'sa-copilot-backup', formatVersion: 2 }))).toThrow(/newer version/)
  })

  it('rejects file names that could escape the upload folder', () => {
    const { data } = packBackup({ tables, files: {} }, '1.0.0')
    const tampered = zipSync({ ...unzipAll(data), 'files/../evil.js': strToU8('x') })
    expect(() => unpackBackup(tampered)).toThrow(/Unsafe file name/)
  })

  it('rejects an upload larger than 50 MB', () => {
    const { data } = packBackup({ tables, files: {} }, '1.0.0')
    const big = new Uint8Array(50 * 1024 * 1024 + 1)
    expect(() => unpackBackup(zipSync({ ...unzipAll(data), 'files/big.bin': big }, { level: 1 }))).toThrow(/larger than 50 MB/)
  })

  it('rejects anything that is not a zip', () => {
    expect(() => unpackBackup(strToU8('hello'))).toThrow(BackupError)
  })
})

function unzipAll(data: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(data)
}
