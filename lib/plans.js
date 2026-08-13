/**
 * Quotas are deliberately in two different units. Free is a rolling daily
 * allowance so casual use never hits a wall, while Pro is a monthly pool that
 * resets with the billing period.
 */
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    scans: 10,
    period: 'day',
    mailboxes: 2,
    blurb: 'Enough to find what you lost.',
    features: [
      '10 scans per day',
      'Up to 2 mailboxes',
      'Gmail and Outlook',
      'Read and unread mail',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 24,
    priceAnnual: 20,
    scans: 800,
    period: 'month',
    mailboxes: Infinity,
    blurb: 'For inboxes you actually live in.',
    features: [
      '800 scans per month',
      'Unlimited mailboxes',
      'Gmail and Outlook',
      'Priority support',
    ],
  },
}

export const DEFAULT_PLAN = 'free'

export function getPlan(id) {
  return PLANS[id] || PLANS[DEFAULT_PLAN]
}

/**
 * Start of the window the current usage counter belongs to. Daily plans roll
 * at UTC midnight; monthly plans roll on the same day each month.
 */
export function periodStart(plan, now = new Date()) {
  const date = new Date(now)
  if (plan.period === 'day') {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    )
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}
