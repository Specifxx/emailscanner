import crypto from 'node:crypto'
import { config } from '../../lib/config.js'
import { serializeCookie, stateCookieName } from '../../lib/session.js'
import { getProvider, isProvider } from '../../lib/providers/index.js'

/**
 * Kicks off the OAuth dance for one provider. Works both for the first sign-in
 * and for attaching another mailbox to an account you are already signed in to
 * — the callback tells the two apart by looking for a session.
 */
export default function handler(req, res) {
  try {
    const url = new URL(req.url, config.appUrl)
    const provider = url.searchParams.get('provider') || 'google'

    if (!isProvider(provider)) {
      res.writeHead(302, { Location: `${config.appUrl}/?error=unknown_provider` })
      return res.end()
    }

    // The state is both the CSRF token and where we remember which provider
    // this callback belongs to. It is only trusted after the returned value is
    // matched against the cookie we set here.
    const state = `${provider}:${crypto.randomBytes(16).toString('hex')}`

    res.setHeader(
      'Set-Cookie',
      serializeCookie(stateCookieName(provider), state, { maxAge: 600 })
    )
    res.writeHead(302, { Location: getProvider(provider).buildAuthUrl(state) })
    res.end()
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
