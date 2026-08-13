import { getSession } from '../../lib/session.js'
import { deleteAccount } from '../../lib/supabase.js'
import { readJsonBody } from '../../lib/http.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = getSession(req)
  if (!session) {
    return res.status(401).json({ error: 'Please sign in again.' })
  }

  let accountId
  try {
    ;({ accountId } = await readJsonBody(req))
  } catch {
    return res.status(400).json({ error: 'Could not read your request.' })
  }

  if (!accountId || typeof accountId !== 'string') {
    return res.status(400).json({ error: 'Which mailbox?' })
  }

  try {
    // Scoped to the session's user, so one person cannot delete another's row.
    await deleteAccount(session.uid, accountId)
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Disconnect failed:', err)
    res.status(500).json({ error: err.message })
  }
}
