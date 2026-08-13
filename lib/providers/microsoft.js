import { config } from '../config.js'
import { AuthError } from '../errors.js'

const GRAPH = 'https://graph.microsoft.com/v1.0'
// `common` lets both personal (outlook.com) and work/school accounts sign in.
const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0'
const MAX_SEARCH_TERMS = 14
// Graph caps a $search page at 1000, but large pages risk a gateway timeout.
const PAGE_SIZE = 100
// KQL is capped around 2048 characters; stay well clear.
const MAX_KQL = 1800

// Mail.Read (not Mail.ReadBasic) — ReadBasic omits bodyPreview, which we rank on.
const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Mail.Read',
]

const SELECT = [
  'id',
  'conversationId',
  'subject',
  'from',
  'sender',
  'receivedDateTime',
  'bodyPreview',
  'isRead',
  'isDraft',
  'webLink',
  'parentFolderId',
].join(',')

export const id = 'microsoft'
export const label = 'Outlook'

export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: config.microsoftClientId,
    redirect_uri: config.microsoftRedirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: SCOPES.join(' '),
    state,
  })
  return `${AUTHORITY}/authorize?${params}`
}

async function postToken(body) {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(
      data.error_description?.split('\n')[0] || data.error || 'Token request failed'
    )
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    idToken: data.id_token || null,
    // Microsoft varies this between 60 and 90 minutes; never assume 3600.
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  }
}

export function exchangeCode(code) {
  return postToken({
    client_id: config.microsoftClientId,
    client_secret: config.microsoftClientSecret,
    code,
    redirect_uri: config.microsoftRedirectUri,
    grant_type: 'authorization_code',
    scope: SCOPES.join(' '),
  })
}

/**
 * Microsoft rotates refresh tokens: every refresh returns a NEW one that must
 * replace the stored token, or the chain dies once the original ages out.
 * Note there is no redirect_uri on this grant.
 */
export async function refreshTokens(refreshToken) {
  try {
    return await postToken({
      client_id: config.microsoftClientId,
      client_secret: config.microsoftClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: SCOPES.join(' '),
    })
  } catch {
    throw new AuthError('Your Outlook session expired. Please sign in again.')
  }
}

async function graphGet(url, accessToken) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (res.status === 401 || res.status === 403) {
    throw new AuthError('Outlook access was denied. Please sign in again.')
  }
  if (res.status === 429 || res.status === 503) {
    throw new Error('Outlook is rate limiting us. Try again in a moment.')
  }
  if (!res.ok) {
    const err = new Error(`Outlook request failed (${res.status}).`)
    err.status = res.status
    throw err
  }

  return res.json()
}

/**
 * `mail` is often null on personal Microsoft accounts, and userPrincipalName
 * can be a non-deliverable federated alias, so fall through a chain.
 */
function pickEmail(me) {
  const upn = me.userPrincipalName || ''
  const upnUsable =
    upn.includes('@') &&
    !upn.includes('#EXT#') &&
    !upn.toLowerCase().endsWith('.onmicrosoft.com')

  return (
    me.mail ||
    (upnUsable ? upn : '') ||
    (Array.isArray(me.otherMails) ? me.otherMails[0] : '') ||
    upn ||
    ''
  )
}

/**
 * Reads the id_token payload without verifying it. Safe here only because it
 * came straight back from Microsoft's token endpoint over TLS — never do this
 * with a token that arrived from a browser.
 */
function readIdToken(idToken) {
  try {
    const payload = idToken.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return {}
  }
}

export async function fetchProfile(accessToken, idToken) {
  const me = await graphGet(
    `${GRAPH}/me?$select=id,displayName,mail,userPrincipalName,otherMails`,
    accessToken
  ).catch(() => {
    throw new Error('Could not read your Outlook profile')
  })

  // Microsoft's guidance is that the tenant id must form part of the key: the
  // same person in two tenants gets a different oid in each.
  const claims = idToken ? readIdToken(idToken) : {}
  const providerId =
    claims.oid && claims.tid ? `${claims.tid}:${claims.oid}` : me.id

  return {
    providerId,
    email: pickEmail(me) || claims.email || claims.preferred_username || '',
    name: me.displayName || claims.name || '',
    // Graph serves the photo as binary from a separate endpoint, so there is
    // no URL to hand the browser. The UI falls back to an initial.
    picture: null,
  }
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Builds a KQL string for Graph's $search. Unlike Gmail, $search cannot be
 * combined with $filter, so the time window has to live inside the KQL itself.
 * Booleans must be uppercase and the OR group needs parentheses, otherwise AND
 * binds tighter and the date clause silently swallows the last term.
 */
export function buildQuery(parsed, { withDate = true } = {}) {
  const clean = (term) => term.replace(/["\\]/g, '')

  const clauses = []
  let length = 0
  for (const { term, phrase } of parsed.terms.slice(0, MAX_SEARCH_TERMS)) {
    const clause = phrase ? `"${clean(term)}"` : clean(term)
    if (!clause) continue
    if (length + clause.length + 4 > MAX_KQL) break
    clauses.push(clause)
    length += clause.length + 4
  }

  const dateClause = withDate ? `received>=${isoDaysAgo(parsed.window.days)}` : ''

  if (!clauses.length) return dateClause
  if (!dateClause) return `(${clauses.join(' OR ')})`
  return `(${clauses.join(' OR ')}) AND ${dateClause}`
}

/** The $search value is a quoted KQL string, so inner quotes get escaped. */
function searchUrl(kql, top) {
  const quoted = `"${kql.replace(/"/g, '\\"')}"`
  // Built by hand rather than with URLSearchParams, which encodes spaces as
  // "+" — Graph wants %20 here.
  return (
    `${GRAPH}/me/messages` +
    `?$search=${encodeURIComponent(quoted)}` +
    `&$select=${SELECT}` +
    `&$top=${top}`
  )
}

async function excludedFolderIds(accessToken) {
  const names = ['junkemail', 'deleteditems']
  const results = await Promise.all(
    names.map((name) =>
      graphGet(`${GRAPH}/me/mailFolders/${name}?$select=id`, accessToken)
        .then((f) => f.id)
        .catch(() => null)
    )
  )
  return new Set(results.filter(Boolean))
}

function normalize(message) {
  const address = message.from?.emailAddress || message.sender?.emailAddress || {}

  // Rebuilt into the same shape Gmail's From header has, so the scorer can
  // match on the display name AND the address ("amazon" should still hit
  // orders@amazon.com) and cleanSender can pull the name back out for display.
  const name = address.name || ''
  const mail = address.address || ''
  const from = name && mail ? `${name} <${mail}>` : name || mail

  return {
    id: message.id,
    subject: message.subject || '',
    // bodyPreview is already plain text, so no entity decoding needed.
    from,
    date: message.receivedDateTime || null,
    snippet: message.bodyPreview || '',
    unread: message.isRead === false,
    // Deliberately never set. Outlook's Focused/Other split is a personalised
    // ML guess, not a taxonomy — "Other" is full of real personal mail. Since
    // results from every mailbox are ranked in one list, penalising Outlook on
    // a signal Gmail doesn't have would quietly demote it.
    promotional: false,
    url: message.webLink || '',
  }
}

/**
 * Recent mail in the window, newest first, with no keyword filtering. Used when
 * $search is rejected — Microsoft does not document whether personal
 * outlook.com accounts support it, so this keeps the scan working either way.
 * The scorer then does all the matching client-side.
 */
function recentUrl(parsed, top) {
  const since = new Date(
    Date.now() - parsed.window.days * 86_400_000
  ).toISOString()
  return (
    `${GRAPH}/me/messages` +
    `?$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}` +
    `&$orderby=${encodeURIComponent('receivedDateTime desc')}` +
    `&$select=${SELECT}` +
    `&$top=${top}`
  )
}

/**
 * One request returns metadata for every hit — Graph shapes the collection with
 * $select, so there is no per-message fetch like Gmail needs.
 */
export async function search(accessToken, parsed, maxResults = 100) {
  const top = Math.min(maxResults, PAGE_SIZE)

  async function runSearch() {
    try {
      return await graphGet(searchUrl(buildQuery(parsed), top), accessToken)
    } catch (err) {
      if (err.status !== 400) throw err
      // KQL date syntax is the least-documented part of $search, so drop the
      // time window and try again before giving up on keyword search.
      try {
        return await graphGet(
          searchUrl(buildQuery(parsed, { withDate: false }), top),
          accessToken
        )
      } catch (retryErr) {
        if (retryErr.status !== 400) throw retryErr
        return graphGet(recentUrl(parsed, top), accessToken)
      }
    }
  }

  const [data, excluded] = await Promise.all([
    runSearch(),
    excludedFolderIds(accessToken),
  ])

  const messages = data.value || []
  const cutoff = Date.now() - parsed.window.days * 86_400_000

  return messages
    .filter((m) => !m.isDraft)
    .filter((m) => !excluded.has(m.parentFolderId))
    // Enforced client-side too, in case the KQL date clause was dropped by a
    // fallback or silently ignored — Graph documents that unsupported query
    // parameters can fail quietly rather than erroring.
    .filter((m) => !m.receivedDateTime || new Date(m.receivedDateTime).getTime() >= cutoff)
    .map(normalize)
}
