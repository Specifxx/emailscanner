import crypto from 'node:crypto'
import { config } from './config.js'

// OAuth tokens are stored at rest in Supabase encrypted with AES-256-GCM so a
// leaked database dump alone does not grant access to anybody's mailbox.
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

function key() {
  return crypto.createHash('sha256').update(config.sessionSecret).digest()
}

export function encrypt(plaintext) {
  if (plaintext == null) return null

  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv)
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join('.')
}

export function decrypt(payload) {
  if (!payload) return null

  const [ivPart, tagPart, dataPart] = String(payload).split('.')
  if (!ivPart || !tagPart || !dataPart) return null

  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key(),
      Buffer.from(ivPart, 'base64')
    )
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // Wrong key or tampered ciphertext — treat as no stored token.
    return null
  }
}
