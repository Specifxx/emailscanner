import { getSession } from '../../lib/session.js'
import { getUser } from '../../lib/supabase.js'
import { billingEnabled, returnUrl, stripe } from '../../lib/billing.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = getSession(req)
  if (!session) {
    return res.status(401).json({ error: 'Please sign in again.' })
  }

  if (!billingEnabled()) {
    return res.status(503).json({ error: 'Billing is not available yet.' })
  }

  try {
    const user = await getUser(session.uid)
    if (!user?.stripe_customer_id) {
      return res.status(400).json({ error: 'You do not have a subscription.' })
    }

    const portal = await stripe().billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: returnUrl('/'),
    })

    res.status(200).json({ url: portal.url })
  } catch (err) {
    console.error('Portal failed:', err)
    res.status(500).json({ error: 'Could not open billing. Try again.' })
  }
}
