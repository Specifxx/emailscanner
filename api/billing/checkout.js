import { getSession } from '../../lib/session.js'
import { getUser, setPlan } from '../../lib/supabase.js'
import {
  billingEnabled,
  explainStripeError,
  priceId,
  returnUrl,
  stripe,
} from '../../lib/billing.js'
import { readJsonBody } from '../../lib/http.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = getSession(req)
  if (!session) {
    return res.status(401).json({ error: 'Please sign in again.' })
  }

  if (!billingEnabled()) {
    return res.status(503).json({ error: 'Upgrades are not available yet.' })
  }

  let interval = 'month'
  try {
    ;({ interval = 'month' } = await readJsonBody(req))
  } catch {
    // Default to monthly rather than failing on an empty body.
  }

  try {
    const user = await getUser(session.uid)
    if (!user) {
      return res.status(401).json({ error: 'Please sign in again.' })
    }

    // Reuse the customer across upgrades so Stripe keeps one billing history
    // per person rather than one per checkout.
    let customerId = user.stripe_customer_id
    if (!customerId) {
      const customer = await stripe().customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: user.id },
      })
      customerId = customer.id
      await setPlan(user.id, { stripe_customer_id: customerId })
    }

    const checkout = await stripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId(interval), quantity: 1 }],
      success_url: returnUrl('/?upgraded=1'),
      cancel_url: returnUrl('/'),
      allow_promotion_codes: true,
      // Read back by the webhook, which is the only thing that actually
      // grants the plan.
      subscription_data: { metadata: { userId: user.id } },
      metadata: { userId: user.id },
    })

    res.status(200).json({ url: checkout.url })
  } catch (err) {
    console.error('Checkout failed:', err)
    res.status(500).json({
      error: explainStripeError(err) || 'Could not start checkout. Try again.',
    })
  }
}
