// POC version history: restoring never rewrites history — the old config becomes current and is recorded as a new version.
import { withTransaction } from './db.ts'
import { HttpError } from './http.ts'

interface PocRow {
  id: string
  config: unknown
}

interface PocVersionRow {
  id: string
  poc_id: string
  version_no: number
  config: unknown
  note: string
  origin: 'manual' | 'ai' | 'restore'
  created_at: string
}

export async function restorePocVersion(pocId: string, versionId: string): Promise<{ poc: PocRow; version: PocVersionRow }> {
  return withTransaction(async (tx) => {
    const { rows: found } = await tx.query<PocVersionRow>('select * from poc_versions where id = $1 and poc_id = $2', [versionId, pocId])
    const source = found[0]
    if (!source) throw new HttpError(404, 'Version not found for this POC')
    const { rows: pocs } = await tx.query<PocRow>('update pocs set config = $2, updated_at = now() where id = $1 returning *', [pocId, source.config])
    if (!pocs[0]) throw new HttpError(404, 'POC not found')
    const { rows: inserted } = await tx.query<PocVersionRow>(
      `insert into poc_versions (poc_id, config, origin, note) values ($1, $2, 'restore', $3) returning *`,
      [pocId, source.config, `Restored v${source.version_no}`],
    )
    return { poc: pocs[0], version: inserted[0] }
  })
}
