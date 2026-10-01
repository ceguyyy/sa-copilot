// POC welcome image: an http(s) link, or an image file picked from disk and embedded in the POC as a data URL
// (so it travels with backups, versions and exports).

export const MAX_WELCOME_IMAGE_BYTES = 2 * 1024 * 1024
export const WELCOME_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

const MAX_URL_CHARS = 2000
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]*={0,2})$/
const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }

/** Decoded size of a base64 payload without decoding it. */
const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0)

export function isValidWelcomeImage(value: string): boolean {
  if (/^https?:\/\//i.test(value)) return value.length <= MAX_URL_CHARS && URL.canParse(value)
  const match = DATA_URL_RE.exec(value)
  return !!match && match[2].length % 4 === 0 && base64Bytes(match[2]) <= MAX_WELCOME_IMAGE_BYTES
}

export const isEmbeddedImage = (value: string): boolean => value.startsWith('data:image/')

/** Download name for an embedded image: <poc-slug>-welcome.<ext>. */
export function welcomeImageFileName(pocName: string, dataUrl: string): string {
  const type = /^data:([^;]+);/.exec(dataUrl)?.[1] ?? 'image/png'
  const slug = pocName
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${slug || 'poc'}-welcome.${EXTENSIONS[type] ?? 'png'}`
}
