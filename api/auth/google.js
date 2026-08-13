import crypto from 'node:crypto'
import { config, GOOGLE_SCOPES } from '../../lib/config.js'
import { serializeCookie } from '../../lib/session.js'

export default function handler(req, res) {
  try {
    const state = crypto.randomBytes(16).toString('hex')

    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: config.googleRedirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
    })

    res.setHeader(
      'Set-Cookie',
      serializeCookie('oauth_state', state, { maxAge: 600 })
    )
    res.writeHead(302, {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    })
    res.end()
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
