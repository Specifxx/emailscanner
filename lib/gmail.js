import { config } from './config.js'
import { updateTokens } from './supabase.js'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const CONCURRENCY = 10

class AuthError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthError'
  }
}

export { AuthError }

/**
 * Returns a usable access token for the user, refreshing it first if the stored
 * one is expired or about to be.
 */
export async function getAccessToken(user) {
  const expiry = user.token_expiry ? new Date(user.token_expiry).getTime() : 0
  const stillFresh = user.access_token && expiry - Date.now() > 60_000
  if (stillFresh) return user.access_token

  if (!user.refresh_token) {
    throw new AuthError('Your Google session expired. Please sign in again.')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: user.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  const tokens = await res.json()
  if (!res.ok) {
    throw new AuthError('Your Google session expired. Please sign in again.')
  }

  await updateTokens(user.id, {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
  })

  return tokens.access_token
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

/** Searches Gmail and returns matching message ids (read and unread). */
export async function searchMessages(accessToken, query, maxResults = 100) {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(Math.min(maxResults, 100)),
  })
  const data = await gmailFetch(`/messages?${params}`, accessToken)
  return data.messages || []
}

function header(headers, name) {
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
  return found ? found.value : ''
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
    threadId: message.threadId,
    subject: header(headers, 'Subject'),
    from: header(headers, 'From'),
    date: message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : null,
    snippet: decodeEntities(message.snippet || ''),
    unread: labels.includes('UNREAD'),
    labels,
  }
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

/** Fetches metadata for many ids with a bounded worker pool. */
export async function fetchMessages(accessToken, ids) {
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

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, ids.length) },
    worker
  )
  await Promise.all(workers)

  return results.filter(Boolean)
}
