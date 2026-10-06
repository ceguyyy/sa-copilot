import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({cloud:vi.fn(),updates:vi.fn()}))
vi.mock('./maintenance/cloud.ts',()=>({cloudStatus:mocks.cloud}))
vi.mock('./maintenance/updates.ts',()=>({updateStatus:mocks.updates}))
import { systemInbox } from './systemInbox.ts'
beforeEach(()=>{vi.clearAllMocks();mocks.updates.mockResolvedValue({});mocks.cloud.mockResolvedValue({configured:true,localRevision:1,remoteRevision:2})})
describe('system notifications',()=>{
  it('checks in the background, reports revision mismatches, and does not refetch on each poll',async()=>{
    expect(systemInbox('workspace:one')).toEqual([])
    await vi.waitFor(()=>expect(systemInbox('workspace:one')).toHaveLength(1))
    expect(systemInbox('workspace:one')[0]).toMatchObject({status:'attention',title:'Cloud revisions do not match',href:'/settings/backup'})
    const first=systemInbox('workspace:one')[0]
    expect(systemInbox('workspace:one')[0].token).toBe(first.token)
    expect(mocks.cloud).toHaveBeenCalledTimes(1)
  })
  it('reports failures with a safe error message',async()=>{
    mocks.cloud.mockRejectedValue(new Error('secret database URL'))
    systemInbox('workspace:failure')
    await vi.waitFor(()=>expect(systemInbox('workspace:failure')).toHaveLength(1))
    expect(systemInbox('workspace:failure')[0]).toMatchObject({status:'error',title:'Cloud backup unavailable'})
    expect(JSON.stringify(systemInbox('workspace:failure'))).not.toContain('secret database URL')
  })
  it('includes clean backup and a running app update',async()=>{
    mocks.cloud.mockResolvedValue({configured:true,localRevision:2,remoteRevision:2,localChangeStatus:'clean'})
    mocks.updates.mockResolvedValue({job:{running:true,phase:'Building'}})
    systemInbox('workspace:working')
    await vi.waitFor(()=>expect(systemInbox('workspace:working')).toHaveLength(2))
    expect(systemInbox('workspace:working').map(item=>item.status)).toEqual(['done','working'])
  })
})
