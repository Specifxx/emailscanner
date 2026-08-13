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

export async function upsertUser({
  googleId,
  email,
  name,
  picture,
  accessToken,
  refreshToken,
  expiresAt,
}) {
  const row = {
    google_id: googleId,
    email,
    name,
    picture,
    access_token: encrypt(accessToken),
    token_expiry: expiresAt ? new Date(expiresAt).toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  // Google only returns a refresh token on the first consent, so never
  // overwrite a stored one with null on subsequent sign-ins.
  if (refreshToken) row.refresh_token = encrypt(refreshToken)

  const { data, error } = await db()
    .from('users')
    .upsert(row, { onConflict: 'google_id' })
    .select()
    .single()

  if (error) throw new Error(`Could not save your account: ${error.message}`)
  return data
}

export async function getUserById(id) {
  const { data, error } = await db()
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Could not load your account: ${error.message}`)
  if (!data) return null

  return {
    ...data,
    access_token: decrypt(data.access_token),
    refresh_token: decrypt(data.refresh_token),
  }
}

export async function updateTokens(id, { accessToken, expiresAt }) {
  const { error } = await db()
    .from('users')
    .update({
      access_token: encrypt(accessToken),
      token_expiry: expiresAt ? new Date(expiresAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw new Error(`Could not refresh your session: ${error.message}`)
}
