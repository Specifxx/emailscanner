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
    throw new Error(body?.error || `Something went wrong (${res.status}).`)
  }
  return body
}

export function getMe() {
  return request('/api/me')
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
