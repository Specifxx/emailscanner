import { config } from '../../lib/config.js'
import {
  createSessionCookie,
  getSession,
  parseCookies,
  serializeCookie,
  stateCookieName,
} from '../../lib/session.js'
import {
  createUser,
  findAccount,
  getUser,
  listAccounts,
  saveAccount,
} from '../../lib/supabase.js'
import { getProvider, isProvider } from '../../lib/providers/index.js'
import { getPlan } from '../../lib/plans.js'

function redirect(res, cookies, path) {
  res.setHeader('Set-Cookie', cookies)
  res.writeHead(302, { Location: `${config.appUrl}${path}` })
  res.end()
}

export default async function handler(req, res) {
  const url = new URL(req.url, config.appUrl)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  // Which provider this is claiming to be. Untrusted until the state matches
  // the cookie we set when the flow started.
  const claimed = String(state || '').split(':')[0]
  const cookieName = isProvider(claimed)
    ? stateCookieName(claimed)
    : 'oauth_state'
  const expectedState = parseCookies(req)[cookieName]
  const clearState = serializeCookie(cookieName, '', { maxAge: 0 })

  if (url.searchParams.get('error')) {
    return redirect(res, [clearState], '/?error=declined')
  }
  if (!code) {
    return redirect(res, [clearState], '/?error=missing_code')
  }
  if (!isProvider(claimed)) {
    return redirect(res, [clearState], '/?error=unknown_provider')
  }
  if (!state || !expectedState || state !== expectedState) {
    return redirect(res, [clearState], '/?error=bad_state')
  }

  // Verified: the state matched the cookie we issued, so this really is the
  // provider we started the flow with.
  const providerId = claimed

  try {
    const provider = getProvider(providerId)
    const tokens = await provider.exchangeCode(code)
    const profile = await provider.fetchProfile(tokens.accessToken, tokens.idToken)

    // An existing session means "add this mailbox to the account I am already
    // signed in to" rather than "sign me in".
    const session = getSession(req)
    const existing = await findAccount(providerId, profile.providerId)

    let userId
    const sessionUser = session?.uid ? await getUser(session.uid) : null

    if (sessionUser) {
      if (existing && existing.user_id !== sessionUser.id) {
        return redirect(res, [clearState], '/?error=already_linked')
      }
      // Only a genuinely new mailbox counts against the plan limit;
      // reconnecting one you already have must always be allowed.
      if (!existing) {
        const attached = await listAccounts(sessionUser.id)
        if (attached.length >= getPlan(sessionUser.plan).mailboxes) {
          return redirect(res, [clearState], '/?error=mailbox_limit')
        }
      }
      userId = sessionUser.id
    } else if (existing) {
      userId = existing.user_id
    } else {
      const user = await createUser({
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
      })
      userId = user.id
    }

    await saveAccount({
      userId,
      provider: providerId,
      providerId: profile.providerId,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    })

    const user = await getUser(userId)
    const cookie = createSessionCookie({
      uid: userId,
      email: user.email,
      name: user.name,
      picture: user.picture,
    })

    return redirect(res, [clearState, cookie], '/')
  } catch (err) {
    console.error('OAuth callback failed:', err)
    return redirect(res, [clearState], '/?error=auth_failed')
  }
}
