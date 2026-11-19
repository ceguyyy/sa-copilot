import { createHash } from 'node:crypto'
import { strToU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { CLOUD_SNAPSHOT_VERSION, assembleBackup, fileHashes, packCloudSnapshot, readCloudSnapshot } from './cloudSnapshot.ts'
import { BackupError, packBackup, unpackBackup } from './format.ts'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const tables = { projects: [{ id: 'p1', name: 'Xhealth' }] }
const files = { 'a-Brief.pdf': strToU8('%PDF-brief'), 'b-Deck.pdf': strToU8('%PDF-deck') }

describe('fileHashes', () => {
  it('maps each upload to the SHA-256 of its bytes', () => {
    expect(fileHashes(files)).toEqual({ 'a-Brief.pdf': sha('%PDF-brief'), 'b-Deck.pdf': sha('%PDF-deck') })
  })
})

describe('packCloudSnapshot / readCloudSnapshot', () => {
  it('stores the tables and file hashes but none of the file bytes', () => {
    const { data } = packCloudSnapshot(tables, fileHashes(files), '2.1.1')
    const entries = Object.keys(unzipSync(data))
    expect(entries.some((e) => e.startsWith('files/'))).toBe(false)
    const snap = readCloudSnapshot(data)
    expect(snap).toMatchObject({ kind: 'blobs', tables, files: fileHashes(files) })
    expect(snap.kind === 'blobs' && snap.manifest.formatVersion).toBe(CLOUD_SNAPSHOT_VERSION)
  })

  it('cannot be restored by an older app version as if it were a full backup', () => {
    const { data } = packCloudSnapshot(tables, fileHashes(files), '2.1.1')
    expect(() => unpackBackup(data)).toThrow(/newer version/)
  })

  it('still reads a full (older) cloud snapshot as is', () => {
    const { data } = packBackup({ tables, files }, '2.0.0')
    expect(readCloudSnapshot(data)).toEqual({ kind: 'full', data })
  })

  it('rejects unsafe file names and malformed hashes', () => {
    expect(() => packCloudSnapshot(tables, { '../evil.js': sha('x') }, '2.1.1')).toThrow(BackupError)
    expect(() => packCloudSnapshot(tables, { 'a.pdf': 'not-a-hash' }, '2.1.1')).toThrow(BackupError)
  })
})

describe('assembleBackup', () => {
  it('rebuilds a full backup from the snapshot and verified blobs', () => {
    const { data } = packCloudSnapshot(tables, fileHashes(files), '2.1.1')
    const snap = readCloudSnapshot(data)
    if (snap.kind !== 'blobs') throw new Error('expected blobs')
    const blobs = new Map([[sha('%PDF-brief'), files['a-Brief.pdf']], [sha('%PDF-deck'), files['b-Deck.pdf']]])
    const back = unpackBackup(assembleBackup(snap, blobs))
    expect(back.tables.projects).toEqual(tables.projects)
    expect(new TextDecoder().decode(back.files['b-Deck.pdf'])).toBe('%PDF-deck')
  })

  it('refuses to rebuild when a file is missing or its bytes do not match the hash', () => {
    const { data } = packCloudSnapshot(tables, fileHashes(files), '2.1.1')
    const snap = readCloudSnapshot(data)
    if (snap.kind !== 'blobs') throw new Error('expected blobs')
    expect(() => assembleBackup(snap, new Map([[sha('%PDF-brief'), files['a-Brief.pdf']]]))).toThrow(/b-Deck.pdf/)
    const corrupt = new Map([[sha('%PDF-brief'), files['a-Brief.pdf']], [sha('%PDF-deck'), strToU8('tampered')]])
    expect(() => assembleBackup(snap, corrupt)).toThrow(/b-Deck.pdf/)
  })
})
