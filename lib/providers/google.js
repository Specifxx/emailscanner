import { config } from '../config.js'
import { AuthError } from '../errors.js'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CONCURRENCY = 10
const MAX_SEARCH_TERMS = 14

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
]

export const id = 'google'
export const label = 'Google'

export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    // Google only returns a refresh token on first consent unless forced.
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

async function postToken(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Token request failed')
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  }
}

export function exchangeCode(code) {
  return postToken({
    code,
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    redirect_uri: config.googleRedirectUri,
    grant_type: 'authorization_code',
  })
}

export async function refreshTokens(refreshToken) {
  try {
    return await postToken({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })
  } catch {
    throw new AuthError('Your Google session expired. Please sign in again.')
  }
}

export async function fetchProfile(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Could not read your Google profile')

  const profile = await res.json()
  return {
    providerId: profile.sub,
    email: profile.email || '',
    name: profile.name || '',
    picture: profile.picture || null,
  }
}

/**
 * Gmail's `{a b}` syntax means OR, so one query pre-filters server-side and we
 * only pull plausible candidates.
 */
export function buildQuery(parsed) {
  const top = parsed.terms.slice(0, MAX_SEARCH_TERMS)
  if (!top.length) return `newer_than:${parsed.window.gmail}`

  const clauses = top.map(({ term, phrase }) => (phrase ? `"${term}"` : term))
  return `{${clauses.join(' ')}} newer_than:${parsed.window.gmail} -in:spam -in:trash`
}

async function gmailFetch(path, accessToken) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (res.status === 401 || res.status === 403) {
    throw new AuthError('Gmail access was denied. Please sign in again.')
  }
  if (res.status === 429) {
    throw new Error('Gmail is rate limiting us. Try again in a moment.')
  }
  if (!res.ok) {
    throw new Error(`Gmail request failed (${res.status}).`)
  }

  return res.json()
}

function header(headers, name) {
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
  return found ? found.value : ''
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

/** Fetches headers + snippet only. Message bodies are never requested. */
async function fetchMetadata(accessToken, id) {
  const params = new URLSearchParams({ format: 'metadata' })
  for (const name of ['Subject', 'From', 'Date']) {
    params.append('metadataHeaders', name)
  }

  const message = await gmailFetch(`/messages/${id}?${params}`, accessToken)
  const headers = message.payload?.headers || []
  const labels = message.labelIds || []

  return {
    id: message.id,
    subject: header(headers, 'Subject'),
    from: header(headers, 'From'),
    date: message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : null,
    snippet: decodeEntities(message.snippet || ''),
    unread: labels.includes('UNREAD'),
    promotional: labels.includes('CATEGORY_PROMOTIONS'),
    url: `https://mail.google.com/mail/u/0/#all/${message.threadId || message.id}`,
  }
}

/**
 * Gmail needs one request per message for metadata, so this runs a bounded
 * worker pool over the ids returned by the search.
 */
export async function search(accessToken, parsed, maxResults = 100) {
  const params = new URLSearchParams({
    q: buildQuery(parsed),
    maxResults: String(Math.min(maxResults, 100)),
  })
  const data = await gmailFetch(`/messages?${params}`, accessToken)
  const ids = data.messages || []
  if (!ids.length) return []

  const results = new Array(ids.length)
  let cursor = 0

  async function worker() {
    while (cursor < ids.length) {
      const index = cursor++
      try {
        results[index] = await fetchMetadata(accessToken, ids[index].id)
      } catch (err) {
        if (err instanceof AuthError) throw err
        // One bad message shouldn't sink the whole scan.
        results[index] = null
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker)
  )

  return results.filter(Boolean)
}
