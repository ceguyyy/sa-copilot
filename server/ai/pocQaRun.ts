// POC Agent QA: runs the POC's planned happy cases on its livechat and saves the report to poc_qa_runs.
import { z } from 'zod'
import { queryOne } from '../db.ts'
import { HttpError, UUID_RE } from '../http.ts'
import { pocConfig } from '../validation.ts'
import type { Stream } from './stream.ts'
import { currentPocSummary } from './pocDraft.ts'
import { executeQaRun, runFields } from '../qa/runner.ts'

export { stopQa } from '../qa/runner.ts'

const input = z.object({ pocId: z.string().regex(UUID_RE), ...runFields })

export async function runQa(body: unknown, out: Stream): Promise<void> {
  const req = input.parse(body)
  const poc = await queryOne<{ config: unknown }>('select config from pocs where id = $1', [req.pocId])
  if (!poc) throw new HttpError(404, 'POC not found')
  const report = await executeQaRun(req, currentPocSummary(pocConfig.parse(poc.config ?? {})), out)
  const row = await queryOne('insert into poc_qa_runs (poc_id, report) values ($1, $2) returning *', [req.pocId, report])
  out.send({ type: 'result', data: row })
  out.send({ type: 'done' })
}
