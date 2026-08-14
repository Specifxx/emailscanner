async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  let body = null
  try {
    body = await res.json()
  } catch {
    // Non-JSON response (e.g. an HTML error page from the platform).
  }

  if (!res.ok) {
    const error = new Error(body?.error || `Something went wrong (${res.status}).`)
    error.status = res.status
    error.body = body
    throw error
  }
  return body
}

export function getMe() {
  return request('/api/me')
}

export function getStats() {
  return request('/api/stats')
}

export function scan(query) {
  return request('/api/scan', {
    method: 'POST',
    body: JSON.stringify({ query }),
  })
}

export function logout() {
  return request('/api/auth/logout', { method: 'POST' })
}

export function disconnect(accountId) {
  return request('/api/accounts/disconnect', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  })
}

/** Deletes the whole account — every connected mailbox goes with it. */
export function deleteMyAccount() {
    return request('/api/account/delete', { method: 'POST' })
}

const INTENT_KEY = 'afterSignIn'

/**
 * Full page navigation — the OAuth dance has to leave the SPA. `intent` is
 * remembered in sessionStorage rather than a query param: it survives the round
 * trip to the provider and back, and never leaves the browser.
 */
export function connect(provider, intent) {
  try {
    if (intent) sessionStorage.setItem(INTENT_KEY, intent)
    else sessionStorage.removeItem(INTENT_KEY)
  } catch {
    // Private browsing can block storage. Losing the intent is survivable.
  }
  window.location.href = `/api/auth/start?provider=${encodeURIComponent(provider)}`
}

/**
 * Reading and clearing are separate on purpose. StrictMode double-invokes both
 * state initialisers and effects, so a read that also clears would consume the
 * intent during the first mount and leave the second — the one whose state is
 * kept — with nothing. Peek is pure and safe to repeat; clearing is idempotent.
 */
export function peekIntent() {
  try {
    return sessionStorage.getItem(INTENT_KEY)
  } catch {
    return null
  }
}

export function clearIntent() {
  try {
    sessionStorage.removeItem(INTENT_KEY)
  } catch {
    // Nothing to do if storage is unavailable.
  }
}

export async function upgrade(interval = 'month') {
  const { url } = await request('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ interval }),
  })
  window.location.href = url
}

export async function manageBilling() {
  const { url } = await request('/api/billing/portal', { method: 'POST' })
  window.location.href = url
}
