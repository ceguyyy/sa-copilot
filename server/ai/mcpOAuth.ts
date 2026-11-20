// OAuth login for remote MCP servers that need an account (e.g. Cekat MCP, https://mcp.cekat.ai/mcp).
// The SDK does discovery, dynamic client registration, PKCE and token refresh; this file stores what it needs.
// Credentials live in a 0600 file per server outside the database, so they are never part of a backup or the
// cloud sync. The browser comes back to /api/mcp-oauth/callback on this machine with a single-use state.
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { auth, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { config } from '../config.ts'

interface StoredAuth {
  clientInformation?: OAuthClientInformationMixed
  tokens?: OAuthTokens
  codeVerifier?: string
}

/** How long the browser has to finish logging in. */
export const LOGIN_TTL_MS = 10 * 60_000
const pending = new Map<string, { serverId: string; serverUrl: string; expires: number }>()

const authDir = () => path.join(path.dirname(config.uploadDir), 'mcp-oauth')
const authFile = (serverId: string) => path.join(authDir(), `${serverId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`)
export const redirectUrl = () => `http://${config.host}:${config.port}/api/mcp-oauth/callback`

async function load(serverId: string): Promise<StoredAuth> {
  try {
    return JSON.parse(await readFile(authFile(serverId), 'utf8')) as StoredAuth
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw e
  }
}

async function save(serverId: string, patch: Partial<StoredAuth>): Promise<void> {
  await mkdir(authDir(), { recursive: true, mode: 0o700 })
  const next = { ...(await load(serverId)), ...patch }
  const file = authFile(serverId)
  const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(tmp, JSON.stringify(next), { mode: 0o600 })
  await rename(tmp, file)
}

export async function hasLogin(serverId: string): Promise<boolean> {
  return !!(await load(serverId)).tokens
}

export async function forgetLogin(serverId: string): Promise<void> {
  await rm(authFile(serverId), { force: true })
  for (const [state, p] of pending) if (p.serverId === serverId) pending.delete(state)
}

/**
 * The provider the SDK uses. In the background (normal tool calls) a missing or expired login never opens
 * anything: the SDK throws UnauthorizedError and the server shows "Login required" in Settings.
 */
export class StoredOAuthProvider implements OAuthClientProvider {
  /** Set when an interactive login needs the browser. */
  authorizationUrl: URL | null = null
  private loginState: string | null = null
  private readonly serverId: string
  private readonly serverUrl: string
  private readonly interactive: boolean

  constructor(serverId: string, serverUrl: string, interactive = false) {
    this.serverId = serverId
    this.serverUrl = serverUrl
    this.interactive = interactive
  }

  get redirectUrl() {
    return redirectUrl()
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'SA Copilot',
      redirect_uris: [redirectUrl()],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }
  }

  state(): string {
    this.loginState ??= randomBytes(24).toString('base64url')
    return this.loginState
  }

  async clientInformation() {
    return (await load(this.serverId)).clientInformation
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed) {
    await save(this.serverId, { clientInformation })
  }

  async tokens() {
    return (await load(this.serverId)).tokens
  }

  async saveTokens(tokens: OAuthTokens) {
    await save(this.serverId, { tokens, codeVerifier: undefined })
  }

  async saveCodeVerifier(codeVerifier: string) {
    await save(this.serverId, { codeVerifier })
  }

  async codeVerifier() {
    const verifier = (await load(this.serverId)).codeVerifier
    if (!verifier) throw new Error('Login expired. Start the login again from Settings.')
    return verifier
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'all') return forgetLogin(this.serverId)
    if (scope === 'client') return save(this.serverId, { clientInformation: undefined })
    if (scope === 'tokens') return save(this.serverId, { tokens: undefined })
    if (scope === 'verifier') return save(this.serverId, { codeVerifier: undefined })
  }

  redirectToAuthorization(url: URL) {
    if (!this.interactive) return
    this.authorizationUrl = url
    pending.set(this.state(), { serverId: this.serverId, serverUrl: this.serverUrl, expires: Date.now() + LOGIN_TTL_MS })
  }
}

/** Starts a login. Returns the page to open in the browser, or null when the saved login still works. */
export async function startLogin(serverId: string, serverUrl: string): Promise<URL | null> {
  const provider = new StoredOAuthProvider(serverId, serverUrl, true)
  const result = await auth(provider, { serverUrl })
  return result === 'AUTHORIZED' ? null : provider.authorizationUrl
}

export class LoginCallbackError extends Error {}

/** Finishes a login from the browser redirect. The state is single-use and expires after LOGIN_TTL_MS. */
export async function finishLogin(state: string | undefined, code: string | undefined): Promise<string> {
  const login = state ? pending.get(state) : undefined
  if (state) pending.delete(state)
  if (!login || login.expires < Date.now()) throw new LoginCallbackError('This login link has expired or was already used. Start the login again from Settings.')
  if (!code) throw new LoginCallbackError('The server did not return an authorization code.')
  await auth(new StoredOAuthProvider(login.serverId, login.serverUrl), { serverUrl: login.serverUrl, authorizationCode: code })
  return login.serverId
}

/** Read-only verbs and the few harmless session tools a logged-in account server may expose to the AI. */
const READ_NAME = /(^|_)(list|get|count|check|find|search|read|discover|ping|healthz|research|resolve|validate|structure|metric|metrics|detail|trend|status)(_|$)/
const WRITE_NAME = /(^|_)(create|update|delete|save|apply|connect|disconnect|install|propose|undo|claim|move|import|duplicate|publish|retry|test|change|add|rename|build|configure|setup_conversions|manage|lock|send|remove|set|post|upload)(_|$)/
const SESSION_TOOLS = /(^|_)(select_business|start_here|setup_guide)$/

/**
 * For servers acting on a logged-in account: tools that declare themselves read-only, or — when a server does
 * not annotate its tools — tools whose name only reads. Anything that could change the account is left out.
 */
export function isReadOnlyAccountTool(tool: { name: string; annotations?: { readOnlyHint?: boolean } }): boolean {
  const hint = tool.annotations?.readOnlyHint
  if (hint !== undefined) return hint
  // Servers may use dots or dashes (crm.list_boards); compare in the underscore form.
  const name = tool.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  if (SESSION_TOOLS.test(name)) return true
  return READ_NAME.test(name) && !WRITE_NAME.test(name)
}
