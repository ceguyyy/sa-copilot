import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
const scrypt = promisify(scryptCallback)
export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64) as Buffer
  return `${salt}:${hash.toString('hex')}`
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(':')
  if (!salt || !hex || !/^[a-f0-9]{128}$/.test(hex)) return false
  const hash = await scrypt(password, salt, 64) as Buffer
  return timingSafeEqual(hash, Buffer.from(hex, 'hex'))
}
