import { clearSessionCookie, getSession } from '../../lib/session.js'
import { deleteUser } from '../../lib/supabase.js'

/**
   * Deletes the signed-in person's account entirely — every connected mailbox's
   * tokens go with it (see the cascade in supabase/schema.sql). Distinct from
   * /api/accounts/disconnect, which only removes one mailbox.
   */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' })
    }

  const session = getSession(req)
    if (!session) {
          return res.status(401).json({ error: 'Please sign in again.' })
    }

  try {
        await deleteUser(session.uid)
        res.setHeader('Set-Cookie', clearSessionCookie())
        res.status(200).json({ ok: true })
  } catch (err) {
        console.error('Account deletion failed:', err)
        res.status(500).json({ error: err.message })
  }
}
