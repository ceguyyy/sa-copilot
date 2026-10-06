import { describe, expect, it } from 'vitest'
import { importConnectionEnv } from './connectionEnv.ts'

describe('connection ENV import',()=>{
  it('maps supported fields while skipping desktop-managed settings',()=>{
    const result=importConnectionEnv('\uFEFF# config\r\n9ROUTER_API_KEY=secret\r\nANTHROPIC_MODEL=custom-model\nCLOUD_DATABASE_URL=postgresql://user:password@host/db\nDATABASE_URL=postgres://local/db\nPORT=3000\nUPLOAD_DIR=data/uploads\nCLOUD_WORKSPACE=legacy')
    expect(result.patch).toEqual({values:{aiModel:'custom-model'},secrets:{routerApiKey:'secret',cloudDatabaseUrl:'postgresql://user:password@host/db'}})
    expect(result.ignored).toEqual(['DATABASE_URL','PORT','UPLOAD_DIR','CLOUD_WORKSPACE'])
  })
  it('handles export, quoted hashes, comments and literal Windows paths',()=>{
    const result=importConnectionEnv(`export OUTLINE_API_KEY="secret#part" # note\nDOCS_DIR='C:\\new\\templates'\nCHAT_EFFORT=high # note\nDECK_TEMPLATE=C:\\templates\\deck.pptx`)
    expect(result.patch.secrets).toEqual({outlineApiKey:'secret#part'})
    expect(result.patch.values).toEqual({docsDir:'C:\\new\\templates',chatEffort:'high',deckTemplate:'C:\\templates\\deck.pptx'})
  })
  it('never clears saved secrets from empty assignments but allows value resets',()=>{
    const result=importConnectionEnv('NOTION_TOKEN=\nANTHROPIC_MODEL=\nOUTLINE_API_KEY=""')
    expect(result.patch).toEqual({values:{aiModel:''},secrets:{}})
    expect(result.emptySecrets).toEqual(['NOTION_TOKEN','OUTLINE_API_KEY'])
  })
  it('uses the last duplicate and prioritizes non-empty 9router over Anthropic',()=>{
    for (const text of ['ANTHROPIC_API_KEY=direct\n9ROUTER_API_KEY=router','9ROUTER_API_KEY=router\nANTHROPIC_API_KEY=direct']) {
      expect(importConnectionEnv(text).patch.secrets?.routerApiKey).toBe('router')
    }
    expect(importConnectionEnv('9ROUTER_API_KEY=\nANTHROPIC_API_KEY=direct').patch.secrets?.routerApiKey).toBe('direct')
    expect(importConnectionEnv('ANTHROPIC_MODEL=first\nANTHROPIC_MODEL=last').patch.values?.aiModel).toBe('last')
  })
  it('keeps shell syntax as literal data and handles multiline quotes',()=>{
    expect(importConnectionEnv("NOTION_TOKEN='$(command)\n${TOKEN}'").patch.secrets?.notionToken).toBe('$(command)\n${TOKEN}')
  })
  it('returns errors without echoing secret contents',()=>{
    for(const text of ['NOTION_TOKEN="private-secret','NOTION_TOKEN="private-secret" junk','invalid private-secret']) {
      expect(()=>importConnectionEnv(text)).toThrow(/line 1/)
      try {importConnectionEnv(text)} catch(e) {expect(String(e)).not.toContain('private-secret')}
    }
  })
  it('validates supported values before applying any changes',()=>{
    expect(()=>importConnectionEnv('9ROUTER_API_KEY=secret\nCHAT_EFFORT=extreme')).toThrow('CHAT_EFFORT')
    expect(()=>importConnectionEnv('ANTHROPIC_BASE_URL=file:///private')).toThrow('HTTP')
    expect(()=>importConnectionEnv('CLOUD_DATABASE_URL=https://private')).toThrow('PostgreSQL')
    expect(()=>importConnectionEnv('NOTION_TOKEN='+'x'.repeat(2001))).toThrow('2000')
    expect(()=>importConnectionEnv('x'.repeat(1024*1024+1))).toThrow('1 MB')
  })
  it('ignores object prototype names',()=>{
    expect(importConnectionEnv('__proto__=secret\nconstructor=secret').patch).toEqual({values:{},secrets:{}})
  })
})
