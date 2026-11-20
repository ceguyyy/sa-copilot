import { mkdtempSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({ auth: mocks.auth }))
vi.mock('../config.ts', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sa-mcp-oauth-'))
  return { config: { uploadDir: path.join(dir, 'uploads'), dataDir: path.join(dir, 'data'), host: '127.0.0.1', port: 3000 } }
})
import { LOGIN_TTL_MS, LoginCallbackError, StoredOAuthProvider, finishLogin, forgetLogin, hasLogin, isReadOnlyAccountTool, redirectUrl, startLogin } from './mcpOAuth.ts'
import { config } from '../config.ts'

const URL_ = 'https://mcp.cekat.ai/mcp'
const tokens = { access_token: 'at', token_type: 'Bearer', refresh_token: 'rt' }

/** auth() as the SDK runs it for a first login: register, save the verifier, then send the browser away. */
function firstLogin() {
  mocks.auth.mockImplementation(async (provider: StoredOAuthProvider, opts: { authorizationCode?: string }) => {
    if (opts.authorizationCode) {
      await provider.codeVerifier()
      await provider.saveTokens(tokens)
      return 'AUTHORIZED'
    }
    await provider.saveClientInformation({ client_id: 'client-1', redirect_uris: [redirectUrl()] })
    await provider.saveCodeVerifier('verifier')
    const url = new URL('https://auth.cekat.ai/authorize')
    url.searchParams.set('state', await provider.state())
    await provider.redirectToAuthorization(url)
    return 'REDIRECT'
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  firstLogin()
})

describe('isReadOnlyAccountTool', () => {
  it('trusts the read-only annotation when a server gives one', () => {
    expect(isReadOnlyAccountTool({ name: 'crm_delete_items', annotations: { readOnlyHint: true } })).toBe(true)
    expect(isReadOnlyAccountTool({ name: 'crm_list_boards', annotations: { readOnlyHint: false } })).toBe(false)
  })

  it('allows unannotated tools whose names only read', () => {
    for (const name of ['crm_list_boards', 'crm_get_item', 'crm_count_view_items', 'marketing_get_leads', 'marketing_check_tracking', 'broadcast_campaign_metric', 'automation_automation_ckt_list_flows', 'ping', 'central_select_business', 'marketing_start_here']) {
      expect(isReadOnlyAccountTool({ name }), name).toBe(true)
    }
  })

  it('reads dotted tool names the same way', () => {
    expect(isReadOnlyAccountTool({ name: 'crm.list_boards' })).toBe(true)
    expect(isReadOnlyAccountTool({ name: 'central.select_business' })).toBe(true)
    expect(isReadOnlyAccountTool({ name: 'crm.delete_items' })).toBe(false)
  })

  it('leaves out unannotated tools that can change the account', () => {
    for (const name of ['crm_create_item', 'crm_update_item_with_values', 'crm_delete_items', 'crm_move_items_to_group', 'marketing_apply_changes', 'marketing_save_custom_event', 'marketing_setup_conversions', 'broadcast_create_campaign', 'automation_automation_ckt_test_flow', 'automation_automation_ckt_lock_and_publish', 'marketing_connect_platform', 'marketing_undo_changes']) {
      expect(isReadOnlyAccountTool({ name }), name).toBe(false)
    }
  })
})

describe('login', () => {
  it('returns the page to open and finishes with tokens from the callback', async () => {
    const page = await startLogin('server-1', URL_)
    expect(page?.origin).toBe('https://auth.cekat.ai')
    expect(await hasLogin('server-1')).toBe(false)
    await expect(finishLogin(page!.searchParams.get('state')!, 'code-1')).resolves.toBe('server-1')
    expect(await hasLogin('server-1')).toBe(true)
    expect(mocks.auth).toHaveBeenLastCalledWith(expect.any(StoredOAuthProvider), { serverUrl: URL_, authorizationCode: 'code-1' })
  })

  it('accepts each state only once', async () => {
    const state = (await startLogin('server-2', URL_))!.searchParams.get('state')!
    await finishLogin(state, 'code')
    await expect(finishLogin(state, 'code')).rejects.toBeInstanceOf(LoginCallbackError)
  })

  it('rejects unknown and expired states without calling the server', async () => {
    await expect(finishLogin('made-up', 'code')).rejects.toBeInstanceOf(LoginCallbackError)
    await expect(finishLogin(undefined, 'code')).rejects.toBeInstanceOf(LoginCallbackError)
    vi.useFakeTimers({ now: Date.now() })
    try {
      const state = (await startLogin('server-3', URL_))!.searchParams.get('state')!
      vi.setSystemTime(Date.now() + LOGIN_TTL_MS + 1)
      mocks.auth.mockClear()
      await expect(finishLogin(state, 'code')).rejects.toThrow(/expired/)
      expect(mocks.auth).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports an already valid login instead of opening the browser', async () => {
    mocks.auth.mockResolvedValue('AUTHORIZED')
    await expect(startLogin('server-4', URL_)).resolves.toBeNull()
  })
})

describe('stored credentials', () => {
  it('keeps them in a private file outside the database and removes them on logout', async () => {
    const state = (await startLogin('server-5', URL_))!.searchParams.get('state')!
    await finishLogin(state, 'code')
    const dir = path.join((config as { dataDir: string }).dataDir, 'mcp-oauth')
    const file = path.join(dir, 'server-5.json')
    expect(readdirSync(dir)).toContain('server-5.json')
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o077).toBe(0)
    await forgetLogin('server-5')
    expect(await hasLogin('server-5')).toBe(false)
  })

  it('never opens a login from background tool calls', async () => {
    const provider = new StoredOAuthProvider('server-6', URL_)
    await provider.redirectToAuthorization(new URL('https://auth.cekat.ai/authorize?state=x'))
    expect(provider.authorizationUrl).toBeNull()
    await expect(finishLogin(await provider.state(), 'code')).rejects.toBeInstanceOf(LoginCallbackError)
  })

  it('asks to log in again when the verifier is gone', async () => {
    await expect(new StoredOAuthProvider('server-7', URL_).codeVerifier()).rejects.toThrow(/Start the login again/)
  })

  it('sends the browser back to this machine', () => {
    expect(new StoredOAuthProvider('s', URL_).clientMetadata).toMatchObject({ redirect_uris: ['http://127.0.0.1:3000/api/mcp-oauth/callback'], token_endpoint_auth_method: 'none' })
  })
})

describe('https relay page', () => {
  const RELAY = 'https://relay.example/oauth-callback.html'
  const settings = config as { mcpOAuthRelayUrl?: string }
  beforeEach(() => {
    settings.mcpOAuthRelayUrl = RELAY
    return () => {
      settings.mcpOAuthRelayUrl = undefined
    }
  })

  it('registers the relay page as the redirect and puts this port at the start of the state', async () => {
    const provider = new StoredOAuthProvider('relay-1', URL_)
    expect(provider.clientMetadata.redirect_uris).toEqual([RELAY])
    expect(provider.state()).toMatch(/^3000\.[A-Za-z0-9_-]{32}$/)
    const state = (await startLogin('relay-1', URL_))!.searchParams.get('state')!
    await expect(finishLogin(state, 'code')).resolves.toBe('relay-1')
  })

  it('registers again when the saved client was made for another redirect', async () => {
    const provider = new StoredOAuthProvider('relay-2', URL_)
    await provider.saveClientInformation({ client_id: 'old', redirect_uris: ['http://127.0.0.1:3000/api/mcp-oauth/callback'] })
    expect(await provider.clientInformation()).toBeUndefined()
    await provider.saveClientInformation({ client_id: 'new', redirect_uris: [RELAY] })
    expect(await provider.clientInformation()).toMatchObject({ client_id: 'new' })
  })
})
