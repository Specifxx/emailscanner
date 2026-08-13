import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'
import { encrypt, decrypt } from './crypto.js'

let client = null

function db() {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

function fail(action, error) {
  throw new Error(`Could not ${action}: ${error.message}`)
}

function decryptAccount(row) {
  return {
    ...row,
    access_token: decrypt(row.access_token),
    refresh_token: decrypt(row.refresh_token),
  }
}

/** The mailbox a provider identity belongs to, or null if it is new to us. */
export async function findAccount(provider, providerId) {
  const { data, error } = await db()
    .from('accounts')
    .select('*')
    .eq('provider', provider)
    .eq('provider_id', providerId)
    .maybeSingle()

  if (error) fail('look up your account', error)
  return data || null
}

export async function getUser(id) {
  const { data, error } = await db()
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) fail('load your account', error)
  return data || null
}

export async function createUser({ email, name, picture }) {
  const { data, error } = await db()
    .from('users')
    .insert({ email, name, picture })
    .select()
    .single()

  if (error) fail('create your account', error)
  return data
}

/**
 * Attaches a mailbox to a person, or refreshes the stored details if it is
 * already attached.
 */
export async function saveAccount({
  userId,
  provider,
  providerId,
  email,
  name,
  picture,
  accessToken,
  refreshToken,
  expiresAt,
}) {
  const row = {
    user_id: userId,
    provider,
    provider_id: providerId,
    email,
    name,
    picture,
    access_token: encrypt(accessToken),
    token_expiry: expiresAt ? new Date(expiresAt).toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  // Google only returns a refresh token on first consent, so never overwrite a
  // stored one with null. Microsoft returns a new one every time.
  if (refreshToken) row.refresh_token = encrypt(refreshToken)

  const { data, error } = await db()
    .from('accounts')
    .upsert(row, { onConflict: 'provider,provider_id' })
    .select()
    .single()

  if (error) fail('connect that mailbox', error)
  return data
}

/** Every mailbox attached to a person, tokens decrypted, oldest first. */
export async function listAccounts(userId) {
  const { data, error } = await db()
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) fail('load your mailboxes', error)
  return (data || []).map(decryptAccount)
}

export async function updateAccountTokens(
  accountId,
  { accessToken, refreshToken, expiresAt }
) {
  const patch = {
    access_token: encrypt(accessToken),
    token_expiry: expiresAt ? new Date(expiresAt).toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  // Microsoft rotates refresh tokens on every use, so the new one has to
  // replace the old or the chain breaks once the original ages out.
  if (refreshToken) patch.refresh_token = encrypt(refreshToken)

  const { error } = await db().from('accounts').update(patch).eq('id', accountId)
  if (error) fail('refresh your session', error)
}

/**
 * Claims one scan against the user's allowance. Returns whether it was allowed
 * and the new usage count. The rollover and the increment happen inside the
 * database so concurrent scans can't both slip past the limit.
 */
export async function consumeScan(userId, limit, periodStart) {
  const { data, error } = await db().rpc('consume_scan', {
    p_user_id: userId,
    p_limit: limit,
    p_period_start: periodStart.toISOString(),
  })

  if (error) fail('check your scan allowance', error)
  const row = Array.isArray(data) ? data[0] : data
  return { allowed: Boolean(row?.allowed), used: row?.used ?? 0 }
}

export async function setPlan(userId, patch) {
  const { error } = await db()
    .from('users')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) fail('update your plan', error)
}

export async function findUserByCustomerId(customerId) {
  const { data, error } = await db()
    .from('users')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (error) fail('find your account', error)
  return data || null
}

export async function deleteAccount(userId, accountId) {
  const { error } = await db()
    .from('accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', userId)

  if (error) fail('disconnect that mailbox', error)
}
