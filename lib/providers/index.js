import * as google from './google.js'
import * as microsoft from './microsoft.js'
import { AuthError } from '../errors.js'
import { updateAccountTokens } from '../supabase.js'

const PROVIDERS = { google, microsoft }

export function getProvider(id) {
  const provider = PROVIDERS[id]
  if (!provider) throw new Error(`Unknown provider: ${id}`)
  return provider
}

export function isProvider(id) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, id)
}

/**
 * A usable access token for one connected mailbox, refreshing first if the
 * stored one is stale. Any rotated refresh token is persisted before use.
 */
export async function getAccessToken(account) {
  const provider = getProvider(account.provider)
  const expiry = account.token_expiry
    ? new Date(account.token_expiry).getTime()
    : 0

  if (account.access_token && expiry - Date.now() > 60_000) {
    return account.access_token
  }

  if (!account.refresh_token) {
    throw new AuthError(
      `${account.email} needs to be reconnected. Please sign in again.`
    )
  }

  const tokens = await provider.refreshTokens(account.refresh_token)
  await updateAccountTokens(account.id, tokens)
  return tokens.accessToken
}
