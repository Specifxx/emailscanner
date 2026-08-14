import { billingEnabled, stripe } from '../../lib/billing.js'
import { findUserByCustomerId, setPlan } from '../../lib/supabase.js'

// Signature verification needs the exact bytes Stripe sent, so the platform
// must not parse this body for us.
export const config = { api: { bodyParser: false } }

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8')

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

/** Only an active-ish subscription grants Pro. */
function planFor(status) {
  return status === 'active' || status === 'trialing' ? 'pro' : 'free'
}

async function applySubscription(subscription) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id

  const existing = customerId ? await findUserByCustomerId(customerId) : null
  const userId = subscription.metadata?.userId || existing?.id

  if (!userId) {
    console.error('Subscription with no matching user:', subscription.id)
    return
  }

  const plan = planFor(subscription.status)
  const renews = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null

  const patch = {
    plan,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    plan_renews_at: renews,
    // Cancelling does not end the subscription immediately — Stripe keeps it
    // active to the end of the paid period, so this only changes the wording.
    plan_cancels: Boolean(subscription.cancel_at_period_end),
  }

  // Only a genuine plan change starts a fresh allowance. Stripe re-sends
  // subscription.updated for unrelated things (a cancellation being scheduled,
  // a card being updated), and resetting the counter on those would hand out
  // free scans every time.
  if (existing && existing.plan !== plan) {
    patch.scans_used = 0
    patch.scan_period_start = null
  }

  await setPlan(userId, patch)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!billingEnabled() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Billing is not configured.' })
  }

  let event
  try {
    event = stripe().webhooks.constructEvent(
      await rawBody(req),
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    // An unverified payload is either a misconfiguration or a forgery; either
    // way it must never reach the plan logic.
    console.error('Webhook signature check failed:', err.message)
    return res.status(400).json({ error: 'Invalid signature.' })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.subscription) {
          const subscription = await stripe().subscriptions.retrieve(
            session.subscription
          )
          await applySubscription(subscription)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscription(event.data.object)
        break
      default:
        break
    }

    res.status(200).json({ received: true })
  } catch (err) {
    // A non-2xx makes Stripe retry, which is what we want for a transient
    // database failure.
    console.error(`Webhook ${event.type} failed:`, err)
    res.status(500).json({ error: 'Webhook handling failed.' })
  }
}
