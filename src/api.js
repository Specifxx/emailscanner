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

/** Full page navigation — the OAuth dance has to leave the SPA. */
export function connect(provider) {
  window.location.href = `/api/auth/start?provider=${encodeURIComponent(provider)}`
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
