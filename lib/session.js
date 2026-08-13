import jwt from 'jsonwebtoken'
import { config } from './config.js'

const COOKIE_NAME = 'session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export function parseCookies(req) {
  const header = req.headers?.cookie
  if (!header) return {}

  return header.split(';').reduce((acc, part) => {
    const index = part.indexOf('=')
    if (index === -1) return acc
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!name) return acc
    try {
      acc[name] = decodeURIComponent(value)
    } catch {
      // An unrelated cookie with a stray '%' must not take down every route.
      acc[name] = value
    }
    return acc
  }, {})
}

export function serializeCookie(name, value, { maxAge, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax']
  if (httpOnly) parts.push('HttpOnly')
  if (config.isProduction) parts.push('Secure')
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`)
  return parts.join('; ')
}

export function createSessionCookie(payload) {
  const token = jwt.sign(payload, config.sessionSecret, {
    expiresIn: MAX_AGE_SECONDS,
  })
  return serializeCookie(COOKIE_NAME, token, { maxAge: MAX_AGE_SECONDS })
}

export function clearSessionCookie() {
  return serializeCookie(COOKIE_NAME, '', { maxAge: 0 })
}

/**
 * Namespaced per provider so starting a second sign-in doesn't overwrite the
 * first one's nonce and break whichever flow the user finishes.
 */
export function stateCookieName(provider) {
  return `oauth_state_${provider}`
}

export function getSession(req) {
  const token = parseCookies(req)[COOKIE_NAME]
  if (!token) return null

  try {
    return jwt.verify(token, config.sessionSecret)
  } catch {
    return null
  }
}
