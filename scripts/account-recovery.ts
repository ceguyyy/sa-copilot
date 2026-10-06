// Local administrator recovery for an existing account bound to this data profile.
// Never generate codes for arbitrary emails: possession of the owning profile is required.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../server/config.ts'
import { connectCloud } from '../server/maintenance/cloud.ts'
import { issueRecoveryCode } from '../server/accountRecovery.ts'
const email = process.argv[2]?.trim().toLowerCase()
if (!email) throw new Error('Usage: npm run account:recovery -- <email>')
const owner = JSON.parse(await readFile(path.join(config.backupDir, 'account-owner.json'), 'utf8'))
if (owner.email !== email) throw new Error('Email does not own this local data profile')
const client = await connectCloud()
try {
  const { rows } = await client.query('select id from sa_copilot_sync.accounts where id = $1 and email = $2', [owner.id, email])
  if (!rows[0]) throw new Error('Account does not match the local owner')
  const code = await issueRecoveryCode(client, rows[0].id)
  console.log('Single-use recovery code (store privately; previous code is now invalid):')
  console.log(code)
} finally { await client.end() }
