import { config } from '../../lib/config.js'
import {
  createSessionCookie,
  parseCookies,
  serializeCookie,
} from '../../lib/session.js'
import { upsertUser } from '../../lib/supabase.js'

function redirect(res, cookies, path) {
  res.setHeader('Set-Cookie', cookies)
  res.writeHead(302, { Location: `${config.appUrl}${path}` })
  res.end()
}

export default async function handler(req, res) {
  const url = new URL(req.url, config.appUrl)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expectedState = parseCookies(req).oauth_state
  const clearState = serializeCookie('oauth_state', '', { maxAge: 0 })

  if (url.searchParams.get('error')) {
    return redirect(res, [clearState], '/?error=declined')
  }
  if (!code) {
    return redirect(res, [clearState], '/?error=missing_code')
  }
  if (!state || !expectedState || state !== expectedState) {
    return redirect(res, [clearState], '/?error=bad_state')
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: config.googleRedirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await tokenRes.json()
    if (!tokenRes.ok) {
      throw new Error(tokens.error_description || 'Token exchange failed')
    }

    const profileRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    )
    const profile = await profileRes.json()
    if (!profileRes.ok) {
      throw new Error('Could not read your Google profile')
    }

    const user = await upsertUser({
      googleId: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    })

    const session = createSessionCookie({
      uid: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    })

    return redirect(res, [clearState, session], '/')
  } catch (err) {
    console.error('OAuth callback failed:', err)
    return redirect(res, [clearState], '/?error=auth_failed')
  }
}
